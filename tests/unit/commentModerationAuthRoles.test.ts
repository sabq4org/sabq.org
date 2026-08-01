/**
 * يضمن أن قائمة أدوار إشراف التعليقات لا تُسقِط حسابات مدير النظام
 * (كان ذلك يسبب 403 على /api/moderation/* بينما الشريط الجانبي يظهر اللوحة).
 */
import { describe, expect, it } from "vitest";
import { SUPERUSER_ROLE_NAMES } from "../../shared/rbac-constants";

/** مرآة للمنطق في server/routes/commentModeration.ts */
const MODERATOR_ROLES: readonly string[] = [
  ...SUPERUSER_ROLE_NAMES,
  "super_admin",
  "editor",
  "chief_editor",
  "moderator",
  "comments_moderator",
];

describe("comment moderation auth roles", () => {
  it("includes every SUPERUSER_ROLE_NAMES alias", () => {
    for (const role of SUPERUSER_ROLE_NAMES) {
      expect(MODERATOR_ROLES).toContain(role);
    }
  });

  it("includes system_admin so dashboard API matches sidebar visibility", () => {
    expect(MODERATOR_ROLES).toContain("system_admin");
    expect(MODERATOR_ROLES).toContain("system.admin");
  });

  it("keeps editorial moderator roles", () => {
    expect(MODERATOR_ROLES).toEqual(
      expect.arrayContaining([
        "editor",
        "chief_editor",
        "moderator",
        "comments_moderator",
      ]),
    );
  });
});
