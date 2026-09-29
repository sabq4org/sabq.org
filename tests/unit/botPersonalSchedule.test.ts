import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../server/db", () => ({ db: {} }));
const deps = vi.hoisted(() => ({ auth: vi.fn(), license: vi.fn(), credit: vi.fn(), event: vi.fn(), activity: vi.fn() }));
vi.mock("../../server/services/botPublisherTokenService", () => ({ authenticatePublisherTokenId: deps.auth }));
vi.mock("../../server/services/mediaLicenseService", () => ({ assertMediaLicenseAllowsSubmission: deps.license }));
vi.mock("../../server/services/publisherCreditService", () => ({ deductPublisherCreditSafely: deps.credit }));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent: deps.event }));
vi.mock("../../server/rbac", () => ({ logActivity: deps.activity }));
import { personalBotScheduledReleaseAllowed, recordPersonalBotScheduledPublish, personalBotScheduledWriteCondition } from "../../server/services/botPersonalScheduleService";
const article = { id: "a", title: "عنوان", publisherId: "agency", sourceMetadata: { type: "bot" as const, publisherUserId: "u", publisherTokenId: "t", publisherOwnerUserId: "agency-owner" } };
beforeEach(() => { vi.resetAllMocks(); deps.auth.mockResolvedValue({ userId: "u", publisherId: "agency", capabilities: ["publish"] }); deps.license.mockResolvedValue({ ok: true }); });
describe("personal bot schedules", () => {
  it("requires a live token, same owner and current publishing rights", async () => {
    expect(await personalBotScheduledReleaseAllowed(article)).toBe(true);
    deps.auth.mockResolvedValue(null);
    expect(await personalBotScheduledReleaseAllowed(article)).toBe(false);
    deps.auth.mockResolvedValue({ userId: "other", publisherId: "agency", capabilities: ["publish"] });
    expect(await personalBotScheduledReleaseAllowed(article)).toBe(false);
    deps.auth.mockResolvedValue({ userId: "u", publisherId: "agency", capabilities: [] });
    expect(await personalBotScheduledReleaseAllowed(article)).toBe(false);
  });
  it("rejects agency transfer and expired media license", async () => {
    deps.auth.mockResolvedValue({ userId: "u", publisherId: "new-agency", capabilities: ["publish"] });
    expect(await personalBotScheduledReleaseAllowed(article)).toBe(false);
    deps.auth.mockResolvedValue({ userId: "u", publisherId: "agency", capabilities: ["publish"] });
    deps.license.mockResolvedValue({ ok: false });
    expect(await personalBotScheduledReleaseAllowed(article)).toBe(false);
  });
  it("logs the actual actor and charges the agency owner account", async () => {
    await recordPersonalBotScheduledPublish(article);
    expect(deps.credit).toHaveBeenCalledWith({ authorUserId: "agency-owner", articleId: "a", actorId: "u" });
    expect(deps.event).toHaveBeenCalledWith(expect.objectContaining({ actorId: "u", eventType: "published" }));
  });
});

const localUrl = process.env.BOT_OWNERSHIP_TEST_URL;
const isLocal = localUrl && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(localUrl).hostname);
it.skipIf(!isLocal)("SQL write gate rejects revocation after the earlier authorization check", async () => {
  const client = new pg.Client({ connectionString: localUrl });
  await client.connect();
  try {
    await client.query("CREATE TEMP TABLE bot_publisher_tokens(id text, user_id text, revoked_at timestamp, expires_at timestamp)");
    await client.query("INSERT INTO bot_publisher_tokens VALUES ('t','u',NULL,now()+interval '1 day')");
    const query = new PgDialect().sqlToQuery(personalBotScheduledWriteCondition(article)!);
    expect((await client.query(`SELECT 1 WHERE ${query.sql}`, query.params)).rowCount).toBe(1);
    await client.query("UPDATE bot_publisher_tokens SET revoked_at=now() WHERE id='t'");
    expect((await client.query(`SELECT 1 WHERE ${query.sql}`, query.params)).rowCount).toBe(0);
  } finally { await client.end(); }
});
