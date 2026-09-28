import { describe, expect, it } from "vitest";
import {
  checkTime,
  countIndependentSources,
  decideBreaking,
  pastYearMentioned,
  resolvePublisher,
  scoreItem,
  textBasisOf,
  triageIntake,
  type ItemSignals,
} from "../../server/services/radar/triage";
import { parseAnalysisPayload } from "../../server/services/radar/parsing";
import { scoreSaudiRelevance } from "../../server/services/radar/relevanceScore";

const NOW = new Date("2026-09-28T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function signals(overrides: Partial<ItemSignals> = {}): ItemSignals {
  return {
    now: NOW,
    publishedAt: hoursAgo(0.5),
    fetchedAt: hoursAgo(0.4),
    qualityFlags: [],
    publisherType: "wire",
    textBasis: "body",
    independentSources: 1,
    newsValue: 85,
    eventTiming: "new",
    contentType: "news",
    breakingRequested: true,
    ...overrides,
  };
}

describe("حالات القبول — الحداثة والتاريخ", () => {
  it("مباراة 2022 بتاريخ صفحة حديث: لا عاجل ومسار خلفية وأولوية مسقوفة", () => {
    const s = signals({ eventTiming: "old", newsValue: 90, publisherType: "major" });
    const breaking = decideBreaking(s);
    expect(breaking.isBreaking).toBe(false);
    expect(breaking.deniedBy).toBe("old_event");
    const scores = scoreItem(s);
    expect(scores.lane).toBe("background");
    expect(scores.freshnessScore).toBe(0);
    expect(scores.priorityScore).toBeLessThanOrEqual(25);
  });

  it("سنة ماضية في العنوان تمنع العاجل ما لم يؤكد التحليل أن الحدث جديد", () => {
    const flags = triageIntake(
      { title: "Argentina fall to Saudi Arabia in World Cup 2022 opener", publishedAt: hoursAgo(1) },
      NOW
    ).qualityFlags;
    expect(flags).toContain("past_year:2022");
    expect(decideBreaking(signals({ qualityFlags: flags, eventTiming: "unknown" })).deniedBy).toBe(
      "past_year_unconfirmed"
    );
    // «أول مرة منذ 2019» خبر جديد فعلًا: يمر إن أكد التحليل الجِدّة
    expect(decideBreaking(signals({ qualityFlags: flags, eventTiming: "new" })).isBreaking).toBe(true);
  });

  it("لا تلميح سنة عند ذكر السنة الحالية أو المستقبلية (رؤية 2030)", () => {
    expect(pastYearMentioned("Saudi Vision 2030 and 2019 baseline", NOW)).toBeNull();
    expect(pastYearMentioned("Aramco results beat 2025 levels", NOW)).toBe(2025);
  });

  it("مادة مستقبلية بساعتين: زمن غير موثوق، ولا تُستبعد؛ وبعد يوم تُستبعد", () => {
    const soon = checkTime(new Date(NOW.getTime() + 2 * 3_600_000), NOW);
    expect(soon.trustedAt).toBeNull();
    expect(soon.flags).toContain("future_date");
    expect(soon.impossible).toBe(false);
    const far = triageIntake(
      { title: "Event listing", publishedAt: new Date(NOW.getTime() + 30 * 3_600_000) },
      NOW
    );
    expect(far.screenReason).not.toBeNull();
  });

  it("مادة بلا تاريخ: عاجل فقط بقيمة عالية جدًا وتأييد، والحداثة مسقوفة", () => {
    const s = signals({ publishedAt: null, qualityFlags: ["missing_date"], newsValue: 80 });
    expect(decideBreaking(s).deniedBy).toBe("time_unverified");
    expect(decideBreaking({ ...s, newsValue: 90 }).isBreaking).toBe(true);
    expect(scoreItem(s).freshnessScore).toBeLessThanOrEqual(50);
  });

  it("العاجل له صلاحية تنتهي، والمادة الأقدم من ساعتين لا تصبح عاجلة", () => {
    const d = decideBreaking(signals({ publishedAt: hoursAgo(1) }));
    expect(d.isBreaking).toBe(true);
    expect(d.breakingUntil!.getTime()).toBe(hoursAgo(1).getTime() + 3 * 3_600_000);
    expect(decideBreaking(signals({ publishedAt: hoursAgo(5) })).deniedBy).toBe("stale");
  });
});

describe("حالات القبول — الدليل والناشر", () => {
  it("بيان صحفي مدفوع يُستبعد قبل التحليل", () => {
    const t = triageIntake({
      title: "Company X launches product in Riyadh",
      link: "https://www.einpresswire.com/article/123",
      publishedAt: hoursAgo(1),
    }, NOW);
    expect(t.publisherType).toBe("press_release");
    expect(t.screenReason).toBe("بيان صحفي/ترويجي");
  });

  it("ادعاء أمني من ناشر مجهول بلا تأييد: لا عاجل، ومسار «يحتاج تحققًا»", () => {
    const s = signals({ publisherType: "unknown", contentType: "claim", newsValue: 88 });
    expect(decideBreaking(s).deniedBy).toBe("uncorroborated");
    expect(scoreItem(s).lane).toBe("watch");
    // الصلة العالية لا تعوّض غياب الدليل
    expect(scoreItem(s).priorityScore).toBeLessThanOrEqual(70);
    // ناشر مستقل ثانٍ يرفع التأييد
    expect(decideBreaking({ ...s, independentSources: 2 }).isBreaking).toBe(true);
  });

  it("الناشر من الرابط أولًا، ومن الاسم لروابط Google News", () => {
    expect(resolvePublisher({ link: "https://www.spa.gov.sa/w123" })).toMatchObject({ key: "spa", type: "official" });
    expect(resolvePublisher({ link: "https://moh.gov.sa/news/1" }).type).toBe("official");
    expect(
      resolvePublisher({ link: "https://news.google.com/rss/articles/abc", publisher: "Reuters" })
    ).toMatchObject({ key: "reuters", type: "wire" });
    expect(resolvePublisher({ link: "https://news.google.com/rss/articles/x", publisher: "Vietnam.vn" }).key).toBe(
      "name:vietnam vn"
    );
  });

  it("نسخ ناشر واحد بثماني لغات = مصدر مستقل واحد، ونقل ثلاثة مواقع عن وكالة = واحد", () => {
    const sameVendor = Array.from({ length: 8 }, (_, i) => ({ sourceId: `gnews-${i}`, publisherKey: "name:vietnam vn" }));
    expect(countIndependentSources(sameVendor)).toBe(1);

    const copies = ["https://a.example.com/x", "https://b.example.org/y", "https://c.example.net/z"].map((link, i) => {
      const t = triageIntake({ title: "Oil prices jump", excerpt: "RIYADH (Reuters) - Oil prices rose sharply today after the announcement of new output targets.", link }, NOW);
      return { sourceId: `s${i}`, publisherKey: t.publisherKey, wireOrigin: t.wireOrigin };
    });
    expect(copies.every((c) => c.wireOrigin === "reuters")).toBe(true);
    expect(countIndependentSources(copies)).toBe(1);
    expect(countIndependentSources([...copies, { sourceId: "s9", publisherKey: "bbc" }])).toBe(2);
  });
});

describe("حالات القبول — النص", () => {
  it("عنوان بلا متن = title_only (ملخص Google News مكرر العنوان لا يُعد متنًا)", () => {
    expect(textBasisOf("Saudi Arabia signs deal", undefined)).toBe("title_only");
    expect(textBasisOf("Saudi Arabia signs deal", "Saudi Arabia signs deal  Reuters")).toBe("title_only");
    expect(
      textBasisOf("Saudi Arabia signs deal", "Saudi Arabia signed a deal on Monday with three partners to build a new port on the Red Sea coast.")
    ).toBe("body");
    expect(scoreItem(signals({ textBasis: "title_only", publisherType: "unknown" })).evidenceScore).toBe(25);
  });

  it("تفكيك التحليل: توقيت/نوع صالح فقط، وغير ذلك يسقط لقيم آمنة", () => {
    const [a, b] = parseAnalysisPayload(
      JSON.stringify({
        items: [
          { id: "1", newsValue: 30, isBreaking: false, eventTiming: "old", timingEvidence: "مباراة 2022", contentType: "news", translatedTitle: "ع" },
          { id: "2", newsValue: 50, eventTiming: "yesterday", contentType: "rumor", translatedTitle: "ع" },
        ],
      })
    );
    expect(a.eventTiming).toBe("old");
    expect(a.timingEvidence).toBe("مباراة 2022");
    expect(b.eventTiming).toBe("unknown");
    expect(b.contentType).toBe("news");
  });
});

describe("قواميس الصلة مضمّنة في الحزمة", () => {
  it("تعمل دون قراءة ملفات من القرص (كانت فارغة في صورة الإنتاج)", () => {
    expect(scoreSaudiRelevance({ title: "Aramco raises output" }).score).toBeGreaterThanOrEqual(40);
  });
});
