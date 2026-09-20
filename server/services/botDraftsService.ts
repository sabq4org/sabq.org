// ----------------------------------------------------------------------------
// خدمة «مسودات البوتات» — Bot Drafts (ADR-001: كل استعلامات Drizzle هنا)
//
// تُنشئ وتحدّث وتقرأ مسودات عربية فقط لصالح بوت «نشر سبق» ومهندّس (Grok Bot).
// الحالة ثابتة `draft`؛ لا نشر ولا جدولة ولا تغيير إسناد من هذا المسار مطلقاً.
// المصادقة: توكن Bearer لكل بوت من BOT_DRAFTS_API_TOKENS (name:token,…).
// التوثيق: docs/systems/editorial/BOT_DRAFTS_API.md
// ----------------------------------------------------------------------------

import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { articleEditLocks, articles, categories, users } from "@shared/schema";
import { SABQ_NEWSPAPER_ACCOUNT_ID } from "@shared/sabqNewspaper";
import {
  BOT_DRAFT_SOURCE,
  BOT_DRAFT_STATUS,
  type BotDraftCreateInput,
  type BotDraftErrorCode,
  type BotDraftResponse,
  type BotDraftUpdateInput,
} from "@shared/botDrafts";
import { resolveUniqueArticleSlug } from "./articleSlugService";
import { logArticleEvent } from "./articleEventsService";
import { generateEnglishSlug } from "../utils/slugTransliterator";
import { sanitizeArticleHtml } from "../utils/sanitizeArticleHtml";
import { logActivity } from "../rbac";
import { memoryCache } from "../memoryCache";

// ────────────────────────────────────────────────────────────────────
// أخطاء العقد
// ────────────────────────────────────────────────────────────────────

export class BotDraftError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: BotDraftErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "BotDraftError";
  }
}

// ────────────────────────────────────────────────────────────────────
// التوكنات — BOT_DRAFTS_API_TOKENS="nashr-sabq:<secret>,grok-bot:<secret>"
// ────────────────────────────────────────────────────────────────────

export interface BotIdentity {
  /** اسم البوت كما في متغير البيئة — يُسجَّل في sourceMetadata وسجل الأحداث. */
  name: string;
}

interface BotTokenEntry extends BotIdentity {
  tokenHash: Buffer;
}

const BOT_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const MIN_TOKEN_LENGTH = 32;

let cachedRaw: string | undefined;
let cachedEntries: BotTokenEntry[] = [];

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/**
 * يحلّل BOT_DRAFTS_API_TOKENS إلى قائمة (اسم، تجزئة توكن). المدخلات غير الصالحة
 * تُتجاهل مع تحذير واحد لكل تغيير في قيمة المتغير — لا تُطبع قيم التوكنات أبداً.
 */
export function parseBotDraftTokens(raw: string | undefined = process.env.BOT_DRAFTS_API_TOKENS): BotIdentity[] {
  return loadEntries(raw).map((entry) => ({ name: entry.name }));
}

function loadEntries(raw: string | undefined): BotTokenEntry[] {
  if (raw === cachedRaw) return cachedEntries;
  const entries: BotTokenEntry[] = [];
  const seen = new Set<string>();
  for (const chunk of (raw ?? "").split(",")) {
    const item = chunk.trim();
    if (!item) continue;
    const separator = item.indexOf(":");
    if (separator <= 0) {
      console.warn("[BotDrafts] ignoring BOT_DRAFTS_API_TOKENS entry without name:token form");
      continue;
    }
    const name = item.slice(0, separator).trim().toLowerCase();
    const token = item.slice(separator + 1).trim();
    if (!BOT_NAME_RE.test(name)) {
      console.warn("[BotDrafts] ignoring BOT_DRAFTS_API_TOKENS entry with invalid bot name");
      continue;
    }
    if (token.length < MIN_TOKEN_LENGTH) {
      console.warn(`[BotDrafts] ignoring token for "${name}": shorter than ${MIN_TOKEN_LENGTH} chars`);
      continue;
    }
    if (seen.has(name)) {
      console.warn(`[BotDrafts] duplicate bot name "${name}" in BOT_DRAFTS_API_TOKENS — first entry wins`);
      continue;
    }
    seen.add(name);
    entries.push({ name, tokenHash: sha256(token) });
  }
  cachedRaw = raw;
  cachedEntries = entries;
  return entries;
}

export function isBotDraftsConfigured(): boolean {
  return loadEntries(process.env.BOT_DRAFTS_API_TOKENS).length > 0;
}

/**
 * يتحقق من ترويسة Authorization: Bearer <token> ويعيد هوية البوت أو null.
 * المقارنة ثابتة الزمن على تجزئة SHA-256 (أطوال متساوية دائماً)، وتفحص كل
 * المدخلات دون خروج مبكر حتى لا يكشف التوقيت أي البوتات طابق.
 */
export function authenticateBotToken(authorizationHeader: string | undefined): BotIdentity | null {
  if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const provided = match[1].trim();
  if (provided.length < MIN_TOKEN_LENGTH) return null;
  const providedHash = sha256(provided);
  let matched: BotIdentity | null = null;
  for (const entry of loadEntries(process.env.BOT_DRAFTS_API_TOKENS)) {
    if (crypto.timingSafeEqual(providedHash, entry.tokenHash) && !matched) {
      matched = { name: entry.name };
    }
  }
  return matched;
}

// ────────────────────────────────────────────────────────────────────
// مساعدات نقية (قابلة للاختبار بلا قاعدة)
// ────────────────────────────────────────────────────────────────────

/** نفس منطق `client/src/lib/slug.ts` في لوحة التحكم — يحافظ على العربية. */
export function generateArabicSlug(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[^؀-ۿa-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 150);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

/**
 * يحوّل النص الخام إلى فقرات <p> (فاصل الفقرة سطر فارغ)، ويمرر HTML كما هو بعد
 * التنقية القياسية للمحرر (`sanitizeArticleHtml`). `format` يفرض التفسير، وإلا
 * يُكتشف تلقائياً من وجود وسوم.
 */
export function normalizeDraftContent(content: string, format?: "html" | "text"): string {
  const trimmed = (content ?? "").trim();
  const isHtml = format ? format === "html" : HTML_TAG_RE.test(trimmed);
  if (isHtml) return sanitizeArticleHtml(trimmed);
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`);
  return paragraphs.join("\n");
}

function dashboardBaseUrl(): string {
  return (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "https://sabq.org").replace(/\/+$/, "");
}

export function botDraftEditUrl(articleId: string): string {
  return `${dashboardBaseUrl()}/dashboard/articles/${articleId}/edit`;
}

export function botDraftPreviewUrl(articleId: string): string {
  return `${dashboardBaseUrl()}/dashboard/articles/${articleId}/preview`;
}

type ArticleRow = typeof articles.$inferSelect;

export function toBotDraftResponse(row: ArticleRow, categorySlug: string | null = null): BotDraftResponse {
  const meta = (row.sourceMetadata ?? {}) as NonNullable<ArticleRow["sourceMetadata"]>;
  return {
    id: row.id,
    status: row.status,
    updatable: row.status === BOT_DRAFT_STATUS,
    title: row.title,
    subtitle: row.subtitle ?? null,
    slug: row.slug,
    excerpt: row.excerpt ?? null,
    categoryId: row.categoryId ?? null,
    categorySlug,
    imageUrl: row.imageUrl ?? null,
    sourceUrl: row.sourceUrl ?? null,
    keywords: Array.isArray(row.seo?.keywords) ? row.seo!.keywords! : [],
    source: row.source,
    bot: meta.bot ?? null,
    clientReference: meta.clientReference ?? null,
    notes: meta.notes ?? null,
    editUrl: botDraftEditUrl(row.id),
    previewUrl: botDraftPreviewUrl(row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────
// استعلامات مساعدة
// ────────────────────────────────────────────────────────────────────

/**
 * تصنيفات قابلة للإسناد لمسودة بوت.
 * الإنتاج يستخدم `visible` (GET /api/categories، الموبايل، edge SEO).
 * `active` قيمة تاريخية في الـ enum وليست منشورة للعامة، لكن نقبلها حتى لا
 * تُرفض تصنيفات قديمة إن وُجدت. `inactive` تُرفض.
 */
export function isAssignableBotCategoryStatus(status: string | null | undefined): boolean {
  return status === "visible" || status === "active";
}

async function resolveCategory(input: { categoryId?: string; categorySlug?: string }): Promise<{ id: string; slug: string } | null> {
  if (!input.categoryId && !input.categorySlug) return null;
  const condition = input.categoryId
    ? eq(categories.id, input.categoryId)
    : eq(categories.slug, input.categorySlug!);
  const [row] = await db
    .select({ id: categories.id, slug: categories.slug, status: categories.status })
    .from(categories)
    .where(condition)
    .limit(1);
  if (!row || !isAssignableBotCategoryStatus(row.status)) {
    throw new BotDraftError(422, "category_not_found", "التصنيف غير موجود أو غير نشط", {
      categoryId: input.categoryId ?? null,
      categorySlug: input.categorySlug ?? null,
    });
  }
  return { id: row.id, slug: row.slug };
}

async function categorySlugFor(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const [row] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  return row?.slug ?? null;
}

/**
 * الحساب الذي تُسند إليه مسودات البوت (authorId إلزامي في الجدول). الافتراضي
 * حساب «صحيفة سبق» — نفس إسناد وكلاء البريد/الواتساب. يمكن تبديله عبر
 * BOT_DRAFTS_AUTHOR_USER_ID لحساب خدمة مخصص.
 */
export async function resolveBotAuthorId(): Promise<string> {
  const configured = (process.env.BOT_DRAFTS_AUTHOR_USER_ID || "").trim() || SABQ_NEWSPAPER_ACCOUNT_ID;
  const [row] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, configured)).limit(1);
  if (!row || row.status !== "active") {
    throw new BotDraftError(503, "author_not_configured", "حساب إسناد مسودات البوت غير موجود أو غير نشط");
  }
  return row.id;
}

async function findBotArticle(articleId: string): Promise<ArticleRow | null> {
  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.source, BOT_DRAFT_SOURCE)))
    .limit(1);
  return row ?? null;
}

async function findActiveEditLock(articleId: string): Promise<{ userName: string; expiresAt: Date } | null> {
  const [lock] = await db
    .select({ userName: articleEditLocks.userName, expiresAt: articleEditLocks.expiresAt })
    .from(articleEditLocks)
    .where(and(eq(articleEditLocks.articleId, articleId), gt(articleEditLocks.expiresAt, new Date())))
    .limit(1);
  return lock ?? null;
}

function invalidateAdminListCaches(): void {
  // نفس ما يفعله POST /api/admin/articles للمسودات: قوائم اللوحة فقط،
  // بلا purge للـ CDN لأن المسودة لا تصل للقرّاء.
  memoryCache.invalidatePattern("^articles:");
  memoryCache.invalidatePattern("^article:id:");
  memoryCache.invalidatePattern("^article:detail:");
}

export interface BotRequestContext {
  ip?: string;
  userAgent?: string;
}

// ────────────────────────────────────────────────────────────────────
// العمليات
// ────────────────────────────────────────────────────────────────────

export async function createBotDraft(
  bot: BotIdentity,
  input: BotDraftCreateInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const authorId = await resolveBotAuthorId();
  const category = await resolveCategory(input);
  const slug = await resolveUniqueArticleSlug(generateArabicSlug(input.title) || `bot-${Date.now()}`);
  const now = new Date();

  const [row] = await db
    .insert(articles)
    .values({
      title: input.title,
      subtitle: input.subtitle ?? null,
      slug,
      englishSlug: generateEnglishSlug(input.title),
      content: normalizeDraftContent(input.content, input.contentFormat),
      excerpt: input.excerpt ?? null,
      imageUrl: input.imageUrl ?? null,
      categoryId: category?.id ?? null,
      authorId,
      articleType: "news",
      newsType: "regular",
      publishType: "instant",
      status: BOT_DRAFT_STATUS,
      reviewStatus: null,
      scheduledAt: null,
      publishedAt: null,
      source: BOT_DRAFT_SOURCE,
      sourceUrl: input.sourceUrl ?? null,
      sourceMetadata: {
        type: "bot",
        bot: bot.name,
        clientReference: input.clientReference,
        notes: input.notes ?? undefined,
        receivedAt: now.toISOString(),
      },
      seo: input.keywords?.length ? { keywords: input.keywords } : undefined,
      displayOrder: Math.floor(now.getTime() / 1000),
    })
    .returning();

  invalidateAdminListCaches();
  await recordEvent(row.id, authorId, "created", `أنشأ البوت «${bot.name}» مسودة`, bot, input.clientReference, ctx, row);
  console.log(`[BotDrafts] created draft ${row.id} by bot=${bot.name}`);
  return toBotDraftResponse(row, category?.slug ?? null);
}

export async function getBotDraft(articleId: string): Promise<BotDraftResponse | null> {
  const row = await findBotArticle(articleId);
  if (!row) return null;
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

export async function updateBotDraft(
  bot: BotIdentity,
  articleId: string,
  input: BotDraftUpdateInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const existing = await findBotArticle(articleId);
  if (!existing) {
    throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  }
  if (existing.status !== BOT_DRAFT_STATUS) {
    throw new BotDraftError(409, "not_a_draft", "المادة لم تعد مسودة ولا يمكن للبوت تعديلها", {
      status: existing.status,
    });
  }
  const lock = await findActiveEditLock(articleId);
  if (lock) {
    throw new BotDraftError(409, "locked_by_editor", "محرر يعمل على المسودة الآن — أعد المحاولة لاحقاً", {
      editor: lock.userName,
      lockExpiresAt: lock.expiresAt.toISOString(),
    });
  }

  const category = await resolveCategory(input);
  const patch: Partial<typeof articles.$inferInsert> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
  if (input.content !== undefined) patch.content = normalizeDraftContent(input.content, input.contentFormat);
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt;
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
  if (category) patch.categoryId = category.id;
  if (input.keywords !== undefined) {
    patch.seo = { ...(existing.seo ?? {}), keywords: input.keywords };
  }
  if (input.clientReference !== undefined || input.notes !== undefined) {
    patch.sourceMetadata = {
      ...(existing.sourceMetadata ?? { type: "bot" }),
      type: "bot",
      ...(input.clientReference !== undefined ? { clientReference: input.clientReference } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? undefined } : {}),
    };
  }

  // الحالة والإسناد لا يُلمسان هنا مطلقاً — حتى لو تسرّبت من مكان ما.
  delete (patch as Record<string, unknown>).status;
  delete (patch as Record<string, unknown>).authorId;

  const [row] = await db
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, articleId), eq(articles.status, BOT_DRAFT_STATUS), eq(articles.source, BOT_DRAFT_SOURCE)))
    .returning();
  if (!row) {
    // سباق: تغيّرت الحالة بين القراءة والكتابة
    throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء التحديث", { status: "unknown" });
  }

  invalidateAdminListCaches();
  const reference = input.clientReference ?? existing.sourceMetadata?.clientReference;
  await recordEvent(row.id, row.authorId, "updated", `حدّث البوت «${bot.name}» المسودة`, bot, reference, ctx, row, existing);
  console.log(`[BotDrafts] updated draft ${row.id} by bot=${bot.name} fields=${Object.keys(input).join(",")}`);
  return toBotDraftResponse(row, category?.slug ?? (await categorySlugFor(row.categoryId)));
}

async function recordEvent(
  articleId: string,
  actorId: string,
  action: "created" | "updated",
  summary: string,
  bot: BotIdentity,
  clientReference: string | undefined,
  ctx: BotRequestContext,
  newValue: ArticleRow,
  oldValue?: ArticleRow,
): Promise<void> {
  const metadata = { bot: bot.name, clientReference: clientReference ?? null, channel: "bot-drafts-api" };
  await Promise.all([
    logArticleEvent({ articleId, eventType: action, actorId, summary, metadata }).catch((error) =>
      console.error("[BotDrafts] article event log failed:", error),
    ),
    logActivity({
      userId: actorId,
      action,
      entityType: "article",
      entityId: articleId,
      oldValue: oldValue ? { title: oldValue.title, status: oldValue.status } : undefined,
      newValue: { title: newValue.title, status: newValue.status },
      metadata: { ...metadata, ip: ctx.ip, userAgent: ctx.userAgent },
    }).catch((error) => console.error("[BotDrafts] activity log failed:", error)),
  ]);
}
