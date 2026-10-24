// عمق (التحليلات العميقة): أي مستخدم مسجل ينشئ تحليلًا يملكه، فصلاحية
// التحرير على ما يملك ليست تفويضًا بالنشر. وقائمة /api/omq العامة لا تقبل
// ?status لأنها كانت تكشف المسودات والمؤرشف لزائر مجهول (فحص Codex F5/F6).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decidePublish, type PublishGateState } from "../../server/services/publishGateRules";

const NO_PUBLISHER: PublishGateState = { allowed: true, code: "NO_PUBLISHER", publisher: null };
const routes = readFileSync(new URL("../../server/routes.ts", import.meta.url), "utf8");

function handler(signature: string): string {
  const start = routes.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  const next = routes.indexOf("\n  app.", start + signature.length);
  return routes.slice(start, next);
}

describe("deep analysis publishing", () => {
  it("denies an owner who can only edit their own work from publishing it", () => {
    const reporterPerms = ["articles.create", "articles.edit_own"];
    expect(decidePublish({ nextStatus: "published", gate: NO_PUBLISHER, permissions: reporterPerms })).toMatchObject({
      httpStatus: 403,
    });
    expect(decidePublish({ nextStatus: "completed", gate: NO_PUBLISHER, permissions: reporterPerms })).toBeNull();
  });

  it.each([
    'app.patch("/api/deep-analysis/:id/status"',
    'app.patch("/api/omq/:id"',
    'app.put("/api/deep-analysis/:id"',
  ])("%s runs the central publish gate before saving", (signature) => {
    const body = handler(signature);
    const gate = body.indexOf("denyPublish(");
    const save = body.indexOf("storage.updateDeepAnalysis(");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(save);
  });

  it("the public /api/omq list is pinned to published", () => {
    const body = handler('app.get("/api/omq"');
    expect(body).toMatch(/status:\s*"published"/);
    expect(body).not.toMatch(/status:\s*status/);
  });
});
