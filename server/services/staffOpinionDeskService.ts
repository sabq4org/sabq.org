// تبويب «الرأي» في تطبيق الديسك (/api/v1/staff/opinion/*).
// Per ADR-001 all Drizzle access lives here; staffAppMobile.ts stays HTTP-only.
// الأفعال تعيد استخدام منطق الويب: scheduleApprovedOpinionArticle للجدولة،
// ونفس إشعارات /api/dashboard/opinion/:id/publish و request-revision.
import { and, desc, eq, gte, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "../db";
import { articles, categories, opinionWriterSchedules, users } from "@shared/schema";
import {
  resolveStaffOpinionArticleStatus,
  safeStaffAvatarUrl,
  type StaffAppErrorCode,
  type StaffOpinionBoard,
  type StaffOpinionItem,
  type StaffOpinionWarning,
  type StaffOpinionWriter,
} from "@shared/staffApp";
import {
  awaitingEditorialSql,
  getNextSlotForWriter,
  resendOpinionDraftDeskAlert,
  riyadhDateParts,
  scheduleApprovedOpinionArticle,
  type OpinionDraftDeskChannelsResult,
} from "./opinionWritersService";
import {
  buildOpinionSlotClashWarnings,
  findOpinionSlotClashes,
  type OpinionSlotCandidate,
} from "./opinionSlotClash";
import {
  buildStaffOpinionBoard,
  parseWeekStart,
  toStaffOpinionArticle,
  type StaffOpinionArticleRow,
} from "./staffOpinionBoard";

const DAY_MS = 24 * 60 * 60 * 1000;
/** مسودات بانتظار المكتب تُعرض إن عُدّلت خلال هذه المدة (أوسع من شريط الويب: المكتب يجب ألا يفوته شيء). */
const PENDING_DRAFT_WINDOW_MS = 45 * DAY_MS;
/** أسبوع اللوحة مسموح ضمن هذا المدى من اليوم (حماية من استعلامات عشوائية). */
const WEEK_START_RANGE_MS = 60 * DAY_MS;

export class StaffOpinionDeskError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: StaffAppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StaffOpinionDeskError";
  }
}

const articleRowColumns = {
  id: articles.id,
  title: articles.title,
  authorId: articles.authorId,
  status: articles.status,
  reviewStatus: articles.reviewStatus,
  source: articles.source,
  scheduledAt: articles.scheduledAt,
  publishedAt: articles.publishedAt,
  updatedAt: articles.updatedAt,
};

function writerName(row: { firstName: string | null; lastName: string | null; email: string | null }): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email || "كاتب رأي";
}

async function loadWriters(
  ids: string[],
  schedules: { writerId: string; weekday: number; publishTime: string }[],
): Promise<Map<string, StaffOpinionWriter>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const result = new Map<string, StaffOpinionWriter>();
  if (unique.length === 0) return result;
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      jobTitle: users.jobTitle,
    })
    .from(users)
    .where(inArray(users.id, unique));
  const scheduleBy = new Map(schedules.map((s) => [s.writerId, s]));
  for (const row of rows) {
    const schedule = scheduleBy.get(row.id);
    result.set(row.id, {
      id: row.id,
      name: writerName(row),
      avatarUrl: safeStaffAvatarUrl(row.profileImageUrl),
      jobTitle: row.jobTitle ?? null,
      fixedSlot: schedule
        ? { weekday: schedule.weekday, publishTime: schedule.publishTime.slice(0, 5) }
        : null,
    });
  }
  return result;
}

async function activeSchedules(writerIds?: string[]) {
  return db
    .select({
      writerId: opinionWriterSchedules.writerId,
      weekday: opinionWriterSchedules.weekday,
      publishTime: opinionWriterSchedules.publishTime,
    })
    .from(opinionWriterSchedules)
    .where(
      writerIds
        ? and(eq(opinionWriterSchedules.active, true), inArray(opinionWriterSchedules.writerId, writerIds))
        : eq(opinionWriterSchedules.active, true),
    );
}

export async function getStaffOpinionBoard(options: {
  weekStart?: string | null;
  now?: Date;
} = {}): Promise<StaffOpinionBoard> {
  const now = options.now ?? new Date();
  const todayParts = riyadhDateParts(now);
  let weekStart = { y: todayParts.y, m: todayParts.m, d: todayParts.d };
  if (options.weekStart) {
    const parsed = parseWeekStart(options.weekStart);
    if (!parsed) throw new StaffOpinionDeskError(400, "validation_error", "تاريخ بداية الأسبوع غير صالح");
    const delta = Date.UTC(parsed.y, parsed.m - 1, parsed.d) - Date.UTC(weekStart.y, weekStart.m - 1, weekStart.d);
    if (Math.abs(delta) > WEEK_START_RANGE_MS) {
      throw new StaffOpinionDeskError(400, "validation_error", "الأسبوع المطلوب بعيد جداً عن اليوم");
    }
    weekStart = parsed;
  }

  const windowStart = new Date(`${weekStart.y}-${String(weekStart.m).padStart(2, "0")}-${String(weekStart.d).padStart(2, "0")}T00:00:00+03:00`);
  const windowEnd = new Date(windowStart.getTime() + 7 * DAY_MS);
  const draftSince = new Date(now.getTime() - PENDING_DRAFT_WINDOW_MS);

  const [schedules, articleRows] = await Promise.all([
    activeSchedules(),
    db
      .select(articleRowColumns)
      .from(articles)
      .where(and(
        eq(articles.articleType, "opinion"),
        or(
          and(eq(articles.status, "scheduled"), gte(articles.scheduledAt, windowStart), lt(articles.scheduledAt, windowEnd)),
          and(eq(articles.status, "published"), gte(articles.publishedAt, windowStart), lt(articles.publishedAt, windowEnd)),
          and(
            eq(articles.status, "draft"),
            or(awaitingEditorialSql, eq(articles.reviewStatus, "approved")),
            gte(articles.updatedAt, draftSince),
          ),
        ),
      ))
      .orderBy(desc(articles.updatedAt))
      .limit(500),
  ]);

  const writers = await loadWriters(
    [...schedules.map((s) => s.writerId), ...articleRows.map((a) => a.authorId)],
    schedules,
  );
  return buildStaffOpinionBoard({
    now,
    weekStart,
    writers,
    articles: articleRows as StaffOpinionArticleRow[],
  });
}

async function loadOpinionArticle(articleId: string): Promise<StaffOpinionArticleRow & {
  slug: string;
}> {
  const [row] = await db
    .select({ ...articleRowColumns, slug: articles.slug })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.articleType, "opinion")))
    .limit(1);
  if (!row) throw new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود");
  return row as StaffOpinionArticleRow & { slug: string };
}

/** عنصر واحد بنفس شكل اللوحة + الموعد الثابت القادم للكاتب (لفتح الإشعار مباشرة). */
export async function getStaffOpinionItem(articleId: string): Promise<{
  item: StaffOpinionItem;
  nextSlot: string | null;
}> {
  const row = await loadOpinionArticle(articleId);
  const status = resolveStaffOpinionArticleStatus(row);
  if (!status) {
    throw new StaffOpinionDeskError(404, "not_found", "هذا المقال لم يعد بانتظار المكتب");
  }
  const authorId = row.authorId;
  const [schedules, suggestion] = await Promise.all([
    authorId ? activeSchedules([authorId]) : Promise.resolve([]),
    authorId ? getNextSlotForWriter(authorId, row.id) : Promise.resolve(null),
  ]);
  const writers = authorId ? await loadWriters([authorId], schedules) : new Map();
  const writer: StaffOpinionWriter = (authorId && writers.get(authorId)) || {
    id: authorId ?? "",
    name: "كاتب رأي",
    avatarUrl: null,
    jobTitle: null,
    fixedSlot: null,
  };
  const nextSlot = suggestion?.nextSlot ?? null;
  const slotAt =
    status === "scheduled"
      ? row.scheduledAt?.toISOString() ?? null
      : status === "published"
        ? row.publishedAt?.toISOString() ?? null
        : writer.fixedSlot
          ? nextSlot
          : null;
  return {
    item: {
      writer,
      slotAt,
      state: status === "scheduled" ? "scheduled" : status === "published" ? "published" : "arrived",
      article: toStaffOpinionArticle(row, status),
      deeplink: `sabqdesk://opinion/${row.id}`,
    },
    nextSlot,
  };
}

/** نص المسودة وملحقاتها كما هي في المقال (قراءة فقط) — لبوت «مكتب سبق» الذي لا يرى الشاشة. */
export interface StaffOpinionDraftContent {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  status: string;
  reviewStatus: string | null;
  reviewNotes: string | null;
  /** HTML كما حفظه الكاتب أو التجهيز. */
  content: string;
  excerpt: string | null;
  imageUrl: string | null;
  albumImages: string[];
  isAiGeneratedImage: boolean;
  category: { id: string; name: string } | null;
  aiSummary: string | null;
  seo: { metaTitle: string | null; metaDescription: string | null; keywords: string[] } | null;
  updatedAt: string | null;
}

export async function getOpinionDraftContent(articleId: string): Promise<StaffOpinionDraftContent> {
  const [row] = await db
    .select({
      id: articles.id,
      title: articles.title,
      subtitle: articles.subtitle,
      slug: articles.slug,
      status: articles.status,
      reviewStatus: articles.reviewStatus,
      reviewNotes: articles.reviewNotes,
      content: articles.content,
      excerpt: articles.excerpt,
      imageUrl: articles.imageUrl,
      albumImages: articles.albumImages,
      isAiGeneratedImage: articles.isAiGeneratedImage,
      categoryId: articles.categoryId,
      categoryName: categories.nameAr,
      aiSummary: articles.aiSummary,
      seo: articles.seo,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .where(and(eq(articles.id, articleId), eq(articles.articleType, "opinion")))
    .limit(1);
  if (!row) throw new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود");
  const seo = row.seo ?? null;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? null,
    slug: row.slug,
    status: row.status,
    reviewStatus: row.reviewStatus ?? null,
    reviewNotes: row.reviewNotes ?? null,
    content: row.content ?? "",
    excerpt: row.excerpt ?? null,
    imageUrl: row.imageUrl ?? null,
    albumImages: row.albumImages ?? [],
    isAiGeneratedImage: row.isAiGeneratedImage === true,
    category: row.categoryId ? { id: row.categoryId, name: row.categoryName ?? "" } : null,
    aiSummary: row.aiSummary ?? null,
    seo: seo
      ? {
          metaTitle: seo.metaTitle ?? null,
          metaDescription: seo.metaDescription ?? null,
          keywords: Array.isArray(seo.keywords) ? seo.keywords : [],
        }
      : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/** مقالات رأي مجدولة في الدقيقة نفسها لكتّاب آخرين (تنبيه لا منع). */
export async function checkOpinionSlotClashes(
  articleId: string,
  scheduledAt: Date,
): Promise<StaffOpinionWarning[]> {
  const row = await loadOpinionArticle(articleId);
  const minuteStart = new Date(Math.floor(scheduledAt.getTime() / 60_000) * 60_000);
  const minuteEnd = new Date(minuteStart.getTime() + 60_000);
  const others = await db
    .select({
      articleId: articles.id,
      writerId: articles.authorId,
      scheduledAt: articles.scheduledAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(articles)
    .leftJoin(users, eq(users.id, articles.authorId))
    .where(and(
      eq(articles.articleType, "opinion"),
      eq(articles.status, "scheduled"),
      ne(articles.id, articleId),
      gte(articles.scheduledAt, minuteStart),
      lt(articles.scheduledAt, minuteEnd),
    ))
    .limit(20);
  const candidates: OpinionSlotCandidate[] = others
    .filter((o) => o.scheduledAt)
    .map((o) => ({
      articleId: o.articleId,
      writerId: o.writerId,
      writerName: writerName(o),
      scheduledAt: o.scheduledAt as Date,
    }));
  return buildOpinionSlotClashWarnings(
    findOpinionSlotClashes({ scheduledAt, articleId, writerId: row.authorId, candidates }),
  );
}

export type StaffOpinionScheduleRequest = { mode: "fixed_slot" } | { scheduledAt: string };

export async function scheduleOpinionFromDesk(input: {
  articleId: string;
  actorId: string;
  request: StaffOpinionScheduleRequest;
}): Promise<{
  article: { id: string; status: string; scheduledAt: string | null };
  previous: { status: string; scheduledAt: string | null; reviewStatus: string | null };
  scheduledAt: string;
  warnings: StaffOpinionWarning[];
}> {
  const existing = await loadOpinionArticle(input.articleId);
  let scheduledAt: Date;
  if ("mode" in input.request) {
    if (!existing.authorId) {
      throw new StaffOpinionDeskError(409, "conflict", "لا يوجد كاتب لهذا المقال");
    }
    const suggestion = await getNextSlotForWriter(existing.authorId, existing.id);
    if (!suggestion) {
      throw new StaffOpinionDeskError(409, "conflict", "لا موعد ثابت لهذا الكاتب؛ اختر موعداً");
    }
    scheduledAt = new Date(suggestion.nextSlot);
  } else {
    scheduledAt = new Date(input.request.scheduledAt);
  }

  const result = await scheduleApprovedOpinionArticle(existing.id, scheduledAt);
  if (!result.ok) {
    throw new StaffOpinionDeskError(
      result.status,
      result.status === 404 ? "not_found" : result.status === 409 ? "conflict" : "validation_error",
      result.message,
    );
  }

  let warnings: StaffOpinionWarning[] = [];
  try {
    warnings = await checkOpinionSlotClashes(existing.id, scheduledAt);
  } catch (err) {
    console.error("[staff-opinion] slot clash check failed:", err);
  }

  const article = result.article;
  setImmediate(async () => {
    try {
      const { notifyArticleStakeholders } = await import("./editorialNotifications");
      await notifyArticleStakeholders(article, "scheduled", undefined, { excludeUserId: input.actorId });
      const { notifyOpinionAuthorArticleScheduled } = await import("../notificationEngine");
      await notifyOpinionAuthorArticleScheduled(article.id, scheduledAt);
    } catch (notifyErr) {
      console.error("[staff-opinion] schedule notification failed:", notifyErr);
    }
  });

  return {
    article: {
      id: article.id,
      status: article.status,
      scheduledAt: article.scheduledAt ? article.scheduledAt.toISOString() : null,
    },
    previous: {
      status: existing.status,
      scheduledAt: existing.scheduledAt?.toISOString() ?? null,
      reviewStatus: existing.reviewStatus,
    },
    scheduledAt: scheduledAt.toISOString(),
    warnings,
  };
}

/**
 * «انشر الآن» من المكتب. يختلف عن الويب في أنه يقبل pending_review أيضاً
 * (المكتب هو المراجع) ويثبت الاعتماد: reviewStatus=approved + reviewedBy/At.
 */
export async function publishOpinionFromDesk(input: {
  articleId: string;
  actorId: string;
}): Promise<{
  article: { id: string; status: string; publishedAt: string | null };
  previous: { status: string; reviewStatus: string | null };
}> {
  const existing = await loadOpinionArticle(input.articleId);
  if (existing.status === "published") {
    throw new StaffOpinionDeskError(409, "conflict", "هذا المقال منشور بالفعل");
  }
  const status = resolveStaffOpinionArticleStatus(existing);
  if (status !== "new_draft" && status !== "in_prep" && status !== "scheduled") {
    throw new StaffOpinionDeskError(409, "conflict", "هذا المقال لم يعد بانتظار المكتب");
  }

  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({
      status: "published",
      publishedAt: now,
      reviewStatus: "approved",
      reviewedBy: input.actorId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(and(eq(articles.id, existing.id), ne(articles.status, "published")))
    .returning();
  if (!updated) {
    throw new StaffOpinionDeskError(409, "conflict", "هذا المقال منشور بالفعل");
  }

  // نفس إبطال الكاش في مسار الويب.
  try {
    const { invalidatePublishedContent } = await import("./contentInvalidation");
    invalidatePublishedContent({ reason: "article-write" });
    const { memoryCache } = await import("../memoryCache");
    memoryCache.delete("lite-feed");
    memoryCache.invalidatePattern("^article:detail:");
    memoryCache.invalidatePattern("^article:id:");
    memoryCache.invalidatePattern("^articles:");
    memoryCache.invalidatePattern("^sidebar:");
  } catch (cacheErr) {
    console.error("[staff-opinion] cache invalidation failed:", cacheErr);
  }

  setImmediate(async () => {
    try {
      const { createNotification } = await import("../notificationEngine");
      await createNotification({
        type: "NEW_ARTICLE",
        data: {
          articleId: updated.id,
          articleTitle: updated.title,
          articleSlug: updated.slug,
          categoryId: updated.categoryId,
        },
      });
    } catch (err) {
      console.error("[staff-opinion] publish notification failed:", err);
    }
    try {
      const { sendOpinionAuthorPublishEmail } = await import("./editorAlerts");
      await sendOpinionAuthorPublishEmail(updated.id);
    } catch (err) {
      console.error("[staff-opinion] publish email failed:", err);
    }
    try {
      const { notifyArticleStakeholders } = await import("./editorialNotifications");
      await notifyArticleStakeholders(updated, "published", undefined, { excludeUserId: input.actorId });
    } catch (err) {
      console.error("[staff-opinion] publish push failed:", err);
    }
  });

  return {
    article: {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
    },
    previous: { status: existing.status, reviewStatus: existing.reviewStatus },
  };
}

/** «أعده للكاتب»: نفس request-revision على الويب (needs_changes + ملاحظة + إشعار وبريد). */
export async function returnOpinionToWriterFromDesk(input: {
  articleId: string;
  actorId: string;
  note: string;
}): Promise<{
  article: { id: string; status: string; reviewStatus: string | null };
  previous: { status: string; reviewStatus: string | null };
}> {
  const existing = await loadOpinionArticle(input.articleId);
  if (existing.status === "published") {
    throw new StaffOpinionDeskError(409, "conflict", "لا يمكن إعادة مقال منشور إلى الكاتب");
  }
  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({
      reviewStatus: "needs_changes",
      reviewedBy: input.actorId,
      reviewedAt: now,
      reviewNotes: input.note,
      status: "draft",
      updatedAt: now,
    })
    .where(and(eq(articles.id, existing.id), ne(articles.status, "published")))
    .returning();
  if (!updated) {
    throw new StaffOpinionDeskError(409, "conflict", "لا يمكن إعادة مقال منشور إلى الكاتب");
  }

  setImmediate(async () => {
    try {
      const { notifyArticleStakeholders } = await import("./editorialNotifications");
      await notifyArticleStakeholders(updated, "needs_revision", input.note, { excludeUserId: input.actorId });
      const { sendOpinionAuthorRevisionEmail } = await import("./editorAlerts");
      await sendOpinionAuthorRevisionEmail(updated.id, input.note);
    } catch (err) {
      console.error("[staff-opinion] return-to-writer notify failed:", err);
    }
  });

  return {
    article: { id: updated.id, status: updated.status, reviewStatus: updated.reviewStatus },
    previous: { status: existing.status, reviewStatus: existing.reviewStatus },
  };
}

/**
 * «أعد التنبيه»: يعيد إرسال push الديسك وبريد البوت (type=opinion_draft) لمسودة
 * رأي ما زالت بانتظار المراجعة. لا يكتب على المقال ولا يُشعر الكاتب أو المحررين.
 */
export async function renotifyOpinionDraftFromDesk(input: {
  articleId: string;
}): Promise<{ articleId: string } & OpinionDraftDeskChannelsResult> {
  const existing = await loadOpinionArticle(input.articleId);
  if (existing.reviewStatus !== "pending_review") {
    throw new StaffOpinionDeskError(
      409,
      "conflict",
      "إعادة التنبيه متاحة فقط لمسودة رأي بانتظار المراجعة",
    );
  }
  const result = await resendOpinionDraftDeskAlert({
    id: existing.id,
    title: existing.title,
    authorId: existing.authorId,
  });
  return { articleId: existing.id, ...result };
}
