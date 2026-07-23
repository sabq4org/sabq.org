/**
 * صفحة الكاتب العامة — نفس عقد الموبايل `/api/v1/authors/by-name`
 * لكن بشكل مناسب للويب (روابط /opinion و/article).
 */
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
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

function normalizeAuthorName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function getAuthorPageByName(
  rawName: string,
  opts: { page?: number; limit?: number } = {},
): Promise<AuthorPageResult | null> {
  const name = normalizeAuthorName(rawName);
  if (!name) return null;

  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 30));
  const offset = (page - 1) * limit;

  // ترتيب بآخر نشر حتى لا نلتقط حساباً قديماً مكرّر الاسم (نفس منطق الموبايل)
  const userRow = (await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, u.profile_image_url, u.bio,
           u.job_title, u.department, u.created_at,
           COUNT(a.id) AS published_count,
           MAX(a.published_at) AS latest_published
    FROM users u
    LEFT JOIN articles a
      ON a.status = 'published'
      AND (a.author_id = u.id OR a.reporter_id = u.id)
    WHERE LOWER(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')))
          = LOWER(${name})
    GROUP BY u.id, u.first_name, u.last_name, u.profile_image_url, u.bio,
             u.job_title, u.department, u.created_at
    ORDER BY latest_published DESC NULLS LAST,
             published_count DESC,
             u.created_at ASC
    LIMIT 1
  `)) as { rows?: Array<Record<string, unknown>> };

  const author = (userRow?.rows ?? (userRow as unknown as Array<Record<string, unknown>>))[0];
  if (!author) return null;

  const authorId = String(author.id);

  const [statsRow, topCatsRows, recent] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(DISTINCT a.id) AS article_count,
        COALESCE(SUM(a.views), 0) AS total_views,
        MIN(a.published_at) AS earliest_publish
      FROM articles a
      WHERE a.status = 'published'
        AND (a.reporter_id = ${authorId} OR a.author_id = ${authorId})
    `) as Promise<{ rows?: Array<Record<string, unknown>> }>,

    db.execute(sql`
      SELECT c.id, c.name_ar, c.color, c.icon, COUNT(*) AS count
      FROM articles a
      INNER JOIN categories c ON a.category_id = c.id
      WHERE a.status = 'published'
        AND (a.reporter_id = ${authorId} OR a.author_id = ${authorId})
      GROUP BY c.id, c.name_ar, c.color, c.icon
      ORDER BY count DESC
      LIMIT 3
    `) as Promise<{ rows?: Array<Record<string, unknown>> }>,

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
        categoryNameAr: categories.nameAr,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(
          eq(articles.status, "published"),
          or(eq(articles.reporterId, authorId), eq(articles.authorId, authorId)),
        ),
      )
      .orderBy(desc(articles.publishedAt))
      .limit(limit)
      .offset(offset),
  ]);

  const stats = (statsRow?.rows ?? (statsRow as unknown as Array<Record<string, unknown>>))[0] ?? {};
  const topCategories = (topCatsRows?.rows ?? (topCatsRows as unknown as Array<Record<string, unknown>>)).map(
    (r) => ({
      id: String(r.id),
      nameAr: String(r.name_ar ?? ""),
      color: (r.color as string | null) ?? null,
      icon: (r.icon as string | null) ?? null,
      count: Number(r.count) || 0,
    }),
  );

  const firstName = (author.first_name as string | null) ?? "";
  const lastName = (author.last_name as string | null) ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || name;
  const role =
    (author.job_title as string | null) ||
    (author.department as string | null) ||
    "كاتب في سبق";

  const avatarRaw = author.profile_image_url as string | null;
  const joined = author.created_at as Date | string | null;
  const earliest = stats.earliest_publish as Date | string | null;

  return {
    author: {
      id: authorId,
      name: fullName,
      role,
      avatarUrl: avatarRaw || null,
      bio: (author.bio as string | null) || null,
      jobTitle: (author.job_title as string | null) || null,
      department: (author.department as string | null) || null,
      joinedAt:
        joined instanceof Date ? joined.toISOString() : joined ? String(joined) : null,
    },
    stats: {
      articleCount: Number(stats.article_count) || 0,
      totalViews: Number(stats.total_views) || 0,
      earliestPublish:
        earliest instanceof Date
          ? earliest.toISOString()
          : earliest
            ? String(earliest)
            : null,
    },
    topCategories,
    recentArticles: recent.map((r) => ({
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
}
