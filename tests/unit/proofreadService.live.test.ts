// Opt-in paid evaluation with synthetic text. No database, articles, or usage-log writes.
// PROOFREAD_LIVE_EVAL=1 OPENAI_API_KEY=... npx vitest run tests/unit/proofreadService.live.test.ts
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
vi.mock("../../server/ai/gateway", async () => {
  const { openaiAdapter } = await import("../../server/ai/gateway/adapters/openai");
  return { aiGateway: { complete: async (req: any) => {
    if (process.env.PROOFREAD_EVAL_BASELINE_PATH) {
      const before = fs.readFileSync(process.env.PROOFREAD_EVAL_BASELINE_PATH, "utf8");
      req.messages[0].content = before.match(/const CONTENT_SYSTEM_PROMPT = `([^]*?)`;/)![1];
    }
    const result = await openaiAdapter.complete!("gpt-5.1", {
      messages: req.messages, maxTokens: req.options.maxTokens, jsonMode: true, timeoutMs: req.timeoutMs,
    });
    console.log(JSON.stringify({ model: "gpt-5.1", ...result }));
    return result;
  } } };
});
import { proofreadContent } from "../../server/services/proofreadService";

const run = process.env.PROOFREAD_LIVE_EVAL === "1" ? describe : describe.skip;
run("live Arabic proofreading corpus", () => {
  it("detects joined words and omitted hamzas in editorial prose", async () => {
    const result = await proofreadContent('<p>اعلنت الادارة انتقال الفريق الى مقر جديد. وتتحول علاقته بالشركةمن العمل القانوني إلى شراكة، لتنفيذ مشروعتقني وتحديد المخاطروالالتزامات.</p>');
    for (const [original, suggestion] of [["اعلنت", "أعلنت"], ["الادارة", "الإدارة"], ["الى", "إلى"], ["بالشركةمن", "بالشركة من"], ["مشروعتقني", "مشروع تقني"], ["المخاطروالالتزامات", "المخاطر والالتزامات"]]) {
      expect(result.issues.some(i => i.original === original && i.suggestion === suggestion), `${original} -> ${suggestion}`).toBe(true);
    }
  }, 120_000);
  it("preserves valid hamzat-wasl, clitics, names and numbers", async () => {
    const result = await proofreadContent('<p>أعلنت شركة White &amp; Case استثمارها في Clauze.AI. ويهدف الاستثمار إلى استخدام الذكاء الاصطناعي في ابتكار أدوات للمحامين، وبالشركة فريق يعمل على تطوير أعمالها في الرياض. بدأ اجتماع الفريق الساعة 10:30 لمراجعة 25 عقدًا، والتزمت الإدارة بإجراء المراجعة الواجبة.</p>');
    expect(result.issues).toEqual([]);
  }, 120_000);
  it("detects unseen combinations in contextual sentences", async () => {
    const source = 'اكد المتحدث ان الوزارة ستطلقخدمة جديدة يوم الاحد، وتهدف الى تسريعاجراءات التسجيل للمستفيدين.';
    const result = await proofreadContent(source);
    expect(result.issues.some(i => i.original === "ستطلقخدمة" && i.suggestion === "ستطلق خدمة")).toBe(true);
    // A model may combine the spacing/hamza correction or report them in two
    // applicable steps. Assert the corrected text, not one arbitrary grouping.
    const corrected = result.issues.reduce((text, i) => text.replace(i.original, i.suggestion), source);
    expect(corrected).toContain("تسريع إجراءات");
    for (const word of ["اكد", "ان", "الاحد", "الى"]) expect(result.issues.some(i => i.original === word), word).toBe(true);
  }, 120_000);
});
