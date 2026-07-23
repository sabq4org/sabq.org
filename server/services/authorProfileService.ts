/**
 * صفحة الكاتب العامة — نفس عقد الموبايل `/api/v1/authors/by-name`
 * لكن بشكل مناسب للويب (روابط /opinion و/article).
 *
 * الأداء: بدون JOIN ثقيل على كل المقالات عند مطابقة الاسم؛
 * قائمة المقالات عبر author_id (فهرس)؛ كاش ذاكرة ٥ دقائق.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { memoryCache } from "../memoryCache";
import { articles, categories } from "@shared/schema";

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

function normalizeAuthorName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const withRows = result as { rows?: Array<Record<string, unknown>> };
  if (Array.isArray(withRows?.rows)) return withRows.rows;
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return [];
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

export async function getAuthorPageByName(
  rawName: string,
  opts: { page?: number; limit?: number } = {},
): Promise<AuthorPageResult | null> {
  const name = normalizeAuthorName(rawName);
  if (!name) return null;

  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(24, Math.max(1, opts.limit ?? 12));
  const offset = (page - 1) * limit;

  const cacheKey = `author:web:${name.toLowerCase()}:p${page}:l${limit}`;
  const cached = memoryCache.get<AuthorPageResult>(cacheKey);
  if (cached) return cached;

  const author = await resolveAuthorByName(name);
  if (!author) return null;

  const authorId = String(author.id);

  // قائمة + عدّ عبر author_id فقط (كتّاب الرأي ومسار الويب الأساسي)
  const [statsRow, recent] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS article_count,
        COALESCE(SUM(a.views), 0)::bigint AS total_views,
        MIN(a.published_at) AS earliest_publish
      FROM articles a
      WHERE a.status = 'published'
        AND a.author_id = ${authorId}
    `),

    db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        articleType: articles.articleType,
        imageUrl: articles.imageUrl,
        publishedAt: articles.publishedAt,
        views: articles.views,
        categoryId: articles.categoryId,
        categoryNameAr: categories.nameAr,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(eq(articles.status, "published"), eq(articles.authorId, authorId)))
      .orderBy(desc(articles.publishedAt))
      .limit(limit)
      .offset(offset),
  ]);

  const stats = rowsOf(statsRow)[0] ?? {};

  // إن لم تُعثر مقالات على author_id (حساب قديم عبر reporter_id) — مسار احتياطي ضيّق
  let list = recent;
  let articleCount = Number(stats.article_count) || 0;
  let totalViews = Number(stats.total_views) || 0;
  let earliest = stats.earliest_publish as Date | string | null;

  if (list.length === 0 && articleCount === 0) {
    const [fallbackStats, fallbackList] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*)::int AS article_count,
          COALESCE(SUM(a.views), 0)::bigint AS total_views,
          MIN(a.published_at) AS earliest_publish
        FROM articles a
        WHERE a.status = 'published'
          AND a.reporter_id = ${authorId}
      `),
      db
        .select({
          id: articles.id,
          title: articles.title,
          excerpt: articles.excerpt,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          articleType: articles.articleType,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          views: articles.views,
          categoryId: articles.categoryId,
          categoryNameAr: categories.nameAr,
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .where(and(eq(articles.status, "published"), eq(articles.reporterId, authorId)))
        .orderBy(desc(articles.publishedAt))
        .limit(limit)
        .offset(offset),
    ]);
    const fs = rowsOf(fallbackStats)[0] ?? {};
    list = fallbackList;
    articleCount = Number(fs.article_count) || 0;
    totalViews = Number(fs.total_views) || 0;
    earliest = fs.earliest_publish as Date | string | null;
  }

  // تصنيفات من الصفحة الحالية فقط — بلا GROUP BY على كل الأرشيف
  const catCounts = new Map<string, { id: string; nameAr: string; count: number }>();
  for (const r of list) {
    if (!r.categoryId || !r.categoryNameAr) continue;
    const prev = catCounts.get(r.categoryId);
    if (prev) prev.count += 1;
    else catCounts.set(r.categoryId, { id: r.categoryId, nameAr: r.categoryNameAr, count: 1 });
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
      joinedAt:
        joined instanceof Date ? joined.toISOString() : joined ? String(joined) : null,
    },
    stats: {
      articleCount,
      totalViews,
      earliestPublish:
        earliest instanceof Date
          ? earliest.toISOString()
          : earliest
            ? String(earliest)
            : null,
    },
    topCategories,
    recentArticles: list.map((r) => ({
      id: r.id,
      title: r.title,
      excerpt: r.excerpt,
      slug: r.slug,
      englishSlug: r.englishSlug,
      articleType: r.articleType,
      imageUrl: r.imageUrl,
      publishedAt: r.publishedAt,
      views: r.views ?? 0,
      categoryNameAr: r.categoryNameAr ?? null,
    })),
  };

  memoryCache.set(cacheKey, result, 5 * 60 * 1000);
  return result;
}
