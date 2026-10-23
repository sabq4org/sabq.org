// سجل المادة الكامل: نسخة بعد كل حفظ (article_versions) + حدث في article_events
// يحمل القيم قبل وبعد للحقول القصيرة، ثم المقارنة والاسترجاع. الاستعلامات هنا (ADR-001).

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { articleVersions, articles, categories, users, type Article } from "@shared/schema";
import {
  ARTICLE_VERSION_FIELD_LABELS,
  buildRestorePatch,
  changedSnapshotFields,
  contentWordCount,
  inlineChanges,
  parseStoredSnapshot,
  snapshotFromArticle,
  summarizeContentChange,
  versionActionFor,
  type ArticleRestorableField,
  type ArticleSnapshot,
  type ArticleVersionAction,
} from "@shared/articleHistory";
import { logArticleEvent, getArticleEventsWithActor } from "./articleEventsService";
import { articleLockAllowsWriter, nextArticleVersion } from "./articleWriteVersion";
import { maybePlanPublishedRevision, recordArticleRevision, editorDisplayName } from "./publishFirstService";
import { runWithExclusiveBreaking } from "./breakingNewsService";

type ArticleRow = Article;

const EVENT_FOR_ACTION: Record<ArticleVersionAction, Parameters<typeof logArticleEvent>[0]["eventType"]> = {
  baseline: "updated",
  created: "created",
  updated: "updated",
  autosave: "updated",
  published: "published",
  unpublished: "unpublished",
  archived: "archived",
  restored: "restored",
};

const SUMMARY_FOR_ACTION: Record<ArticleVersionAction, string> = {
  baseline: "أقدم نسخة محفوظة",
  created: "تم إنشاء الخبر",
  updated: "تم تحديث الخبر",
  autosave: "حفظ تلقائي للمسودة",
  published: "تم نشر الخبر",
  unpublished: "تم إلغاء نشر الخبر",
  archived: "تمت أرشفة الخبر",
  restored: "تم استرجاع نسخة سابقة",
};

async function insertVersion(values: {
  articleId: string;
  action: ArticleVersionAction;
  actorId: string | null;
  snapshot: ArticleSnapshot;
  changedFields: string[];
  restoredFromVersionId?: string | null;
  reason?: string | null;
  createdAt?: Date;
}) {
  // الرقم التالي داخل الإدراج نفسه؛ تعارض حفظين متزامنين يعيد المحاولة مرة.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [row] = await db
        .insert(articleVersions)
        .values({
          articleId: values.articleId,
          versionNumber: sql<number>`(select coalesce(max(${articleVersions.versionNumber}), 0) + 1 from ${articleVersions} where ${articleVersions.articleId} = ${values.articleId})`,
          action: values.action,
          actorId: values.actorId,
          snapshot: values.snapshot as unknown as Record<string, unknown>,
          changedFields: values.changedFields,
          restoredFromVersionId: values.restoredFromVersionId ?? null,
          reason: values.reason ?? null,
          ...(values.createdAt ? { createdAt: values.createdAt } : {}),
        })
        .returning();
      return row;
    } catch (error: any) {
      if (attempt === 0 && (error?.code === "23505" || error?.cause?.code === "23505")) continue;
      throw error;
    }
  }
  return undefined;
}

async function hasVersions(articleId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: articleVersions.id })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId))
    .limit(1);
  return Boolean(row);
}

/**
 * يسجّل حفظًا واحدًا: نسخة كاملة بعد الحفظ وحدثًا في السجل الزمني.
 * مادة قديمة بلا نسخ تُحفظ حالتها السابقة أولًا (baseline) حتى يمكن الرجوع إليها.
 * فشل جدول النسخ (قبل تنفيذ SQL الإنتاج) لا يمنع تسجيل الحدث.
 */
export async function recordArticleSave(input: {
  before: ArticleRow | null;
  after: ArticleRow;
  actorId?: string | null;
  autosave?: boolean;
  action?: ArticleVersionAction;
  reason?: string | null;
  restoredFromVersion?: { id: string; versionNumber: number } | null;
  /** وصف الحدث بدل الوصف العام، مثل «حدّث البوت … المسودة». */
  summary?: string;
  /** بيانات إضافية للحدث (القناة، البوت…). */
  metadata?: Record<string, unknown>;
}) {
  const articleId = input.after.id;
  const actorId = input.actorId ?? null;
  const beforeSnap = input.before ? snapshotFromArticle(input.before) : null;
  const afterSnap = snapshotFromArticle(input.after);
  const fields = changedSnapshotFields(beforeSnap, afterSnap);
  const action = input.action ?? versionActionFor({ before: beforeSnap, after: afterSnap, autosave: input.autosave });

  if (beforeSnap && fields.length === 0 && action !== "restored") {
    await logArticleEvent({
      articleId,
      eventType: "updated",
      actorId,
      summary: input.summary ?? "تم تحديث إعدادات المادة",
      metadata: { ...input.metadata, changedFields: [], fields: [], autosave: input.autosave === true },
    });
    return null;
  }

  let version: Awaited<ReturnType<typeof insertVersion>>;
  try {
    if (input.before && !(await hasVersions(articleId))) {
      const at = input.before.updatedAt ? new Date(input.before.updatedAt) : new Date(Date.now() - 1);
      await insertVersion({ articleId, action: "baseline", actorId: null, snapshot: beforeSnap!, changedFields: [], createdAt: at });
    }
    version = await insertVersion({
      articleId,
      action,
      actorId,
      snapshot: afterSnap,
      changedFields: fields,
      restoredFromVersionId: input.restoredFromVersion?.id ?? null,
      reason: input.reason?.trim() || null,
    });
  } catch (error) {
    console.error("[article-history] version insert failed", error);
  }

  const metadata: Record<string, unknown> = {
    ...input.metadata,
    changedFields: fields.map((field) => ARTICLE_VERSION_FIELD_LABELS[field]),
    fields,
    changes: beforeSnap ? inlineChanges(beforeSnap, afterSnap, fields) : [],
    autosave: input.autosave === true,
  };
  if (version) {
    metadata.versionId = version.id;
    metadata.versionNumber = version.versionNumber;
  }
  if (fields.includes("content") && beforeSnap) {
    metadata.content = summarizeContentChange(beforeSnap.content, afterSnap.content);
  }
  if (input.restoredFromVersion) metadata.restoredFromVersionNumber = input.restoredFromVersion.versionNumber;
  if (input.reason?.trim()) metadata.reason = input.reason.trim().slice(0, 500);

  const summary = input.restoredFromVersion
    ? `تم استرجاع النسخة ${input.restoredFromVersion.versionNumber}`
    : input.summary ?? SUMMARY_FOR_ACTION[action];
  await logArticleEvent({ articleId, eventType: EVENT_FOR_ACTION[action], actorId, summary, metadata });
  return version ?? null;
}

export async function getArticleHistory(articleId: string) {
  const [events, versionRows] = await Promise.all([
    getArticleEventsWithActor(articleId),
    db
      .select({
        id: articleVersions.id,
        versionNumber: articleVersions.versionNumber,
        action: articleVersions.action,
        changedFields: articleVersions.changedFields,
        reason: articleVersions.reason,
        createdAt: articleVersions.createdAt,
        content: sql<string>`${articleVersions.snapshot}->>'content'`,
        categoryId: sql<string | null>`${articleVersions.snapshot}->>'categoryId'`,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
      })
      .from(articleVersions)
      .leftJoin(users, eq(articleVersions.actorId, users.id))
      .where(eq(articleVersions.articleId, articleId))
      .orderBy(desc(articleVersions.versionNumber))
      .catch((error) => {
        console.error("[article-history] versions read failed", error);
        return [];
      }),
  ]);

  const categoryIds = new Set<string>();
  for (const row of versionRows) if (row.categoryId) categoryIds.add(row.categoryId);
  for (const event of events) {
    const changes = (event.metadata as any)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (change?.field !== "categoryId") continue;
      if (typeof change.oldValue === "string") categoryIds.add(change.oldValue);
      if (typeof change.newValue === "string") categoryIds.add(change.newValue);
    }
  }
  const categoryRows = categoryIds.size
    ? await db
        .select({ id: categories.id, nameAr: categories.nameAr })
        .from(categories)
        .where(inArray(categories.id, Array.from(categoryIds)))
    : [];

  return {
    events,
    versions: versionRows.map(({ content, categoryId: _categoryId, ...row }) => ({
      ...row,
      wordCount: contentWordCount(content),
    })),
    categories: Object.fromEntries(categoryRows.map((row) => [row.id, row.nameAr])),
  };
}

/** نسخة كاملة ومعها النسخة التي تُقارن بها (السابقة افتراضيًا). */
export async function getArticleVersionPair(articleId: string, versionId: string, compareToId?: string | null) {
  const [version] = await db
    .select()
    .from(articleVersions)
    .where(and(eq(articleVersions.id, versionId), eq(articleVersions.articleId, articleId)))
    .limit(1);
  if (!version) return null;
  let other;
  if (compareToId) {
    [other] = await db
      .select()
      .from(articleVersions)
      .where(and(eq(articleVersions.id, compareToId), eq(articleVersions.articleId, articleId)))
      .limit(1);
  } else {
    [other] = await db
      .select()
      .from(articleVersions)
      .where(and(eq(articleVersions.articleId, articleId), sql`${articleVersions.versionNumber} < ${version.versionNumber}`))
      .orderBy(desc(articleVersions.versionNumber))
      .limit(1);
  }
  const list = await db
    .select({ id: articleVersions.id, versionNumber: articleVersions.versionNumber, action: articleVersions.action, createdAt: articleVersions.createdAt })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId))
    .orderBy(asc(articleVersions.versionNumber));
  return { version, compareTo: other ?? null, versions: list };
}

/**
 * يعيد حقول نسخة سابقة إلى المادة. الوضع الحالي يُحفظ أولًا نسخةً (baseline
 * إن لم تكن هناك نسخ) والاسترجاع نفسه نسخة جديدة، فيمكن التراجع عنه.
 * يحترم قفل التحرير، ومع المادة المنشورة يسجل مراجعة «النشر أولاً» بلا سطر للقارئ.
 */
export async function restoreArticleVersion(input: {
  articleId: string;
  versionId: string;
  fields: readonly ArticleRestorableField[];
  actorId: string;
  reason?: string | null;
}) {
  const [version] = await db
    .select()
    .from(articleVersions)
    .where(and(eq(articleVersions.id, input.versionId), eq(articleVersions.articleId, input.articleId)))
    .limit(1);
  if (!version) return { ok: false as const, status: 404, message: "النسخة غير موجودة" };
  const [existing] = await db.select().from(articles).where(eq(articles.id, input.articleId)).limit(1);
  if (!existing) return { ok: false as const, status: 404, message: "المادة غير موجودة" };

  const snapshot = parseStoredSnapshot(version.snapshot);
  const patch = buildRestorePatch({
    snapshot,
    fields: input.fields,
    currentSeo: (existing.seo ?? null) as Record<string, unknown> | null,
  });
  const revisionPlan = await maybePlanPublishedRevision({
    existingStatus: existing.status,
    existing: existing as any,
    patch: patch as any,
    updateReason: null,
  });

  const { article: updated } = await runWithExclusiveBreaking(
    async (tx) => {
      const [restored] = await tx
        .update(articles)
        .set({ ...patch, ...(revisionPlan?.contentChanged ? { correctedAt: new Date() } : {}), updatedAt: nextArticleVersion } as any)
        .where(and(eq(articles.id, input.articleId), articleLockAllowsWriter(input.actorId)))
        .returning();
      return restored;
    },
    { reason: "article-history-restore-breaking-clear" },
  );
  if (!updated) {
    return { ok: false as const, status: 409, code: "ARTICLE_LOCKED", message: "المادة مفتوحة للتحرير عند مستخدم آخر" };
  }

  if (revisionPlan) {
    recordArticleRevision({
      articleId: input.articleId,
      editorUserId: input.actorId,
      editorName: await editorDisplayName(input.actorId),
      plan: revisionPlan,
    }).catch((error) => console.error("[article-history] publish-first revision failed", error));
  }
  await recordArticleSave({
    before: existing,
    after: updated,
    actorId: input.actorId,
    action: "restored",
    reason: input.reason,
    restoredFromVersion: { id: version.id, versionNumber: version.versionNumber },
  }).catch((error) => console.error("[article-history] restore log failed", error));

  return { ok: true as const, article: updated, before: existing };
}
