import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The service imports the app db; these tests hand it their own transaction.
vi.mock("../../server/db", () => ({ db: {} }));
import { chargePublishInTx, type CreditTx } from "../../server/services/publisherCreditService";

const url = process.env.EDITORIAL_LIST_TEST_DATABASE_URL ?? process.env.SESSION_REVOCATION_TEST_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const schema = `test_publisher_credit_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool;
let pool: pg.Pool;

const DAY = 86_400_000;

async function charge(articleId: string, publisherId = "agency") {
  const tx = drizzle(pool);
  return tx.transaction((t) =>
    chargePublishInTx(t as unknown as CreditTx, { publisherId, articleId, performedBy: "user-1" }),
  );
}

async function addPackage(p: { id: string; unlimited?: boolean; remaining?: number; expiresInDays?: number | null; active?: boolean }) {
  const expiry = p.expiresInDays === null ? null : new Date(Date.now() + (p.expiresInDays ?? 30) * DAY);
  await pool.query(
    `INSERT INTO publisher_credits (id, publisher_id, package_name, total_credits, used_credits, remaining_credits,
       is_unlimited, period, start_date, expiry_date, is_active)
     VALUES ($1, 'agency', $1, $2, 0, $2, $3, 'monthly', now() - interval '1 day', $4, $5)`,
    [p.id, p.remaining ?? 0, p.unlimited ?? false, expiry, p.active ?? true],
  );
}

async function pkg(id: string) {
  const { rows } = await pool.query("SELECT used_credits, remaining_credits FROM publisher_credits WHERE id = $1", [id]);
  return { used: Number(rows[0].used_credits), remaining: Number(rows[0].remaining_credits) };
}

async function logs(articleId: string) {
  const { rows } = await pool.query("SELECT credit_package_id, credits_changed FROM publisher_credit_logs WHERE article_id = $1", [articleId]);
  return rows;
}

(local ? describe : describe.skip)("publisher credit charge — actual PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
    await pool.query(`CREATE TABLE publisher_credits (
      id text PRIMARY KEY, publisher_id text NOT NULL, package_name text NOT NULL,
      total_credits int NOT NULL, used_credits int NOT NULL DEFAULT 0, remaining_credits int NOT NULL,
      is_unlimited boolean NOT NULL DEFAULT false, period text NOT NULL, start_date timestamp NOT NULL,
      expiry_date timestamp, price real, currency text DEFAULT 'SAR', is_active boolean NOT NULL DEFAULT true,
      notes text, created_by text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE publisher_credit_logs (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text, publisher_id text NOT NULL, credit_package_id text NOT NULL,
      article_id text, action_type text NOT NULL, credits_before int NOT NULL, credits_changed int NOT NULL,
      credits_after int NOT NULL, performed_by text, notes text, created_at timestamp NOT NULL DEFAULT now())`);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE publisher_credits, publisher_credit_logs");
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("deducts one credit from a limited package and logs it", async () => {
    await addPackage({ id: "limited", remaining: 2 });
    expect(await charge("a1")).toBe("deducted");
    expect(await pkg("limited")).toEqual({ used: 1, remaining: 1 });
    expect(await logs("a1")).toEqual([{ credit_package_id: "limited", credits_changed: -1 }]);
  });

  it("never charges the same article twice, even when published again", async () => {
    await addPackage({ id: "limited", remaining: 5 });
    expect(await charge("a1")).toBe("deducted");
    expect(await charge("a1")).toBe("already_charged");
    expect(await pkg("limited")).toEqual({ used: 1, remaining: 4 });
    expect(await logs("a1")).toHaveLength(1);
  });

  it("charges each article exactly once under concurrent publishes", async () => {
    await addPackage({ id: "limited", remaining: 10 });
    const results = await Promise.all([charge("a1"), charge("a1"), charge("a1"), charge("a2")]);
    expect(results.filter((r) => r === "deducted")).toHaveLength(2);
    expect(await pkg("limited")).toEqual({ used: 2, remaining: 8 });
  });

  it("counts usage on an unlimited package without lowering its balance, and prefers it", async () => {
    await addPackage({ id: "limited", remaining: 3, expiresInDays: 5 });
    await addPackage({ id: "open", unlimited: true, expiresInDays: 90 });
    expect(await charge("a1")).toBe("deducted");
    expect(await pkg("open")).toEqual({ used: 1, remaining: 0 });
    expect(await pkg("limited")).toEqual({ used: 0, remaining: 3 });
    expect(await logs("a1")).toEqual([{ credit_package_id: "open", credits_changed: 0 }]);
  });

  it("uses the soonest-expiring limited package first", async () => {
    await addPackage({ id: "later", remaining: 3, expiresInDays: 60 });
    await addPackage({ id: "sooner", remaining: 3, expiresInDays: 10 });
    await charge("a1");
    expect(await pkg("sooner")).toEqual({ used: 1, remaining: 2 });
    expect(await pkg("later")).toEqual({ used: 0, remaining: 3 });
  });

  it("returns no_credits for empty, expired or inactive packages and writes nothing", async () => {
    await addPackage({ id: "empty", remaining: 0 });
    await addPackage({ id: "expired", remaining: 5, expiresInDays: -1 });
    await addPackage({ id: "off", remaining: 5, active: false });
    expect(await charge("a1")).toBe("no_credits");
    expect(await logs("a1")).toHaveLength(0);
    expect(await pkg("expired")).toEqual({ used: 0, remaining: 5 });
  });

  it("charges again after a refund entry cancels the earlier charge", async () => {
    await addPackage({ id: "limited", remaining: 5 });
    await charge("a1");
    await pool.query(
      `INSERT INTO publisher_credit_logs (publisher_id, credit_package_id, article_id, action_type, credits_before, credits_changed, credits_after)
       VALUES ('agency', 'limited', 'a1', 'credit_refunded', 4, 1, 5)`,
    );
    expect(await charge("a1")).toBe("deducted");
  });
});
