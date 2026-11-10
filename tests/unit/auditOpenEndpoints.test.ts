// تدقيق 2026-11-10: مسارات كانت مفتوحة للمجهول. الملفان أكبر من أن يُستوردا
// في اختبار وحدة، فالحارس هنا على نص التسجيل نفسه.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");

describe("GET /api/activities", () => {
  const routes = read("server/routes.ts");
  const start = routes.indexOf('app.get("/api/activities"');
  const block = routes.slice(start, routes.indexOf("// LIVE NEWS UPDATES ROUTES", start));

  it("requires a session and the audit permission", () => {
    expect(start).toBeGreaterThan(-1);
    expect(block.split("\n")[0]).toContain('requireAuth, requirePermission("system.view_audit")');
  });

  it("never falls back to the user's email as a display name", () => {
    expect(block).not.toContain("u.email");
  });
});

describe("mobile API", () => {
  const mobile = read("server/routes/mobileApiRoutes.ts");

  it("has no APNs test route (it pushed to real devices for anonymous callers)", () => {
    expect(mobile).not.toContain("test-apns");
  });

  it("batch-view only buffers short string article ids", () => {
    const start = mobile.indexOf('router.post("/articles/batch-view"');
    const block = mobile.slice(start, start + 1500);
    expect(block).toContain('typeof articleId === "string"');
    expect(block).toContain("articleId.length <= 64");
  });
});
