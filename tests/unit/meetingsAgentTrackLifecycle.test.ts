// «مُدوِّن سبق AI» — منع الفشل الصامت والتعليق عند الإغلاق (اجتماع 78848e31، 2026-11-17):
// انضم العامل ولم يرفع أي مقطع ولم يطبع خطأ، ثم «job is unresponsive».
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SHUTDOWN_GRACE_MS,
  describeEnvPresence,
  describeSttErrorEvent,
  diagnoseTrack,
  formatTrackSummary,
  newTrackStats,
  safeErrorMessage,
  settleWithin,
} from "../../meetings-agent/src/trackLifecycle";

const root = path.resolve(import.meta.dirname, "../..");
const agentSrc = () => readFileSync(path.join(root, "meetings-agent/src/agent.ts"), "utf8");

describe("agent.ts — أخطاء STT تُطبع والإغلاق لا يعلق", () => {
  it("يستمع لحدث error على كائن STT (بدونه يضيع الخطأ في debug)", () => {
    expect(agentSrc()).toMatch(/sttImpl\.on\("error"/);
  });
  it("يغلق قارئ الصوت والجلسات عند قطع الغرفة وينتظر بمهلة", () => {
    const src = agentSrc();
    expect(src).toMatch(/reader\.cancel\(\)/);
    expect(src).toMatch(/for \(const close of \[\.\.\.closers\]\) close\(\)/);
    expect(src).toMatch(/settleWithin\(\[\.\.\.activeStreams\], SHUTDOWN_GRACE_MS\)/);
    expect(src).not.toMatch(/await Promise\.allSettled\(\[\.\.\.activeStreams\]\)/);
  });
  it("يطبع وجود المتغيرات فقط لا قيمها، وملخص كل مسار", () => {
    const src = agentSrc();
    expect(src).toMatch(/describeEnvPresence\(process\.env\)/);
    expect(src).not.toMatch(/console\.\w+\([^)]*process\.env\.(OPENAI_API_KEY|MEETINGS_AGENT_SECRET)/);
    expect(src).toMatch(/formatTrackSummary\(s\)/);
  });
});

describe("settleWithin", () => {
  it("يعود settled حين تنتهي الوعود", async () => {
    expect(await settleWithin([Promise.resolve(1), Promise.reject(new Error("x"))], 1000)).toBe("settled");
  });
  it("يعود timeout لوعد لا ينتهي (AudioStream لا ينتهي بعد قطع الغرفة)", async () => {
    const never = new Promise(() => {});
    expect(await settleWithin([never], 20)).toBe("timeout");
  });
  it("مهلة الإغلاق أقل من مهلة «job is unresponsive» في LiveKit", () => {
    expect(SHUTDOWN_GRACE_MS).toBeLessThan(55_000);
  });
});

describe("describeSttErrorEvent / safeErrorMessage", () => {
  it("يقرأ شكل حدث stt_error في @livekit/agents", () => {
    const ev = { type: "stt_error", error: new Error("Incorrect API key provided"), recoverable: false };
    expect(describeSttErrorEvent(ev)).toEqual({ message: "Incorrect API key provided", recoverable: false });
    expect(describeSttErrorEvent({ error: new Error("x"), recoverable: true }).recoverable).toBe(true);
  });
  it("يخفي ما يشبه المفاتيح والتوكنات ويقص الطول", () => {
    const msg = safeErrorMessage(new Error("bad key sk-proj-ABCDEFGHIJKLMNOP and Bearer botpub_abcdefghijklmnop\nline2"));
    expect(msg).not.toMatch(/ABCDEFGHIJ/);
    expect(msg).not.toMatch(/abcdefghij/);
    expect(msg).not.toMatch(/\n/);
    expect(safeErrorMessage("x".repeat(1000)).length).toBe(300);
  });
});

describe("describeEnvPresence", () => {
  it("set/missing فقط — القيمة لا تظهر", () => {
    const { line, missing } = describeEnvPresence({
      OPENAI_API_KEY: "sk-secret-value",
      SABQ_API_URL: "https://sabq.org",
      MEETINGS_AGENT_SECRET: " ",
    });
    expect(line).toContain("OPENAI_API_KEY=set");
    expect(line).toContain("MEETINGS_AGENT_SECRET=missing");
    expect(line).toContain("LIVEKIT_URL=missing");
    expect(line).not.toContain("sk-secret-value");
    expect(missing).toEqual(["MEETINGS_AGENT_SECRET", "LIVEKIT_URL"]);
  });
});

describe("diagnoseTrack", () => {
  it("يميّز فشل STT وغياب الصوت وغياب الكلام", () => {
    const s = newTrackStats("user-1");
    expect(diagnoseTrack(s)).toBe("no-audio-frames");
    s.frames = 500;
    expect(diagnoseTrack(s)).toBe("audio-but-no-speech-detected");
    s.errors = 1;
    s.lastError = "Incorrect API key provided";
    expect(diagnoseTrack(s)).toBe("stt-failed");
    s.errors = 0;
    s.speechStarts = 3;
    expect(diagnoseTrack(s)).toBe("speech-but-no-transcript");
    s.finals = 2;
    expect(diagnoseTrack(s)).toBe("ok");
    expect(formatTrackSummary(s)).toContain("track user-1: frames=500 speechStarts=3 finals=2");
  });
});
