import { describe, expect, it } from "vitest";
import {
  buildEnAutoSelectionPrompt,
  DEFAULT_EN_AUTO_TRANSLATE_SETTINGS,
  enAutoTranslateSettingsSchema,
  parseEnAutoScores,
  pickEnAutoWinners,
} from "../../shared/enAutoTranslate";

describe("EN auto-translate selection", () => {
  it("builds a prompt with stories, breaking flag and already-translated titles", () => {
    const prompt = buildEnAutoSelectionPrompt(
      [{ id: "a1", title: "التحالف: اعتراض <b>صاروخ</b>", excerpt: null, categoryNameAr: "محليات", newsType: "breaking" }],
      ["Coalition intercepts drone over Riyadh"],
    );
    expect(prompt).toContain("id: a1");
    expect(prompt).toContain("title: التحالف: اعتراض صاروخ");
    expect(prompt).toContain("flag: breaking");
    expect(prompt).toContain("- Coalition intercepts drone over Riyadh");
  });

  it("parses fenced JSON, clamps scores and drops unknown or repeated ids", () => {
    const raw = '```json\n{"items":[{"id":"a1","score":12,"reason":"coalition"},{"id":"zz","score":9},{"id":"a1","score":2},{"id":"a2","score":"4"}]}\n```';
    expect(parseEnAutoScores(raw, ["a1", "a2"])).toEqual([
      { id: "a1", score: 10, reason: "coalition" },
      { id: "a2", score: 4, reason: "" },
    ]);
    expect(parseEnAutoScores("not json", ["a1"])).toEqual([]);
  });

  it("picks the highest scores above the threshold, newest first on ties, capped per run", () => {
    const scores = [
      { id: "old", score: 8, reason: "" },
      { id: "local", score: 4, reason: "" },
      { id: "new", score: 8, reason: "" },
      { id: "top", score: 10, reason: "" },
    ];
    const winners = pickEnAutoWinners(scores, ["new", "local", "top", "old"], { maxPerRun: 2, minScore: 7 });
    expect(winners.map((w) => w.id)).toEqual(["top", "new"]);
  });

  it("validates settings strictly", () => {
    expect(enAutoTranslateSettingsSchema.parse(DEFAULT_EN_AUTO_TRANSLATE_SETTINGS)).toEqual(DEFAULT_EN_AUTO_TRANSLATE_SETTINGS);
    expect(() => enAutoTranslateSettingsSchema.parse({ ...DEFAULT_EN_AUTO_TRANSLATE_SETTINGS, maxPerRun: 50 })).toThrow();
    expect(() => enAutoTranslateSettingsSchema.parse({ ...DEFAULT_EN_AUTO_TRANSLATE_SETTINGS, mode: "auto" })).toThrow();
  });
});
