// خدمة إدارة المراسلين: قائمة بحالة الترخيص والمدينة (بدون إحصاءات نشر — لسرعة الجلب).
import { and, asc, desc, eq, exists, or, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, roles, userRoles, users } from "@shared/schema";
import {
  mediaLicenseFlags,
  getMediaLicenseFileKey,
  resolveMediaLicenseReviewStatus,
} from "./mediaLicenseService";

export { getMediaLicenseFileKey as getReporterMediaLicenseFileKey };

export type ReporterSummary = {
  id: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  jobTitle: string | null;
  city: string | null;
  lastLoginAt: string | null;
  mediaLicense: {
    hasLicense: boolean;
    expired: boolean;
    expiringSoon: boolean;
    needsCorrection: boolean;
    pendingReview: boolean;
    adminNote: string | null;
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
      mediaLicenseAdminNote: users.mediaLicenseAdminNote,
      mediaLicenseCorrectionRequestedAt: users.mediaLicenseCorrectionRequestedAt,
      mediaLicenseReviewStatus: users.mediaLicenseReviewStatus,
    })
    .from(users)
    .where(reporterId ? and(isReporter, eq(users.id, reporterId)) : isReporter)
    .orderBy(asc(users.firstName));
}

/** قائمة المراسلين من جدول users فقط — بلا استعلام على articles. */
export async function listReporters(): Promise<ReporterSummary[]> {
  const reporterRows = await fetchReporterUsers();
  if (reporterRows.length === 0) return [];
  const now = new Date();

  return reporterRows.map((r) => {
    const submitted = Boolean(
      r.mediaLicenseNumber && r.mediaLicenseFileKey && r.mediaLicenseSubmittedAt,
    );
    const reviewStatus = resolveMediaLicenseReviewStatus(r);
    const needsCorrection = reviewStatus === "needs_correction";
    const pendingReview = reviewStatus === "pending_review";
    const licenseFlags = mediaLicenseFlags(submitted, r.mediaLicenseExpiresAt ?? null, now);
    const submittedAt = r.mediaLicenseSubmittedAt;
    const submittedAtIso =
      submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt.toISOString() : null;
    const hasLicense = licenseFlags.hasLicense && reviewStatus === "approved";

    return {
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || r.id,
      email: r.email,
      profileImageUrl: r.profileImageUrl,
      jobTitle: r.jobTitle,
      city: r.city,
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
      mediaLicense: {
        hasLicense,
        expired: licenseFlags.expired,
        expiringSoon: licenseFlags.expiringSoon && reviewStatus === "approved",
        needsCorrection,
        pendingReview,
        adminNote:
          needsCorrection || pendingReview
            ? r.mediaLicenseAdminNote?.trim() || null
            : null,
        number: r.mediaLicenseNumber ?? null,
        submittedAt: submittedAtIso,
        expiresAt: licenseFlags.expiresAtIso,
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
