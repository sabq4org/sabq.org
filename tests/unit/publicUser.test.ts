// Guards the one rule that kept being broken by hand: a `users` row must never
// reach a client carrying its credential columns.
//
// The audit found this three separate ways — a bare `.returning()` on the
// self-profile routes, a bare `db.select()` over a join on the public
// article-by-slug routes, and an inline destructure that stripped two of the
// four secret columns. The drift test at the bottom is the important one: it
// fails when the table gains a new secret-shaped column that nobody added to
// the denylist.

import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { users } from "@shared/schema";
import { SENSITIVE_USER_FIELDS, toPublicUser } from "../../server/utils/publicUser";

const ROW = {
  id: "u_1",
  email: "editor@sabq.org",
  firstName: "سارة",
  lastName: "الحربي",
  role: "editor",
  bio: "محررة",
  profileImageUrl: "/img.png",
  twoFactorEnabled: true,
  // the four that must never ship
  passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
  twoFactorSecret: "JBSWY3DPEHPK3PXP",
  twoFactorBackupCodes: ["11111111", "22222222"],
  fcmToken: "fcm-device-token",
};

describe("toPublicUser", () => {
  it.each(SENSITIVE_USER_FIELDS)("removes %s", (field) => {
    expect(toPublicUser(ROW)).not.toHaveProperty(field);
  });

  it("keeps everything the dashboard needs", () => {
    const safe = toPublicUser(ROW) as Record<string, unknown>;
    for (const key of ["id", "email", "firstName", "lastName", "role", "bio", "profileImageUrl", "twoFactorEnabled"]) {
      expect(safe).toHaveProperty(key);
    }
  });

  it("reports whether 2FA is on without revealing the factor itself", () => {
    const safe = toPublicUser(ROW) as Record<string, unknown>;
    expect(safe.twoFactorEnabled).toBe(true);
    expect(safe.twoFactorSecret).toBeUndefined();
    expect(safe.twoFactorBackupCodes).toBeUndefined();
  });

  it("does not mutate the row it was given", () => {
    const row = { ...ROW };
    toPublicUser(row);
    expect(row.passwordHash).toBe(ROW.passwordHash);
  });

  it("passes null/undefined through instead of throwing", () => {
    expect(toPublicUser(null)).toBeNull();
    expect(toPublicUser(undefined)).toBeNull();
  });

  it("serialises without any secret surviving JSON round-trip", () => {
    const json = JSON.stringify(toPublicUser(ROW));
    for (const field of SENSITIVE_USER_FIELDS) {
      expect(json).not.toContain(field);
    }
    expect(json).not.toContain("$2b$12$");
    expect(json).not.toContain("JBSWY3DPEHPK3PXP");
  });
});

describe("denylist drift", () => {
  // A denylist is only as good as its maintenance. If someone adds
  // `resetPasswordToken` or `apiSecret` to the users table and forgets
  // publicUser.ts, this fails — which is the whole point.
  const SECRET_SHAPED = /password|secret|token|hash|backup|otp/i;

  it("covers every secret-shaped column on the users table", () => {
    const columnNames = Object.keys(getTableColumns(users));
    const suspicious = columnNames.filter((c) => SECRET_SHAPED.test(c));
    const allowed = new Set<string>([
      ...SENSITIVE_USER_FIELDS,
      // Not a secret: a boolean flag telling the UI to prompt for a new
      // password. Listed explicitly so the exemption is a decision, not a gap.
      "mustChangePassword",
    ]);

    const uncovered = suspicious.filter((c) => !allowed.has(c));
    expect(
      uncovered,
      `users.${uncovered.join(", users.")} looks like a credential column but is not in SENSITIVE_USER_FIELDS`,
    ).toEqual([]);
  });

  it("does not list fields that no longer exist on the table", () => {
    const columnNames = new Set(Object.keys(getTableColumns(users)));
    const stale = SENSITIVE_USER_FIELDS.filter((f) => !columnNames.has(f));
    expect(stale, `stale entries in SENSITIVE_USER_FIELDS: ${stale.join(", ")}`).toEqual([]);
  });
});
