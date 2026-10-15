import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  roles: ["system_admin"],
  where: null as unknown,
  executed: null as unknown,
}));

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          state.where = condition;
          return { then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(resolve(state.rows)) };
        },
      }),
    }),
    execute: (query: unknown) => {
      state.executed = query;
      return Promise.resolve({ rows: state.events });
    },
  },
}));
vi.mock("../../server/rbac", () => ({
  getUserRoleNames: vi.fn(async () => state.roles),
  logActivity: vi.fn(),
}));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: {}, CACHE_TTL: {} }));
vi.mock("../../server/publishFirstService", () => ({}));

import { getBotDraftHistory, type BotIdentity } from "../../server/services/botDraftsService";

const bot: BotIdentity = {
  name: "publisher",
  personal: {
    userId: "u1",
    publisherId: undefined,
    tokenId: "token",
    email: "u1@example.test",
    name: "User",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    capabilities: ["read"],
  },
};

describe("getBotDraftHistory", () => {
  beforeEach(() => {
    state.rows = [{ id: "a1", status: "published", publishedAt: new Date("2026-10-01T07:08:09Z") }];
    state.events = [{ articleId: "a1", firstName: "Ali", lastName: "Hazmi" }];
    state.roles = ["system_admin"];
    state.where = null;
    state.executed = null;
  });

  it("projects published date and latest actual publisher only for an admin", async () => {
    const result = await getBotDraftHistory(["a1"], bot);
    expect(result).toEqual({
      canViewPublisherNames: true,
      items: [{ id: "a1", status: "published", publishedAt: "2026-10-01T07:08:09.000Z", publisherName: "Ali Hazmi" }],
    });
    const query = new PgDialect().sqlToQuery(state.where as any);
    expect(query.sql).toContain("source");
    expect(query.sql).toContain("publisherUserId");
    expect(query.params).toEqual(expect.arrayContaining(["a1", "bot", "u1"]));
    const eventQuery = new PgDialect().sqlToQuery(state.executed as any);
    expect(eventQuery.sql).toContain("LATERAL");
    expect(eventQuery.sql).toContain("LIMIT");
    expect(eventQuery.sql).toContain("ORDER BY e.created_at DESC, e.id DESC");
  });

  it("omits publisher names after a role downgrade and for unpublished rows", async () => {
    state.roles = ["staff"];
    state.rows = [{ id: "a1", status: "scheduled", publishedAt: new Date("2026-10-01T07:08:09Z") }];
    const result = await getBotDraftHistory(["a1"], bot);
    expect(result).toEqual({ canViewPublisherNames: false, items: [{ id: "a1", status: "scheduled", publishedAt: null }] });
    expect(state.executed).toBeNull();
  });

  it("does not fall back when the latest publication actor has no name", async () => {
    state.events = [{ articleId: "a1", firstName: null, lastName: null }];
    const result = await getBotDraftHistory(["a1"], bot);
    expect(result.items[0]).toMatchObject({ publisherName: null });
  });

  it.each(["admin", "super_admin", "publisher", "reader"])("does not disclose names to the %s role", async (role) => {
    state.roles = [role];
    const result = await getBotDraftHistory(["a1"], bot);
    expect(result.canViewPublisherNames).toBe(false);
    expect(result.items[0]).not.toHaveProperty("publisherName");
    expect(state.executed).toBeNull();
  });

  it("rechecks roles on the next request after downgrade", async () => {
    expect((await getBotDraftHistory(["a1"], bot)).items[0].publisherName).toBe("Ali Hazmi");
    state.roles = ["admin"];
    state.executed = null;
    expect((await getBotDraftHistory(["a1"], bot)).items[0]).not.toHaveProperty("publisherName");
    expect(state.executed).toBeNull();
  });
});
