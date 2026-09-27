// خدمة «النشر أولاً»: أعلام من system_settings، بوابة الحساسية،
// حكم المراجع، سجل المراجعة، وسبب التحديث. الاستعلامات هنا (ADR-001).

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articlePublishOverrides,
  articleReviewerVerdicts,
  articleRevisions,
  articles,
  categories,
  systemSettings,
  users,
} from "@shared/schema";
import {
  PUBLISH_FIRST_FLAG_KEYS,
  PUBLISH_FIRST_FLAGS_DEFAULT,
  buildOverrideLogRow,
  buildRevisionLogRow,
  decideSensitiveGate,
  flagEnabledFromSetting,
  formatPublishFirstUpdateLines,
  isAcceptableCategoryId,
  isPublishFirstAdmin,
  isPublishFirstVerdict,
  planContentRevision,
  validateBotDraftUpload,
  type PublishFirstFlags,
  type PublishFirstFlagName,
  type PublicUpdateLine,
  type RevisionPlan,
  type SensitiveGateDecision,
} from "@shared/publishFirst";
const FLAG_TTL_MS = 5_000;

function assignableCategoryStatus(status: string | null | undefined): boolean {
  return status === "visible" || status === "active";
}
const SLUG_LIST_CAP = 40;

let flagCache: { at: number; flags: PublishFirstFlags } | null = null;

export function clearPublishFirstFlagCache(): void {
  flagCache = null;
}

function flagsFromRows(rows: Array<{ key: string; value: unknown }>): PublishFirstFlags {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const read = (name: PublishFirstFlagName): boolean =>
    flagEnabledFromSetting(byKey.get(PUBLISH_FIRST_FLAG_KEYS[name]), PUBLISH_FIRST_FLAGS_DEFAULT[name]);
  return {
    validation: read("validation"),
    sensitiveGate: read("sensitiveGate"),
    revisionHistory: read("revisionHistory"),
    updateLine: read("updateLine"),
  };
}

export async function getPublishFirstFlags(): Promise<PublishFirstFlags> {
  if (flagCache && Date.now() - flagCache.at < FLAG_TTL_MS) return flagCache.flags;
  try {
    const rows = await db
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(inArray(systemSettings.key, Object.values(PUBLISH_FIRST_FLAG_KEYS)));
    const flags = flagsFromRows(rows);
    flagCache = { at: Date.now(), flags };
    return flags;
  } catch (error) {
    console.error("[publish-first] flag read failed, using defaults", error);
    return PUBLISH_FIRST_FLAGS_DEFAULT;
  }
}

export async function setPublishFirstFlags(
  patch: Partial<PublishFirstFlags>,
): Promise<PublishFirstFlags> {
  const current = await getPublishFirstFlags();
  const next: PublishFirstFlags = { ...current, ...patch };
  for (const name of Object.keys(PUBLISH_FIRST_FLAG_KEYS) as PublishFirstFlagName[]) {
    if (patch[name] === undefined) continue;
    const key = PUBLISH_FIRST_FLAG_KEYS[name];
    const value = { enabled: next[name] };
    const [existing] = await db
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (existing) {
      await db
        .update(systemSettings)
        .set({ value, category: "editorial", updatedAt: new Date() })
        .where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({
        key,
        value,
        category: "editorial",
        isPublic: false,
      });
    }
  }
  clearPublishFirstFlagCache();
  return next;
}

export async function listAssignableCategorySlugs(): Promise<{ slugs: string[]; truncated: boolean }> {
  const rows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(inArray(categories.status, ["visible", "active"]))
    .limit(SLUG_LIST_CAP + 1);
  const slugs = rows.map((row) => row.slug).filter((slug): slug is string => Boolean(slug));
  return { slugs: slugs.slice(0, SLUG_LIST_CAP), truncated: slugs.length > SLUG_LIST_CAP };
}

export async function findAssignableCategory(categoryId: string): Promise<{ id: string; slug: string } | null> {
  if (!isAcceptableCategoryId(categoryId)) return null;
  const [row] = await db
    .select({ id: categories.id, slug: categories.slug, status: categories.status })
    .from(categories)
    .where(eq(categories.id, categoryId.trim()))
    .limit(1);
  if (!row || !assignableCategoryStatus(row.status)) return null;
  return { id: row.id, slug: row.slug };
}

/** يبني خطأ 422 للتحقق. `validSlugs` تُجلب فقط عند فشل التصنيف والعلم مفعّل. */
export async function botDraftUploadIssue(input: {
  subtitle?: string | null;
  categorySlug?: string | null;
  categoryResolved: boolean;
  categoryProvided: boolean;
}) {
  const flags = await getPublishFirstFlags();
  let validSlugs: string[] | undefined;
  let slugsTruncated = false;
  if (flags.validation && input.categoryProvided && !input.categoryResolved) {
    const listed = await listAssignableCategorySlugs();
    validSlugs = listed.slugs;
    slugsTruncated = listed.truncated;
  }
  return validateBotDraftUpload({ ...input, validationEnabled: flags.validation, validSlugs, slugsTruncated });
}

export async function articleHasReviewerVerdict(articleId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: articleReviewerVerdicts.id })
    .from(articleReviewerVerdicts)
    .where(eq(articleReviewerVerdicts.articleId, articleId))
    .limit(1);
  return Boolean(row);
}

export async function sensitiveGateForArticle(input: {
  articleId: string;
  riskLabel: string | null | undefined;
  action: "publish" | "correct";
  adminOverride: boolean;
}): Promise<SensitiveGateDecision> {
  const flags = await getPublishFirstFlags();
  if (!flags.sensitiveGate || input.riskLabel !== "sensitive") {
    return decideSensitiveGate({ ...input, hasVerdict: false, gateEnabled: flags.sensitiveGate });
  }
  const hasVerdict = await articleHasReviewerVerdict(input.articleId);
  return decideSensitiveGate({ ...input, hasVerdict, gateEnabled: true });
}

export async function editorDisplayName(userId: string): Promise<string> {
  const [user] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || user?.email || userId;
}

export async function recordReviewerVerdict(input: {
  articleId: string;
  verdict: string;
  reviewerName: string;
  note?: string | null;
}) {
  if (!isPublishFirstVerdict(input.verdict)) {
    return { ok: false as const, message: "الحكم يجب أن يكون ok أو minor أو major" };
  }
  const reviewerName = input.reviewerName.trim();
  if (!reviewerName) return { ok: false as const, message: "اسم المراجع مطلوب" };
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, input.articleId))
    .limit(1);
  if (!article) return { ok: false as const, notFound: true, message: "المادة غير موجودة" };
  const now = new Date();
  const [row] = await db
    .insert(articleReviewerVerdicts)
    .values({
      articleId: input.articleId,
      verdict: input.verdict,
      reviewerName,
      note: input.note?.trim() || null,
      verdictAt: now,
    })
    .returning();
  return { ok: true as const, verdict: row };
}

export async function recordPublishOverride(input: {
  articleId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  action: "publish" | "correct";
  reason?: string | null;
  now?: Date;
}) {
  const row = buildOverrideLogRow({ ...input, now: input.now ?? new Date() });
  const [saved] = await db.insert(articlePublishOverrides).values(row).returning();
  return saved;
}

export async function recordArticleRevision(input: {
  articleId: string;
  editorUserId?: string | null;
  editorName?: string | null;
  plan: RevisionPlan;
}) {
  const row = buildRevisionLogRow(input);
  const [saved] = await db.insert(articleRevisions).values({
    articleId: row.articleId,
    editorUserId: row.editorUserId,
    editorName: row.editorName,
    changedFields: row.changedFields,
    previousValues: row.previousValues,
    updateReason: row.updateReason,
    createdAt: row.createdAt,
  }).returning();
  return saved;
}

export async function maybePlanPublishedRevision(input: {
  existingStatus: string | null | undefined;
  existing: Parameters<typeof planContentRevision>[0]["existing"];
  patch: Parameters<typeof planContentRevision>[0]["patch"];
  updateReason?: string | null;
  now?: Date;
}): Promise<RevisionPlan | null> {
  const flags = await getPublishFirstFlags();
  return planContentRevision({
    ...input,
    now: input.now ?? new Date(),
    historyEnabled: flags.revisionHistory,
  });
}

export async function listArticlePublishFirstHistory(articleId: string) {
  const [verdicts, revisions, overrides] = await Promise.all([
    db
      .select()
      .from(articleReviewerVerdicts)
      .where(eq(articleReviewerVerdicts.articleId, articleId))
      .orderBy(desc(articleReviewerVerdicts.verdictAt)),
    db
      .select()
      .from(articleRevisions)
      .where(eq(articleRevisions.articleId, articleId))
      .orderBy(desc(articleRevisions.createdAt)),
    db
      .select()
      .from(articlePublishOverrides)
      .where(eq(articlePublishOverrides.articleId, articleId))
      .orderBy(desc(articlePublishOverrides.createdAt)),
  ]);
  return { verdicts, revisions, overrides };
}

export async function listPublicUpdateLines(articleId: string): Promise<PublicUpdateLine[]> {
  try {
    const flags = await getPublishFirstFlags();
    if (!flags.updateLine) return [];
    const rows = await db
      .select({
        id: articleRevisions.id,
        updateReason: articleRevisions.updateReason,
        createdAt: articleRevisions.createdAt,
      })
      .from(articleRevisions)
      .where(and(
        eq(articleRevisions.articleId, articleId),
        sql`nullif(btrim(${articleRevisions.updateReason}), '') is not null`,
      ))
      .orderBy(asc(articleRevisions.createdAt));
    return formatPublishFirstUpdateLines(rows);
  } catch (error) {
    console.error("[publish-first] update lines failed", error);
    return [];
  }
}

const ROLLBACK_COLUMNS = ["title", "subtitle", "excerpt", "content", "categoryId", "imageUrl", "riskLabel"] as const;

export async function rollbackArticleRevision(input: {
  articleId: string;
  revisionId: string;
  editorUserId: string;
  editorName: string;
}) {
  const [revision] = await db
    .select()
    .from(articleRevisions)
    .where(and(eq(articleRevisions.id, input.revisionId), eq(articleRevisions.articleId, input.articleId)))
    .limit(1);
  if (!revision) return { ok: false as const, notFound: true, message: "المراجعة غير موجودة" };
  const [existing] = await db.select().from(articles).where(eq(articles.id, input.articleId)).limit(1);
  if (!existing) return { ok: false as const, notFound: true, message: "المادة غير موجودة" };
  const previous = (revision.previousValues ?? {}) as Record<string, unknown>;
  const now = new Date();
  const patch: Record<string, unknown> = { correctedAt: now, updatedAt: now };
  for (const field of ROLLBACK_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(previous, field)) patch[field] = previous[field];
  }
  const gate = await sensitiveGateForArticle({
    articleId: input.articleId,
    riskLabel: existing.riskLabel,
    action: "correct",
    adminOverride: true,
  });
  if (gate.allow && gate.override) {
    await recordPublishOverride({
      articleId: input.articleId,
      actorUserId: input.editorUserId,
      actorName: input.editorName,
      action: "correct",
      reason: "استرجاع نسخة سابقة",
      now,
    });
  }
  const plan = planContentRevision({
    existingStatus: existing.status,
    existing,
    patch,
    updateReason: "استرجاع نسخة سابقة",
    now,
    historyEnabled: true,
  });
  const [updated] = await db
    .update(articles)
    .set(patch)
    .where(eq(articles.id, input.articleId))
    .returning();
  if (plan) {
    await recordArticleRevision({
      articleId: input.articleId,
      editorUserId: input.editorUserId,
      editorName: input.editorName,
      plan,
    });
  }
  return { ok: true as const, article: updated };
}

export type PublishFirstDenial = {
  status: 422;
  body: { message: string; code: string; field?: string };
};

function publishFirstDenial(decision: { code: string; message: string }): PublishFirstDenial {
  return { status: 422, body: { message: decision.message, code: decision.code } };
}

function adminOverrideRequested(
  body: { sensitiveOverride?: unknown } | null | undefined,
  user: { role?: string | null; roles?: Array<string | { name?: string | null } | null> | null; permissions?: string[] | null },
  permissions?: string[] | null,
): boolean {
  return body?.sensitiveOverride === true && isPublishFirstAdmin({
    role: user.role,
    roles: user.roles,
    permissions: permissions ?? user.permissions,
  });
}

/** يضبط طابع إنشاء المسودة ويمنع نشر مادة حساسة بلا حكم. */
export async function prepareNewArticlePublishFirst(
  articleData: Record<string, unknown>,
  user: { id: string; role?: string | null; roles?: string[] | null },
  body: { sensitiveOverride?: unknown; overrideReason?: unknown } | null | undefined,
  loadPermissions: () => Promise<string[]>,
): Promise<PublishFirstDenial | { override: boolean; reason: string | null; actorName: string | null }> {
  delete articleData.draftCreatedAt;
  delete articleData.correctedAt;
  delete articleData.verdictAt;
  articleData.draftCreatedAt = new Date();
  const releasing = articleData.status === "published" || articleData.status === "scheduled";
  if (!releasing || articleData.riskLabel !== "sensitive") {
    return { override: false, reason: null, actorName: null };
  }
  const adminOverride = adminOverrideRequested(body, user, await loadPermissions());
  const gate = await sensitiveGateForArticle({
    articleId: "pending-create",
    riskLabel: typeof articleData.riskLabel === "string" ? articleData.riskLabel : null,
    action: "publish",
    adminOverride,
  });
  if (!gate.allow) return publishFirstDenial(gate);
  return {
    override: gate.override,
    reason: typeof body?.overrideReason === "string" ? body.overrideReason : null,
    actorName: gate.override ? await editorDisplayName(user.id) : null,
  };
}

/** تصنيف، بوابة الحساسية، وخطة المراجعة قبل حفظ اللوحة. */
export async function prepareDashboardArticleSave(input: {
  articleId: string;
  existing: { status?: string | null; riskLabel?: string | null };
  updateData: Record<string, unknown>;
  userId: string;
  user: { role?: string | null; roles?: string[] | null };
  permissions: string[];
  body: { updateReason?: unknown; sensitiveOverride?: unknown; overrideReason?: unknown } | null | undefined;
}): Promise<PublishFirstDenial | { revisionPlan: RevisionPlan | null }> {
  if (typeof input.updateData.categoryId === "string" && input.updateData.categoryId) {
    const category = await findAssignableCategory(input.updateData.categoryId);
    if (!category) {
      return {
        status: 422,
        body: { message: "التصنيف غير موجود أو غير متاح للنشر", code: "category_not_found", field: "categoryId" },
      };
    }
  }
  const updateReason = typeof input.body?.updateReason === "string" ? input.body.updateReason : null;
  const adminOverride = adminOverrideRequested(input.body, input.user, input.permissions);
  const resultingRisk = input.updateData.riskLabel !== undefined ? input.updateData.riskLabel : input.existing.riskLabel;
  const nextStatus = (input.updateData.status as string | undefined) ?? input.existing.status;
  const publishing = nextStatus === "published" && input.existing.status !== "published";
  const scheduling = nextStatus === "scheduled" && input.existing.status !== "scheduled";
  const revisionPlan = await maybePlanPublishedRevision({
    existingStatus: input.existing.status,
    existing: input.existing,
    patch: input.updateData,
    updateReason,
  });
  const overrideReason = typeof input.body?.overrideReason === "string" ? input.body.overrideReason : null;
  const logOverride = async (action: "publish" | "correct") => {
    await recordPublishOverride({
      articleId: input.articleId,
      actorUserId: input.userId,
      actorName: await editorDisplayName(input.userId),
      action,
      reason: overrideReason,
    });
  };
  if (publishing || scheduling) {
    const gate = await sensitiveGateForArticle({
      articleId: input.articleId,
      riskLabel: typeof resultingRisk === "string" ? resultingRisk : null,
      action: "publish",
      adminOverride,
    });
    if (!gate.allow) return publishFirstDenial(gate);
    if (gate.override) await logOverride("publish");
  } else if (revisionPlan?.contentChanged) {
    const gate = await sensitiveGateForArticle({
      articleId: input.articleId,
      riskLabel: typeof resultingRisk === "string" ? resultingRisk : null,
      action: "correct",
      adminOverride,
    });
    if (!gate.allow) return publishFirstDenial(gate);
    if (gate.override) await logOverride("correct");
  }
  if (revisionPlan) input.updateData.correctedAt = revisionPlan.correctedAt;
  return { revisionPlan };
}

/** نشر مباشر من POST /publish. المادة المنشورة مسبقاً لا تُعاد بوابة. */
export async function guardDirectArticlePublish(input: {
  article: { status?: string | null; riskLabel?: string | null };
  articleId: string;
  userId: string;
  user: { role?: string | null; roles?: string[] | null };
  permissions: string[];
  body: { sensitiveOverride?: unknown; overrideReason?: unknown } | null | undefined;
}): Promise<PublishFirstDenial | null> {
  if (input.article.status === "published") return null;
  const adminOverride = adminOverrideRequested(input.body, input.user, input.permissions);
  const gate = await sensitiveGateForArticle({
    articleId: input.articleId,
    riskLabel: input.article.riskLabel,
    action: "publish",
    adminOverride,
  });
  if (!gate.allow) return publishFirstDenial(gate);
  if (gate.override) {
    await recordPublishOverride({
      articleId: input.articleId,
      actorUserId: input.userId,
      actorName: await editorDisplayName(input.userId),
      action: "publish",
      reason: typeof input.body?.overrideReason === "string" ? input.body.overrideReason : null,
    });
  }
  return null;
}

export async function attachPublishedUpdateLines<T extends { id?: string; status?: string | null }>(article: T): Promise<T> {
  if (article?.id && article.status === "published") {
    (article as T & { updateLines?: PublicUpdateLine[] }).updateLines = await listPublicUpdateLines(article.id);
  }
  return article;
}
