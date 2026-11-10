// عدّادات «مكتب سبق» في طلب واحد — GET /api/v1/staff/counts، ورقم الأيقونة
// المرسل مع إشعارات desk.* (2026-11-09). استعلامات COUNT فقط، بلا تحميل اللوحات.
// قراءة فقط. كل مصدر معزول: فشله يعيد 0 ويُسجَّل ولا يُسقط الرد.
// المنطق الخالص (الحجب والمجموع) في shared/staffDeskCounts.ts.

import { and, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { articleEditRequests, articles, socialPosts, users } from "@shared/schema";
import type { StaffCapabilities } from "@shared/staffApp";
import {
  STAFF_BADGE_EXCLUDED_BELL_KINDS,
  buildStaffDeskCounts,
  canSeeStaffDeskBell,
  type StaffDeskCountsResponse,
  type StaffDeskRawCounts,
} from "@shared/staffDeskCounts";
import { STAFF_NEWS_EMAIL_SOURCES, STAFF_NEWS_LIST_LIMIT, STAFF_NEWS_WINDOW_DAYS } from "@shared/staffNews";
import { db } from "../db";
import { awaitingEditorialSql } from "./opinionWritersService";
import { getOpinionTicketsUnreadCounts } from "./opinionTicketsService";
import { getStaffAdminAlerts } from "./staffAdminAlertsService";
import { resolveStaffCapabilitiesAndRoles } from "./staffAppService";
import { getStaffDeskUnreadDetailed } from "./staffDeskEventsService";

const LOG_PREFIX = "[StaffDeskCounts]";
const DAY_MS = 24 * 60 * 60 * 1000;
// الحدود نفسها التي تعرضها القوائم الأصلية، ليطابق الرقم ما يراه العضو.
const SOCIAL_PENDING_CAP = 200;
const OPINION_PENDING_WINDOW_MS = 45 * DAY_MS;
const OPINION_PENDING_CAP = 500;
const EDIT_REQUESTS_CAP = 200;

/** مصدر واحد: فشله لا يُسقط الرد. */
async function guarded<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`${LOG_PREFIX} ${label} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function isTableNotReady(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "42P01" || code === "42501";
}

/** مقترحات التغريدات بانتظار القرار — شرط listPendingSocialProposalsForDesk("all"). */
async function countPendingSocialProposals(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(socialPosts)
    .leftJoin(articles, eq(socialPosts.articleId, articles.id))
    .where(
      and(
        eq(socialPosts.status, "draft"),
        or(
          isNotNull(socialPosts.publisherId),
          and(
            isNotNull(socialPosts.articleId),
            isNotNull(socialPosts.createdByUserId),
            or(
              eq(socialPosts.createdByUserId, articles.authorId),
              eq(socialPosts.createdByUserId, articles.submitterId),
            ),
          ),
          // مقترح محرر من «نشر سبق» (editorTweetService): خبر + requestedAt بلا وكالة.
          and(isNotNull(socialPosts.articleId), isNotNull(socialPosts.requestedAt)),
        ),
      ),
    );
  return Math.min(Number(row?.total) || 0, SOCIAL_PENDING_CAP);
}

/** مسودات الرأي بانتظار المكتب (جديدة + قيد التجهيز) — شرط لوحة الرأي. */
async function countPendingOpinionDrafts(now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(articles)
    .where(
      and(
        eq(articles.articleType, "opinion"),
        eq(articles.status, "draft"),
        isNotNull(articles.authorId),
        or(awaitingEditorialSql, eq(articles.reviewStatus, "approved")),
        gte(articles.updatedAt, new Date(now.getTime() - OPINION_PENDING_WINDOW_MS)),
      ),
    );
  return Math.min(Number(row?.total) || 0, OPINION_PENDING_CAP);
}

/** مسودات الأخبار بانتظار المراجعة، مقسومة بريد/مراسلين — شرط تبويب «الأخبار». */
async function countPendingNewsDrafts(now: Date): Promise<{ reporters: number; email: number }> {
  const emailSources = [...STAFF_NEWS_EMAIL_SOURCES];
  const isEmail = sql`lower(coalesce(${articles.source}, '')) in (${sql.join(emailSources.map((s) => sql`${s}`), sql`, `)})`;
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      email: sql<number>`count(*) filter (where ${isEmail})::int`,
    })
    .from(articles)
    .where(
      and(
        ne(articles.articleType, "opinion"),
        eq(articles.status, "draft"),
        gte(articles.updatedAt, new Date(now.getTime() - STAFF_NEWS_WINDOW_DAYS * DAY_MS)),
        or(
          eq(articles.reviewStatus, "pending_review"),
          and(isNull(articles.reviewStatus), inArray(articles.source, emailSources)),
        ),
      ),
    );
  const total = Math.min(Number(row?.total) || 0, STAFF_NEWS_LIST_LIMIT);
  const email = Math.min(Number(row?.email) || 0, total);
  return { reporters: total - email, email };
}

/** طلبات التعديل المعلّقة. الجدول غير الجاهز (قبل الترحيل/المنح) = 0 بلا ضجيج. */
async function countPendingEditRequests(): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(articleEditRequests)
      .innerJoin(articles, eq(articleEditRequests.articleId, articles.id))
      .where(eq(articleEditRequests.status, "pending"));
    return Math.min(Number(row?.total) || 0, EDIT_REQUESTS_CAP);
  } catch (error) {
    if (isTableNotReady(error)) return 0;
    throw error;
  }
}

/**
 * كل العدّادات بالتوازي. `includeAlerts=false` يتخطى تنبيهات الإدارة
 * (أثقل المصادر وخارج رقم الأيقونة) — مسار الإشعار لا يحتاجها.
 */
export async function getStaffDeskCounts(options: {
  userId: string;
  capabilities: StaffCapabilities;
  includeAlerts?: boolean;
  now?: Date;
}): Promise<StaffDeskCountsResponse> {
  const { userId, capabilities: caps } = options;
  const now = options.now ?? new Date();
  const skip = Promise.resolve(null);

  const [tickets, social, opinionPending, news, editRequests, bell, alerts] = await Promise.all([
    caps.canTickets
      ? guarded("tickets", async () =>
          (await getOpinionTicketsUnreadCounts({ viewerId: userId, isAdmin: true })).unreadCount)
      : skip,
    caps.canSocial?.view ? guarded("social", countPendingSocialProposals) : skip,
    caps.canOpinion?.view ? guarded("opinion", () => countPendingOpinionDrafts(now)) : skip,
    caps.canNews ? guarded("news", () => countPendingNewsDrafts(now)) : skip,
    caps.canNews ? guarded("editRequests", countPendingEditRequests) : skip,
    canSeeStaffDeskBell(caps)
      ? guarded("notifications", () =>
          getStaffDeskUnreadDetailed(caps, userId, now, STAFF_BADGE_EXCLUDED_BELL_KINDS))
      : skip,
    caps.canAdminAlerts && options.includeAlerts !== false
      ? guarded("alerts", async () =>
          (await getStaffAdminAlerts({ canRetrySocial: caps.canSocial.publish, now })).counts.urgent)
      : skip,
  ]);

  const raw: StaffDeskRawCounts = {
    tickets,
    social,
    opinionPending,
    newsReporters: news?.reporters ?? null,
    newsEmail: news?.email ?? null,
    editRequests,
    bellUnread: bell?.unreadCount ?? null,
    bellActionable: bell?.unreadExcludingKinds ?? null,
    bellLatest: bell?.latest ?? null,
    urgentAlerts: alerts,
  };
  return buildStaffDeskCounts(caps, raw, now);
}

/**
 * رقم الأيقونة لمستلم إشعار desk.*: الصلاحيات الحية ثم المجموع نفسه الذي
 * يعيده /counts. null عند أي فشل — يُرسل الإشعار عندها بلا رقم.
 */
export async function getStaffDeskBadgeForUser(userId: string): Promise<number | null> {
  try {
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const { capabilities } = await resolveStaffCapabilitiesAndRoles(userId, user.role);
    const counts = await getStaffDeskCounts({ userId, capabilities, includeAlerts: false });
    return counts.badge;
  } catch (error) {
    console.error(`${LOG_PREFIX} badge failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}
