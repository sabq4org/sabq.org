// تدقيق 2026-11-10: مسارات تولّد محتوى بنماذج مدفوعة كانت متاحة لأي قارئ مسجَّل.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPORTS_INTEL_ASK_PER_DAY, SPORTS_INTEL_ASK_PER_MINUTE } from "../../server/routes/v1/aiCostLimiters";

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");
const lineOf = (src: string, needle: string) => {
  const line = src.split("\n").find((l) => l.includes(needle));
  expect(line, `${needle} not found`).toBeTruthy();
  return line as string;
};

describe("paid AI routes need an editorial permission", () => {
  const routes = read("server/routes.ts");
  it.each([
    '"/api/ai-tools/summarize"',
    '"/api/ai-tools/social-post"',
    '"/api/ai-tools/image-search"',
    '"/api/ai-tools/translate"',
    '"/api/ai-tools/fact-check"',
    '"/api/ai-tools/analyze-trends"',
    '"/api/ai/generate-entity-description"',
    '"/api/deep-analysis/generate"',
  ])("%s", (path) => {
    expect(lineOf(routes, `app.post(${path}`)).toContain("requireAnyPermission('articles.create'");
  });

  it("notebooklm and social-card generation", () => {
    expect(lineOf(read("server/routes/notebookLmRoutes.ts"), 'router.post("/generate"')).toContain("requireAnyPermission(");
    expect(lineOf(read("server/routes/visualAiRoutes.ts"), 'router.post("/generate-social-cards"')).toContain("requireAnyPermission(");
  });
});

describe("anonymous sports copilot", () => {
  it("has its own tight budget, mounted before the mobile router", () => {
    expect(SPORTS_INTEL_ASK_PER_MINUTE).toBeLessThanOrEqual(10);
    expect(SPORTS_INTEL_ASK_PER_DAY).toBeLessThanOrEqual(100);
    const index = read("server/index.ts");
    expect(index.indexOf('app.use("/api/v1", aiCostLimiters)')).toBeGreaterThan(-1);
    expect(index.indexOf('app.use("/api/v1", aiCostLimiters)')).toBeLessThan(index.indexOf('app.use("/api/v1", mobileApiRoutes)'));
  });
});
