// «طلب تعديل» على الخبر: إنشاء الطلب من صاحب المادة، والقائمة، والاعتماد
// (تطبيق الحقول المختارة على المادة نفسها مع نسخة في سجل التعديلات) والرفض.
// الاستعلامات هنا (ADR-001)؛ المنطق الخالص في shared/articleEditRequests.ts.

import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "../db";
import { articleEditRequests, articles, notificationsInbox, users, type Article } from "@shared/schema";
import {
  articleAcceptsEditRequests,
  baseSnapshotFor,
  buildEditRequestPatch,
  editRequestShortLabel,
  editableParagraphs,
  isEditRequestOwner,
  normalizeParagraph,
  proposalFields,
  type EditRequestField,
  type EditRequestInput,
  type EditRequestProposal,
} from "@shared/articleEditRequests";
import { articleLockAllowsWriter, matchesArticleVersion, nextArticleVersion } from "./articleWriteVersion";
import { articleWriteConflict, refreshArticleLiteImage } from "./articleDerivedWrites";
import { generateArticleThumbnail } from "./thumbnailService";
import { summarizeArticle } from "../openai";
import { generateSeoMetadata } from "../seo-generator";
import { storage } from "../storage";
import { maybePlanPublishedRevision, recordArticleRevision } from "./publishFirstService";
import { runWithExclusiveBreaking } from "./breakingNewsService";
import { recordArticleSave } from "./articleHistoryService";
import { logArticleEvent } from "./articleEventsService";
import { sendDraftSubmittedNotification } from "../notificationService";
import { notificationBus } from "../notificationBus";

type Fail = { ok: false; status: number; message: string; code?: string; missing?: string[] };

const NOT_READY: Fail = { ok: false, status: 503, code: "EDIT_REQUESTS_NOT_READY", message: "ميزة طلبات التعديل لم تُفعّل بعد" };

/** الجدول غير موجود بعد (قبل تنفيذ SQL الإنتاج) أو بلا صلاحيات. */
function isNotReady(error: any): boolean {
  const code = error?.code ?? error?.cause?.code;
  return code === "42P01" || code === "42501";
}

async function displayNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "زميل"]));
}

async function loadArticle(articleId: string): Promise<Article | undefined> {
  const [row] = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
  return row;
}

function articleBrief(article: Article) {
  return {
    id: article.id,
    title: article.title,
    subtitle: article.subtitle ?? null,
    slug: article.slug,
    status: article.status,
    articleType: article.articleType,
    imageUrl: article.imageUrl ?? null,
    thumbnailUrl: article.thumbnailUrl ?? null,
    albumImages: Array.isArray(article.albumImages) ? article.albumImages : [],
    publishedAt: article.publishedAt ?? null,
  };
}

/** ما يحتاجه نموذج الطلب عند المراسل: المادة وفقراتها القابلة للتعديل وطلبه المفتوح. */
export async function getEditRequestContext(articleId: string, userId: string) {
  const article = await loadArticle(articleId);
  if (!article) return { ok: false as const, status: 404, message: "الخبر غير موجود" };
  if (!isEditRequestOwner(article, userId)) {
    return { ok: false as const, status: 403, message: "طلب التعديل متاح لصاحب الخبر فقط" };
  }
  try {
    const [pending] = await db
      .select({ id: articleEditRequests.id, createdAt: articleEditRequests.createdAt })
      .from(articleEditRequests)
      .where(and(
        eq(articleEditRequests.articleId, articleId),
        eq(articleEditRequests.requesterId, userId),
        eq(articleEditRequests.status, "pending"),
      ))
      .limit(1);
    return {
      ok: true as const,
      article: articleBrief(article),
      paragraphs: editableParagraphs(article.content),
      acceptsRequests: articleAcceptsEditRequests(article.status),
      pendingRequestId: pending?.id ?? null,
    };
  } catch (error) {
    if (isNotReady(error)) return NOT_READY;
    throw error;
  }
}

export async function createEditRequest(input: EditRequestInput, userId: string) {
  const article = await loadArticle(input.articleId);
  if (!article) return { ok: false as const, status: 404, message: "الخبر غير موجود" };
  if (!isEditRequestOwner(article, userId)) {
    return { ok: false as const, status: 403, message: "طلب التعديل متاح لصاحب الخبر فقط" };
  }
  if (!articleAcceptsEditRequests(article.status)) {
    return { ok: false as const, status: 409, code: "ARTICLE_NOT_EDITABLE", message: "لا يمكن طلب تعديل خبر مؤرشف" };
  }
  try {
    const [existing] = await db
      .select({ id: articleEditRequests.id })
      .from(articleEditRequests)
      .where(and(
        eq(articleEditRequests.articleId, article.id),
        eq(articleEditRequests.requesterId, userId),
        eq(articleEditRequests.status, "pending"),
      ))
      .limit(1);
    if (existing) {
      return { ok: false as const, status: 409, code: "EDIT_REQUEST_PENDING", message: "لديك طلب قيد المراجعة على هذا الخبر. ألغِه أولًا لإرسال طلب جديد." };
    }
    const [row] = await db
      .insert(articleEditRequests)
      .values({
        articleId: article.id,
        requesterId: userId,
        urgent: input.urgent,
        note: input.note,
        proposed: input.proposed as Record<string, unknown>,
        baseSnapshot: baseSnapshotFor(article),
      })
      .returning();

    const names = await displayNames([userId]);
    const requesterName = names.get(userId) ?? "مراسل";
    logArticleEvent({
      articleId: article.id,
      eventType: "updated",
      actorId: userId,
      summary: `طلب تعديل من ${requesterName}${input.urgent ? " (عاجل)" : ""}`,
      metadata: { editRequestId: row.id, editRequestStatus: "pending", fields: proposalFields(input.proposed) },
    }).catch((error) => console.error("[edit-requests] event log failed", error));
    sendDraftSubmittedNotification(
      { id: article.id, title: article.title, slug: article.slug },
      requesterName,
      userId,
      {
        type: "ArticleEditRequest",
        title: input.urgent ? "طلب تعديل عاجل" : "طلب تعديل على خبر",
        body: `${requesterName} (${editRequestShortLabel(input.proposed)}): ${article.title}`,
        deeplink: `/dashboard/articles?editRequest=${row.id}`,
        metadata: { editRequestId: row.id, urgent: input.urgent, label: editRequestShortLabel(input.proposed) },
      },
    ).catch((error) => console.error("[edit-requests] notify failed", error));
    return { ok: true as const, request: row };
  } catch (error) {
    if (isNotReady(error)) return NOT_READY;
    throw error;
  }
}

export async function cancelEditRequest(id: string, userId: string) {
  try {
    const [row] = await db
      .update(articleEditRequests)
      .set({ status: "cancelled", decidedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(articleEditRequests.id, id),
        eq(articleEditRequests.requesterId, userId),
        eq(articleEditRequests.status, "pending"),
      ))
      .returning();
    if (!row) return { ok: false as const, status: 404, message: "لا يوجد طلب مفتوح بهذا المعرّف" };
    return { ok: true as const, request: row };
  } catch (error) {
    if (isNotReady(error)) return NOT_READY;
    throw error;
  }
}

/**
 * الطلبات لليبل القائمة. المحرر: كل الطلبات المفتوحة. صاحب الطلب: طلباته
 * المفتوحة وما حُسم منها خلال آخر 3 أيام، ليرى النتيجة على خبره.
 */
export async function listEditRequestsForList(input: { userId: string; reviewer: boolean; articleId?: string | null }) {
  try {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const where = input.reviewer
      ? eq(articleEditRequests.status, "pending")
      : and(
          eq(articleEditRequests.requesterId, input.userId),
          or(
            eq(articleEditRequests.status, "pending"),
            and(inArray(articleEditRequests.status, ["approved", "rejected"]), gt(articleEditRequests.decidedAt, recent)),
          ),
        );
    const scoped = input.articleId ? and(where, eq(articleEditRequests.articleId, input.articleId)) : where;
    const rows = await db
      .select({
        id: articleEditRequests.id,
        articleId: articleEditRequests.articleId,
        requesterId: articleEditRequests.requesterId,
        status: articleEditRequests.status,
        urgent: articleEditRequests.urgent,
        note: articleEditRequests.note,
        proposed: articleEditRequests.proposed,
        decisionNote: articleEditRequests.decisionNote,
        createdAt: articleEditRequests.createdAt,
        decidedAt: articleEditRequests.decidedAt,
        articleTitle: articles.title,
        articleStatus: articles.status,
        articleImageUrl: articles.imageUrl,
        articleThumbnailUrl: articles.thumbnailUrl,
      })
      .from(articleEditRequests)
      .innerJoin(articles, eq(articles.id, articleEditRequests.articleId))
      .where(scoped)
      .orderBy(desc(articleEditRequests.urgent), asc(articleEditRequests.createdAt))
      .limit(200);
    const names = await displayNames(rows.map((r) => r.requesterId));
    return {
      ok: true as const,
      requests: rows.map(({ proposed, ...row }) => {
        const p = proposed as EditRequestProposal;
        return {
          ...row,
          requesterName: row.requesterId ? names.get(row.requesterId) ?? "مراسل" : "مراسل",
          fields: proposalFields(p),
          label: editRequestShortLabel(p),
        };
      }),
    };
  } catch (error) {
    if (isNotReady(error)) return NOT_READY;
    throw error;
  }
}

/** تفاصيل طلب واحد مع القيم الحالية للمادة، لشاشة المراجعة. */
export async function getEditRequestDetail(id: string, input: { userId: string; reviewer: boolean }) {
  try {
    const [row] = await db.select().from(articleEditRequests).where(eq(articleEditRequests.id, id)).limit(1);
    if (!row) return { ok: false as const, status: 404, message: "الطلب غير موجود" };
    if (!input.reviewer && row.requesterId !== input.userId) {
      return { ok: false as const, status: 403, message: "لا تملك صلاحية عرض هذا الطلب" };
    }
    const article = await loadArticle(row.articleId);
    if (!article) return { ok: false as const, status: 404, message: "الخبر غير موجود" };
    const proposed = row.proposed as EditRequestProposal;
    const names = await displayNames([row.requesterId, row.decidedBy]);
    const current = new Set(editableParagraphs(article.content).map(normalizeParagraph));
    return {
      ok: true as const,
      request: {
        ...row,
        requesterName: row.requesterId ? names.get(row.requesterId) ?? "مراسل" : "مراسل",
        decidedByName: row.decidedBy ? names.get(row.decidedBy) ?? null : null,
      },
      article: articleBrief(article),
      fields: proposalFields(proposed),
      contentEdits: (proposed.contentEdits ?? []).map((edit) => ({ ...edit, found: current.has(normalizeParagraph(edit.before)) })),
    };
  } catch (error) {
    if (isNotReady(error)) return NOT_READY;
    throw error;
  }
}

async function notifyRequester(input: {
  requesterId: string | null;
  requestId: string;
  articleId: string;
  articleTitle: string;
  approved: boolean;
  reason?: string | null;
}) {
  if (!input.requesterId) return;
  const title = input.approved ? "اعتُمد طلب تعديلك" : "لم يُعتمد طلب تعديلك";
  const body = input.approved
    ? `حُدّث الخبر: ${input.articleTitle}`
    : `${input.articleTitle}${input.reason ? ` — السبب: ${input.reason}` : ""}`;
  await db.insert(notificationsInbox).values({
    userId: input.requesterId,
    type: "ArticleEditRequestDecision",
    title,
    body,
    deeplink: `/dashboard/articles?editRequest=${input.requestId}`,
    read: false,
    metadata: { articleId: input.articleId, editRequestId: input.requestId, approved: input.approved },
  });
  notificationBus.emit("new-notification", { userId: input.requesterId, type: "ArticleEditRequestDecision", title, body });
}

/** يحجز الطلب المفتوح لقرار واحد؛ يعيد null إن حُسم أو أُلغي قبل ذلك. */
async function claimPending(id: string, status: "approved" | "rejected", actorId: string, decisionNote: string | null) {
  const [row] = await db
    .update(articleEditRequests)
    .set({ status, decidedBy: actorId, decidedAt: new Date(), decisionNote, updatedAt: new Date() })
    .where(and(eq(articleEditRequests.id, id), eq(articleEditRequests.status, "pending")))
    .returning();
  return row ?? null;
}

async function releaseClaim(id: string) {
  await db
    .update(articleEditRequests)
    .set({ status: "pending", decidedBy: null, decidedAt: null, decisionNote: null, updatedAt: new Date() })
    .where(eq(articleEditRequests.id, id));
}

/**
 * الاعتماد: يطبّق الحقول المختارة على المادة نفسها (لا تتغير حالتها)، فيُحفظ
 * الوضع السابق والجديد نسختين في سجل التعديلات باسم المعتمد مع ذكر صاحب الطلب.
 * manual = عُدّل في المحرر ثم اعتُمد، فلا يُطبَّق شيء هنا.
 */
export async function approveEditRequest(input: {
  id: string;
  actorId: string;
  fields: EditRequestField[];
  updateLine?: string | null;
  manual?: boolean;
}) {
  let claimed;
  try {
    claimed = await claimPending(input.id, "approved", input.actorId, input.manual ? "عُدّل في المحرر" : null);
  } catch (error) {
    if (isNotReady(error)) return NOT_READY;
    throw error;
  }
  if (!claimed) return { ok: false as const, status: 409, code: "EDIT_REQUEST_CLOSED", message: "الطلب حُسم أو أُلغي" } satisfies Fail;

  // أي خطأ قبل كتابة المادة يعيد الطلب مفتوحًا، فلا يبقى «معتمدًا» دون تطبيق.
  let applied = false;
  try {
    const result = await applyClaimedRequest(claimed, input, () => { applied = true; });
    if (!result.ok && !applied) await releaseClaim(claimed.id);
    return result;
  } catch (error) {
    if (!applied) await releaseClaim(claimed.id).catch((e) => console.error("[edit-requests] release failed", e));
    throw error;
  }
}

async function applyClaimedRequest(
  claimed: typeof articleEditRequests.$inferSelect,
  input: { actorId: string; fields: EditRequestField[]; updateLine?: string | null; manual?: boolean },
  markApplied: () => void,
) {
  const existing = await loadArticle(claimed.articleId);
  if (!existing) return { ok: false as const, status: 404, message: "الخبر غير موجود" } satisfies Fail;
  const names = await displayNames([claimed.requesterId, input.actorId]);
  const requesterName = claimed.requesterId ? names.get(claimed.requesterId) ?? "مراسل" : "مراسل";

  if (input.manual) {
    markApplied();
    await db
      .update(articleEditRequests)
      .set({ appliedFields: [], updatedAt: new Date() })
      .where(eq(articleEditRequests.id, claimed.id));
    logArticleEvent({
      articleId: existing.id,
      eventType: "approved",
      actorId: input.actorId,
      summary: `اعتُمد طلب تعديل ${requesterName} بعد تعديله في المحرر`,
      metadata: { editRequestId: claimed.id, requesterId: claimed.requesterId, manual: true },
    }).catch((error) => console.error("[edit-requests] event log failed", error));
    notifyRequester({ requesterId: claimed.requesterId, requestId: claimed.id, articleId: existing.id, articleTitle: existing.title, approved: true })
      .catch((error) => console.error("[edit-requests] notify requester failed", error));
    return { ok: true as const, article: existing, before: existing, appliedFields: [] as EditRequestField[], missingParagraphs: [] as string[], changed: false, request: claimed };
  }

  const proposed = claimed.proposed as EditRequestProposal;
  const { patch, appliedFields, missingParagraphs } = buildEditRequestPatch({
    article: { content: existing.content, albumImages: existing.albumImages, seo: (existing.seo ?? null) as Record<string, unknown> | null },
    proposed,
    fields: input.fields,
  });
  if (appliedFields.length === 0) {
    return {
      ok: false as const,
      status: 409,
      code: missingParagraphs.length ? "PARAGRAPHS_CHANGED" : "NOTHING_TO_APPLY",
      message: missingParagraphs.length
        ? "الفقرات المطلوب تعديلها تغيّرت بعد إرسال الطلب. عدّل في المحرر ثم اعتمد."
        : "اختر تغييرًا واحدًا على الأقل لتطبيقه",
      missing: missingParagraphs,
    } satisfies Fail;
  }

  const updateLine = existing.status === "published" ? input.updateLine?.trim() || null : null;
  const revisionPlan = await maybePlanPublishedRevision({
    existingStatus: existing.status,
    existing: existing as any,
    patch: patch as any,
    updateReason: updateLine,
  });

  // الكتابة مشروطة بنسخة المادة التي بُني عليها التعديل: إن حفظها محرر أو اعتماد
  // آخر في هذه الأثناء لا يُكتب فوقه، ويعود الطلب مفتوحًا لإعادة المحاولة.
  const { article: updated } = await runWithExclusiveBreaking(
    async (tx) => {
      const [row] = await tx
        .update(articles)
        .set({ ...patch, ...(revisionPlan?.contentChanged ? { correctedAt: new Date() } : {}), updatedAt: nextArticleVersion } as any)
        .where(and(
          eq(articles.id, existing.id),
          matchesArticleVersion(existing.updatedAt ?? new Date(0)),
          articleLockAllowsWriter(input.actorId),
        ))
        .returning();
      return row as Article | undefined;
    },
    { reason: "article-edit-request-breaking-clear" },
  );
  if (!updated) {
    const conflict = await articleWriteConflict(existing.id, input.actorId);
    return conflict.code === "ARTICLE_LOCKED"
      ? { ok: false as const, status: 409, code: "ARTICLE_LOCKED", message: "الخبر مفتوح للتحرير عند مستخدم آخر" } satisfies Fail
      : { ok: false as const, status: 409, code: "ARTICLE_CHANGED", message: "تغيّر الخبر أثناء الاعتماد. أعد فتح الطلب وحاول مجددًا." } satisfies Fail;
  }
  markApplied();

  if (appliedFields.includes("imageUrl") && updated.imageUrl) {
    const imageUrl = updated.imageUrl;
    void (async () => {
      await refreshArticleLiteImage(updated.id, imageUrl);
      await generateArticleThumbnail(updated.id, imageUrl).catch((error) =>
        console.error("[edit-requests] thumbnail failed", error));
    })();
  }

  if (revisionPlan) {
    recordArticleRevision({
      articleId: existing.id,
      editorUserId: input.actorId,
      editorName: names.get(input.actorId) ?? "محرر",
      plan: revisionPlan,
    }).catch((error) => console.error("[edit-requests] publish-first revision failed", error));
  }
  const version = await recordArticleSave({
    before: existing,
    after: updated,
    actorId: input.actorId,
    reason: updateLine,
    summary: `اعتُمد طلب تعديل من ${requesterName}`,
    metadata: { editRequestId: claimed.id, requesterId: claimed.requesterId, requesterName },
  }).catch((error) => {
    console.error("[edit-requests] history log failed", error);
    return null;
  });
  await db
    .update(articleEditRequests)
    .set({ appliedFields, appliedVersionId: version?.id ?? null, updatedAt: new Date() })
    .where(eq(articleEditRequests.id, claimed.id))
    .catch((error) => console.error("[edit-requests] applied fields write failed", error));
  notifyRequester({ requesterId: claimed.requesterId, requestId: claimed.id, articleId: existing.id, articleTitle: updated.title, approved: true })
    .catch((error) => console.error("[edit-requests] notify requester failed", error));

  return { ok: true as const, article: updated, before: existing, appliedFields, missingParagraphs, changed: true, request: claimed };
}

export async function rejectEditRequest(input: { id: string; actorId: string; reason: string }) {
  let claimed;
  try {
    claimed = await claimPending(input.id, "rejected", input.actorId, input.reason);
  } catch (error) {
    if (isNotReady(error)) return NOT_READY;
    throw error;
  }
  if (!claimed) return { ok: false as const, status: 409, code: "EDIT_REQUEST_CLOSED", message: "الطلب حُسم أو أُلغي" } satisfies Fail;
  const [article] = await db
    .select({ id: articles.id, title: articles.title })
    .from(articles)
    .where(eq(articles.id, claimed.articleId))
    .limit(1);
  const names = await displayNames([claimed.requesterId]);
  logArticleEvent({
    articleId: claimed.articleId,
    eventType: "rejected",
    actorId: input.actorId,
    summary: `رُفض طلب تعديل ${claimed.requesterId ? names.get(claimed.requesterId) ?? "مراسل" : "مراسل"}`,
    metadata: { editRequestId: claimed.id, requesterId: claimed.requesterId, reason: input.reason },
  }).catch((error) => console.error("[edit-requests] event log failed", error));
  notifyRequester({
    requesterId: claimed.requesterId,
    requestId: claimed.id,
    articleId: claimed.articleId,
    articleTitle: article?.title ?? "",
    approved: false,
    reason: input.reason,
  }).catch((error) => console.error("[edit-requests] notify requester failed", error));
  return { ok: true as const, request: claimed };
}

/**
 * اختياري عند الاعتماد: يعيد توليد الموجز ووصف السيو والكلمات المفتاحية من
 * العنوان والنص الجديدين، كما يفعل زرّا «تلخيص» و«توليد SEO» في المحرر.
 * يعمل بعد الرد، ولا يرفع updatedAt (نسخة المحرر)، ونصّ الصورة البديل الذي
 * كتبه المراسل يبقى كما هو.
 */
export async function regenerateEditRequestDerived(input: { articleId: string; actorId: string; keepImageAlt?: string | null }) {
  const article = await loadArticle(input.articleId);
  if (!article?.content) return null;
  const done: string[] = [];

  try {
    const summary = (await summarizeArticle(article.content))?.trim();
    if (summary) {
      await db
        .update(articles)
        .set({ excerpt: summary, aiSummary: summary, aiBullets: null, aiBulletsGeneratedAt: null } as any)
        .where(eq(articles.id, article.id));
      done.push("excerpt");
    }
  } catch (error) {
    console.error("[edit-requests] summary regeneration failed", error);
  }

  try {
    const fresh = (await loadArticle(article.id)) ?? article;
    const result = await generateSeoMetadata(
      { id: fresh.id, title: fresh.title, subtitle: fresh.subtitle || undefined, content: fresh.content, excerpt: fresh.excerpt || undefined },
      "ar",
    );
    const seo = {
      metaTitle: result.content.metaTitle,
      metaDescription: result.content.metaDescription,
      keywords: result.content.keywords,
      socialTitle: result.content.socialTitle,
      socialDescription: result.content.socialDescription,
      imageAltText: input.keepImageAlt || result.content.imageAltText,
      ogImageUrl: result.content.ogImageUrl,
    };
    const metadata = {
      status: "generated" as const,
      generatedAt: new Date().toISOString(),
      generatedBy: input.actorId,
      provider: result.provider,
      model: result.model,
      manualOverride: false,
    };
    await storage.saveSeoMetadata(fresh.id, "ar", seo, metadata);
    await storage.createSeoHistoryEntry({
      articleId: fresh.id,
      language: "ar",
      seoContent: seo,
      seoMetadata: metadata,
      provider: result.provider,
      model: result.model,
      generatedBy: input.actorId,
    });
    done.push("seo");
  } catch (error) {
    console.error("[edit-requests] SEO regeneration failed", error);
  }

  if (done.length) {
    logArticleEvent({
      articleId: article.id,
      eventType: "updated",
      actorId: input.actorId,
      summary: done.length === 2 ? "أُعيد توليد الموجز والسيو بعد طلب تعديل" : done[0] === "excerpt" ? "أُعيد توليد الموجز بعد طلب تعديل" : "أُعيد توليد السيو بعد طلب تعديل",
      metadata: { regenerated: done },
    }).catch((error) => console.error("[edit-requests] event log failed", error));
  }
  return { article: (await loadArticle(article.id)) ?? article, regenerated: done };
}
