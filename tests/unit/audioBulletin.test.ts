import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/storage", () => ({ storage: { getSystemSetting: vi.fn(), upsertSystemSetting: vi.fn() } }));
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete: vi.fn() } }));

import { joinPcm, parseWav, pcmDurationSec, wavFromPcm, type PcmAudio } from "../../server/services/audioBulletinAudio";
import {
  BULLETIN_INTRO,
  BULLETIN_OUTRO,
  bulletinChapters,
  bulletinParagraphs,
  dueSlot,
  editionTitle,
  parseScript,
  publicBulletin,
  rankCandidates,
  vowelSabq,
  type Bulletin,
  type BulletinState,
  type CandidateStory,
} from "../../server/services/audioBulletinService";

function pcm(seconds: number, rate = 24_000): PcmAudio {
  return { sampleRate: rate, channels: 1, bitsPerSample: 16, data: Buffer.alloc(Math.round(seconds * rate) * 2, 1) };
}

describe("bulletin audio assembly", () => {
  it("round-trips WAV and reads chunks in any order", () => {
    const wav = wavFromPcm(pcm(0.5));
    const parsed = parseWav(wav);
    expect(parsed.sampleRate).toBe(24_000);
    expect(pcmDurationSec(parsed)).toBeCloseTo(0.5, 5);
    expect(() => parseWav(Buffer.from("not a wav file at all"))).toThrow("BULLETIN_INVALID_WAV");
  });

  it("accepts a streamed WAV whose data size was never filled in", () => {
    const wav = wavFromPcm(pcm(0.25));
    wav.writeUInt32LE(0xffffffff, 40);
    expect(pcmDurationSec(parseWav(wav))).toBeCloseTo(0.25, 5);
  });

  it("returns exact paragraph starts including the gap", () => {
    const { audio, starts } = joinPcm([pcm(2), pcm(3), pcm(1)], 0.5);
    expect(starts).toEqual([0, 2.5, 6]);
    expect(pcmDurationSec(audio)).toBeCloseTo(7, 5);
  });

  it("refuses to mix sample rates from different voices", () => {
    expect(() => joinPcm([pcm(1, 24_000), pcm(1, 44_100)])).toThrow("BULLETIN_MIXED_AUDIO_FORMAT");
  });

  it("trims a part that ends mid-sample so later starts stay aligned", () => {
    const odd = { ...pcm(1), data: Buffer.alloc(48_001) };
    const { starts } = joinPcm([odd, pcm(1)], 0);
    expect(starts[1]).toBeCloseTo(1, 5);
  });
});

describe("bulletin script", () => {
  it("vowels the paper's name only where it names the paper", () => {
    expect(vowelSabq("مرحباً بكم في نشرة سبق، نأخذكم")).toBe("مرحباً بكم في نشرة سَبْق، نأخذكم");
    expect(vowelSabq("التفاصيل على سبق دوت أورغ")).toBe("التفاصيل على سَبْق دوت أورغ");
    expect(vowelSabq("وكان قد سبق أن أعلن")).toBe("وكان قد سبق أن أعلن");
  });

  it("frames every bulletin with the fixed intro and outro", () => {
    const paragraphs = bulletinParagraphs([{ id: "a", articleIds: ["1"], href: "/article/x", label: "خبر", text: "نص الخبر الأول." }]);
    expect(paragraphs[0]).toBe(BULLETIN_INTRO);
    expect(paragraphs.at(-1)).toBe(BULLETIN_OUTRO);
    expect(BULLETIN_INTRO).toContain("سَبْق");
  });

  const candidates: CandidateStory[] = ["a", "b", "c", "d"].map((id, i) => ({
    id, title: `خبر ${id}`, href: `/article/${id}`, category: null, newsType: "regular", views: i, isFeatured: false, publishedAt: new Date(), body: "نص",
  }));

  it("drops sources the model invented and keeps real links", () => {
    const raw = "```json\n" + JSON.stringify({ items: [
      { articleIds: ["a", "zzz"], label: "الأول", text: "فقرة أولى كاملة بما يكفي." },
      { articleIds: ["zzz"], label: "مختلق", text: "فقرة لا مصدر لها في المواد." },
      { articleIds: ["b"], label: "الثاني", text: "فقرة ثانية كاملة بما يكفي." },
      { articleIds: ["c"], label: "الثالث", text: "فقرة ثالثة كاملة بما يكفي." },
    ] }) + "\n```";
    const items = parseScript(raw, candidates);
    expect(items.map((i) => i.label)).toEqual(["الأول", "الثاني", "الثالث"]);
    expect(items[0].articleIds).toEqual(["a"]);
    expect(items[0].href).toBe("/article/a");
  });

  it("rejects a script with fewer than three usable stories", () => {
    const raw = JSON.stringify({ items: [{ articleIds: ["a"], label: "واحد", text: "فقرة واحدة فقط هنا وهي كافية الطول." }] });
    expect(() => parseScript(raw, candidates)).toThrow("BULLETIN_SCRIPT_TOO_SHORT");
  });

  it("ranks breaking news first, then featured, then most read", () => {
    const ranked = rankCandidates([
      { ...candidates[0], id: "read", views: 900 },
      { ...candidates[1], id: "featured", isFeatured: true, views: 10 },
      { ...candidates[2], id: "breaking", newsType: "breaking", views: 1 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["breaking", "featured", "read"]);
  });
});

describe("bulletin schedule and visibility", () => {
  it("fires each Riyadh slot only in its first 20 minutes", () => {
    expect(dueSlot(new Date("2026-10-09T04:05:00Z"))).toBe("2026-10-09@7"); // 07:05 Riyadh
    expect(dueSlot(new Date("2026-10-09T18:10:00Z"))).toBe("2026-10-09@21");
    expect(dueSlot(new Date("2026-10-09T04:30:00Z"))).toBeNull();
    expect(dueSlot(new Date("2026-10-09T05:05:00Z"))).toBeNull();
  });

  it("names the edition by Riyadh time", () => {
    expect(editionTitle(new Date("2026-10-09T04:00:00Z"))).toBe("نشرة الصباح");
    expect(editionTitle(new Date("2026-10-09T10:00:00Z"))).toBe("نشرة الظهيرة");
    expect(editionTitle(new Date("2026-10-09T18:00:00Z"))).toBe("نشرة المساء");
  });

  it("maps paragraph starts to chapters with labels and links", () => {
    const chapters = bulletinChapters(
      [{ id: "a", articleIds: ["1"], href: "/article/x", label: "الذهب", text: "..." }],
      [0, 5.62, 30.04],
    );
    expect(chapters).toEqual([
      { label: "الترحيب", href: null, start: 0 },
      { label: "الذهب", href: "/article/x", start: 5.6 },
      { label: "الختام", href: null, start: 30 },
    ]);
    expect(() => bulletinChapters([], [0])).toThrow("BULLETIN_CHAPTER_MISMATCH");
  });

  it("hides a bulletin after six hours", () => {
    const publishedAt = "2026-10-09T18:00:00.000Z";
    const current = {
      id: "b1", title: "نشرة المساء", publishedAt,
      audio: { url: "https://media.sabq.org/audio-bulletin/b1.mp3", contentType: "audio/mpeg", durationSec: 180, bytes: 1, provider: "gemini", chapters: [] },
    } as unknown as Bulletin;
    const state: BulletinState = { version: 1, scheduleEnabled: false, lastScheduledSlot: null, draft: null, current, history: [] };
    expect(publicBulletin(state, Date.parse(publishedAt) + 5 * 3600_000)?.audioUrl).toContain("b1.mp3");
    expect(publicBulletin(state, Date.parse(publishedAt) + 7 * 3600_000)).toBeNull();
  });
});
