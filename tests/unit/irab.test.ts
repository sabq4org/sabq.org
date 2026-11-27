import { describe, expect, it } from "vitest";
import { mergeIrabPasses, parseIrabPass, validateIrabInput, IrabParseError, type IrabPass } from "../../shared/irab";

const SENT = "كتب الطالب الدرس";

function pass(cases: Array<[string, string, string]>, extra: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    valid: true,
    readings: [{
      name: "", sentence: "كَتَبَ الطَّالِبُ الدَّرْسَ", type: "جملة فعلية",
      words: cases.map(([word, c, roleKey], i) => ({
        word, case: c, roleKey, role: roleKey, sign: "", text: `إعراب ${i}`, head: i === 0 ? null : 0,
      })),
      notes: [],
    }],
    ...extra,
  });
}

const GOOD: Array<[string, string, string]> = [
  ["كَتَبَ", "mabni", "fiil_madi"], ["الطَّالِبُ", "raf", "fail"], ["الدَّرْسَ", "nasb", "maful_bih"],
];

describe("validateIrabInput", () => {
  it("accepts an Arabic sentence and normalizes spaces and tatweel", () => {
    expect(validateIrabInput("  كتـب   الطالب الدرس ")).toEqual({ ok: true, sentence: SENT });
  });
  it("rejects one word, Latin text, and over-long input", () => {
    expect(validateIrabInput("كتب").ok).toBe(false);
    expect(validateIrabInput("hello world there").ok).toBe(false);
    expect(validateIrabInput("كلمة ".repeat(20)).ok).toBe(false);
    expect(validateIrabInput(42).ok).toBe(false);
  });
});

describe("parseIrabPass", () => {
  it("parses a well-formed reply, even wrapped in a code fence", () => {
    const p = parseIrabPass("```json\n" + pass(GOOD) + "\n```", SENT);
    expect(p.valid).toBe(true);
    expect(p.readings[0].words.map((w) => w.case)).toEqual(["mabni", "raf", "nasb"]);
    expect(p.readings[0].words[1].head).toBe(0);
  });
  it("rejects a reply whose words are not the input sentence", () => {
    const wrong: Array<[string, string, string]> = [["قَرَأَ", "mabni", "fiil_madi"], ...GOOD.slice(1)];
    expect(() => parseIrabPass(pass(wrong), SENT)).toThrow(IrabParseError);
  });
  it("tolerates a split conjunction (و as its own word)", () => {
    const p = parseIrabPass(JSON.stringify({ valid: true, readings: [{ words: [
      { word: "وَ", case: "mabni", roleKey: "harf", role: "حرف عطف", text: "حرف عطف." },
      { word: "ذَهَبَ", case: "mabni", roleKey: "fiil_madi", role: "فعل ماض", text: "فعل ماض." },
      { word: "زَيْدٌ", case: "raf", roleKey: "fail", role: "فاعل", text: "فاعل." },
    ] }] }), "وذهب زيد");
    expect(p.readings[0].words).toHaveLength(3);
  });
  it("rejects an unknown case and drops an out-of-range head", () => {
    const bad: Array<[string, string, string]> = [["كَتَبَ", "fath", "fiil_madi"], ...GOOD.slice(1)];
    expect(() => parseIrabPass(pass(bad), SENT)).toThrow(IrabParseError);
    const raw = JSON.parse(pass(GOOD));
    raw.readings[0].words[2].head = 9;
    expect(parseIrabPass(JSON.stringify(raw), SENT).readings[0].words[2].head).toBeNull();
  });
  it("passes through an invalid-sentence verdict", () => {
    expect(parseIrabPass('{"valid": false, "problem": "ليست جملة"}', SENT)).toEqual({ valid: false, problem: "ليست جملة", readings: [] });
  });
});

describe("mergeIrabPasses", () => {
  const a = parseIrabPass(pass(GOOD), SENT);

  it("marks the result agreed only when both passes match word by word", () => {
    const r = mergeIrabPasses(SENT, a, parseIrabPass(pass(GOOD), SENT));
    expect(r.agreement).toBe("agreed");
    expect(r.readings[0].words.some((w) => w.uncertain)).toBe(false);
  });

  it("flags the differing word as uncertain and attaches the other reading", () => {
    const other: Array<[string, string, string]> = [GOOD[0], GOOD[1], ["الدَّرْسَ", "nasb", "maful_mutlaq"]];
    const r = mergeIrabPasses(SENT, a, parseIrabPass(pass(other), SENT));
    expect(r.agreement).toBe("partial");
    const words = r.readings[0].words;
    expect(words.map((w) => Boolean(w.uncertain))).toEqual([false, false, true]);
    expect(words[2].alt?.role).toBe("maful_mutlaq");
  });

  it("keeps an extra reading seen only by the second pass, marked uncertain", () => {
    const twoReadings = JSON.parse(pass(GOOD));
    const second = JSON.parse(JSON.stringify(twoReadings.readings[0]));
    second.name = "وجه آخر";
    second.words[2].case = "raf";
    second.words[2].roleKey = "naib_fail";
    twoReadings.readings.push(second);
    const b: IrabPass = parseIrabPass(JSON.stringify(twoReadings), SENT);
    const r = mergeIrabPasses(SENT, a, b);
    expect(r.agreement).toBe("partial");
    expect(r.readings).toHaveLength(2);
    expect(r.readings[1].uncertain).toBe(true);
  });

  it("reports single when one pass failed", () => {
    expect(mergeIrabPasses(SENT, a, null).agreement).toBe("single");
    expect(() => mergeIrabPasses(SENT, null, null)).toThrow(IrabParseError);
  });

  it("does not present a result as agreed when one pass rejects the sentence", () => {
    const r = mergeIrabPasses(SENT, a, { valid: false, problem: "x", readings: [] });
    expect(r.agreement).toBe("partial");
    expect(r.readings[0].words.every((w) => w.uncertain)).toBe(true);
  });
});
