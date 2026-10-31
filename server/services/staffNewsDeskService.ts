// تبويب «الأخبار» في تطبيق «مكتب سبق» (/api/v1/staff/news/*) — المرحلة 1 من
// تكامل الويب وiOS (2026-10-31). كل استعلامات Drizzle هنا (ADR-001).
//
// الأفعال تعيد استخدام منطق الويب: النشر يمر على runWithExclusiveBreaking
// ونفس آثار النشر (botDraftPublishEffects مع خيارات المكتب)، والإعادة إلى
// المراسل مطابقة لـ /api/admin/articles/:id/request-revision، وطلبات التعديل
// على articleEditRequestsService كما هي. كل كتابة تحترم قفل التحرير ونسخة الخبر.

import { and, asc, eq, gt, gte, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { articleEditLocks, articleEditRequests, articles, categories, users, type Article } from "@shared/schema";
import type { StaffAppErrorCode } from "@shared/staffApp";
import {
  STAFF_NEWS_EMAIL_SOURCES,
  STAFF_NEWS_LIST_LIMIT,
  STAFF_NEWS_WINDOW_DAYS,
  countStaffNewsItems,
  filterStaffNewsItems,
  sortStaffNewsItems,
  staffNewsChannel,
  staffNewsScheduleError,
  type StaffNewsBoard,
  type StaffNewsCategory,
  type StaffNewsDraftItem,
  type StaffNewsEditRequestItem,
  type StaffNewsFilter,
  type StaffNewsPreview,
} from "@shared/staffNews";
import { articleWriteConflict } from "./articleDerivedWrites";
import { articleLockAllowsWriter, matchesArticleVersion, nextArticleVersion } from "./articleWriteVersion";
import { runWithExclusiveBreaking } from "./breakingNewsService";
import {
  queueBotDraftPublishEffects,
  queueBotDraftScheduleEffects,
  type BotDraftReleaseRow,
} from "./botDraftPublishEffects";
import { logArticleEvent } from "./articleEventsService";

const DAY_MS = 24 * 60 * 60 * 1000;
const SITE_ORIGIN = "https://sabq.org";

export class StaffNewsDeskError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: StaffAppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StaffNewsDeskError";
  }
}

function personName(first: string | null | undefined, last: string | null | undefined): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
}

function senderName(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as { senderName?: unknown }).senderName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** شرط «بانتظار المكتب» في SQL (نسخة isStaffNewsPending في shared/staffNews.ts). */
function pendingNewsWhere(since: Date) {
  return and(
    ne(articles.articleType, "opinion"),
    eq(articles.status, "draft"),
    gte(articles.updatedAt, since),
    or(
      eq(articles.reviewStatus, "pending_review"),
      and(isNull(articles.reviewStatus), inArray(articles.source, [...STAFF_NEWS_EMAIL_SOURCES])),
    ),
  );
}

/** قفل تحرير نشط عند زميل غير المستخدم الحالي. */
function activeLockJoin(userId: string) {
  return and(
    eq(articleEditLocks.articleId, articles.id),
    ne(articleEditLocks.userId, userId),
    gt(articleEditLocks.expiresAt, sql`(clock_timestamp() at time zone 'UTC')`),
  );
}

async function listPendingDrafts(userId: string, now: Date): Promise<StaffNewsDraftItem[]> {
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      subtitle: articles.subtitle,
      source: articles.source,
      sourceMetadata: articles.sourceMetadata,
      newsType: articles.newsType,
      imageUrl: articles.imageUrl,
      thumbnailUrl: articles.thumbnailUrl,
      albumImages: articles.albumImages,
      updatedAt: articles.updatedAt,
      createdAt: articles.createdAt,
      categoryName: categories.nameAr,
      reporterFirst: users.firstName,
      reporterLast: users.lastName,
      lockedBy: articleEditLocks.userName,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .leftJoin(users, eq(users.id, sql`coalesce(${articles.reporterId}, ${articles.submitterId}, ${articles.authorId})`))
    .leftJoin(articleEditLocks, activeLockJoin(userId))
    .where(pendingNewsWhere(new Date(now.getTime() - STAFF_NEWS_WINDOW_DAYS * DAY_MS)))
    .orderBy(asc(articles.updatedAt))
    .limit(STAFF_NEWS_LIST_LIMIT);

  return rows.map((row) => {
    const channel = staffNewsChannel(row.source);
    return {
      kind: "draft" as const,
      id: row.id,
      articleId: row.id,
      title: row.title,
      subtitle: row.subtitle ?? null,
      channel,
      reporterName: channel === "email"
        ? senderName(row.sourceMetadata) ?? personName(row.reporterFirst, row.reporterLast)
        : personName(row.reporterFirst, row.reporterLast),
      categoryName: row.categoryName ?? null,
      imageUrl: row.imageUrl ?? null,
      thumbnailUrl: row.thumbnailUrl ?? null,
      albumCount: Array.isArray(row.albumImages) ? row.albumImages.length : 0,
      isBreaking: row.newsType === "breaking",
      lockedBy: row.lockedBy ?? null,
      submittedAt: iso(row.updatedAt ?? row.createdAt) ?? new Date(0).toISOString(),
    };
  });
}

async function listPendingEditRequests(userId: string): Promise<{ ready: boolean; items: StaffNewsEditRequestItem[] }> {
  // استيراد متأخر: خدمة طلبات التعديل تحمّل عميل OpenAI (إعادة توليد الموجز).
  const { listEditRequestsForList } = await import("./articleEditRequestsService");
  const result = await listEditRequestsForList({ userId, reviewer: true });
  if (!result.ok) return { ready: false, items: [] };
  return {
    ready: true,
    items: result.requests.map((r) => ({
      kind: "edit_request" as const,
      id: r.id,
      articleId: r.articleId,
      title: r.articleTitle,
      articleStatus: r.articleStatus,
      requesterName: r.requesterName,
      urgent: r.urgent === true,
      note: r.note ?? null,
      fields: r.fields,
      label: r.label,
      imageUrl: r.articleThumbnailUrl ?? r.articleImageUrl ?? null,
      submittedAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    })),
  };
}

export async function getStaffNewsBoard(input: {
  userId: string;
  filter: StaffNewsFilter;
  now?: Date;
}): Promise<StaffNewsBoard> {
  const now = input.now ?? new Date();
  const [drafts, requests] = await Promise.all([
    listPendingDrafts(input.userId, now),
    listPendingEditRequests(input.userId),
  ]);
  const all = sortStaffNewsItems([...drafts, ...requests.items]);
  const oldest = all.reduce<string | null>((min, item) => (!min || item.submittedAt < min ? item.submittedAt : min), null);
  return {
    counts: countStaffNewsItems(all),
    oldestAt: oldest,
    editRequestsReady: requests.ready,
    items: filterStaffNewsItems(all, input.filter),
  };
}

async function loadNewsArticle(articleId: string): Promise<Article> {
  const [row] = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!row || row.articleType === "opinion") {
    throw new StaffNewsDeskError(404, "not_found", "الخبر غير موجود");
  }
  return row;
}

async function pendingEditRequestFor(articleId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: articleEditRequests.id })
      .from(articleEditRequests)
      .where(and(eq(articleEditRequests.articleId, articleId), eq(articleEditRequests.status, "pending")))
      .orderBy(asc(articleEditRequests.createdAt))
      .limit(1);
    return row?.id ?? null;
  } catch (error: any) {
    const code = error?.code ?? error?.cause?.code;
    if (code === "42P01" || code === "42501") return null;
    throw error;
  }
}

async function activeLockOwner(articleId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ userName: articleEditLocks.userName })
    .from(articleEditLocks)
    .where(and(
      eq(articleEditLocks.articleId, articleId),
      ne(articleEditLocks.userId, userId),
      gt(articleEditLocks.expiresAt, sql`(clock_timestamp() at time zone 'UTC')`),
    ))
    .limit(1);
  return row?.userName ?? null;
}

/** «استعراض الخبر»: النص والصور كما سيُنشر، مع حالة القفل وطلب تعديل مفتوح. */
export async function getStaffNewsPreview(articleId: string, userId: string): Promise<StaffNewsPreview> {
  const article = await loadNewsArticle(articleId);
  const personId = article.reporterId ?? article.submitterId ?? article.authorId;
  const [category, person, lockedBy, pendingEditRequestId] = await Promise.all([
    article.categoryId
      ? db.select({ id: categories.id, name: categories.nameAr }).from(categories).where(eq(categories.id, article.categoryId)).limit(1)
      : Promise.resolve([]),
    personId
      ? db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, personId)).limit(1)
      : Promise.resolve([]),
    activeLockOwner(article.id, userId),
    pendingEditRequestFor(article.id),
  ]);
  const channel = staffNewsChannel(article.source);
  const seo = (article.seo ?? null) as { metaDescription?: string | null } | null;
  return {
    id: article.id,
    title: article.title,
    subtitle: article.subtitle ?? null,
    slug: article.slug,
    status: article.status,
    reviewStatus: article.reviewStatus ?? null,
    content: article.content ?? "",
    excerpt: article.excerpt ?? null,
    imageUrl: article.imageUrl ?? null,
    albumImages: Array.isArray(article.albumImages) ? article.albumImages : [],
    category: category[0] ? { id: category[0].id, name: category[0].name } : null,
    isBreaking: article.newsType === "breaking",
    channel,
    reporterName: channel === "email"
      ? senderName(article.sourceMetadata) ?? personName(person[0]?.firstName, person[0]?.lastName)
      : personName(person[0]?.firstName, person[0]?.lastName),
    submittedAt: iso(article.updatedAt ?? article.createdAt),
    summaryReady: Boolean((article.aiSummary || article.excerpt || "").trim()),
    seoReady: Boolean(seo?.metaDescription?.trim()),
    lockedBy,
    webEditUrl: `${SITE_ORIGIN}/dashboard/articles/${encodeURIComponent(article.id)}/edit`,
    pendingEditRequestId,
    updatedAt: iso(article.updatedAt),
  };
}

export async function listStaffNewsCategories(): Promise<StaffNewsCategory[]> {
  const rows = await db
    .select({ id: categories.id, name: categories.nameAr })
    .from(categories)
    .where(eq(categories.status, "active"))
    .orderBy(asc(categories.displayOrder), asc(categories.nameAr))
    .limit(200);
  return rows;
}

async function assertCategory(categoryId: string | undefined): Promise<string | undefined> {
  if (!categoryId) return undefined;
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.status, "active")))
    .limit(1);
  if (!row) throw new StaffNewsDeskError(400, "validation_error", "القسم غير موجود");
  return row.id;
}

function assertDecidable(article: Article): void {
  if (article.status === "published") throw new StaffNewsDeskError(409, "conflict", "هذا الخبر منشور بالفعل");
  if (article.status === "archived") throw new StaffNewsDeskError(409, "conflict", "هذا الخبر مؤرشف");
}

/** كتابة لم تقع: قفل عند زميل، أو تغيّر الخبر، أو نُشر من مسار آخر. */
async function writeConflict(articleId: string, userId: string): Promise<StaffNewsDeskError> {
  const [row] = await db.select({ status: articles.status }).from(articles).where(eq(articles.id, articleId)).limit(1);
  if (row?.status === "published") return new StaffNewsDeskError(409, "conflict", "هذا الخبر منشور بالفعل");
  const conflict = await articleWriteConflict(articleId, userId);
  return conflict.code === "ARTICLE_LOCKED"
    ? new StaffNewsDeskError(409, "conflict", "الخبر مفتوح للتحرير عند زميل الآن. أعد المحاولة بعد انتهائه.")
    : new StaffNewsDeskError(409, "conflict", "تغيّر الخبر بعد فتحه. حدّث الشاشة وراجعه من جديد.");
}

function versionGuard(expectedUpdatedAt: string | undefined) {
  return expectedUpdatedAt ? matchesArticleVersion(new Date(expectedUpdatedAt)) : undefined;
}

function releaseRow(article: Article): BotDraftReleaseRow {
  return article as unknown as BotDraftReleaseRow;
}

/** «انشر الآن» من المكتب: نفس أثر زر النشر في اللوحة، باسم المحرر. */
export async function publishNewsFromDesk(input: {
  articleId: string;
  actorId: string;
  actorName: string;
  expectedUpdatedAt?: string;
  categoryId?: string;
}): Promise<{ article: { id: string; status: string; publishedAt: string | null; url: string }; previous: { status: string; reviewStatus: string | null } }> {
  const existing = await loadNewsArticle(input.articleId);
  assertDecidable(existing);
  const categoryId = await assertCategory(input.categoryId);
  const now = new Date();

  const { article: updated } = await runWithExclusiveBreaking(
    async (tx) => {
      const [row] = await tx
        .update(articles)
        .set({
          status: "published",
          publishedAt: existing.publishedAt ?? now,
          scheduledAt: null,
          reviewStatus: "approved",
          reviewedBy: input.actorId,
          reviewedAt: now,
          ...(categoryId ? { categoryId } : {}),
          updatedAt: nextArticleVersion,
        } as any)
        .where(and(
          eq(articles.id, existing.id),
          notInArray(articles.status, ["published", "archived"]),
          articleLockAllowsWriter(input.actorId),
          versionGuard(input.expectedUpdatedAt),
        ))
        .returning();
      return row as Article | undefined;
    },
    { reason: "staff-desk-publish-breaking-clear" },
  );
  if (!updated) throw await writeConflict(existing.id, input.actorId);

  queueBotDraftPublishEffects(releaseRow(updated), "staff-desk", {
    actorName: input.actorName,
    excludeUserId: input.actorId,
    chargePublisherCredit: false,
    reason: "staff-desk-publish",
  });
  logArticleEvent({
    articleId: updated.id,
    eventType: "published",
    actorId: input.actorId,
    summary: "تم نشر الخبر من «مكتب سبق»",
  }).catch((err) => console.error("[staff-news] event log failed:", err));

  const slug = updated.englishSlug || updated.slug;
  return {
    article: {
      id: updated.id,
      status: updated.status,
      publishedAt: iso(updated.publishedAt),
      url: `${SITE_ORIGIN}/article/${encodeURIComponent(slug)}`,
    },
    previous: { status: existing.status, reviewStatus: existing.reviewStatus ?? null },
  };
}

/** «جدول» من المكتب: status=scheduled؛ الترقية للنشر على publishScheduledArticles. */
export async function scheduleNewsFromDesk(input: {
  articleId: string;
  actorId: string;
  actorName: string;
  scheduledAt: string;
  expectedUpdatedAt?: string;
  categoryId?: string;
}): Promise<{ article: { id: string; status: string; scheduledAt: string | null }; previous: { status: string; scheduledAt: string | null; reviewStatus: string | null } }> {
  const when = new Date(input.scheduledAt);
  const error = staffNewsScheduleError(when);
  if (error) throw new StaffNewsDeskError(400, "validation_error", error);
  const existing = await loadNewsArticle(input.articleId);
  assertDecidable(existing);
  const categoryId = await assertCategory(input.categoryId);
  const now = new Date();

  const [updated] = await db
    .update(articles)
    .set({
      status: "scheduled",
      scheduledAt: when,
      reviewStatus: "approved",
      reviewedBy: input.actorId,
      reviewedAt: now,
      ...(categoryId ? { categoryId } : {}),
      updatedAt: nextArticleVersion,
    } as any)
    .where(and(
      eq(articles.id, existing.id),
      notInArray(articles.status, ["published", "archived"]),
      articleLockAllowsWriter(input.actorId),
      versionGuard(input.expectedUpdatedAt),
    ))
    .returning();
  if (!updated) throw await writeConflict(existing.id, input.actorId);

  queueBotDraftScheduleEffects(releaseRow(updated), "staff-desk", {
    actorName: input.actorName,
    excludeUserId: input.actorId,
    reason: "staff-desk-schedule",
  });
  logArticleEvent({
    articleId: updated.id,
    eventType: "approved",
    actorId: input.actorId,
    summary: "جُدول الخبر من «مكتب سبق»",
    metadata: { scheduledAt: when.toISOString() },
  }).catch((err) => console.error("[staff-news] event log failed:", err));

  return {
    article: { id: updated.id, status: updated.status, scheduledAt: iso(updated.scheduledAt) },
    previous: { status: existing.status, scheduledAt: iso(existing.scheduledAt), reviewStatus: existing.reviewStatus ?? null },
  };
}

/** «أعده للمراسل»: نفس request-revision على الويب (needs_changes + ملاحظة + تنبيه وبريد). */
export async function returnNewsToReporterFromDesk(input: {
  articleId: string;
  actorId: string;
  note: string;
}): Promise<{ article: { id: string; status: string; reviewStatus: string | null }; previous: { status: string; reviewStatus: string | null } }> {
  const existing = await loadNewsArticle(input.articleId);
  assertDecidable(existing);
  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({
      status: "draft",
      scheduledAt: null,
      reviewStatus: "needs_changes",
      reviewedBy: input.actorId,
      reviewedAt: now,
      reviewNotes: input.note,
      updatedAt: nextArticleVersion,
    } as any)
    .where(and(
      eq(articles.id, existing.id),
      notInArray(articles.status, ["published", "archived"]),
      articleLockAllowsWriter(input.actorId),
    ))
    .returning();
  if (!updated) throw await writeConflict(existing.id, input.actorId);

  setImmediate(async () => {
    try {
      const { notifyArticleStakeholders } = await import("./editorialNotifications");
      await notifyArticleStakeholders(
        {
          id: updated.id,
          title: updated.title,
          slug: updated.slug,
          englishSlug: updated.englishSlug,
          articleType: updated.articleType,
          scheduledAt: updated.scheduledAt,
          publishedAt: updated.publishedAt,
          authorId: updated.authorId,
          reporterId: updated.reporterId,
          submitterId: updated.submitterId,
        },
        "needs_revision",
        input.note,
        { excludeUserId: input.actorId },
      );
      const { sendReporterRevisionEmail } = await import("./editorAlerts");
      await sendReporterRevisionEmail(updated.id, input.note);
    } catch (err) {
      console.error("[staff-news] return-to-reporter notify failed:", err);
    }
  });
  logArticleEvent({
    articleId: updated.id,
    eventType: "updated",
    actorId: input.actorId,
    summary: "أُعيد الخبر للمراسل من «مكتب سبق»",
    metadata: { note: input.note },
  }).catch((err) => console.error("[staff-news] event log failed:", err));

  return {
    article: { id: updated.id, status: updated.status, reviewStatus: updated.reviewStatus ?? null },
    previous: { status: existing.status, reviewStatus: existing.reviewStatus ?? null },
  };
}
