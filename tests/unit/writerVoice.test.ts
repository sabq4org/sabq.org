import { describe, expect, it } from "vitest";
import {
  WRITER_VOICE_SCRIPT,
  activeScriptIndex,
  buildWriterVoicePreviewText,
  checkWriterVoiceDuration,
  classifyRoomNoise,
  classifySpeechLevel,
  isWriterVoiceSampleDue,
  normalizeWriterVoiceMime,
  rmsToDbfs,
  writerVoiceSampleDeletesAt,
} from "../../shared/writerVoice";

describe("writer voice: recording rules", () => {
  it("accepts browser recorder MIME types and strips codecs", () => {
    expect(normalizeWriterVoiceMime("audio/webm;codecs=opus")).toEqual({ mime: "audio/webm", ext: "webm" });
    expect(normalizeWriterVoiceMime("audio/mp4")).toEqual({ mime: "audio/mp4", ext: "m4a" });
    expect(normalizeWriterVoiceMime("video/mp4")).toBeNull();
    expect(normalizeWriterVoiceMime("application/pdf")).toBeNull();
    expect(normalizeWriterVoiceMime(undefined)).toBeNull();
  });

  it("requires between 45 seconds and 2 minutes", () => {
    expect(checkWriterVoiceDuration(30)).toBe("too_short");
    expect(checkWriterVoiceDuration(44.9)).toBe("too_short");
    expect(checkWriterVoiceDuration(45)).toBe("ok");
    expect(checkWriterVoiceDuration(64)).toBe("ok");
    expect(checkWriterVoiceDuration(121)).toBe("ok"); // timer rounding margin
    expect(checkWriterVoiceDuration(130)).toBe("too_long");
    expect(checkWriterVoiceDuration(Number.NaN)).toBe("too_short");
  });

  it("classifies room noise and speech level", () => {
    expect(rmsToDbfs(1)).toBe(0);
    expect(Math.round(rmsToDbfs(0.01))).toBe(-40);
    expect(rmsToDbfs(0)).toBe(-100);
    expect(classifyRoomNoise(-60)).toBe("quiet");
    expect(classifyRoomNoise(-45)).toBe("acceptable");
    expect(classifyRoomNoise(-30)).toBe("noisy");
    expect(classifySpeechLevel(-25, 0)).toBe("ok");
    expect(classifySpeechLevel(-45, 0)).toBe("low");
    expect(classifySpeechLevel(-10, 0.05)).toBe("clipping");
  });
});

describe("writer voice: retention", () => {
  it("deletes the raw sample 30 days after the voice is ready", () => {
    const ready = new Date("2026-11-25T08:00:00Z");
    expect(writerVoiceSampleDeletesAt(ready)?.toISOString()).toBe("2026-12-25T08:00:00.000Z");
    expect(isWriterVoiceSampleDue(ready, new Date("2026-12-24T08:00:00Z"))).toBe(false);
    expect(isWriterVoiceSampleDue(ready, new Date("2026-12-25T08:00:00Z"))).toBe(true);
    expect(isWriterVoiceSampleDue(null)).toBe(false);
  });
});

describe("writer voice: preview text and prompter", () => {
  it("cuts the latest article at a sentence end without breaking words", () => {
    const text = `${"جملة أولى قصيرة. ".repeat(10)}${"كلمة ".repeat(80)}`;
    const out = buildWriterVoicePreviewText(text, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith(".")).toBe(true);
  });

  it("falls back to the reading script when the writer has no article", () => {
    expect(buildWriterVoicePreviewText("")).toContain("أكتب");
  });

  it("moves the highlighted sentence forward with time", () => {
    expect(activeScriptIndex(0)).toBe(0);
    expect(activeScriptIndex(30)).toBeGreaterThan(0);
    expect(activeScriptIndex(30)).toBeLessThan(WRITER_VOICE_SCRIPT.length - 1);
    expect(activeScriptIndex(999)).toBe(WRITER_VOICE_SCRIPT.length - 1);
  });
});
