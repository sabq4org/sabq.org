import { eq, sql } from "drizzle-orm";
import { articleVersions, articles, categories, enArticles, enCategories } from "@shared/schema";
import { changedSnapshotFields, snapshotFromArticle } from "@shared/articleHistory";
import { nashrConcurrencySchema, nashrPublishSchema, nashrScheduleSchema } from "@shared/botEditorLifecycle";
import { parseBotDraftPublishAt } from "@shared/botDrafts";
import { db } from "../db";
import { memoryCache } from "../memoryCache";
import { generateEnglishSlug } from "../utils/slugTransliterator";
import { assertBotEditorUnlocked } from "./botEditorLocks";
import { recordBotEditorAudit } from "./botEditorAudit";
import { assertEditorCapability, assertNotProtected } from "./botEditorCapabilityGuard";
import { chargePublishInTx, publisherHasUsableCredit, PUBLISHER_NO_CREDITS_MESSAGE } from "./publisherCreditService";
import type { NashrEditorCapability } from "@shared/botEditorCapabilities";
import { demoteOtherBreaking } from "./botEditorWritesBreaking";
import {
  BotDraftError,
  buildBotDraftPublishUpdate,
  buildBotDraftRescheduleUpdate,
  buildBotDraftScheduleUpdate,
  buildBotDraftUnscheduleUpdate,
  toBotDraftResponse,
} from "./botDraftsService";
import { toEnBotDraftResponse } from "./enBotDraftsService";
import { invalidateArticleWrite } from "./contentInvalidation";
import { queueBotDraftPublishEffects, queueBotDraftScheduleEffects } from "./botDraftPublishEffects";
import { queueEnBotDraftSurfaceEffects } from "./enBotDraftPublishEffects";

type Language = "ar" | "en";
type Action = "publish" | "schedule" | "reschedule" | "unschedule" | "ready" | "revert-to-draft" | "resurface" | "request-revision" | "translate";
const ACTOR = "nashr-sabq";
const LEGACY_PUBLISH_KEYS = new Set(["operationId", "sensitiveOverride", "overrideReason"]);

/** Old bot-draft bodies stay on the source=bot path, including operation receipts. */
export function isLegacyLifecycleBody(action: string, body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return action !== "schedule" && action !== "reschedule";
  const keys = Object.keys(body);
  if (action === "publish") return keys.every((key) => LEGACY_PUBLISH_KEYS.has(key));
  if (action === "schedule" || action === "reschedule") return keys.length === 1 && keys[0] === "publishAt";
  return keys.length === 0;
}

export async function nashrArticleScope(language: Language, id: string): Promise<"bot" | "other" | "missing"> {
  if (language === "ar") {
    const [row] = await db.select({ source: articles.source }).from(articles).where(eq(articles.id, id)).limit(1);
    if (!row) return "missing";
    return row.source === "bot" ? "bot" : "other";
  }
  const [row] = await db.select({
    source: sql<string | null>`${enArticles.seoMetadata}->>'source'`.as("source"),
  }).from(enArticles).where(eq(enArticles.id, id)).limit(1);
  if (!row) return "missing";
  return row.source === "bot" ? "bot" : "other";
}
const EDITABLE = new Set(["draft", "ready_to_publish", "scheduled", "published"]);

export const NASHR_ACTION_CAPABILITY: Record<Action, NashrEditorCapability> = {
  publish: "article.publish",
  schedule: "article.schedule",
  reschedule: "article.schedule",
  unschedule: "article.schedule",
  ready: "article.ready",
  "revert-to-draft": "article.revision",
  resurface: "article.revision",
  "request-revision": "article.revision",
  translate: "article.translate",
};

function noCreditsError() {
  return new BotDraftError(403, "forbidden_action", PUBLISHER_NO_CREDITS_MESSAGE, { reason: "no_credits" });
}

function parseBody(action: Action, body: unknown) {
  const schema = action === "schedule" || action === "reschedule" ? nashrScheduleSchema : action === "publish" ? nashrPublishSchema : nashrConcurrencySchema;
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new BotDraftError(422, "validation_error", "updateReason و expectedUpdatedAt مطلوبان", result.error.flatten());
  return result.data;
}

function refuse(status: string, allowed: string[], code: "not_a_draft" | "not_published" | "not_scheduled" | "not_archived", message: string): never {
  throw new BotDraftError(409, code, message, { status, allowed });
}

function statusPatch(action: Action, before: any, input: { publishAt?: string }, now: Date) {
  if (action === "publish") {
    if (!["draft", "ready_to_publish", "scheduled"].includes(before.status)) {
      if (before.status === "published") refuse(before.status, ["draft", "ready_to_publish", "scheduled"], "not_a_draft", "الخبر منشور بالفعل");
      if (before.status === "archived") refuse(before.status, ["draft", "ready_to_publish", "scheduled"], "not_archived", "استعد المادة قبل النشر");
      refuse(before.status, ["draft", "ready_to_publish", "scheduled"], "not_a_draft", "حالة المادة لا تسمح بالنشر");
    }
    return buildBotDraftPublishUpdate(now, before.publishedAt);
  }
  if (action === "schedule") {
    if (!["draft", "ready_to_publish"].includes(before.status)) {
      refuse(before.status, ["draft", "ready_to_publish"], before.status === "scheduled" ? "not_scheduled" : "not_a_draft", before.status === "scheduled" ? "المادة مجدولة؛ غيّر الموعد عبر PATCH" : "حالة المادة لا تسمح بالجدولة");
    }
    const when = parseBotDraftPublishAt(input.publishAt ?? "");
    if (!when.ok) throw new BotDraftError(422, "validation_error", when.message, when.details);
    return buildBotDraftScheduleUpdate(when.publishAt, now);
  }
  if (action === "reschedule") {
    if (before.status !== "scheduled") refuse(before.status, ["scheduled"], "not_scheduled", "تغيير الموعد يتطلب مادة مجدولة");
    const when = parseBotDraftPublishAt(input.publishAt ?? "");
    if (!when.ok) throw new BotDraftError(422, "validation_error", when.message, when.details);
    return buildBotDraftRescheduleUpdate(when.publishAt, now);
  }
  if (action === "unschedule") {
    if (before.status !== "scheduled") refuse(before.status, ["scheduled"], "not_scheduled", "إلغاء الجدولة يتطلب مادة مجدولة");
    return buildBotDraftUnscheduleUpdate(now);
  }
  if (action === "ready") {
    if (before.status !== "draft") refuse(before.status, ["draft"], "not_a_draft", "تعليم الجاهزية يبدأ من مسودة");
    return { status: "ready_to_publish" as const, publishType: "instant" as const, updatedAt: now };
  }
  if (action === "revert-to-draft") {
    if (before.status !== "ready_to_publish") refuse(before.status, ["ready_to_publish"], "not_a_draft", "الإرجاع إلى مسودة من الجاهزية فقط؛ المنشور يُسحب والمجدول تُلغى جدولته");
    return { status: "draft" as const, publishType: "instant" as const, reviewStatus: null, updatedAt: now };
  }
  if (action === "resurface") {
    if (before.status !== "published") refuse(before.status, ["published"], "not_published", "الإنعاش لخبر منشور فقط");
    return { resurfacedAt: now, updatedAt: now };
  }
  if (before.status === "archived") refuse(before.status, ["draft", "ready_to_publish", "scheduled", "published"], "not_archived", "استعد المادة قبل طلب التعديل");
  return { status: "draft" as const, reviewStatus: "needs_changes", reviewNotes: "", reviewedAt: now, updatedAt: now };
}

async function respond(language: Language, row: any) {
  const table = language === "ar" ? categories : enCategories;
  const [category] = row.categoryId ? await db.select({ slug: table.slug }).from(table).where(eq(table.id, row.categoryId)).limit(1) : [];
  const response = language === "ar" ? toBotDraftResponse(row, category?.slug ?? null) : toEnBotDraftResponse(row, category?.slug ?? null);
  return { ...response, updatable: EDITABLE.has(row.status) };
}

async function writeArabicHistory(tx: any, before: any, after: any, operation: string, reason: string) {
  const beforeSnapshot = snapshotFromArticle(before);
  const afterSnapshot = snapshotFromArticle(after);
  const [maxRow] = await tx.select({
    maxVersion: sql<number>`coalesce(max(${articleVersions.versionNumber}), 0)`.as("max_version"),
  }).from(articleVersions).where(eq(articleVersions.articleId, after.id));
  let next = Number(maxRow?.maxVersion ?? 0);
  const insert = async (snapshot: object, action: string, changed: string[], createdAt?: Date) => {
    next += 1;
    await tx.insert(articleVersions).values({
      articleId: after.id, versionNumber: next, action, actorId: null, snapshot, changedFields: changed, reason,
      ...(createdAt ? { createdAt } : {}),
    });
  };
  if (next === 0) await insert(beforeSnapshot, "baseline", [], before.updatedAt ?? undefined);
  const versionAction = operation === "published" ? "published" : "updated";
  await insert(afterSnapshot, versionAction, changedSnapshotFields(beforeSnapshot, afterSnapshot));
  await recordBotEditorAudit(tx, { language: "ar", articleId: after.id, actorId: null, operation, originalSource: before.source, before, after, updateReason: reason, actorName: ACTOR });
}

async function translate(id: string, body: unknown) {
  const input = parseBody("translate", body);
  const before = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(articles).where(eq(articles.id, id)).limit(1).for("update");
    if (!row) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
    if (row.articleType !== "news" && row.articleType !== "infographic") throw new BotDraftError(403, "forbidden_action", "نوع المادة غير مدعوم");
    if (row.updatedAt?.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new BotDraftError(409, "draft_changed", "تغيّرت المادة — أعد القراءة ثم أعد المحاولة");
    if (row.status !== "published") throw new BotDraftError(409, "not_published", "يجب أن يكون الخبر منشوراً قبل الترجمة");
    await assertBotEditorUnlocked(tx, "ar", id, row);
    if (!row.authorId) throw new BotDraftError(422, "author_not_configured", "الخبر بلا كاتب، ولا يمكن إسناد الترجمة");
    return row;
  });
  const { translateArticleToEnglish, EnTranslationError } = await import("./enArticleTranslationService");
  try {
    const created = await translateArticleToEnglish({ articleId: id, actorUserId: before.authorId!, status: "published", trigger: "manual" });
    await db.transaction(async (tx) => {
      await recordBotEditorAudit(tx, { language: "ar", articleId: id, actorId: null, operation: "translated", originalSource: before.source, before, after: before, updateReason: input.updateReason, actorName: ACTOR });
    });
    return { articleId: id, englishArticleId: created.enArticle.id, status: created.enArticle.status };
  } catch (error) {
    if (error instanceof EnTranslationError) {
      const mapped = error.code === "NOT_FOUND" ? [404, "not_found"] : error.code === "NOT_PUBLISHED" ? [409, "not_published"] : error.code === "ALREADY_TRANSLATED" ? [409, "source_article_already_linked"] : [422, "generation_failed"];
      throw new BotDraftError(mapped[0] as number, mapped[1] as "not_found", error.message);
    }
    throw error;
  }
}

/** Editorial lifecycle for the non-personal nashr-sabq identity. Any news source, valid statuses only. */
export async function runNashrAction(language: Language, action: Action, id: string, body: unknown) {
  assertEditorCapability(NASHR_ACTION_CAPABILITY[action]);
  assertNotProtected(id);
  if (action === "translate") {
    if (language !== "ar") throw new BotDraftError(422, "forbidden_action", "الترجمة من العربي إلى الإنجليزي فقط");
    return translate(id, body);
  }
  const input = parseBody(action, body);
  const table: any = language === "ar" ? articles : enArticles;
  const now = new Date();
  let cleared: any[] = [];
  let clearedEnglish: any[] = [];
  const after = await db.transaction(async (tx) => {
    const [preview] = await tx.select({ newsType: table.newsType }).from(table).where(eq(table.id, id)).limit(1);
    if (action === "publish" && preview?.newsType === "breaking") await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sabq-bot-editor-breaking'))`);
    const [before] = await tx.select().from(table).where(eq(table.id, id)).limit(1).for("update");
    if (!before) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
    if (before.articleType !== "news" && before.articleType !== "infographic") throw new BotDraftError(403, "forbidden_action", "نوع المادة غير مدعوم");
    if (before.updatedAt?.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new BotDraftError(409, "draft_changed", "تغيّرت المادة — أعد القراءة ثم أعد المحاولة");
    await assertBotEditorUnlocked(tx, language, id, before);
    const publishAt = "publishAt" in input && typeof input.publishAt === "string" ? input.publishAt : undefined;
    const patch: any = statusPatch(action, before, { publishAt }, now);
    // خبر ناشر/وكالة: نفس بوابة الرصيد في اللوحة وفي مسار البوت. الجدولة تفحص فقط، والخصم عند النشر.
    if (language === "ar" && (action === "schedule" || action === "reschedule") && (before as any).publisherId) {
      if (!await publisherHasUsableCredit((before as any).publisherId, tx)) throw noCreditsError();
    }
    if (action === "request-revision") patch.reviewNotes = input.updateReason;
    if (action === "resurface" && language === "en") patch.displayOrder = Math.floor(now.getTime() / 1000);
    if (language === "en" && !before.englishSlug && (action === "publish" || action === "schedule")) patch.englishSlug = generateEnglishSlug(before.title);
    if (action === "publish" || action === "schedule") {
      const { denyBannedWords } = await import("./publishBannedWordsService");
      const banned = await denyBannedWords({ userId: null, nextStatus: patch.status, content: { ...before, ...patch }, previous: before, articleId: language === "ar" ? id : null, actorLabel: ACTOR, surface: "bot" });
      if (banned) throw new BotDraftError(403, "forbidden_action", banned.message, { reason: "banned_word", bannedWords: banned.bannedWords });
    }
    const [saved] = await tx.update(table).set(patch).where(eq(table.id, id)).returning();
    if (!saved || saved.source !== undefined && language === "ar" && saved.source !== before.source) {
      throw new BotDraftError(409, "draft_changed", "تغيّرت المادة — أعد القراءة ثم أعد المحاولة");
    }
    if (language === "ar" && action === "publish" && (saved as any).publisherId) {
      const charge = await chargePublishInTx(tx, { publisherId: (saved as any).publisherId, articleId: id, performedBy: null, note: String((saved as any).title ?? "") });
      if (charge === "no_credits") throw noCreditsError();
    }
    if (action === "publish" && before.newsType === "breaking") {
      const demoted = await demoteOtherBreaking(tx, language, id, input.updateReason, ACTOR);
      cleared = demoted.cleared;
      clearedEnglish = demoted.english;
    }
    const operation = action === "publish" ? "published" : action;
    if (language === "ar") await writeArabicHistory(tx, before, saved, operation, input.updateReason);
    else await recordBotEditorAudit(tx, { language, articleId: id, actorId: null, operation, originalSource: before.seoMetadata?.source ?? null, before, after: saved, updateReason: input.updateReason, actorName: ACTOR });
    return saved;
  });
  if (action === "request-revision") {
    const { notifyArticleStakeholders } = await import("./editorialNotifications");
    await notifyArticleStakeholders(after as any, "needs_revision", input.updateReason).catch((error) => console.error("[BotEditor] revision notify failed", error));
  }
  if (language === "ar") {
    if (action === "publish") queueBotDraftPublishEffects(after as any, ACTOR, { actorName: ACTOR });
    else if (action === "schedule" || action === "reschedule") queueBotDraftScheduleEffects(after as any, ACTOR, { actorName: ACTOR });
    else invalidateArticleWrite(after, { reason: `nashr:${action}`, warm: false });
    if (cleared.length) {
      const { invalidateClearedBreakingArticles } = await import("./breakingNewsService");
      invalidateClearedBreakingArticles(cleared, `nashr:${action}`);
    }
    for (const item of clearedEnglish) queueEnBotDraftSurfaceEffects(item, "visibility");
  } else if (action === "publish") queueEnBotDraftSurfaceEffects(after as any, "publish");
  else if (action === "resurface") queueEnBotDraftSurfaceEffects(after as any, "update");
  else if (action === "request-revision") queueEnBotDraftSurfaceEffects(after as any, "archive");
  else memoryCache.invalidatePattern("^articles:");
  return respond(language, after);
}
