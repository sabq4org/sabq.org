import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// الخدمة تستورد db التطبيق؛ نسلّمها اتصالًا بمخطط اختبار معزول.
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../server/db", () => ({
  get db() {
    return holder.db;
  },
}));
const portal = vi.hoisted(() => ({
  notifyAdmins: vi.fn(async () => {}),
  notifyPublisherMembers: vi.fn(async () => {}),
  listPublisherMembers: vi.fn(async () => [{ id: "member-1" }]),
}));
vi.mock("../../server/services/publisherPortalService", () => portal);
const email = vi.hoisted(() => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock("../../server/services/email", () => email);
const editorAlerts = vi.hoisted(() => ({ sendEditorWhatsAppNotice: vi.fn(async () => 1) }));
vi.mock("../../server/services/editorAlerts", () => editorAlerts);
vi.mock("../../server/services/editorialNotifications", () => ({ notifyAuthorOfSocialPostStatus: vi.fn(async () => {}) }));
vi.mock("../../server/services/socialPublishing/suggestService", () => ({ suggestSocialPostForArticle: vi.fn() }));

import { articles, publishers, socialPlatformAccounts, socialPosts, users, type Publisher } from "@shared/schema";
import {
  getAgencySocialStatus,
  listAgencySocialPosts,
  saveAgencySocialPost,
  withdrawAgencySocialPost,
  type AgencySocialInput,
} from "../../server/services/publisherSocialService";

const url = process.env.EDITORIAL_LIST_TEST_DATABASE_URL ?? process.env.SESSION_REVOCATION_TEST_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const schema = `test_publisher_social_${randomUUID().replaceAll("-", "")}`;
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
    else if (c.hasDefault && c.getSQLType() === "jsonb") def = " DEFAULT '[]'::jsonb";
    return `"${c.name}" ${c.getSQLType()}${def}`;
  });
  return `CREATE TABLE "${name}" (${cols.join(", ")})`;
}

async function agency(mode: string): Promise<Publisher> {
  await pool.query(`UPDATE publishers SET social_publish_mode = $1`, [mode]);
  const [row] = await drizzle(pool).select().from(publishers);
  return row;
}

async function story(opts: { publishedHoursAgo?: number | null; publisher?: string } = {}) {
  const hours = opts.publishedHoursAgo === undefined ? 2 : opts.publishedHoursAgo;
  await pool.query(
    `INSERT INTO articles (id, title, slug, content, publisher_id, status, published_at, image_url)
     VALUES ('story', 'إطلاق منصة رقمية للمستثمرين', 'story', 'c', $1, $2,
             CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(hours => $3::int) END, 'https://sabq.org/img/a.jpg')`,
    [opts.publisher ?? "agency", hours === null ? "draft" : "published", hours],
  );
}

const submit = (over: Partial<AgencySocialInput> = {}): AgencySocialInput => ({
  text: "نص التغريدة",
  textSource: "custom",
  includeLink: true,
  media: "article",
  mediaUrls: [],
  requestedAt: null,
  action: "submit",
  ...over,
});

(local ? describe : describe.skip)("agency social publishing — actual PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
    for (const t of [publishers, articles, socialPosts, socialPlatformAccounts, users]) {
      await pool.query(ddl(t));
    }
    holder.db = drizzle(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE publishers, articles, social_posts, social_platform_accounts, users");
    await pool.query(
      `INSERT INTO publishers (id, user_id, agency_name, contact_person, phone_number, email)
       VALUES ('agency', 'owner', 'روافد الإعلام', 'أحمد', '05', 'a@example.test')`,
    );
    await pool.query(
      `INSERT INTO social_platform_accounts (id, platform, handle, status, connected_by_user_id)
       VALUES ('acct', 'x', 'sabqorg', 'connected', 'admin')`,
    );
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("submits for approval as a draft tied to the agency, tells Sabq once, and edits stay one post", async () => {
    await story();
    const pub = await agency("approval");
    const at = new Date(Date.now() + 3 * 3600_000);
    const first = await saveAgencySocialPost(pub, "member-1", "story", submit({ requestedAt: at }));
    expect(first.outcome).toBe("submitted");
    expect(first.post).toMatchObject({ status: "draft", publisherId: "agency", imageSource: "article", scheduledAt: null });
    expect(first.post.requestedAt?.getTime()).toBe(at.getTime());
    expect(portal.notifyAdmins).toHaveBeenCalledOnce();
    expect(editorAlerts.sendEditorWhatsAppNotice).toHaveBeenCalledOnce();
    expect(editorAlerts.sendEditorWhatsAppNotice.mock.calls[0][0]).toContain("بانتظار موافقتك");
    expect(email.sendEmailNotification).toHaveBeenCalledWith(expect.objectContaining({ to: "aalhazmi@sabq.org" }));

    const second = await saveAgencySocialPost(pub, "member-1", "story", submit({ text: "نص معدل", media: "none", requestedAt: null }));
    expect(second.outcome).toBe("updated");
    expect(second.post).toMatchObject({ id: first.post.id, text: "نص معدل", imageSource: "none", requestedAt: null });
    expect(portal.notifyAdmins).toHaveBeenCalledOnce();
    expect(editorAlerts.sendEditorWhatsAppNotice).toHaveBeenCalledOnce();
    expect((await pool.query("SELECT count(*)::int AS n FROM social_posts")).rows[0].n).toBe(1);
  });

  it("uses the story title verbatim when the agency picks the title", async () => {
    await story();
    const { post } = await saveAgencySocialPost(await agency("approval"), "member-1", "story", submit({ text: "x", textSource: "title" }));
    expect(post.text).toBe("إطلاق منصة رقمية للمستثمرين");
  });

  it("refuses actions the agency's mode does not allow", async () => {
    await story();
    await expect(saveAgencySocialPost(await agency("approval"), "m", "story", submit({ action: "publish_now" }))).rejects.toMatchObject({ status: 403 });
    await expect(saveAgencySocialPost(await agency("direct"), "m", "story", submit())).rejects.toMatchObject({ status: 403 });
    await expect(saveAgencySocialPost(await agency("off"), "m", "story", submit())).rejects.toMatchObject({ status: 403 });
  });

  it("lets a direct agency schedule straight into the publishing queue", async () => {
    await story();
    const at = new Date(Date.now() + 3600_000);
    const res = await saveAgencySocialPost(await agency("direct"), "member-1", "story", submit({ action: "schedule", requestedAt: at }));
    expect(res.outcome).toBe("scheduled");
    expect(res.post).toMatchObject({ status: "scheduled", publisherId: "agency" });
    expect(res.post.scheduledAt?.getTime()).toBe(at.getTime());
    expect(portal.notifyAdmins).not.toHaveBeenCalled();
    expect(editorAlerts.sendEditorWhatsAppNotice.mock.calls[0][0]).toContain("جدولت تغريدة");
  });

  it("keeps one live tweet per story and closes the window after 48 hours", async () => {
    await story();
    const pub = await agency("approval");
    await pool.query(
      `INSERT INTO social_posts (article_id, text, status, created_by_user_id, account_id) VALUES ('story', 'سبق', 'published', 'editor', 'acct')`,
    );
    expect((await getAgencySocialStatus(pub, "story"))?.state).toBe("live");
    await expect(saveAgencySocialPost(pub, "m", "story", submit())).rejects.toMatchObject({ status: 409 });

    await pool.query("TRUNCATE articles, social_posts");
    await story({ publishedHoursAgo: 49 });
    expect((await getAgencySocialStatus(pub, "story"))?.state).toBe("expired");
    await expect(saveAgencySocialPost(pub, "m", "story", submit())).rejects.toThrow("48");
  });

  it("hides other agencies' stories and unpublished ones", async () => {
    await story({ publisher: "someone-else" });
    expect(await getAgencySocialStatus(await agency("approval"), "story")).toBeNull();
    await pool.query("TRUNCATE articles");
    await story({ publishedHoursAgo: null });
    expect((await getAgencySocialStatus(await agency("approval"), "story"))?.state).toBe("not_published");
  });

  it("marks a withdrawal apart from a Sabq rejection and allows a new request after either", async () => {
    await story();
    const pub = await agency("approval");
    const { post } = await saveAgencySocialPost(pub, "member-1", "story", submit());
    await withdrawAgencySocialPost(pub, "member-1", post.id);
    let [row] = await listAgencySocialPosts(pub);
    expect(row).toMatchObject({ status: "canceled", withdrawn: true, note: null });

    const again = await saveAgencySocialPost(pub, "member-1", "story", submit());
    expect(again.outcome).toBe("submitted");
    await pool.query(`UPDATE social_posts SET status = 'canceled', canceled_by_user_id = 'editor', last_error = 'صياغة تسويقية' WHERE id = $1`, [again.post.id]);
    [row] = await listAgencySocialPosts(pub);
    expect(row).toMatchObject({ withdrawn: false, note: "صياغة تسويقية" });
    expect((await getAgencySocialStatus(pub, "story"))?.state).toBe("open");
  });
});
