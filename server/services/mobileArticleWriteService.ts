// كتابات الجوال على المادة: إعادة إرسال صاحبها بعد ملاحظات التحرير
// (PUT /api/v1/articles/:id/resubmit) وحفظ محرر مسؤول النظام في تطبيق «سبق»
// (PATCH /api/v1/admin/articles/:id). نُقلت من mobileApiRoutes.ts (2026-10-31)
// لتأخذ ضمانات بقية مسارات الحفظ:
//
// - شرط الكتابة النهائي يحمل نسخة المادة (`matchesArticleVersion`) وقفل التحرير
//   (`articleLockAllowsWriter`)، ولإعادة الإرسال حالة `needs_changes` أيضًا.
//   الفحص عند فتح النموذج أو قبل رفع الصور وحده لا يكفي: محرر قد ينشر المادة
//   أثناء الرفع. عند التعارض 409 دون أي كتابة.
// - النسخة المتوقعة يرسلها التطبيق (`expectedUpdatedAt`)؛ النسخ المثبتة التي لا
//   ترسلها تُحمى بالنسخة المقروءة عند بدء الطلب.
// - إعادة الإرسال تمر بحراس الإرسال الأول والويب: الترخيص المهني لصاحب الاسم
//   على المادة، وانشغال مسار كاتب الرأي (مع استثناء المادة نفسها).
// - فشل رفع أي صورة جديدة يرفض إعادة الإرسال كلها: لا تُستبدل الصورة البارزة
//   أو الألبوم بمصفوفة ناقصة.
// - الحفظ الناجح يُسجَّل في سجل المادة (`recordArticleSave`)، ومع المنشور مراجعة
//   «النشر أولاً» كما في اعتماد طلب التعديل.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { articles, type Article } from "@shared/schema";
import { resolveContentBylineUserId } from "@shared/mediaLicense";
import { articleLockAllowsWriter, matchesArticleVersion, nextArticleVersion } from "./articleWriteVersion";
import { articleWriteConflict } from "./articleDerivedWrites";
import { recordArticleSave } from "./articleHistoryService";
import { maybePlanPublishedRevision, recordArticleRevision } from "./publishFirstService";
import { newsImageStorageService } from "./newsImageStorageService";
import { isOwnSubmissionImageUrl } from "./mobileSubmissionService";
import { mobileScheduleError } from "./mobileAdminSchedule";

export type MobileWriteFail = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

type Guard = { ok: true } | { ok: false; status: number; message: string; code: string };

export const RESUBMIT_IMAGE_CONCURRENCY = 3;

/** يقرأ نسخة المادة التي يرسلها التطبيق؛ قيمة غير صالحة تُعامل كغائبة. */
export function parseExpectedVersion(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** مقارنة نسختين بدقة المللي ثانية، كما يقارنها شرط الكتابة. */
export function sameArticleVersion(stored: Date | null | undefined, expected: Date): boolean {
  if (!stored) return false;
  return Math.floor(stored.getTime()) === Math.floor(expected.getTime());
}

/** رابط صورة يُقبل كما هو: على أصل صور سبق، أو موجود أصلًا على المادة. */
export function isKeepableImageUrl(
  url: string,
  existing: { imageUrl: string | null; albumImages: string[] | null },
  trusted: (url: string) => boolean,
): boolean {
  if (url === existing.imageUrl) return true;
  if ((existing.albumImages ?? []).includes(url)) return true;
  return trusted(url);
}

/** يشغّل المهام بتوازٍ محدود مع إبقاء ترتيب النتائج. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|webp|gif|heic|heif);base64,(.+)$/i;

async function uploadRevisionImage(input: { userId: string; articleId: string; dataUrl: string; slot: string }): Promise<string | null> {
  const m = input.dataUrl.match(DATA_IMAGE);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  const result = await newsImageStorageService.upload({
    buffer: Buffer.from(m[2], "base64"),
    filename: `mobile-revision-${input.articleId}-${input.slot}-${Date.now()}.${ext}`,
    mimeType: `image/${ext === "heif" ? "heic" : ext}`,
    purpose: "mobile-article-revision",
    metadata: { source: "mobile-app", articleId: input.articleId },
    rolloutKey: `${input.userId}:${input.articleId}:${input.slot}`,
  });
  return result.success && result.deliveryUrl ? result.deliveryUrl : null;
}

/** شرط الكتابة النهائي لإعادة الإرسال: الحالة والنسخة والقفل معًا. */
export function resubmitWriteGuard(articleId: string, userId: string, version: Date) {
  return and(
    eq(articles.id, articleId),
    eq(articles.reviewStatus, "needs_changes"),
    matchesArticleVersion(version),
    articleLockAllowsWriter(userId),
  );
}

/** شرط الكتابة النهائي لحفظ محرر المسؤول: النسخة والقفل. */
export function adminWriteGuard(articleId: string, adminId: string, version: Date) {
  return and(eq(articles.id, articleId), matchesArticleVersion(version), articleLockAllowsWriter(adminId));
}

export type ResubmitDeps = {
  loadArticle: (id: string) => Promise<Article | undefined>;
  licenseGate: (bylineUserId: string | null) => Promise<{ ok: true } | { ok: false; message: string; code: string }>;
  pipelineGate: (authorId: string | null, articleType: string | null, articleId: string) => Promise<Guard>;
  uploadImage: (input: { userId: string; articleId: string; dataUrl: string; slot: string }) => Promise<string | null>;
  isTrustedUrl: (url: string) => boolean;
  guardedWrite: (input: {
    articleId: string;
    userId: string;
    version: Date;
    updates: Record<string, unknown>;
  }) => Promise<Article | undefined>;
  conflict: (articleId: string, userId: string) => Promise<{ code: string; message: string }>;
  recordSave: (input: { before: Article; after: Article; userId: string }) => Promise<unknown>;
};

const defaultResubmitDeps: ResubmitDeps = {
  loadArticle: async (id) => {
    const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    return row;
  },
  licenseGate: async (bylineUserId) => {
    const { assertMediaLicenseAllowsSubmission } = await import("./mediaLicenseService");
    return assertMediaLicenseAllowsSubmission(bylineUserId);
  },
  pipelineGate: async (authorId, articleType, articleId) => {
    const { assertOpinionAuthorPipelineOpen } = await import("./opinionWritersService");
    return assertOpinionAuthorPipelineOpen(authorId, articleType, articleId);
  },
  uploadImage: uploadRevisionImage,
  isTrustedUrl: isOwnSubmissionImageUrl,
  guardedWrite: async ({ articleId, userId, version, updates }) => {
    const [row] = await db
      .update(articles)
      .set({ ...updates, updatedAt: nextArticleVersion } as any)
      .where(resubmitWriteGuard(articleId, userId, version))
      .returning();
    return row;
  },
  conflict: articleWriteConflict,
  recordSave: ({ before, after, userId }) =>
    recordArticleSave({
      before,
      after,
      actorId: userId,
      summary: "أعاد صاحب المادة إرسالها بعد ملاحظات التحرير",
      metadata: { channel: "mobile-resubmit" },
    }),
};

export type ResubmitInput = {
  userId: string;
  articleId: string;
  title: string;
  htmlContent: string;
  excerpt: string;
  heroImage?: string;
  albumImages?: string[];
  expectedUpdatedAt?: Date | null;
};

export type ResubmitResult = { ok: true; before: Article; article: Article } | MobileWriteFail;

const VERSION_CONFLICT_MESSAGE =
  "تغيّرت المادة بعد فتحها (راجعها محرر أو نُشرت). احتفظ بتعديلك وأعد تحميل النسخة الحالية قبل الإرسال.";

export async function resubmitMobileArticle(
  input: ResubmitInput,
  deps: ResubmitDeps = defaultResubmitDeps,
): Promise<ResubmitResult> {
  const existing = await deps.loadArticle(input.articleId);
  if (!existing) return { ok: false, status: 404, code: "NOT_FOUND", message: "المقال غير موجود" };
  if (existing.authorId !== input.userId && existing.reporterId !== input.userId) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "ليس لديك صلاحية لتعديل هذا المقال" };
  }
  if (existing.reviewStatus !== "needs_changes") {
    return { ok: false, status: 409, code: "NOT_NEEDS_CHANGES", message: "هذا المقال ليس في حالة \"يحتاج تعديل\"" };
  }
  if (input.expectedUpdatedAt && !sameArticleVersion(existing.updatedAt, input.expectedUpdatedAt)) {
    return { ok: false, status: 409, code: "ARTICLE_VERSION_CONFLICT", message: VERSION_CONFLICT_MESSAGE };
  }

  // حراس الإرسال الأول والويب نفسها (routes.ts submit-for-review).
  const license = await deps.licenseGate(resolveContentBylineUserId({
    articleType: existing.articleType,
    authorId: existing.authorId,
    reporterId: existing.reporterId,
  }));
  if (!license.ok) return { ok: false, status: 403, code: license.code, message: license.message };
  const pipeline = await deps.pipelineGate(existing.authorId, existing.articleType, existing.id);
  if (!pipeline.ok) return { ok: false, status: pipeline.status, code: pipeline.code, message: pipeline.message };

  const keepable = (url: string) =>
    isKeepableImageUrl(url, { imageUrl: existing.imageUrl, albumImages: existing.albumImages }, deps.isTrustedUrl);
  const candidates = [
    ...(input.heroImage !== undefined ? [input.heroImage] : []),
    ...(input.albumImages ?? []),
  ];
  for (const img of candidates) {
    if (!img.startsWith("data:") && !keepable(img)) {
      return { ok: false, status: 400, code: "IMAGE_URL_NOT_ALLOWED", message: "رابط صورة غير مقبول. أعد اختيار الصورة من جهازك." };
    }
  }

  // كل صورة جديدة تُرفع قبل أي كتابة؛ فشل واحدة يرفض الإرسال كله.
  const resolve = async (img: string, slot: string): Promise<string | null> => {
    if (!img.startsWith("data:")) return img;
    try {
      return await deps.uploadImage({ userId: input.userId, articleId: existing.id, dataUrl: img, slot });
    } catch (error) {
      console.error(`[mobile-resubmit] ${slot} upload failed:`, error);
      return null;
    }
  };
  let heroImageUrl = existing.imageUrl;
  if (input.heroImage !== undefined && input.heroImage !== "") {
    const url = await resolve(input.heroImage, "hero");
    if (!url) return imageFailure();
    heroImageUrl = url;
  }
  let albumUrls: string[] | null = null;
  if (input.albumImages !== undefined) {
    const uploaded = await mapWithConcurrency(input.albumImages, RESUBMIT_IMAGE_CONCURRENCY, (img, i) => resolve(img, `album-${i}`));
    if (uploaded.some((url) => !url)) return imageFailure();
    albumUrls = uploaded as string[];
  }

  const updates: Record<string, unknown> = {
    title: input.title.trim(),
    content: input.htmlContent,
    excerpt: input.excerpt,
    imageUrl: heroImageUrl,
    // يعود إلى طابور المحرر. تبقى reviewNotes/reviewedAt/reviewedBy ليرسم الويب
    // شريط «أُعيد إرسالها» (isResubmittedAfterRevision).
    reviewStatus: "pending_review",
  };
  if (albumUrls !== null) updates.albumImages = albumUrls;

  const written = await deps.guardedWrite({
    articleId: existing.id,
    userId: input.userId,
    version: input.expectedUpdatedAt ?? existing.updatedAt ?? new Date(0),
    updates,
  });
  if (!written) {
    const current = await deps.loadArticle(existing.id);
    if (current && current.reviewStatus !== "needs_changes") {
      return { ok: false, status: 409, code: "ARTICLE_VERSION_CONFLICT", message: VERSION_CONFLICT_MESSAGE };
    }
    const conflict = await deps.conflict(existing.id, input.userId);
    return { ok: false, status: 409, code: conflict.code, message: conflict.message };
  }

  await deps.recordSave({ before: existing, after: written, userId: input.userId })
    .catch((error) => console.error("[mobile-resubmit] history log failed:", error));
  return { ok: true, before: existing, article: written };
}

function imageFailure(): MobileWriteFail {
  return {
    ok: false,
    status: 502,
    code: "IMAGE_UPLOAD_FAILED",
    message: "تعذّر رفع صورة أو أكثر، ولم يُرسَل التعديل. نصّك محفوظ؛ أعد المحاولة.",
  };
}

// ---------------------------------------------------------------------------
// محرر مسؤول النظام في تطبيق «سبق»
// ---------------------------------------------------------------------------

export type AdminSaveResult = { ok: true; before: Article; article: Article } | MobileWriteFail;

export async function saveMobileAdminArticle(input: {
  adminId: string;
  articleId: string;
  body: Record<string, unknown>;
}): Promise<AdminSaveResult> {
  const [existing] = await db.select().from(articles).where(eq(articles.id, input.articleId)).limit(1);
  if (!existing) return { ok: false, status: 404, code: "NOT_FOUND", message: "الخبر غير موجود" };

  const expected = parseExpectedVersion(input.body.expectedUpdatedAt);
  if (expected && !sameArticleVersion(existing.updatedAt, expected)) {
    const conflict = await articleWriteConflict(existing.id, input.adminId);
    return { ok: false, status: 409, code: "ARTICLE_VERSION_CONFLICT", message: conflict.code === "ARTICLE_LOCKED" ? conflict.message : "حُفظ الخبر من مكان آخر بعد فتحه. تعديلك باقٍ على الشاشة؛ أعد تحميل النسخة الحالية ثم احفظ." };
  }

  const { buildMobileAdminArticleUpdates, runWithExclusiveBreaking } = await import("./breakingNewsService");
  const updates = buildMobileAdminArticleUpdates(input.body, existing);
  delete updates.updatedAt;

  const scheduleError = mobileScheduleError(
    (updates.status as string | undefined) ?? existing.status,
    Object.prototype.hasOwnProperty.call(input.body, "scheduledAt") ? input.body.scheduledAt : existing.scheduledAt,
  );
  if (scheduleError) return { ok: false, status: 400, code: "INVALID_SCHEDULE", message: scheduleError };

  const updateReason = typeof input.body.updateReason === "string" ? input.body.updateReason.trim() || null : null;
  const revisionPlan = await maybePlanPublishedRevision({
    existingStatus: existing.status,
    existing: existing as any,
    patch: updates as any,
    updateReason,
  });

  const { article: written } = await runWithExclusiveBreaking(
    async (tx) => {
      const [row] = await tx
        .update(articles)
        .set({
          ...updates,
          ...(revisionPlan?.contentChanged ? { correctedAt: new Date() } : {}),
          updatedAt: nextArticleVersion,
        } as any)
        .where(adminWriteGuard(existing.id, input.adminId, expected ?? existing.updatedAt ?? new Date(0)))
        .returning();
      return row as Article | undefined;
    },
    { reason: "mobile-edit-breaking-clear" },
  );
  if (!written) {
    const conflict = await articleWriteConflict(existing.id, input.adminId);
    return {
      ok: false,
      status: 409,
      code: conflict.code,
      message: conflict.code === "ARTICLE_LOCKED" ? conflict.message : "حُفظ الخبر من مكان آخر أثناء الحفظ. تعديلك باقٍ على الشاشة؛ أعد تحميل النسخة الحالية ثم احفظ.",
    };
  }

  if (revisionPlan) {
    recordArticleRevision({ articleId: existing.id, editorUserId: input.adminId, plan: revisionPlan })
      .catch((error) => console.error("[mobile-admin-save] publish-first revision failed:", error));
  }
  await recordArticleSave({
    before: existing,
    after: written,
    actorId: input.adminId,
    reason: updateReason,
    summary: "حُفظت المادة من محرر تطبيق «سبق» على الجوال",
    metadata: { channel: "mobile-admin" },
  }).catch((error) => console.error("[mobile-admin-save] history log failed:", error));

  return { ok: true, before: existing, article: written };
}
