// خدمة إدارة المراسلين: قائمة بحالة الترخيص والإحصاءات (بدون جدول نشر أسبوعي).
import { and, asc, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, roles, userRoles, users } from "@shared/schema";
import {
  isMediaLicenseExpired,
  isMediaLicenseExpiringSoon,
  getMediaLicenseFileKey,
} from "./mediaLicenseService";

export { getMediaLicenseFileKey as getReporterMediaLicenseFileKey };

export type ReporterSummary = {
  id: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  jobTitle: string | null;
  city: string | null;
  publishedCount: number;
  pendingCount: number;
  totalViews: number;
  lastArticle: { id: string; title: string; slug: string | null; publishedAt: string } | null;
  lastLoginAt: string | null;
  mediaLicense: {
    hasLicense: boolean;
    expired: boolean;
    expiringSoon: boolean;
    number: string | null;
    submittedAt: string | null;
    expiresAt: string | null;
    hasFile: boolean;
  };
};

async function fetchReporterUsers(reporterId?: string) {
  const isReporter = or(
    eq(users.role, "reporter"),
    exists(
      db
        .select({ one: sql`1` })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, users.id), eq(roles.name, "reporter"))),
    ),
  );
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      jobTitle: users.jobTitle,
      city: users.city,
      lastLoginAt: users.lastLoginAt,
      mediaLicenseNumber: users.mediaLicenseNumber,
      mediaLicenseFileKey: users.mediaLicenseFileKey,
      mediaLicenseSubmittedAt: users.mediaLicenseSubmittedAt,
      mediaLicenseExpiresAt: users.mediaLicenseExpiresAt,
    })
    .from(users)
    .where(reporterId ? and(isReporter, eq(users.id, reporterId)) : isReporter)
    .orderBy(asc(users.firstName));
}

/**
 * مالك الخبر للمراسل: reporter_id ثم author_id ثم submitter_id (إن كان ضمن قائمة المراسلين).
 * يُحسب في SQL حتى لا نُحمّل كل صفوف articles إلى Node.
 */
function reporterOwnerIdSql(ids: string[]) {
  return sql<string>`CASE
    WHEN ${inArray(articles.reporterId, ids)} THEN ${articles.reporterId}
    WHEN ${inArray(articles.authorId, ids)} THEN ${articles.authorId}
    WHEN ${inArray(articles.submitterId, ids)} THEN ${articles.submitterId}
  END`;
}

const awaitingReporterEditorialSql = sql`(
  ${articles.reviewStatus} = 'pending_review'
  OR (
    ${articles.status} = 'draft'
    AND ${articles.source} IN ('ios-app', 'android-app')
    AND ${articles.reviewStatus} IS NULL
  )
)`;

function asRowArray<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

export async function listReporters(): Promise<ReporterSummary[]> {
  const reporterRows = await fetchReporterUsers();
  if (reporterRows.length === 0) return [];
  const ids = reporterRows.map((r) => r.id);
  const now = new Date();
  const ownerIdSql = reporterOwnerIdSql(ids);
  const ownedWhere = or(
    inArray(articles.reporterId, ids),
    inArray(articles.authorId, ids),
    inArray(articles.submitterId, ids),
  );

  type StatsRow = {
    owner_id: string;
    published_count: number;
    pending_count: number;
    total_views: number;
  };
  type LastArticleRow = {
    owner_id: string;
    id: string;
    title: string;
    slug: string | null;
    published_at: Date | string;
  };

  // تجميع في Postgres + DISTINCT ON لآخر خبر — بدل سحب كل المقالات إلى الذاكرة
  const [statsRows, lastArticleRows] = await Promise.all([
    db
      .execute(sql`
        SELECT
          ${ownerIdSql} AS owner_id,
          count(*) FILTER (WHERE ${articles.status} = 'published')::int AS published_count,
          count(*) FILTER (WHERE ${awaitingReporterEditorialSql})::int AS pending_count,
          coalesce(sum(${articles.views}) FILTER (WHERE ${articles.status} = 'published'), 0)::int AS total_views
        FROM ${articles}
        WHERE ${ownedWhere}
          AND ${ownerIdSql} IS NOT NULL
        GROUP BY 1
      `)
      .then((r) => asRowArray<StatsRow>(r)),
    db
      .execute(sql`
        SELECT DISTINCT ON (owner_id)
          owner_id,
          id,
          title,
          slug,
          published_at
        FROM (
          SELECT
            ${ownerIdSql} AS owner_id,
            ${articles.id} AS id,
            ${articles.title} AS title,
            ${articles.slug} AS slug,
            ${articles.publishedAt} AS published_at
          FROM ${articles}
          WHERE ${ownedWhere}
            AND ${articles.status} = 'published'
            AND ${articles.publishedAt} IS NOT NULL
            AND ${ownerIdSql} IS NOT NULL
        ) owned
        ORDER BY owner_id, published_at DESC
      `)
      .then((r) => asRowArray<LastArticleRow>(r)),
  ]);

  const statsByOwner = new Map(
    statsRows.map((s) => [
      s.owner_id,
      {
        publishedCount: Number(s.published_count) || 0,
        pendingCount: Number(s.pending_count) || 0,
        totalViews: Number(s.total_views) || 0,
      },
    ]),
  );
  const lastByOwner = new Map(lastArticleRows.map((a) => [a.owner_id, a]));

  return reporterRows.map((r) => {
    const agg = statsByOwner.get(r.id) ?? {
      publishedCount: 0,
      pendingCount: 0,
      totalViews: 0,
    };
    const last = lastByOwner.get(r.id);
    const submitted = Boolean(
      r.mediaLicenseNumber && r.mediaLicenseFileKey && r.mediaLicenseSubmittedAt,
    );
    const expiresAt = r.mediaLicenseExpiresAt ?? null;
    const expired = submitted && (!expiresAt || isMediaLicenseExpired(expiresAt, now));
    const hasLicense = submitted && Boolean(expiresAt) && !isMediaLicenseExpired(expiresAt, now);
    const expiringSoon = hasLicense && isMediaLicenseExpiringSoon(expiresAt, now);

    return {
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || r.id,
      email: r.email,
      profileImageUrl: r.profileImageUrl,
      jobTitle: r.jobTitle,
      city: r.city,
      publishedCount: agg.publishedCount,
      pendingCount: agg.pendingCount,
      totalViews: agg.totalViews,
      lastArticle: last
        ? {
            id: last.id,
            title: last.title,
            slug: last.slug,
            publishedAt: new Date(last.published_at).toISOString(),
          }
        : null,
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
      mediaLicense: {
        hasLicense,
        expired,
        expiringSoon,
        number: r.mediaLicenseNumber ?? null,
        submittedAt: r.mediaLicenseSubmittedAt?.toISOString() ?? null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        hasFile: Boolean(r.mediaLicenseFileKey),
      },
    };
  });
}

export type ReporterArticleRow = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  reviewStatus: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  views: number;
  likes: number;
  comments: number;
};

export async function getReporterArticlesWithStats(
  reporterId: string,
  page: number,
  limit: number,
): Promise<{
  reporter: { id: string; name: string; profileImageUrl: string | null } | null;
  articles: ReporterArticleRow[];
  totals: { totalArticles: number; totalViews: number; totalLikes: number; totalComments: number };
  pagination: { page: number; limit: number; total: number };
}> {
  const [reporterRow] = await fetchReporterUsers(reporterId);
  if (!reporterRow) {
    return {
      reporter: null,
      articles: [],
      totals: { totalArticles: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
      pagination: { page, limit, total: 0 },
    };
  }

  const baseWhere = or(
    eq(articles.reporterId, reporterId),
    eq(articles.authorId, reporterId),
    eq(articles.submitterId, reporterId),
  );

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        publishedAt: articles.publishedAt,
        scheduledAt: articles.scheduledAt,
        createdAt: articles.createdAt,
        views: articles.views,
        likes: sql<number>`(select count(*)::int from reactions r where r.article_id = ${articles.id} and r.type = 'like')`,
        comments: sql<number>`(select count(*)::int from comments c where c.article_id = ${articles.id})`,
      })
      .from(articles)
      .where(baseWhere)
      .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.scheduledAt}, ${articles.createdAt})`))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({
        totalArticles: sql<number>`count(*)::int`,
        totalViews: sql<number>`coalesce(sum(${articles.views}) filter (where ${articles.status} = 'published'), 0)::int`,
        totalLikes: sql<number>`coalesce((
          select count(*)::int from reactions r
          join articles a2 on a2.id = r.article_id
          where r.type = 'like'
            and (a2.reporter_id = ${reporterId} or a2.author_id = ${reporterId} or a2.submitter_id = ${reporterId})
        ), 0)`,
        totalComments: sql<number>`coalesce((
          select count(*)::int from comments c
          join articles a3 on a3.id = c.article_id
          where (a3.reporter_id = ${reporterId} or a3.author_id = ${reporterId} or a3.submitter_id = ${reporterId})
        ), 0)`,
      })
      .from(articles)
      .where(baseWhere),
  ]);

  return {
    reporter: {
      id: reporterRow.id,
      name:
        [reporterRow.firstName, reporterRow.lastName].filter(Boolean).join(" ") ||
        reporterRow.email ||
        reporterRow.id,
      profileImageUrl: reporterRow.profileImageUrl,
    },
    articles: rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
      scheduledAt: r.scheduledAt ? new Date(r.scheduledAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
    totals: totals ?? { totalArticles: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
    pagination: { page, limit, total: totals?.totalArticles ?? 0 },
  };
}
