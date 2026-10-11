import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// الخدمة تستورد db التطبيق؛ نسلّمها اتصالًا بمخطط اختبار معزول.
const holder = vi.hoisted(() => ({ db: null as unknown, emails: [] as Array<{ to: string; subject: string }> }));
vi.mock("../../server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("../../server/services/email", () => ({
  sendEmailNotification: vi.fn(async (opts: { to: string; subject: string }) => {
    holder.emails.push({ to: opts.to, subject: opts.subject });
    return { success: true };
  }),
}));

import { articles, publisherCreditLogs, publisherCredits, publisherRequests, publishers } from "@shared/schema";
import {
  activateRenewal,
  buildRenewalReminder,
  respondToRenewalOffer,
  sendRenewalOffer,
} from "../../server/services/publisherRenewalService";

const url = process.env.EDITORIAL_LIST_TEST_DATABASE_URL ?? process.env.SESSION_REVOCATION_TEST_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const schema = `test_publisher_renewal_${randomUUID().replaceAll("-", "")}`;
const DAY = 86_400_000;
let admin: pg.Pool;
let pool: pg.Pool;

/** جدول بأعمدة المخطط الحقيقي (أنواع وافتراضيات فقط) — يبقى متزامنًا مع schema.ts تلقائيًا. */
function ddl(table: PgTable): string {
  const { name, columns } = getTableConfig(table);
  const cols = columns.map((c) => {
    let def = "";
    if (c.name === "id") def = " PRIMARY KEY DEFAULT gen_random_uuid()::text";
    else if (c.hasDefault && c.default !== undefined && typeof c.default !== "object") {
      def = ` DEFAULT ${typeof c.default === "string" ? `'${c.default.replaceAll("'", "''")}'` : String(c.default)}`;
    } else if (c.hasDefault && c.getSQLType().startsWith("timestamp")) def = " DEFAULT now()";
    return `"${c.name}" ${c.getSQLType()}${def}`;
  });
  return `CREATE TABLE "${name}" (${cols.join(", ")})`;
}

const notifyMembers = vi.fn(async () => {});
const notifyAdmins = vi.fn(async () => {});

async function seed(opts: { expiresInDays: number; unlimited?: boolean }) {
  await pool.query(
    `INSERT INTO publishers (id, agency_name, contact_person, phone_number, email, is_active)
     VALUES ('agency', 'وكالة الاختبار', 'أحمد', '0500000000', 'agency@example.test', true)`,
  );
  const expiry = new Date(Date.now() + opts.expiresInDays * DAY);
  await pool.query(
    `INSERT INTO publisher_credits (id, publisher_id, package_name, total_credits, used_credits, remaining_credits,
       is_unlimited, period, start_date, expiry_date, is_active)
     VALUES ('current', 'agency', 'باقة سنوية مفتوحة', 0, 0, 0, $1, 'yearly', now() - interval '200 days', $2, true)`,
    [opts.unlimited ?? true, expiry],
  );
  return expiry;
}

async function openRequest() {
  await pool.query(
    `INSERT INTO publisher_requests (id, publisher_id, requested_by, type, status) VALUES ('req', 'agency', 'user-1', 'renewal', 'open')`,
  );
}

const agencyRow = async () => {
  const d = drizzle(pool);
  const [row] = await d.select().from(publishers);
  return row;
};

const validOffer = (startDate?: string) => ({
  packageType: "unlimited" as const,
  durationMonths: 12,
  startDate: startDate ?? null,
  price: 50000,
  validUntil: new Date(Date.now() + 14 * DAY).toISOString(),
  note: "نفس الشروط",
});

(local ? describe : describe.skip)("publisher renewal — actual PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
    for (const t of [publishers, publisherCredits, publisherCreditLogs, publisherRequests, articles]) {
      await pool.query(ddl(t));
    }
    holder.db = drizzle(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE publishers, publisher_credits, publisher_credit_logs, publisher_requests, articles");
    holder.emails.length = 0;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("runs offer → accept → activate, and the new package starts the moment the current one ends", async () => {
    const expiry = await seed({ expiresInDays: 85 });
    await openRequest();

    const offered = await sendRenewalOffer("req", "admin-1", validOffer(), { notifyMembers });
    expect(offered.ok).toBe(true);
    expect(holder.emails.map((e) => e.to)).toEqual(["agency@example.test"]);
    const afterOffer = (await pool.query("SELECT status, offer FROM publisher_requests WHERE id = 'req'")).rows[0];
    expect(afterOffer.status).toBe("offered");
    expect(new Date(afterOffer.offer.startDate).getTime()).toBe(expiry.getTime());

    expect(await activateRenewal("req", "admin-1", { notifyMembers })).toMatchObject({ ok: false, status: 409 });

    const accepted = await respondToRenewalOffer(await agencyRow(), "req", "user-1", "accepted", { notifyAdmins });
    expect(accepted.ok).toBe(true);
    expect(holder.emails.at(-1)?.to).toBe("info@sabq.org");
    expect(notifyAdmins).toHaveBeenCalledOnce();

    const activated = await activateRenewal("req", "admin-1", { notifyMembers });
    expect(activated.ok).toBe(true);

    const { rows: pkgs } = await pool.query(
      "SELECT id, package_name, is_unlimited, start_date, expiry_date, price FROM publisher_credits WHERE id <> 'current'",
    );
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]).toMatchObject({ package_name: "باقة مفتوحة سنوية", is_unlimited: true, price: 50000 });
    expect(new Date(pkgs[0].start_date).getTime()).toBe(expiry.getTime());
    const nextYear = new Date(expiry);
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    expect(new Date(pkgs[0].expiry_date).getTime()).toBe(nextYear.getTime());

    const req = (await pool.query("SELECT status, handled_by, offer FROM publisher_requests WHERE id = 'req'")).rows[0];
    expect(req).toMatchObject({ status: "closed", handled_by: "admin-1" });
    expect(req.offer.activatedCreditId).toBe(pkgs[0].id);
    const logs = (await pool.query("SELECT action_type, credit_package_id FROM publisher_credit_logs")).rows;
    expect(logs).toEqual([{ action_type: "credit_added", credit_package_id: pkgs[0].id }]);
  });

  it("activates once only, even when confirmed twice at the same time", async () => {
    await seed({ expiresInDays: 85 });
    await openRequest();
    await sendRenewalOffer("req", "admin-1", validOffer(), { notifyMembers });
    await respondToRenewalOffer(await agencyRow(), "req", "user-1", "accepted", { notifyAdmins });

    const results = await Promise.all([
      activateRenewal("req", "admin-1", { notifyMembers }),
      activateRenewal("req", "admin-2", { notifyMembers }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM publisher_credits WHERE id <> 'current'")).rows[0].n).toBe(1);
  });

  it("refuses to accept an expired offer but still lets the agency ask to talk", async () => {
    await seed({ expiresInDays: 85 });
    await openRequest();
    await sendRenewalOffer("req", "admin-1", validOffer(), { notifyMembers });
    await pool.query(
      `UPDATE publisher_requests SET offer = jsonb_set(offer, '{validUntil}', to_jsonb((now() - interval '3 days')::text)) WHERE id = 'req'`,
    );

    expect(await respondToRenewalOffer(await agencyRow(), "req", "user-1", "accepted", { notifyAdmins })).toMatchObject({
      ok: false,
      status: 409,
    });
    const contact = await respondToRenewalOffer(await agencyRow(), "req", "user-1", "contact", { notifyAdmins });
    expect(contact.ok).toBe(true);
    const req = (await pool.query("SELECT status, offer FROM publisher_requests WHERE id = 'req'")).rows[0];
    expect(req.status).toBe("offered");
    expect(req.offer.response).toBe("contact");
  });

  it("another agency cannot answer the offer", async () => {
    await seed({ expiresInDays: 85 });
    await openRequest();
    await sendRenewalOffer("req", "admin-1", validOffer(), { notifyMembers });
    const stranger = { ...(await agencyRow()), id: "someone-else" };
    expect(await respondToRenewalOffer(stranger, "req", "user-9", "accepted", { notifyAdmins })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("reminds an open package at the 90-day milestone and goes quiet once a request or next package exists", async () => {
    await seed({ expiresInDays: 85 });
    await pool.query(
      `INSERT INTO articles (id, title, slug, content, publisher_id, status, published_at, views)
       VALUES ('a1', 't', 's1', 'c', 'agency', 'published', now() - interval '10 days', 1200),
              ('a2', 't', 's2', 'c', 'agency', 'published', now() - interval '20 days', 800)`,
    );
    const reminder = await buildRenewalReminder(await agencyRow());
    expect(reminder?.alertKey).toBe("renewal_due:current:90");
    expect(reminder?.email.html).toContain("٢");
    expect(reminder?.email.html).toContain("٢٬٠٠٠");

    await openRequest();
    expect(await buildRenewalReminder(await agencyRow())).toBeNull();

    await pool.query("UPDATE publisher_requests SET status = 'closed'");
    await pool.query(
      `INSERT INTO publisher_credits (id, publisher_id, package_name, total_credits, used_credits, remaining_credits,
         is_unlimited, period, start_date, expiry_date, is_active)
       SELECT 'next', 'agency', 'التالية', 0, 0, 0, true, 'yearly', expiry_date, expiry_date + interval '1 year', true
       FROM publisher_credits WHERE id = 'current'`,
    );
    expect(await buildRenewalReminder(await agencyRow())).toBeNull();
  });

  it("waits until 30 days for a limited package", async () => {
    await seed({ expiresInDays: 85, unlimited: false });
    expect(await buildRenewalReminder(await agencyRow())).toBeNull();
    await pool.query(`UPDATE publisher_credits SET expiry_date = now() + interval '20 days'`);
    expect((await buildRenewalReminder(await agencyRow()))?.alertKey).toBe("renewal_due:current:30");
  });
});
