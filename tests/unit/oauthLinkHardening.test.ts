import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { unverifiedLinkUpdates } from "../../server/utils/oauthLinkHardening";

// تدقيق 2026-11-10 (اختطاف مسبق): مهاجم يسجّل ببريد الضحية وكلمة مروره، ثم
// دخول الضحية بـGoogle/Apple يُربط بالصف نفسه وتبقى كلمة المرور والجلسات.
describe("unverifiedLinkUpdates", () => {
  it("drops the password and verifies the email on a never-verified account", () => {
    expect(unverifiedLinkUpdates({ emailVerified: false, passwordHash: "$2b$attacker" })).toEqual({
      passwordHash: null,
      emailVerified: true,
    });
    expect(unverifiedLinkUpdates({ emailVerified: null, passwordHash: null })).toEqual({
      passwordHash: null,
      emailVerified: true,
    });
  });

  it("leaves a verified account alone", () => {
    expect(unverifiedLinkUpdates({ emailVerified: true, passwordHash: "$2b$owner" })).toBeNull();
  });
});

describe("every OAuth linking site applies the hardening and revokes sessions", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");
  it.each([
    ["server/auth.ts", 2],
    ["server/routes/v1/oauthMobile.ts", 2],
  ])("%s", (file, sites) => {
    const src = read(file as string);
    expect(src.match(/unverifiedLinkUpdates\(/g)?.length).toBe(sites);
    expect(src.match(/await invalidateAllUserSessions\(existing(User)?\.id\)/g)?.length).toBe(sites);
  });
});

describe("admin password reset", () => {
  it("is behind the target-rank guard like the other user-admin routes", () => {
    const routes = readFileSync(resolve(__dirname, "../..", "server/routes.ts"), "utf8");
    const line = routes.split("\n").find((l) => l.includes('"/api/admin/users/:id/reset-password"'));
    expect(line).toContain('legacyUserActionGuard("admin_reset_password")');
  });
});
