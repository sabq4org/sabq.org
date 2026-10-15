import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selects: [] as unknown[][],
  insertValues: [] as Record<string, unknown>[],
  insertRows: [] as unknown[][],
  updateValues: [] as Record<string, unknown>[],
  updateRows: [] as unknown[][],
  permissions: vi.fn(),
  publisher: vi.fn(),
  gate: vi.fn(),
  authority: vi.fn(),
  targetRoles: vi.fn(),
}));

function query(rows: unknown[]) {
  const builder: any = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

vi.mock("../../server/db", () => ({
  db: {
    select: () => query(state.selects.shift() ?? []),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        state.insertValues.push(value);
        return { returning: () => Promise.resolve(state.insertRows.shift() ?? []) };
      },
    }),
    update: () => {
      const builder: any = {
        set: (value: Record<string, unknown>) => {
          state.updateValues.push(value);
          return builder;
        },
        where: () => {
          const result: any = Promise.resolve([]);
          result.returning = () => Promise.resolve(state.updateRows.shift() ?? []);
          return result;
        },
      };
      return builder;
    },
  },
}));
vi.mock("../../server/rbac", () => ({
  getEffectiveUserPermissions: state.permissions,
  getRoleAssignmentAuthority: state.authority,
  getUserRoleNames: state.targetRoles,
}));
vi.mock("../../server/services/publisherPortalService", () => ({
  resolvePublisherForUser: state.publisher,
  getPublishingGate: state.gate,
  trustedPublisherCanPublish: vi.fn().mockResolvedValue(false),
}));

import {
  authenticatePublisherToken,
  authenticatePublisherTokenId,
  canUsePersonalTokenAccount,
  hashBotPublisherToken,
  issueBotPublisherToken,
  revokeBotPublisherToken,
} from "../../server/services/botPublisherTokenService";

const user = {
  id: "user-1",
  email: "Colleague@Example.com",
  firstName: "Ali",
  lastName: "Colleague",
  status: "active",
  emailVerified: true,
  accountLocked: false,
  bannedUntil: null,
  suspendedUntil: null,
  lockedUntil: null,
  deletedAt: null,
} as any;

const tokenRow = {
  id: "token-1",
  userId: user.id,
  tokenHash: hashBotPublisherToken("botpub_test-secret-value-123456789"),
  tokenPrefix: "botpub_test-secr",
  label: "iOS",
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  issuedBy: "admin-1",
  createdAt: new Date(),
  lastUsedAt: null,
};

beforeEach(() => {
  state.selects = [];
  state.insertValues = [];
  state.insertRows = [];
  state.updateValues = [];
  state.updateRows = [];
  state.permissions.mockReset().mockResolvedValue([
    "articles.view",
    "articles.create",
    "articles.edit_own",
    "articles.publish",
    "media.upload",
    "articles.schedule",
    "articles.archive",
    "articles.feature",
    "articles.news_type",
    "articles.hide_homepage",
  ]);
  state.publisher.mockReset().mockResolvedValue({ id: "publisher-1", userId: "owner-1" });
  state.gate.mockReset().mockResolvedValue({ allowed: true, code: "OK", publisher: { id: "publisher-1", userId: "owner-1" } });
  state.authority.mockReset().mockResolvedValue("system_admin");
  state.targetRoles.mockReset().mockResolvedValue(["publisher"]);
});

describe("bot publisher token service", () => {
  it("hashes the raw credential and never treats a hash as a bearer value", () => {
    const raw = "botpub_test-secret-value-123456789";
    expect(hashBotPublisherToken(raw)).toHaveLength(64);
    expect(hashBotPublisherToken(raw)).not.toContain(raw);
  });

  it("rejects explicit deleted/locked states and indefinite suspension for personal credentials", () => {
    expect(canUsePersonalTokenAccount({ ...user, status: "deleted", deletedAt: null })).toBe(false);
    expect(canUsePersonalTokenAccount({ ...user, status: "locked", accountLocked: false, lockedUntil: null })).toBe(false);
    expect(canUsePersonalTokenAccount({ ...user, status: "suspended", suspendedUntil: null })).toBe(false);
    expect(canUsePersonalTokenAccount({ ...user, status: "suspended", suspendedUntil: new Date(Date.now() - 1000) })).toBe(true);
  });

  it("revalidates token, account, RBAC, and publisher identity on authentication", async () => {
    state.selects.push([{ token: tokenRow, user }]);
    const principal = await authenticatePublisherToken("botpub_test-secret-value-123456789");

    expect(principal).toMatchObject({
      userId: "user-1",
      tokenId: "token-1",
      email: "Colleague@Example.com",
      publisherId: "publisher-1",
      publisherOwnerUserId: "owner-1",
    });
    expect(principal?.capabilities).toEqual(expect.arrayContaining([
      "create", "edit", "upload", "read", "schedule", "reschedule", "cancelSchedule",
      "archive", "featured", "unfeatured", "breaking", "regular", "hide", "show",
    ]));
    expect(principal?.capabilities).toContain("publish");
  });

  it("does not turn editAny into publishing or visibility authority", async () => {
    state.permissions.mockResolvedValue(["articles.edit_any"]);
    state.selects.push([{ token: tokenRow, user }]);
    const principal = await authenticatePublisherToken("botpub_test-secret-value-123456789");
    expect(principal?.capabilities).toEqual(["edit", "ready"]);
  });

  it("rejects an agency token when the existing publishing gate is closed", async () => {
    state.gate.mockResolvedValue({ allowed: false, code: "WINDOW_CLOSED", publisher: { id: "publisher-1", userId: "owner-1" } });
    state.selects.push([{ token: tokenRow, user }]);
    await expect(authenticatePublisherToken("botpub_test-secret-value-123456789")).resolves.toBeNull();
  });

  it("can resolve the same live identity by token id for scheduled work", async () => {
    state.selects.push([{ token: tokenRow, user }]);
    await expect(authenticatePublisherTokenId("token-1")).resolves.toMatchObject({
      userId: "user-1",
      tokenId: "token-1",
    });
  });

  it("issues a one-time raw token while persisting only its digest", async () => {
    state.selects.push([user]);
    state.insertRows.push([{ id: "new-token", label: "iOS", expiresAt: new Date(Date.now() + 90 * 86_400_000) }]);
    const issued = await issueBotPublisherToken({
      email: "COLLEAGUE@example.com",
      label: "iOS",
      issuedByUserId: "admin-1",
    });

    expect(issued.token).toMatch(/^botpub_/);
    expect(state.insertValues[0].tokenHash).toBe(hashBotPublisherToken(issued.token));
    expect(state.insertValues[0].tokenHash).not.toBe(issued.token);
    expect(state.insertValues[0]).not.toHaveProperty("token");
  });

  it("blocks a lower admin from minting a credential for a system-admin account", async () => {
    state.authority.mockResolvedValue("admin");
    state.targetRoles.mockResolvedValue(["system.admin"]);
    state.selects.push([user]);
    await expect(issueBotPublisherToken({ email: user.email, issuedByUserId: "admin-1" }))
      .rejects.toMatchObject({ status: 403 });
    expect(state.insertValues).toHaveLength(0);
  });

  it("does not let a custom settings manager mint a token without role authority", async () => {
    state.authority.mockResolvedValue("");
    state.targetRoles.mockResolvedValue(["publisher"]);
    state.selects.push([user]);
    await expect(issueBotPublisherToken({ email: user.email, issuedByUserId: "settings-manager-1" }))
      .rejects.toMatchObject({ status: 403 });
    expect(state.insertValues).toHaveLength(0);
  });

  it("revokes only an active token and is idempotently false afterwards", async () => {
    state.updateRows.push([{ id: "token-1" }], []);
    await expect(revokeBotPublisherToken("token-1")).resolves.toBe(true);
    await expect(revokeBotPublisherToken("token-1")).resolves.toBe(false);
    expect(state.updateValues[0]).toHaveProperty("revokedAt");
  });
});
