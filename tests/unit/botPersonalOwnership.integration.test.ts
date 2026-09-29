import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import pg from "pg";
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn() }));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: {}, CACHE_TTL: {} }));
import { personalOwnershipWhere, assertPersonalCapability, type BotIdentity } from "../../server/services/botDraftsService";

// Opt-in, local-only, connection-scoped temporary table; never reads production rows.
const url = process.env.BOT_OWNERSHIP_TEST_URL;
const local = url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
const personal = (userId: string, publisherId?: string): BotIdentity => ({ name: "test", personal: { userId, publisherId, tokenId: "test-token", email: "test@example.test", name: "test", expiresAt: new Date(), capabilities: ["read"] } });
const dialect = new PgDialect();
describe.skipIf(!local)("personal ownership predicate on PostgreSQL", () => {
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url }); await client.connect();
    await client.query("CREATE TEMP TABLE articles (id text, source_metadata jsonb, publisher_id text)");
    await client.query(`INSERT INTO articles VALUES
      ('one', '{"publisherUserId":"u1"}', NULL),
      ('two', '{"publisherUserId":"u2"}', NULL),
      ('legacy', '{"bot":"old"}', NULL),
      ('agency-one', '{"publisherUserId":"u1"}', 'agency1'),
      ('agency-peer', '{"publisherUserId":"u2"}', 'agency1')`);
  });
  afterAll(async () => { await client?.end(); });
  async function ids(bot: BotIdentity) {
    const query = dialect.sqlToQuery(personalOwnershipWhere(bot)!);
    return (await client.query(`SELECT id FROM articles WHERE ${query.sql} ORDER BY id`, query.params)).rows.map(r => r.id);
  }
  it("isolates users and quarantines legacy ownerless material", async () => {
    expect(await ids(personal("u1"))).toEqual(["one"]);
    expect(await ids(personal("u2"))).toEqual(["two"]);
  });
  it("does not expose agency colleagues or old-agency material", async () => {
    expect(await ids(personal("u1", "agency1"))).toEqual(["agency-one"]);
    expect(await ids(personal("u1", "agency2"))).toEqual([]);
  });
  it("parameterizes hostile owner identifiers", async () => {
    expect(await ids(personal("u1' OR TRUE --"))).toEqual([]);
  });
});

describe("personal capability boundary", () => {
  it("does not inherit global bot powers", () => {
    expect(() => assertPersonalCapability(personal("u1"), "publish")).toThrow();
    expect(() => assertPersonalCapability(personal("u1"), "read")).not.toThrow();
    expect(() => assertPersonalCapability({ name: "legacy" }, "publish")).not.toThrow();
  });
});
