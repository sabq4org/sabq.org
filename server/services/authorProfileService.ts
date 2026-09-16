/**
 * صفحة الكاتب العامة — نفس عقد الموبايل `/api/v1/authors/by-name`
 * لكن بشكل مناسب للويب (روابط /opinion و/article).
 *
 * الأداء: بدون JOIN ثقيل على كل المقالات عند مطابقة الاسم؛
 * قائمة المقالات عبر author_id (فهرس)؛ كاش ذاكرة ٥ دقائق.
 *
 * ترحيل 2026-03 أنتج صفوفاً مكررة (نفس العنوان + published_at، slug مختلف).
 * العدّ والقائمة يستبعدان المكررات عبر DISTINCT ON مع الإبقاء على أعلى مشاهدات.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { memoryCache } from "../memoryCache";

export type AuthorPageArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  englishSlug: string | null;
  articleType: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  views: number;
  categoryNameAr: string | null;
};

export type AuthorPageResult = {
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
  stats: {
    articleCount: number;
    totalViews: number;
    earliestPublish: string | null;
  };
  topCategories: Array<{
    id: string;
    nameAr: string;
    color: string | null;
    icon: string | null;
    count: number;
  }>;
  recentArticles: AuthorPageArticle[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
};

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  bio: string | null;
  job_title: string | null;
  department: string | null;
  created_at: Date | string | null;
};

type ArticleListRow = {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  english_slug: string | null;
  article_type: string | null;
  image_url: string | null;
  published_at: Date | string | null;
  views: number | null;
  category_id: string | null;
  category_name_ar: string | null;
};

function normalizeAuthorName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const withRows = result as { rows?: Array<Record<string, unknown>> };
  if (Array.isArray(withRows?.rows)) return withRows.rows;
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return [];
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function resolveAuthorByName(name: string): Promise<UserRow | null> {
  const candidatesRaw = await db.execute(sql`
    SELECT id, first_name, last_name, profile_image_url, bio,
           job_title, department, created_at
    FROM users
    WHERE LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')))
          = LOWER(${name})
    LIMIT 8
  `);
  const candidates = rowsOf(candidatesRaw) as unknown as UserRow[];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const ids = candidates.map((c) => String(c.id));
  // بين الأسماء المكررة: اختر صاحب آخر نشر عبر author_id فقط (خفيف + فهرس)
  const pickRaw = await db.execute(sql`
    SELECT a.author_id AS id, MAX(a.published_at) AS latest
    FROM articles a
    WHERE a.status = 'published'
      AND a.author_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    GROUP BY a.author_id
    ORDER BY latest DESC NULLS LAST
    LIMIT 1
  `);
  const pick = rowsOf(pickRaw)[0];
  if (pick?.id) {
    const matched = candidates.find((c) => String(c.id) === String(pick.id));
    if (matched) return matched;
  }
  return candidates[0];
}

/**
 * مقالات الكاتب مع استبعاد صفوف الترحيل المكررة
 * (نفس العنوان + نفس published_at → نبقي الأعلى مشاهدة ثم الأقدم إنشاءً).
 */
async function loadAuthorArticles(params: {
  authorColumn: "author_id" | "reporter_id";
  authorId: string;
  limit: number;
  offset: number;
}): Promise<{
  articleCount: number;
  totalViews: number;
  earliest: Date | string | null;
  list: ArticleListRow[];
}> {
  const idCol =
    params.authorColumn === "author_id"
      ? sql`a.author_id`
      : sql`a.reporter_id`;

  const [statsRow, listRaw] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS article_count,
        COALESCE(SUM(views), 0)::bigint AS total_views,
        MIN(published_at) AS earliest_publish
      FROM (
        SELECT DISTINCT ON (a.title, a.published_at)
          a.views,
          a.published_at
        FROM articles a
        WHERE a.status = 'published'
          AND ${idCol} = ${params.authorId}
        ORDER BY a.title, a.published_at,
                 COALESCE(a.views, 0) DESC,
                 a.created_at ASC NULLS LAST
      ) uniq
    `),

    db.execute(sql`
      SELECT *
      FROM (
        SELECT DISTINCT ON (a.title, a.published_at)
          a.id,
          a.title,
          a.excerpt,
          a.slug,
          a.english_slug,
          a.article_type,
          a.image_url,
          a.published_at,
          a.views,
          a.category_id,
          c.name_ar AS category_name_ar
        FROM articles a
        LEFT JOIN categories c ON a.category_id = c.id
        WHERE a.status = 'published'
          AND ${idCol} = ${params.authorId}
        ORDER BY a.title, a.published_at,
                 COALESCE(a.views, 0) DESC,
                 a.created_at ASC NULLS LAST
      ) uniq
      ORDER BY published_at DESC NULLS LAST
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `),
  ]);

  const stats = rowsOf(statsRow)[0] ?? {};
  return {
    articleCount: Number(stats.article_count) || 0,
    totalViews: Number(stats.total_views) || 0,
    earliest: (stats.earliest_publish as Date | string | null) ?? null,
    list: rowsOf(listRaw) as unknown as ArticleListRow[],
  };
}

export async function getAuthorPageByName(
  rawName: string,
  opts: { page?: number; limit?: number } = {},
): Promise<AuthorPageResult | null> {
  const name = normalizeAuthorName(rawName);
  if (!name) return null;

  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(24, Math.max(1, opts.limit ?? 12));
  const offset = (page - 1) * limit;

  const cacheKey = `author:web:v2:${name.toLowerCase()}:p${page}:l${limit}`;
  const cached = memoryCache.get<AuthorPageResult>(cacheKey);
  if (cached) return cached;

  const author = await resolveAuthorByName(name);
  if (!author) return null;

  const authorId = String(author.id);

  let loaded = await loadAuthorArticles({
    authorColumn: "author_id",
    authorId,
    limit,
    offset,
  });

  // إن لم تُعثر مقالات على author_id (حساب قديم عبر reporter_id) — مسار احتياطي ضيّق
  if (loaded.list.length === 0 && loaded.articleCount === 0) {
    loaded = await loadAuthorArticles({
      authorColumn: "reporter_id",
      authorId,
      limit,
      offset,
    });
  }

  // تصنيفات من الصفحة الحالية فقط — بلا GROUP BY على كل الأرشيف
  const catCounts = new Map<string, { id: string; nameAr: string; count: number }>();
  for (const r of loaded.list) {
    if (!r.category_id || !r.category_name_ar) continue;
    const prev = catCounts.get(r.category_id);
    if (prev) prev.count += 1;
    else {
      catCounts.set(r.category_id, {
        id: r.category_id,
        nameAr: r.category_name_ar,
        count: 1,
      });
    }
  }
  const topCategories = Array.from(catCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      color: null as string | null,
      icon: null as string | null,
      count: c.count,
    }));

  const firstName = author.first_name ?? "";
  const lastName = author.last_name ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || name;
  const role = author.job_title || author.department || "كاتب في سبق";
  const joined = author.created_at;

  const result: AuthorPageResult = {
    author: {
      id: authorId,
      name: fullName,
      role,
      avatarUrl: author.profile_image_url || null,
      bio: author.bio || null,
      jobTitle: author.job_title || null,
      department: author.department || null,
      joinedAt: toIsoOrNull(joined),
    },
    stats: {
      articleCount: loaded.articleCount,
      totalViews: loaded.totalViews,
      earliestPublish: toIsoOrNull(loaded.earliest),
    },
    topCategories,
    recentArticles: loaded.list.map((r) => ({
      id: String(r.id),
      title: r.title,
      excerpt: r.excerpt,
      slug: r.slug,
      englishSlug: r.english_slug,
      articleType: r.article_type,
      imageUrl: r.image_url,
      publishedAt:
        r.published_at instanceof Date
          ? r.published_at
          : r.published_at
            ? new Date(String(r.published_at))
            : null,
      views: Number(r.views) || 0,
      categoryNameAr: r.category_name_ar ?? null,
    })),
    pagination: {
      page,
      limit,
      hasMore: offset + loaded.list.length < loaded.articleCount,
    },
  };

  memoryCache.set(cacheKey, result, 5 * 60 * 1000);
  return result;
}
