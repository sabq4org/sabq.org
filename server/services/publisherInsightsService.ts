import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { withCache } from "../memoryCache";
import {
  articles,
  categories,
  publisherCreditLogs,
  pushCampaigns,
  socialPosts,
  users,
  type Publisher,
} from "@shared/schema";

/**
 * أرقام لوحة الوكالة التي تجيب «هل يستحق النشر في سبق؟»:
 * المقارنة بالمعتاد في القسم، أين ظهر الخبر، التقرير الشهري، وكشف الحساب.
 * كل شيء من بيانات موجودة — لا جداول جديدة.
 */

const DAY = 86_400_000;
/** نافذة «المعتاد»: آخر 90 يومًا، مع استبعاد آخر يومين لأن قراءات الخبر الجديد لم تكتمل. */
const BENCHMARK_WINDOW_DAYS = 90;
const SETTLE_DAYS = 2;
const MIN_SAMPLE = 5;

function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] };
  return Array.isArray(r?.rows) ? r.rows : Array.isArray(result) ? (result as T[]) : [];
}

function benchmarkWindow(now = new Date()) {
  return {
    from: new Date(now.getTime() - BENCHMARK_WINDOW_DAYS * DAY),
    to: new Date(now.getTime() - SETTLE_DAYS * DAY),
  };
}

/**
 * وسيط قراءات أخبار سبق نفسها (بلا أخبار الوكالات) في كل قسم.
 * الوسيط لا المتوسط: خبر واحد منتشر يرفع المتوسط ويجعل كل خبر آخر «أقل من المعتاد».
 */
export async function getCategoryMedians(categoryIds: string[]): Promise<Map<string, { median: number; sample: number }>> {
  const unique = Array.from(new Set(categoryIds.filter(Boolean))).sort();
  const result = new Map<string, { median: number; sample: number }>();
  if (unique.length === 0) return result;

  const rows = await withCache(`publisher:insights:category-medians:${unique.join(",")}`, 60 * 60_000, async () => {
    const { from, to } = benchmarkWindow();
    return db
      .select({
        categoryId: articles.categoryId,
        median: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${articles.views}), 0)::float8`,
        sample: sql<number>`count(*)::int`,
      })
      .from(articles)
      .where(
        and(
          inArray(articles.categoryId, unique),
          eq(articles.status, "published"),
          isNull(articles.publisherId),
          gte(articles.publishedAt, from),
          lt(articles.publishedAt, to),
        ),
      )
      .groupBy(articles.categoryId);
  });

  for (const row of rows) {
    if (!row.categoryId) continue;
    const sample = Number(row.sample) || 0;
    if (sample < MIN_SAMPLE) continue;
    result.set(row.categoryId, { median: Math.round(Number(row.median) || 0), sample });
  }
  return result;
}

/**
 * نسبة قراءات الخبر إلى المعتاد في قسمه، أو null حين يكون الحكم مبكرًا
 * (أقل من يومين على النشر) أو لا يوجد معتاد موثوق للقسم.
 */
export function compareToUsual(
  article: { status: string; views: number | null; publishedAt: Date | string | null; categoryId: string | null },
  medians: Map<string, { median: number }>,
  now = new Date(),
): { ratio: number; median: number } | null {
  if (article.status !== "published" || !article.publishedAt || !article.categoryId) return null;
  if (now.getTime() - new Date(article.publishedAt).getTime() < SETTLE_DAYS * DAY) return null;
  const usual = medians.get(article.categoryId);
  if (!usual || usual.median <= 0) return null;
  return { ratio: Math.round(((Number(article.views) || 0) / usual.median) * 10) / 10, median: usual.median };
}

export async function withUsualComparison<
  T extends { status: string; views: number | null; publishedAt: Date | string | null; categoryId: string | null },
>(rows: T[]): Promise<Array<T & { vsUsual: { ratio: number; median: number } | null }>> {
  const medians = await getCategoryMedians(rows.map((r) => r.categoryId ?? ""));
  const now = new Date();
  return rows.map((row) => ({ ...row, vsUsual: compareToUsual(row, medians, now) }));
}

/** «القراءة المعتادة لخبرك» مقابل المعتاد في القسم الذي تنشر فيه الوكالة أكثر. */
export async function getPublisherBenchmark(publisher: Publisher) {
  const { from, to } = benchmarkWindow();
  const inWindow = and(
    eq(articles.publisherId, publisher.id),
    eq(articles.status, "published"),
    gte(articles.publishedAt, from),
    lt(articles.publishedAt, to),
  );

  const [[agency], [topCategory]] = await Promise.all([
    db
      .select({
        median: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${articles.views}), 0)::float8`,
        sample: sql<number>`count(*)::int`,
      })
      .from(articles)
      .where(inWindow),
    db
      .select({ categoryId: articles.categoryId, name: categories.nameAr, count: sql<number>`count(*)::int` })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(inWindow)
      .groupBy(articles.categoryId, categories.nameAr)
      .orderBy(desc(sql`count(*)`))
      .limit(1),
  ]);

  const sample = Number(agency?.sample) || 0;
  if (sample < MIN_SAMPLE || !topCategory?.categoryId) return null;
  const medians = await getCategoryMedians([topCategory.categoryId]);
  const usual = medians.get(topCategory.categoryId);
  if (!usual) return null;

  return {
    agencyMedian: Math.round(Number(agency.median) || 0),
    agencySample: sample,
    categoryId: topCategory.categoryId,
    categoryName: topCategory.name ?? "القسم",
    categoryMedian: usual.median,
    windowDays: BENCHMARK_WINDOW_DAYS,
  };
}

export type ArticlePlacements = {
  featured: boolean;
  breaking: boolean;
  push: { sentAt: Date | null } | null;
  x: { url: string | null; publishedAt: Date | null } | null;
};

/** أين ظهر الخبر — مما يسجله سبق فعلًا: تمييز في الرئيسية، عاجل، تنبيه مرسل، منشور على X. */
export async function getArticlePlacements(
  rows: Array<{ id: string; isFeatured?: boolean | null; newsType?: string | null }>,
): Promise<Map<string, ArticlePlacements>> {
  const ids = rows.map((r) => r.id);
  const map = new Map<string, ArticlePlacements>();
  if (ids.length === 0) return map;

  const [pushes, posts] = await Promise.all([
    db
      .select({ articleId: pushCampaigns.articleId, sentAt: sql<Date | null>`max(${pushCampaigns.sentAt})` })
      .from(pushCampaigns)
      .where(and(inArray(pushCampaigns.articleId, ids), eq(pushCampaigns.status, "sent")))
      .groupBy(pushCampaigns.articleId),
    db
      .select({
        articleId: socialPosts.articleId,
        url: socialPosts.externalPostUrl,
        publishedAt: socialPosts.publishedAt,
      })
      .from(socialPosts)
      .where(and(inArray(socialPosts.articleId, ids), eq(socialPosts.status, "published")))
      .orderBy(desc(socialPosts.publishedAt)),
  ]);

  for (const row of rows) {
    map.set(row.id, {
      featured: !!row.isFeatured,
      breaking: row.newsType === "breaking",
      push: null,
      x: null,
    });
  }
  for (const p of pushes) {
    const entry = p.articleId ? map.get(p.articleId) : undefined;
    if (entry) entry.push = { sentAt: p.sentAt ? new Date(p.sentAt) : null };
  }
  for (const post of posts) {
    const entry = post.articleId ? map.get(post.articleId) : undefined;
    if (entry && !entry.x) entry.x = { url: post.url, publishedAt: post.publishedAt };
  }
  return map;
}

function authorName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

/** صفحة «تقرير الخبر»: رحلته، قراءاته مقابل المعتاد، أين ظهر، وقيد الرصيد. */
export async function getPortalArticleReport(publisher: Publisher, articleId: string) {
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      views: articles.views,
      categoryId: articles.categoryId,
      categoryName: categories.nameAr,
      isFeatured: articles.isFeatured,
      newsType: articles.newsType,
      createdAt: articles.createdAt,
      publisherSubmittedAt: articles.publisherSubmittedAt,
      publisherApprovedAt: articles.publisherApprovedAt,
      publisherStatus: articles.publisherStatus,
      publisherReviewNotes: articles.publisherReviewNotes,
      scheduledAt: articles.scheduledAt,
      publishedAt: articles.publishedAt,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(and(eq(articles.id, articleId), eq(articles.publisherId, publisher.id)))
    .limit(1);
  if (!article) return null;

  const [medians, placements, ledger] = await Promise.all([
    getCategoryMedians(article.categoryId ? [article.categoryId] : []),
    getArticlePlacements([article]),
    db
      .select({
        actionType: publisherCreditLogs.actionType,
        creditsChanged: publisherCreditLogs.creditsChanged,
        notes: publisherCreditLogs.notes,
        createdAt: publisherCreditLogs.createdAt,
      })
      .from(publisherCreditLogs)
      .where(and(eq(publisherCreditLogs.articleId, article.id), eq(publisherCreditLogs.publisherId, publisher.id)))
      .orderBy(publisherCreditLogs.createdAt),
  ]);

  const { authorFirstName, authorLastName, ...rest } = article;
  return {
    article: { ...rest, authorName: authorName(authorFirstName, authorLastName) },
    vsUsual: compareToUsual(article, medians),
    usualMedian: article.categoryId ? (medians.get(article.categoryId)?.median ?? null) : null,
    placements: placements.get(article.id) ?? null,
    ledger,
  };
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function isValidMonth(month: string | undefined): month is string {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  return monthBounds(month).start.getTime() <= Date.now();
}

/** التقرير الشهري القابل للطباعة: ما نُشر، قراءاته، أقسامه، أفضله، ومن كتبه. */
export async function getPortalMonthlyReport(publisher: Publisher, month: string) {
  const { start, end } = monthBounds(month);
  const prev = monthBounds(
    `${start.getUTCMonth() === 0 ? start.getUTCFullYear() - 1 : start.getUTCFullYear()}-${String(start.getUTCMonth() === 0 ? 12 : start.getUTCMonth()).padStart(2, "0")}`,
  );
  const published = (from: Date, to: Date) =>
    and(
      eq(articles.publisherId, publisher.id),
      eq(articles.status, "published"),
      gte(articles.publishedAt, from),
      lt(articles.publishedAt, to),
    );

  const [[totals], [previous], byCategory, top, byAuthor, months] = await Promise.all([
    db
      .select({ published: sql<number>`count(*)::int`, views: sql<number>`coalesce(sum(${articles.views}), 0)::bigint` })
      .from(articles)
      .where(published(start, end)),
    db
      .select({ published: sql<number>`count(*)::int`, views: sql<number>`coalesce(sum(${articles.views}), 0)::bigint` })
      .from(articles)
      .where(published(prev.start, prev.end)),
    db
      .select({
        categoryId: articles.categoryId,
        name: categories.nameAr,
        published: sql<number>`count(*)::int`,
        views: sql<number>`coalesce(sum(${articles.views}), 0)::bigint`,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(published(start, end))
      .groupBy(articles.categoryId, categories.nameAr)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        id: articles.id,
        title: articles.title,
        englishSlug: articles.englishSlug,
        views: articles.views,
        publishedAt: articles.publishedAt,
        categoryId: articles.categoryId,
        status: articles.status,
        categoryName: categories.nameAr,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(published(start, end))
      .orderBy(desc(articles.views))
      .limit(10),
    db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        published: sql<number>`count(*)::int`,
        views: sql<number>`coalesce(sum(${articles.views}), 0)::bigint`,
      })
      .from(articles)
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(published(start, end))
      .groupBy(users.id, users.firstName, users.lastName)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ month: sql<string>`to_char(date_trunc('month', ${articles.publishedAt}), 'YYYY-MM')` })
      .from(articles)
      .where(and(eq(articles.publisherId, publisher.id), eq(articles.status, "published")))
      .groupBy(sql`date_trunc('month', ${articles.publishedAt})`)
      .orderBy(desc(sql`date_trunc('month', ${articles.publishedAt})`))
      .limit(24),
  ]);

  const medians = await getCategoryMedians(byCategory.map((c) => c.categoryId ?? ""));
  const topWithUsual = top.map((row) => ({ ...row, vsUsual: compareToUsual(row, medians) }));

  return {
    month,
    agencyName: publisher.agencyName,
    totals: { published: Number(totals?.published) || 0, views: Number(totals?.views) || 0 },
    previous: { published: Number(previous?.published) || 0, views: Number(previous?.views) || 0 },
    categories: byCategory.map((c) => ({
      name: c.name ?? "بلا قسم",
      published: Number(c.published) || 0,
      views: Number(c.views) || 0,
      usualMedian: c.categoryId ? (medians.get(c.categoryId)?.median ?? null) : null,
    })),
    topArticles: topWithUsual,
    authors: byAuthor.map((a) => ({
      name: authorName(a.firstName, a.lastName) ?? "غير معروف",
      published: Number(a.published) || 0,
      views: Number(a.views) || 0,
    })),
    availableMonths: months.map((m) => m.month).filter(Boolean),
    generatedAt: new Date(),
  };
}

/**
 * كشف الحساب الشهري من دفتر الخصم: لكل شهر عدد المنشور، وكم منه قُيّد
 * خصمًا، وكم تسوية دفترية، وكم بلا قيد. «مطابق» = كل منشور له قيد صافٍ واحد.
 */
export async function getPortalStatement(publisher: Publisher, monthsBack = 12) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - (monthsBack - 1), 1);
  since.setUTCHours(0, 0, 0, 0);

  const result = await db.execute(sql`
    WITH ledger AS (
      SELECT article_id,
             count(*) FILTER (WHERE action_type = 'credit_used')     AS used,
             count(*) FILTER (WHERE action_type = 'credit_settled')  AS settled,
             count(*) FILTER (WHERE action_type = 'credit_refunded') AS refunded
      FROM publisher_credit_logs
      WHERE publisher_id = ${publisher.id} AND article_id IS NOT NULL
      GROUP BY article_id
    )
    SELECT to_char(date_trunc('month', a.published_at), 'YYYY-MM') AS month,
           count(*)::int AS published,
           count(*) FILTER (WHERE coalesce(l.used, 0) > coalesce(l.refunded, 0))::int AS charged,
           count(*) FILTER (WHERE coalesce(l.used, 0) <= coalesce(l.refunded, 0) AND coalesce(l.settled, 0) > 0)::int AS settled,
           count(*) FILTER (WHERE coalesce(l.used, 0) + coalesce(l.settled, 0) - coalesce(l.refunded, 0) <= 0)::int AS missing
    FROM articles a
    LEFT JOIN ledger l ON l.article_id = a.id
    WHERE a.publisher_id = ${publisher.id}
      AND a.status = 'published'
      AND a.published_at >= ${since}
    GROUP BY 1
    ORDER BY 1 DESC
  `);

  return rowsOf<{ month: string; published: number; charged: number; settled: number; missing: number }>(result).map(
    (r) => ({
      month: r.month,
      published: Number(r.published) || 0,
      charged: Number(r.charged) || 0,
      settled: Number(r.settled) || 0,
      missing: Number(r.missing) || 0,
    }),
  );
}
