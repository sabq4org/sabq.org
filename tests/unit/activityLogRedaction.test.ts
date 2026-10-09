import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { redactActivityValue } from "../../server/rbac";

describe("redactActivityValue", () => {
  it("drops password hashes and 2FA secrets from a full users row", () => {
    const row = {
      id: "u1",
      email: "editor@sabq.org",
      role: "editor",
      passwordHash: "$2b$10$abc",
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorBackupCodes: ["hash1", "hash2"],
      createdAt: new Date("2026-10-09T00:00:00Z"),
    };
    const out = redactActivityValue(row);
    expect(out).toEqual({
      id: "u1",
      email: "editor@sabq.org",
      role: "editor",
      createdAt: row.createdAt,
    });
    expect(row.passwordHash).toBe("$2b$10$abc");
  });

  it("redacts nested log payloads as returned by the audit endpoints", () => {
    const result = {
      logs: [{ id: "l1", oldValue: { two_factor_secret: "S", password_hash: "H", name: "x" }, newValue: null }],
      total: 1,
    };
    expect(redactActivityValue(result)).toEqual({
      logs: [{ id: "l1", oldValue: { name: "x" }, newValue: null }],
      total: 1,
    });
  });

  it("passes primitives and null through", () => {
    expect(redactActivityValue(null)).toBeNull();
    expect(redactActivityValue(undefined)).toBeUndefined();
    expect(redactActivityValue("text")).toBe("text");
  });
});
