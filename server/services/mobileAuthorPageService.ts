/**
 * صفحة الكاتب في التطبيقات — `/api/v1/authors/by-name`.
 *
 * نُقلت من mobileApiRoutes.ts (ADR-001 + سقف الأسطر) مع إصلاح البطء
 * (بلاغ المالك 2026-10-31: أول فتح لكاتب يأخذ ~3 ث):
 *  1. مطابقة الاسم لم تعد تجمّع كل مقالات كل مرشح (LEFT JOIN + COUNT على OR
 *     author/reporter كان يمسح جدول المقالات). المرشحون أولًا، ثم المفاضلة
 *     بين المكررين فقط بآخر نشر عبر استعلامين مفهرسين.
 *  2. كاش من طبقتين: Redis مشترك بين النسختين (5 د) فوق ذاكرة بجلب واحد لكل
 *     مفتاح (2 د). كان كاش ذاكرة فقط لكل نسخة، فنصف الطلبات تقريبًا باردة.
 *  3. عمود المراسل بلا فهرس في المخطط؛ الفهرس في
 *     migrations/20261031_author_page_indexes.sql (يشغّله المالك).
 *
 * شكل الرد مطابق تمامًا لما كان يرسله المسار (يفكّه iOS وAndroid).
 */
import { and, desc, eq, or, sql, aliasedTable } from "drizzle-orm";
import { db } from "../db";
import { articles, categories, users } from "@shared/schema";
import { articleCardSelect } from "../selectHelpers";
import { withCache } from "../memoryCache";
import { getRedisClient } from "../redis";

const reporterUsers = aliasedTable(users, "reporter_user");

const MEMORY_TTL_MS = 2 * 60 * 1000;
const REDIS_TTL_SECONDS = 5 * 60;
const REDIS_PREFIX = "mobile:author:v2:";

type AuthorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  bio: string | null;
  job_title: string | null;
  department: string | null;
  created_at: Date | string | null;
};

/** صف قائمة المقالات كما يتوقعه `formatArticleForMobile` في مسار الموبايل. */
export type MobileAuthorArticleRow = {
  article: Record<string, unknown>;
  category: { nameAr: string | null; id: string | null } | null;
  author: { firstName: string | null; lastName: string | null } | null;
  reporter: { firstName: string | null; lastName: string | null } | null;
};

export type MobileAuthorPage = {
  author: {
    id: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    bio: string | null;
    jobTitle: string | null;
    department: string | null;
    joinedAt: string | null;
  };
  stats: { articleCount: number; totalViews: number; earliestPublish: string | null };
  topCategories: Array<{ id: string; nameAr: string; color: string | null; icon: string | null; count: number }>;
  recentArticles: unknown[];
};

function rowsOf<T>(result: unknown): T[] {
  const withRows = result as { rows?: T[] };
  if (Array.isArray(withRows?.rows)) return withRows.rows;
  return Array.isArray(result) ? (result as T[]) : [];
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * المرشحون بالاسم، ثم بين المكررين («صحيفة سبق» له حسابان: قديم بمئات آلاف
 * المقالات وحالي) صاحب آخر نشر — كما كان الترتيب السابق latest_published DESC.
 */
async function resolveAuthor(name: string): Promise<AuthorRow | null> {
  const candidates = rowsOf<AuthorRow>(await db.execute(sql`
    SELECT id, first_name, last_name, profile_image_url, bio,
           job_title, department, created_at
    FROM users
    WHERE LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')))
          = LOWER(${name})
    ORDER BY created_at ASC
    LIMIT 8
  `));
  if (candidates.length <= 1) return candidates[0] ?? null;

  const ids = sql.join(candidates.map((c) => sql`${String(c.id)}`), sql`, `);
  const latest = rowsOf<{ id: string }>(await db.execute(sql`
    SELECT id FROM (
      SELECT author_id AS id, MAX(published_at) AS latest
      FROM articles WHERE status = 'published' AND author_id IN (${ids})
      GROUP BY author_id
      UNION ALL
      SELECT reporter_id AS id, MAX(published_at) AS latest
      FROM articles WHERE status = 'published' AND reporter_id IN (${ids})
      GROUP BY reporter_id
    ) t
    ORDER BY latest DESC NULLS LAST
    LIMIT 1
  `))[0];
  return candidates.find((c) => String(c.id) === String(latest?.id)) ?? candidates[0];
}

async function computeAuthorPage(
  name: string,
  limit: number,
  offset: number,
  baseUrl: string,
  formatArticle: (row: MobileAuthorArticleRow) => unknown,
): Promise<MobileAuthorPage | null> {
  const author = await resolveAuthor(name);
  if (!author) return null;

  const byAuthor = sql`(a.reporter_id = ${author.id} OR a.author_id = ${author.id})`;
  const [statsRaw, topCatsRaw, recent] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(DISTINCT a.id) AS article_count,
             COALESCE(SUM(a.views), 0) AS total_views,
             MIN(a.published_at) AS earliest_publish
      FROM articles a
      WHERE a.status = 'published' AND ${byAuthor}
    `),
    db.execute(sql`
      SELECT c.id, c.name_ar, c.color, c.icon, COUNT(*) AS count
      FROM articles a
      INNER JOIN categories c ON a.category_id = c.id
      WHERE a.status = 'published' AND ${byAuthor}
      GROUP BY c.id, c.name_ar, c.color, c.icon
      ORDER BY count DESC
      LIMIT 3
    `),
    db
      .select({
        article: articleCardSelect,
        category: { nameAr: categories.nameAr, id: categories.id },
        author: { firstName: users.firstName, lastName: users.lastName },
        reporter: { firstName: reporterUsers.firstName, lastName: reporterUsers.lastName },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(
        and(
          eq(articles.status, "published"),
          or(eq(articles.reporterId, author.id), eq(articles.authorId, author.id)),
        ),
      )
      .orderBy(desc(articles.publishedAt))
      .limit(limit)
      .offset(offset),
  ]);

  const stats = rowsOf<Record<string, unknown>>(statsRaw)[0] ?? {};
  const topCategories = rowsOf<Record<string, unknown>>(topCatsRaw).map((r) => ({
    id: String(r.id),
    nameAr: String(r.name_ar ?? ""),
    color: (r.color as string | null) ?? null,
    icon: (r.icon as string | null) ?? null,
    count: Number(r.count) || 0,
  }));

  const fullName = [author.first_name, author.last_name].filter(Boolean).join(" ").trim();
  const avatar = author.profile_image_url ? String(author.profile_image_url) : null;

  return {
    author: {
      id: author.id,
      name: fullName || name,
      role: author.job_title || author.department || "كاتب في سبق",
      avatarUrl: avatar
        ? avatar.startsWith("http") ? avatar : `${baseUrl}${avatar.startsWith("/") ? "" : "/"}${avatar}`
        : null,
      bio: author.bio || null,
      jobTitle: author.job_title || null,
      department: author.department || null,
      joinedAt: isoOrNull(author.created_at),
    },
    stats: {
      articleCount: Number(stats.article_count) || 0,
      totalViews: Number(stats.total_views) || 0,
      earliestPublish: isoOrNull(stats.earliest_publish),
    },
    topCategories,
    recentArticles: (recent as unknown as MobileAuthorArticleRow[]).map(formatArticle),
  };
}

/**
 * الرد المنسّق جاهزًا للإرسال، أو null إن لم يوجد كاتب بهذا الاسم.
 * يُخزَّن الرد المنسّق (لا الصفوف الخام) لأن Redis يحوّل التواريخ إلى نصوص.
 */
export async function getMobileAuthorPage(params: {
  name: string;
  page: number;
  limit: number;
  offset: number;
  baseUrl: string;
  formatArticle: (row: MobileAuthorArticleRow) => unknown;
}): Promise<MobileAuthorPage | null> {
  const name = params.name.trim().replace(/\s+/g, " ");
  const key = `${name.toLowerCase()}:p${params.page}:l${params.limit}`;

  return withCache(`mobile:author:${key}`, MEMORY_TTL_MS, async () => {
    const redis = getRedisClient();
    if (redis) {
      try {
        const hit = await redis.get(REDIS_PREFIX + key);
        if (hit) return JSON.parse(hit) as MobileAuthorPage;
      } catch {
        // Redis متعثر: نكمل من القاعدة ولا نُفشل الصفحة.
      }
    }
    const result = await computeAuthorPage(name, params.limit, params.offset, params.baseUrl, params.formatArticle);
    if (result && redis) {
      redis
        .set(REDIS_PREFIX + key, JSON.stringify(result), { expiration: { type: "EX", value: REDIS_TTL_SECONDS } })
        .catch(() => {});
    }
    return result;
  });
}
