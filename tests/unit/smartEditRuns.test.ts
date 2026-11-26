import { describe, expect, it } from "vitest";
import {
  adoptionLabel,
  computeAdoption,
  countWords,
  overlapRatio,
  plainText,
  runMatchesContent,
  wordDiff,
} from "@shared/smartEditRuns";

const PASTED =
  "أعلن المركز الوطني للأرصاد اليوم ان منطقة الرياض ومنطقة القصيم سوف تشهد هطول أمطار رعدية متوسطة الى غزيرة وذلك ابتداء من يوم الخميس وحتى يوم الأحد المقبل مع رياح نشطة مثيرة للأتربة";
const OUTPUT =
  "<p>توقع المركز الوطني للأرصاد هطول أمطار رعدية متوسطة إلى غزيرة على منطقتي الرياض والقصيم من الخميس حتى الأحد، تصحبها رياح نشطة مثيرة للأتربة تحد من مدى الرؤية الأفقية.</p>";

describe("smart edit runs — fingerprint", () => {
  it("strips HTML and counts words", () => {
    expect(plainText("<p>مرحبا&nbsp;<b>بكم</b></p>")).toBe("مرحبا بكم");
    expect(countWords(OUTPUT)).toBeGreaterThan(20);
  });

  it("attributes a published text copied from the output to the smart editor", () => {
    const adoption = computeAdoption({ finalContent: OUTPUT, outputContent: OUTPUT, inputContent: PASTED });
    expect(adoption.aiPct).toBe(100);
    expect(adoption.pastedPct + adoption.editorPct).toBe(0);
    expect(adoptionLabel(adoption).label).toBe("اعتُمد الناتج");
  });

  it("attributes the pasted text kept as-is to the paste, not to the AI", () => {
    const adoption = computeAdoption({ finalContent: PASTED, outputContent: OUTPUT, inputContent: PASTED });
    expect(adoption.aiPct).toBeLessThan(25);
    expect(adoption.pastedPct).toBeGreaterThan(60);
    expect(adoptionLabel(adoption).tone).toBe("red");
  });

  it("counts the editor's own sentences separately and sums to 100", () => {
    const final = `${OUTPUT} ودعا الدفاع المدني السكان إلى البقاء في أماكن آمنة والابتعاد عن مجاري السيول والأودية`;
    const adoption = computeAdoption({ finalContent: final, outputContent: OUTPUT, inputContent: PASTED });
    expect(adoption.editorPct).toBeGreaterThan(20);
    expect(adoption.aiPct + adoption.pastedPct + adoption.editorPct).toBe(100);
  });

  it("ignores diacritics and hamza differences when matching", () => {
    expect(overlapRatio("أمطار رعديّة متوسطة إلى غزيرة", "امطار رعدية متوسطه الى غزيره")).toBe(1);
  });

  it("returns zeros for an empty saved text", () => {
    expect(computeAdoption({ finalContent: "", outputContent: OUTPUT, inputContent: PASTED })).toEqual({
      aiPct: 0,
      pastedPct: 0,
      editorPct: 0,
      finalWords: 0,
    });
  });
});

describe("smart edit runs — linking an unlinked run on first save", () => {
  it("matches a save that carries the output or the pasted text", () => {
    expect(runMatchesContent(OUTPUT, { inputContent: PASTED, outputContent: OUTPUT })).toBe(true);
    expect(runMatchesContent(PASTED, { inputContent: PASTED, outputContent: OUTPUT })).toBe(true);
  });

  it("does not match an unrelated story", () => {
    const other = "افتتح معرض الرياض الدولي للكتاب أبوابه للزوار بمشاركة أكثر من ألفي دار نشر من ثلاثين دولة";
    expect(runMatchesContent(other, { inputContent: PASTED, outputContent: OUTPUT })).toBe(false);
  });
});

describe("smart edit runs — word diff", () => {
  it("marks added and removed words and keeps shared ones", () => {
    const ops = wordDiff("قال المتحدث إن الوضع مستقر", "أكد المتحدث أن الوضع مستقر تمامًا")!;
    expect(ops.map((op) => op.type)).toContain("add");
    expect(ops.map((op) => op.type)).toContain("del");
    const after = ops.filter((op) => op.type !== "del").map((op) => op.text).join(" ");
    expect(after).toBe("أكد المتحدث أن الوضع مستقر تمامًا");
    const before = ops.filter((op) => op.type !== "add").map((op) => op.text).join(" ");
    expect(before).toBe("قال المتحدث إن الوضع مستقر");
  });

  it("gives up (null) on texts beyond the word limit instead of freezing the page", () => {
    const long = Array.from({ length: 2600 }, (_, i) => `كلمة${i}`).join(" ");
    expect(wordDiff(long, "قصير")).toBeNull();
  });
});
