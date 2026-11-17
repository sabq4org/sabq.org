// «مُدوِّن سبق AI» — إثبات أن إعدادات التفريغ (المرحلة الأولى من خطة الدقة)
// هي فعلاً ما يُمرَّر إلى new openai.STT(...) في meetings-agent/src/agent.ts.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_PROMPT_CHARS,
  SABQ_FIXED_TERMS,
  SegmentClock,
  buildSttOptions,
  buildTranscriptionPrompt,
  normalizeKeyterms,
  parseJobMetadata,
} from "../../meetings-agent/src/sttConfig";

const root = path.resolve(import.meta.dirname, "../..");

describe("buildSttOptions — الخيارات الممرَّرة لـ openai.STT", () => {
  it("snapshot: نموذج + عربي + server_vad بسكتة ١٠٠٠ms + near_field + prompt", () => {
    const opts = buildSttOptions(["علي الحازمي", "قسم التحرير"]);
    expect({ ...opts, prompt: undefined }).toEqual({
      model: "gpt-4o-transcribe",
      language: "ar",
      prompt: undefined,
      turnDetection: {
        type: "server_vad",
        threshold: 0.55,
        prefix_padding_ms: 300,
        silence_duration_ms: 1000,
      },
      noiseReductionType: "near_field",
    });
    expect(opts.prompt).toContain("صحيفة سبق");
    expect(opts.prompt).toContain("اللهجة السعودية");
    expect(opts.prompt).toContain("علي الحازمي");
    expect(opts.prompt).toContain("قسم التحرير");
    for (const t of SABQ_FIXED_TERMS.slice(0, 5)) expect(opts.prompt).toContain(t);
  });

  it("agent.ts يمرّر buildSttOptions مباشرة لـ openai.STT ويقرأ metadata بـ parseJobMetadata", () => {
    const src = readFileSync(path.join(root, "meetings-agent/src/agent.ts"), "utf8");
    expect(src).toMatch(/const sttOptions = buildSttOptions\(meta\.keyterms\)/);
    expect(src).toMatch(/new openai\.STT\(sttOptions\)/);
    expect(src).toMatch(/parseJobMetadata\(ctx\.job\.metadata\)/);
    // لا تبقى خيارات مضمّنة قديمة بلا turn detection
    expect(src).not.toMatch(/new openai\.STT\(\{\s*model:/);
    // الأسماء لا تُطبع: سطر السجل يطبع العدد فقط
    expect(src).not.toMatch(/console\.\w+\([^)]*meta\.keyterms(?!\.length)/);
  });

  it("الخيارات موجودة في نسخة الإضافة المثبّتة (STTOptions في 1.5.3)", () => {
    const lock = JSON.parse(readFileSync(path.join(root, "meetings-agent/package-lock.json"), "utf8"));
    const v = lock.packages["node_modules/@livekit/agents-plugin-openai"].version as string;
    expect(v).toBe("1.5.3");
    const dts = path.join(root, "meetings-agent/node_modules/@livekit/agents-plugin-openai/dist/stt.d.ts");
    let text = "";
    try {
      text = readFileSync(dts, "utf8");
    } catch {
      return; // CI لا يثبّت حزم meetings-agent — نسخة القفل أعلاه تكفي هناك
    }
    expect(text).toMatch(/prompt\?: string;/);
    expect(text).toMatch(/turnDetection\?: api_proto\.TurnDetectionType \| null;/);
    expect(text).toMatch(/noiseReductionType\?: api_proto\.NoiseReductionType;/);
  });
});

describe("buildTranscriptionPrompt — السقف والتنظيف", () => {
  it("لا يتجاوز MAX_PROMPT_CHARS مهما طالت القائمة ولا يقص اسماً في منتصفه", () => {
    const many = Array.from({ length: 500 }, (_, i) => `موظف رقم ${i}`);
    const p = buildTranscriptionPrompt(many);
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    const listed = p.split("قد ترد: ")[1].replace(/\.$/, "").split("، ");
    for (const t of listed) expect([...SABQ_FIXED_TERMS, ...many]).toContain(t);
  });

  it("normalizeKeyterms: يحذف المكرر والفارغ وغير النصي والطويل ويزيل الفواصل", () => {
    expect(
      normalizeKeyterms(["  سبق ", "سبق", "", 42, null, "أ".repeat(61), "خالد،  محمد"]),
    ).toEqual(["سبق", "خالد محمد"]);
  });
});

describe("parseJobMetadata", () => {
  it("يقرأ meetingId وkeyterms ويتجاهل الأشكال الخاطئة", () => {
    expect(parseJobMetadata(JSON.stringify({ meetingId: "m1", keyterms: ["سارة", 5, "سارة"] }))).toEqual({
      meetingId: "m1",
      keyterms: ["سارة"],
    });
    expect(parseJobMetadata(JSON.stringify({ meetingId: "m1" }))).toEqual({ meetingId: "m1", keyterms: [] });
    expect(parseJobMetadata("not json")).toEqual({ keyterms: [] });
    expect(parseJobMetadata(undefined)).toEqual({ meetingId: undefined, keyterms: [] });
  });
});

describe("SegmentClock — startMs عند بدء الكلام لا عند النص النهائي", () => {
  const fakeNow = () => {
    let t = 0;
    const fn = () => t;
    fn.set = (v: number) => (t = v);
    return fn;
  };

  it("FINAL يأخذ لحظة START_OF_SPEECH", () => {
    const now = fakeNow();
    const c = new SegmentClock(now);
    now.set(1000);
    c.onStartOfSpeech();
    now.set(1800);
    c.onInterim();
    now.set(5200); // النص النهائي يصل بعد سكتة الثانية
    expect(c.onFinal()).toBe(1000);
    c.onSegmentDone();
  });

  it("مقطع تالٍ يبدأ قبل وصول FINAL السابق — لا يختلط الترتيب (FIFO)", () => {
    const now = fakeNow();
    const c = new SegmentClock(now);
    now.set(1000);
    c.onStartOfSpeech(); // المقطع ١
    now.set(4000);
    c.onStartOfSpeech(); // المقطع ٢ بدأ
    now.set(4300);
    expect(c.onFinal()).toBe(1000); // FINAL المقطع ١
    c.onSegmentDone();
    now.set(9000);
    expect(c.onFinal()).toBe(4000); // FINAL المقطع ٢
    c.onSegmentDone();
  });

  it("مقطع مكتمل بلا نص (USAGE بلا FINAL) يُزال فلا ينزاح ما بعده", () => {
    const now = fakeNow();
    const c = new SegmentClock(now);
    now.set(100);
    c.onStartOfSpeech();
    c.onSegmentDone(); // ضجيج بلا نص
    now.set(2000);
    c.onStartOfSpeech();
    now.set(3500);
    expect(c.onFinal()).toBe(2000);
  });

  it("احتياط: بلا حدث بدء → أول INTERIM، وبلا INTERIM → لحظة FINAL", () => {
    const now = fakeNow();
    const c = new SegmentClock(now);
    now.set(700);
    c.onInterim();
    now.set(900);
    c.onInterim();
    now.set(3000);
    expect(c.onFinal()).toBe(700);
    c.onSegmentDone();
    now.set(6000);
    expect(c.onFinal()).toBe(6000);
  });
});
