// «مُدوِّن سبق AI» — حادثة 2026-11-17 («0 مقطع تفريغ» ثم «job is unresponsive»):
// الإنهاء محدود بزمن، والعدّاد يفرّق بين «لا صوت» و«صمت» و«كلام بلا تفريغ».
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AUDIBLE_PEAK,
  TrackMeter,
  diagnoseTrack,
  settleWithin,
  summarizeTracks,
} from "../../meetings-agent/src/shutdown";

const root = path.resolve(import.meta.dirname, "../..");

describe("settleWithin — انتظار محدود بدل الانتظار المفتوح", () => {
  it("يعيد true حين تستقر الوعود قبل المهلة (حتى المرفوضة)", async () => {
    const ok = await settleWithin([Promise.resolve(1), Promise.reject(new Error("x"))], 200);
    expect(ok).toBe(true);
  });

  it("يعيد false ولا يعلق حين يبقى وعد معلّقاً — هذا ما كان يعلّق المهمة", async () => {
    const never = new Promise<void>(() => {});
    const started = Date.now();
    const ok = await settleWithin([never], 40);
    expect(ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("قائمة فارغة = مستقرة فوراً", async () => {
    expect(await settleWithin([], 1000)).toBe(true);
  });
});

describe("TrackMeter + diagnoseTrack", () => {
  const frame = (amp: number, n = 320) => new Int16Array(n).fill(amp);

  it("لا إطارات → no-audio-frames", () => {
    expect(diagnoseTrack(new TrackMeter(16000).stats())).toBe("no-audio-frames");
  });

  it("إطارات صامتة (ميكروفون مكتوم) → silent-audio", () => {
    const m = new TrackMeter(16000);
    for (let i = 0; i < 100; i++) m.onFrame(frame(3));
    const s = m.stats();
    expect(s.audioSeconds).toBe(2);
    expect(s.audibleRatio).toBe(0);
    expect(diagnoseTrack(s)).toBe("silent-audio");
  });

  it("صوت مسموع بلا كشف كلام → audible-but-no-speech-detected (إعداد VAD)", () => {
    const m = new TrackMeter(16000);
    for (let i = 0; i < 100; i++) m.onFrame(frame(-(AUDIBLE_PEAK + 2000)));
    const s = m.stats();
    expect(s.peak).toBe(AUDIBLE_PEAK + 2000);
    expect(s.audibleRatio).toBe(1);
    expect(diagnoseTrack(s)).toBe("audible-but-no-speech-detected");
  });

  it("كلام مكتشف بلا نص نهائي → speech-detected-but-no-transcript", () => {
    const m = new TrackMeter(16000);
    for (let i = 0; i < 50; i++) m.onFrame(frame(4000));
    m.onSpeechStart();
    expect(diagnoseTrack(m.stats())).toBe("speech-detected-but-no-transcript");
  });

  it("نص نهائي → ok", () => {
    const m = new TrackMeter(16000);
    for (let i = 0; i < 50; i++) m.onFrame(frame(4000));
    m.onSpeechStart();
    m.onFinal();
    expect(diagnoseTrack(m.stats())).toBe("ok");
  });
});

describe("summarizeTracks", () => {
  it("بلا مسارات → no-audio-tracks", () => {
    expect(summarizeTracks([])).toMatchObject({ tracks: 0, finals: 0, diagnosis: "no-audio-tracks" });
  });

  it("مسار سليم واحد يكفي ليكون التشخيص ok، والمجاميع تُجمع", () => {
    const sum = summarizeTracks([
      { audioSeconds: 10, peak: 3, audibleRatio: 0, speechStarts: 0, finals: 0 },
      { audioSeconds: 20.5, peak: 9000, audibleRatio: 0.6, speechStarts: 4, finals: 3 },
    ]);
    expect(sum).toEqual({ tracks: 2, audioSeconds: 30.5, speechStarts: 4, finals: 3, diagnosis: "ok" });
  });

  it("كل المسارات صامتة → silent-audio", () => {
    const sum = summarizeTracks([
      { audioSeconds: 85, peak: 2, audibleRatio: 0, speechStarts: 0, finals: 0 },
    ]);
    expect(sum.diagnosis).toBe("silent-audio");
  });
});

describe("agent.ts — يستخدم الإنهاء المحدود فعلاً", () => {
  const src = readFileSync(path.join(root, "meetings-agent/src/agent.ts"), "utf8");

  it("لا انتظار مفتوح على بثوث STT بعد إغلاق الغرفة", () => {
    expect(src).not.toContain("await Promise.allSettled([...activeStreams])");
    expect(src).toContain("settleWithin([...activeStreams], FINAL_GRACE_MS)");
  });

  it("ينهي إدخال كل بث ثم يرسل إشارة الاكتمال بعد الرفع الأخير", () => {
    const end = src.indexOf("for (const s of openStreams) s.endInput()");
    const close = src.indexOf("await uploader.close()");
    const complete = src.indexOf("await uploader.complete(summary)");
    expect(end).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(end);
    expect(complete).toBeGreaterThan(close);
  });

  it("close ينتظر الرفع الجاري قبل إشارة الاكتمال (flush متسلسل)", () => {
    expect(src).toContain("while (this.inflight) await this.inflight;");
  });

  it("يدفع صمتاً أطول من سكتة VAD قبل إنهاء الإدخال ليُختم آخر مقطع", () => {
    expect(src).toContain("sttOptions.turnDetection.silence_duration_ms + 500");
  });

  it("يركّب مستمع خطأ على STT", () => {
    expect(src).toContain('sttImpl.on("error"');
  });
});
