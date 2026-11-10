// تدقيق 2026-11-10: حراس على مسارات محتوى في server/routes.ts (الملف أكبر من
// أن يُستورد في اختبار وحدة، فالحارس على نص المسار).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routes = readFileSync(resolve(__dirname, "../..", "server/routes.ts"), "utf8");
const handler = (signature: string, span = 6000) => {
  const start = routes.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  return routes.slice(start, start + span);
};

describe("en/ur article by slug", () => {
  it.each(['app.get("/api/en/articles/:slug"', 'app.get("/api/ur/articles/:slug"'])(
    "%s hides unpublished rows from the public",
    (signature) => {
      expect(handler(signature, 3500)).toContain("canReadLocalizedArticle(");
    },
  );

  it("only published rows are public; others need ownership or an article permission", () => {
    const helper = handler("const canReadLocalizedArticle = async", 700);
    expect(helper).toContain('if (article.status === "published") return true;');
    expect(helper).toContain("if (!viewerId) return false;");
  });
});

describe("POST /api/admin/articles/:id/publish", () => {
  const block = handler('app.post("/api/admin/articles/:id/publish"');

  it("refuses rows that are not draft or scheduled", () => {
    expect(block).toContain('article.status !== "draft" && article.status !== "scheduled"');
    expect(block).toContain("ARTICLE_NOT_PUBLISHABLE");
  });

  it("re-checks state and the edit lock inside every UPDATE", () => {
    expect(block).toContain('inArray(articles.status, ["draft", "scheduled"])');
    expect(block).toContain("articleLockAllowsWriter(userId)");
    expect(block.match(/\.where\(publishableNow\)/g)?.length).toBe(2);
    expect(block).not.toContain(".where(eq(articles.id, articleId))\n              .returning()");
  });

  it("does not charge a publisher credit when nothing was published", () => {
    expect(block.indexOf('throw new Error("NOT_PUBLISHABLE")')).toBeLessThan(block.indexOf("chargePublishInTx("));
  });
});

describe("legacy hard delete", () => {
  it("DELETE /api/dashboard/articles/:id is gone", () => {
    expect(routes).not.toContain('app.delete("/api/dashboard/articles/:id"');
  });
});
