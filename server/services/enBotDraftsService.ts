// مسودات بوت النسخة الإنجليزية — تكتب en_articles فقط.
// المسار العربي في botDraftsService لا يُستدعى من هنا إلا للمساعدات الصافية
// (تطبيع المتن، الإسناد، أخطاء العقد، حراس الحالة).

import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  BOT_DRAFT_SOURCE,
  BOT_DRAFT_STATUS,
  findDisallowedEnPublishedContentFields,
  type BotDraftExtra,
  type BotDraftPublishOperationResponse,
  type BotDraftRegenerateExtrasInput,
  type BotDraftRegenerateExtrasResponse,
  type BotDraftResponse,
  type BotDraftVisibilityInput,
  type EnBotDraftCreateInput,
  type EnBotDraftUpdateInput,
} from "@shared/botDrafts";
import { articles, botPublisherTokens, enArticlePublishOperations, enArticles, enCategories } from "@shared/schema";
import { SABQ_NEWSPAPER_ACCOUNT_ID } from "@shared/sabqNewspaper";
import { db } from "../db";
import { logActivity } from "../rbac";
import { memoryCache } from "../memoryCache";
import { resolveUniqueArticleSlug } from "./articleSlugService";
import { generateEnglishSlug } from "../utils/slugTransliterator";
import {
  BotDraftError,
  appendBotDraftBodyImages,
  assertPersonalCapability,
  attributionForBotDraftCreate,
  botDraftArchivedBlock,
  botDraftContentBlockedMessage,
  botDraftContentEditBlock,
  botDraftPublishBlockedMessage,
  botDraftPublishedBlock,
  botDraftReadyBlockedMessage,
  botDraftReleaseBlock,
  botDraftScheduledBlock,
  buildBotDraftArchiveUpdate,
  buildBotDraftPublishUpdate,
  buildBotDraftRescheduleUpdate,
  buildBotDraftRestoreUpdate,
  buildBotDraftScheduleUpdate,
  buildBotDraftSeoPatch,
  buildBotDraftUnscheduleUpdate,
  BOT_DRAFT_EXTRAS_MIN_CONTENT_CHARS,
  buildBotDraftVisibilityUpdate,
  buildRegeneratedExtrasInput,
  extractBodyImageUrls,
  isBotContentEditable,
  isPersonalBotNewspaperNews,
  normalizeBotDraftPublicId,
  normalizeDraftContent,
  reporterIdForBotDraftUpdate,
  resolveBotAuthorId,
  type BotDraftPublicIdLookup,
  type BotIdentity,
  type BotRequestContext,
  type GeneratedBotDraftExtras,
} from "./botDraftsService";
import { queueEnBotDraftSurfaceEffects } from "./enBotDraftPublishEffects";
import { clearOtherBreakingArticles, clearOtherEnBreakingArticles, isBreakingNewsType } from "./breakingNewsService";
import { getPublishFirstFlags, botDraftUploadIssue } from "./publishFirstService";
import { authenticatePublisherTokenId } from "./botPublisherTokenService";

export { normalizeBotDraftPublicId };

type EnRow = typeof enArticles.$inferSelect;
type EnSeo = NonNullable<EnRow["seoMetadata"]>;
type EnSeoFields = NonNullable<EnRow["seo"]>;
type ReceiptRow = typeof enArticlePublishOperations.$inferSelect;

const EN_CORE_CATEGORY = "core";

function siteBase(): string {
  return (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "https://sabq.org").replace(/\/+$/, "");
}

export function enBotDraftEditUrl(articleId: string): string {
  return `${siteBase()}/en/dashboard/articles/${articleId}/edit`;
}

/** لوحة الإنجليزية بلا صفحة معاينة منفصلة؛ رابط التحرير هو سطح المراجعة. */
export function enBotDraftPreviewUrl(articleId: string): string {
  return enBotDraftEditUrl(articleId);
}

export function enBotDraftPublicUrl(
  englishSlug: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  const canonical = (englishSlug || "").trim() || (slug || "").trim();
  if (!canonical) return null;
  return `${siteBase()}/en/article/${encodeURIComponent(canonical)}`;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readSeo(row: { seoMetadata?: EnSeo | null }): EnSeo {
  return { ...(row.seoMetadata ?? {}) };
}

function botSourceOf(row: { seoMetadata?: EnSeo | null }): string | null {
  return readSeo(row).source === BOT_DRAFT_SOURCE ? BOT_DRAFT_SOURCE : null;
}

function statusView(row: EnRow): { source: string | null; status: string } {
  return { source: botSourceOf(row), status: row.status };
}

export function englishSlugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return slug || generateEnglishSlug();
}

function enOwnership(bot?: BotIdentity): SQL | undefined {
  if (!bot?.personal) return undefined;
  const publisher = bot.personal.publisherId
    ? sql`${enArticles.seoMetadata}->>'publisherId' = ${bot.personal.publisherId}`
    : sql`(${enArticles.seoMetadata}->>'publisherId' IS NULL OR ${enArticles.seoMetadata}->>'publisherId' = '')`;
  return and(
    sql`${enArticles.seoMetadata}->>'publisherUserId' = ${bot.personal.userId}`,
    publisher,
  );
}

function mergeSeo(existing: EnSeo | null | undefined, patch: Partial<EnSeo>): EnSeo {
  const next: EnSeo = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(patch) as Array<[keyof EnSeo, EnSeo[keyof EnSeo]]>) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function toEnBotDraftResponse(
  row: EnRow,
  categorySlug: string | null = null,
  options: { includeContent?: boolean } = {},
): BotDraftResponse {
  const meta = readSeo(row);
  const source = botSourceOf(row);
  return {
    id: row.id,
    status: row.status,
    updatable: isBotContentEditable({ status: row.status, source }),
    title: row.title,
    ...(options.includeContent ? { content: row.content, contentFormat: "html" as const } : {}),
    subtitle: row.subtitle ?? null,
    slug: row.slug,
    excerpt: row.excerpt ?? null,
    seoTitle: row.seo?.metaTitle ?? null,
    seoDescription: row.seo?.metaDescription ?? null,
    categoryId: row.categoryId ?? null,
    categorySlug,
    imageUrl: row.imageUrl ?? null,
    articleType: row.articleType || "news",
    infographicBannerUrl: meta.infographicBannerUrl ?? null,
    bodyImageUrls: extractBodyImageUrls(row.content),
    sourceUrl: meta.sourceUrl ?? null,
    keywords: Array.isArray(row.seo?.keywords) ? row.seo.keywords : [],
    source: source ?? "",
    riskLabel: meta.riskLabel ?? null,
    draftCreatedAt: meta.draftCreatedAt ?? row.createdAt.toISOString(),
    correctedAt: meta.correctedAt ?? null,
    isFeatured: row.isFeatured === true,
    newsType: row.newsType || "regular",
    hideFromHomepage: row.hideFromHomepage === true,
    bot: meta.bot ?? null,
    clientReference: meta.clientReference ?? null,
    notes: [meta.notes, meta.scheduleFailure?.reason].filter(Boolean).join("\n") || null,
    editUrl: enBotDraftEditUrl(row.id),
    previewUrl: enBotDraftPreviewUrl(row.id),
    publicUrl: enBotDraftPublicUrl(row.englishSlug, row.slug),
    publishedAt: isoOrNull(row.publishedAt),
    scheduledAt: isoOrNull(row.scheduledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sourceArticleId: meta.sourceArticleId ?? null,
  };
}

async function categorySlugFor(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const [row] = await db.select({ slug: enCategories.slug }).from(enCategories).where(eq(enCategories.id, categoryId)).limit(1);
  return row?.slug ?? null;
}

function isAssignableEnCategory(row: { status: string; type: string | null }): boolean {
  return row.status === "active" && (!row.type || row.type === EN_CORE_CATEGORY);
}

async function listAssignableEnCategorySlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: enCategories.slug })
    .from(enCategories)
    .where(and(eq(enCategories.status, "active"), or(eq(enCategories.type, EN_CORE_CATEGORY), isNull(enCategories.type))))
    .orderBy(asc(enCategories.displayOrder), asc(enCategories.slug))
    .limit(40);
  return rows.map((row) => row.slug);
}

async function resolveEnCategory(input: { categoryId?: string; categorySlug?: string }): Promise<{ id: string; slug: string } | null> {
  if (!input.categoryId && !input.categorySlug) return null;
  const condition = input.categoryId ? eq(enCategories.id, input.categoryId) : eq(enCategories.slug, input.categorySlug!);
  const [row] = await db
    .select({ id: enCategories.id, slug: enCategories.slug, status: enCategories.status, type: enCategories.type })
    .from(enCategories)
    .where(condition)
    .limit(1);
  if (!row || !isAssignableEnCategory(row)) {
    const flags = await getPublishFirstFlags();
    const details: Record<string, unknown> = { categorySlug: input.categorySlug ?? row?.slug ?? null };
    if (flags.validation) {
      details.validSlugs = await listAssignableEnCategorySlugs();
      details.hint = "استخدم categorySlug من تصنيفات النسخة الإنجليزية النشطة (type=core) عبر GET /api/en/categories";
    }
    throw new BotDraftError(422, "category_not_found", "التصنيف غير موجود أو غير نشط في النسخة الإنجليزية", details);
  }
  return { id: row.id, slug: row.slug };
}

async function assertEnSubtitle(subtitle: string | null | undefined): Promise<void> {
  if (subtitle == null || subtitle === "") return;
  const issue = await botDraftUploadIssue({ subtitle, categoryResolved: true, categoryProvided: false });
  if (issue) throw new BotDraftError(issue.httpStatus, issue.code, issue.message, issue.details);
}

async function assertArabicSourceExists(sourceArticleId: string): Promise<void> {
  const [row] = await db.select({ id: articles.id }).from(articles).where(eq(articles.id, sourceArticleId)).limit(1);
  if (!row) {
    throw new BotDraftError(422, "source_article_not_found", "الخبر العربي الأصلي غير موجود", { sourceArticleId });
  }
}

async function assertSourceLinkFree(sourceArticleId: string, excludeEnId?: string): Promise<void> {
  const [linked] = await db
    .select({ id: enArticles.id })
    .from(enArticles)
    .where(sql`${enArticles.seoMetadata}->>'sourceArticleId' = ${sourceArticleId}`)
    .limit(1);
  if (linked && linked.id !== excludeEnId) {
    throw new BotDraftError(409, "source_article_already_linked", "هذا الخبر العربي مربوط بمادة إنجليزية أخرى", {
      sourceArticleId,
      enArticleId: linked.id,
    });
  }
}

async function lockSourceLink(tx: { execute: (query: SQL) => Promise<unknown> }, sourceArticleId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`en-bot:${sourceArticleId}`}))`);
}

async function slugIsFree(candidate: string): Promise<boolean> {
  const [hit] = await db
    .select({ id: enArticles.id })
    .from(enArticles)
    .where(or(eq(enArticles.slug, candidate), eq(enArticles.englishSlug, candidate)))
    .limit(1);
  return !hit;
}

async function pickEnSlug(title: string, sourceArticleId?: string | null): Promise<{ slug: string; englishSlug: string }> {
  if (sourceArticleId) {
    const [arabic] = await db
      .select({ englishSlug: articles.englishSlug })
      .from(articles)
      .where(eq(articles.id, sourceArticleId))
      .limit(1);
    const preferred = (arabic?.englishSlug || "").trim();
    if (preferred && (await slugIsFree(preferred))) {
      return { slug: preferred, englishSlug: preferred };
    }
  }
  let candidate = await resolveUniqueArticleSlug(englishSlugFromTitle(title), undefined, enArticles);
  for (let attempt = 0; attempt < 8 && !(await slugIsFree(candidate)); attempt += 1) {
    candidate = await resolveUniqueArticleSlug(`${englishSlugFromTitle(title)}-${generateEnglishSlug()}`, undefined, enArticles);
  }
  return { slug: candidate, englishSlug: candidate };
}

function createSeo(input: EnBotDraftCreateInput): EnSeoFields | undefined {
  const seo: EnSeoFields = {};
  if (input.keywords !== undefined) seo.keywords = input.keywords;
  if (input.seoTitle) seo.metaTitle = input.seoTitle;
  if (input.seoDescription) seo.metaDescription = input.seoDescription;
  return Object.keys(seo).length > 0 ? seo : undefined;
}

function provenance(bot: BotIdentity, input: EnBotDraftCreateInput, now: Date, sourceArticleId: string | null): EnSeo {
  return {
    source: "bot",
    trigger: "bot",
    bot: bot.name,
    clientReference: input.clientReference,
    notes: input.notes ?? undefined,
    sourceUrl: input.sourceUrl ?? undefined,
    sourceArticleId: sourceArticleId ?? undefined,
    riskLabel: input.riskLabel ?? undefined,
    infographicBannerUrl: input.infographicBannerUrl ?? undefined,
    draftCreatedAt: now.toISOString(),
    ...(bot.personal
      ? {
          publisherUserId: bot.personal.userId,
          publisherTokenId: bot.personal.tokenId,
          publisherOwnerUserId: bot.personal.publisherOwnerUserId,
          publisherId: bot.personal.publisherId ?? null,
        }
      : {}),
  };
}

async function findOwned(articleId: string, bot?: BotIdentity): Promise<EnRow | null> {
  const [row] = await db.select().from(enArticles).where(and(eq(enArticles.id, articleId), enOwnership(bot))).limit(1);
  return row ?? null;
}

function throwBlock(block: { httpStatus: number; code: BotDraftError["code"]; message: string; details?: unknown } | null, fallback = "المسودة غير موجودة"): void {
  if (!block) return;
  throw new BotDraftError(block.httpStatus, block.code, block.message || fallback, block.details);
}

async function logEn(
  row: EnRow,
  bot: BotIdentity,
  action: string,
  ctx: BotRequestContext,
  extra?: Record<string, unknown>,
): Promise<void> {
  const actor = bot.personal?.userId || row.authorId;
  await logActivity({
    userId: actor,
    action,
    entityType: "en_article",
    entityId: row.id,
    newValue: { title: row.title, status: row.status, ...extra },
    metadata: { ip: ctx.ip, userAgent: ctx.userAgent, channel: "bot-drafts-en", bot: bot.name },
  }).catch((error) => console.error("[EnBotDrafts] activity log failed:", error));
}

function sameVersion(actual: Date | string, expected: Date): boolean {
  return new Date(actual).getTime() === expected.getTime();
}

export async function createEnBotDraft(
  bot: BotIdentity,
  input: EnBotDraftCreateInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "create");
  await assertEnSubtitle(input.subtitle);
  const category = await resolveEnCategory(input);
  const { authorId, reporterId } = attributionForBotDraftCreate(await resolveBotAuthorId());
  const now = new Date();
  const sourceArticleId = input.sourceArticleId ?? null;
  if (sourceArticleId) await assertArabicSourceExists(sourceArticleId);

  const row = await db.transaction(async (tx) => {
    if (sourceArticleId) {
      await lockSourceLink(tx, sourceArticleId);
      await assertSourceLinkFree(sourceArticleId);
    }
    const slugs = await pickEnSlug(input.title, sourceArticleId);
    const excerpt = input.excerpt?.trim() || null;
    const [created] = await tx
      .insert(enArticles)
      .values({
        title: input.title,
        subtitle: input.subtitle ?? null,
        slug: slugs.slug,
        englishSlug: slugs.englishSlug,
        content: normalizeDraftContent(input.content, input.contentFormat, input.imageUrls),
        excerpt,
        ...(input.excerpt !== undefined ? { aiSummary: excerpt, smartSummary: excerpt } : {}),
        imageUrl: input.imageUrl ?? null,
        categoryId: category?.id ?? null,
        authorId,
        reporterId,
        articleType: input.infographic ? "infographic" : "news",
        newsType: "regular",
        publishType: "instant",
        status: BOT_DRAFT_STATUS,
        reviewStatus: null,
        scheduledAt: null,
        publishedAt: null,
        aiGenerated: false,
        seo: createSeo(input),
        seoMetadata: provenance(bot, input, now, sourceArticleId),
        displayOrder: Math.floor(now.getTime() / 1000),
      })
      .returning();
    return created;
  });

  memoryCache.invalidatePattern("^articles:");
  await logEn(row, bot, "created", ctx, { sourceArticleId });
  console.log(`[EnBotDrafts] created ${row.id} by bot=${bot.name}`);
  return toEnBotDraftResponse(row, category?.slug ?? null);
}

export async function getEnBotDraft(
  articleId: string,
  bot?: BotIdentity,
  options: { includeContent?: boolean } = {},
): Promise<BotDraftResponse | null> {
  if (bot) assertPersonalCapability(bot, "read");
  const row = await findOwned(articleId, bot);
  if (!row) return null;
  if (botSourceOf(row) !== BOT_DRAFT_SOURCE && row.status !== "published") return null;
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId), options);
}

export async function findPublishedEnArticleByPublicId(
  publicId: string,
  bot?: BotIdentity,
): Promise<BotDraftPublicIdLookup | null> {
  if (bot) assertPersonalCapability(bot, "read");
  const rows = await db
    .select()
    .from(enArticles)
    .where(and(
      eq(enArticles.status, "published"),
      or(eq(enArticles.englishSlug, publicId), eq(enArticles.slug, publicId)),
      enOwnership(bot),
    ))
    .orderBy(sql`CASE WHEN ${enArticles.englishSlug} = ${publicId} THEN 0 ELSE 1 END`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const source = botSourceOf(row);
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    slug: row.slug,
    englishSlug: row.englishSlug ?? null,
    source,
    categorySlug: await categorySlugFor(row.categoryId),
    publishedAt: isoOrNull(row.publishedAt),
    updatedAt: row.updatedAt.toISOString(),
    publicUrl: enBotDraftPublicUrl(row.englishSlug, row.slug),
    updatable: isBotContentEditable({ status: row.status, source }),
  };
}

function assertPublishedFields(row: EnRow, input: EnBotDraftUpdateInput): void {
  if (row.status !== "published") return;
  const extra = findDisallowedEnPublishedContentFields(input);
  if (extra.length > 0) {
    throw new BotDraftError(422, "forbidden_fields", "هذه الحقول ليست متاحة على الخبر الإنجليزي المنشور", { fields: extra });
  }
}

async function applySourceLink(row: EnRow, input: EnBotDraftUpdateInput, tx: { execute: (query: SQL) => Promise<unknown> }): Promise<string | null | undefined> {
  if (input.sourceArticleId === undefined) return undefined;
  if (input.sourceArticleId === null) return null;
  await assertArabicSourceExists(input.sourceArticleId);
  await lockSourceLink(tx, input.sourceArticleId);
  await assertSourceLinkFree(input.sourceArticleId, row.id);
  return input.sourceArticleId;
}

export async function updateEnBotDraft(
  bot: BotIdentity,
  articleId: string,
  input: EnBotDraftUpdateInput,
  ctx: BotRequestContext = {},
  guard?: { expectedUpdatedAt: Date },
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "edit");
  const existing = await findOwned(articleId, bot);
  const block = botDraftContentEditBlock(existing ? statusView(existing) : null);
  throwBlock(block);
  if (!existing) throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  assertPublishedFields(existing, input);
  if (input.subtitle !== undefined) await assertEnSubtitle(input.subtitle);
  const category = input.categoryId !== undefined || input.categorySlug !== undefined ? await resolveEnCategory(input) : null;
  const now = new Date();
  const published = existing.status === "published";

  const updated = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(enArticles).where(and(eq(enArticles.id, articleId), enOwnership(bot))).limit(1).for("update");
    if (!locked || locked.status !== existing.status) {
      throw new BotDraftError(409, "not_a_draft", botDraftContentBlockedMessage(locked?.status ?? "unknown"), { status: locked?.status ?? "unknown" });
    }
    if (guard && !sameVersion(locked.updatedAt, guard.expectedUpdatedAt)) {
      throw new BotDraftError(409, "draft_changed", "تغيّرت المادة أثناء التوليد — لم يُحفظ شيء، أعد الطلب");
    }
    const link = await applySourceLink(locked, input, tx);
    const meta = readSeo(locked);
    const seo = { ...(locked.seo ?? {}) } as EnSeoFields;
    const patch: Partial<typeof enArticles.$inferInsert> = { updatedAt: now };

    if (!published) {
      if (input.clientReference !== undefined) meta.clientReference = input.clientReference;
      if (input.notes !== undefined) meta.notes = input.notes ?? undefined;
      if (input.infographic !== undefined) patch.articleType = input.infographic ? "infographic" : "news";
    }
    if (input.title !== undefined) patch.title = input.title;
    if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
    if (input.content !== undefined) {
      patch.content = normalizeDraftContent(input.content, input.contentFormat, input.imageUrls);
    } else if (input.imageUrls !== undefined) {
      const appended = appendBotDraftBodyImages(locked.content ?? "", input.imageUrls);
      if (appended !== (locked.content ?? "")) patch.content = appended;
    }
    if (category && category.id !== locked.categoryId) patch.categoryId = category.id;
    if (input.excerpt !== undefined) {
      const next = typeof input.excerpt === "string" ? input.excerpt.trim() || null : null;
      patch.excerpt = next;
      patch.aiSummary = next;
      patch.smartSummary = next;
    }
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
    if (input.infographicBannerUrl !== undefined) meta.infographicBannerUrl = input.infographicBannerUrl;
    if (input.sourceUrl !== undefined) meta.sourceUrl = input.sourceUrl ?? undefined;
    if (input.riskLabel !== undefined) meta.riskLabel = input.riskLabel;
    if (input.updateReason !== undefined) meta.updateReason = input.updateReason;
    if (link !== undefined) meta.sourceArticleId = link ?? undefined;
    if (input.keywords !== undefined) seo.keywords = input.keywords;
    const seoPatch = buildBotDraftSeoPatch(locked.seo, input);
    if (seoPatch || input.keywords !== undefined) {
      patch.seo = { ...(seoPatch ?? seo), ...(input.keywords !== undefined ? { keywords: input.keywords } : {}) };
    }
    const contentChanged = input.title !== undefined || input.subtitle !== undefined || input.content !== undefined
      || input.excerpt !== undefined || input.imageUrl !== undefined || input.infographicBannerUrl !== undefined
      || category != null;
    if (published && contentChanged) meta.editorialModifiedAt = now.toISOString();
    if (!published && isMissingReporter(locked.reporterId)) {
      const filled = reporterIdForBotDraftUpdate(locked.reporterId, await resolveBotAuthorId());
      if (filled) patch.reporterId = filled;
    }
    patch.seoMetadata = meta;
    const [saved] = await tx.update(enArticles).set(patch).where(eq(enArticles.id, articleId)).returning();
    return saved;
  });

  if (published) queueEnBotDraftSurfaceEffects(updated, "update");
  else memoryCache.invalidatePattern("^articles:");
  await logEn(updated, bot, published ? "updated_published" : "updated", ctx);
  return toEnBotDraftResponse(updated, await categorySlugFor(updated.categoryId));
}

function isMissingReporter(reporterId: string | null): boolean {
  return reporterId == null || reporterId === "";
}

const EN_SUMMARY_SYSTEM = [
  "You write the English edition of Sabq, a Saudi newspaper.",
  "Summarize the article in 2 short English sentences, 280 characters or fewer.",
  "No headline, no bullets, no quotes from the prompt, no Arabic.",
].join(" ");

export async function regenerateEnBotDraftExtras(
  bot: BotIdentity,
  articleId: string,
  input: BotDraftRegenerateExtrasInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftRegenerateExtrasResponse> {
  assertPersonalCapability(bot, "edit");
  const existing = await findOwned(articleId, bot);
  const block = botDraftContentEditBlock(existing ? statusView(existing) : null);
  throwBlock(block);
  if (!existing) throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  const plain = existing.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length < BOT_DRAFT_EXTRAS_MIN_CONTENT_CHARS) {
    throw new BotDraftError(422, "content_too_short", `المتن أقصر من ${BOT_DRAFT_EXTRAS_MIN_CONTENT_CHARS} حرف — لا يكفي لتوليد الملحقات`, {
      minChars: BOT_DRAFT_EXTRAS_MIN_CONTENT_CHARS,
    });
  }
  const fields: BotDraftExtra[] = Array.from(new Set(input.fields ?? (["summary", "keywords", "seo"] as BotDraftExtra[])));
  let generated: GeneratedBotDraftExtras;
  let seoProvider: string | undefined;
  let seoModel: string | undefined;
  try {
    const [summary, seo] = await Promise.all([
      fields.includes("summary")
        ? import("../ai/editorGatewayText").then(({ completeEditorText }) =>
            completeEditorText("editor-summarize", {
              system: EN_SUMMARY_SYSTEM,
              user: plain.slice(0, 12000),
              maxTokens: 220,
            }),
          )
        : Promise.resolve(null),
      fields.includes("keywords") || fields.includes("seo")
        ? import("../seo-generator").then(({ generateSeoMetadata }) =>
            generateSeoMetadata(
              { id: existing.id, title: existing.title, subtitle: existing.subtitle || undefined, content: existing.content, excerpt: existing.excerpt || undefined },
              "en",
            ),
          )
        : Promise.resolve(null),
    ]);
    generated = {
      summary: summary?.content?.trim() || null,
      seo: seo?.content ?? null,
    };
    seoProvider = seo?.provider;
    seoModel = seo?.model;
  } catch (error) {
    console.error(`[EnBotDrafts] regenerate-extras ${articleId} failed:`, error);
    throw new BotDraftError(502, "generation_failed", "تعذر توليد الملحقات — أعد المحاولة بعد قليل");
  }
  const update = buildRegeneratedExtrasInput(fields, generated);
  if (Object.keys(update).length === 0) {
    throw new BotDraftError(502, "generation_failed", "لم يرجع المولّد قيماً صالحة — لم يُحفظ شيء", { fields });
  }
  const draft = await updateEnBotDraft(bot, articleId, update, ctx, { expectedUpdatedAt: new Date(existing.updatedAt) });
  return {
    draft,
    regenerated: {
      fields,
      ...(update.excerpt !== undefined ? { excerpt: update.excerpt ?? undefined } : {}),
      ...(update.keywords !== undefined ? { keywords: update.keywords } : {}),
      ...(update.seoTitle !== undefined ? { seoTitle: update.seoTitle } : {}),
      ...(update.seoDescription !== undefined ? { seoDescription: update.seoDescription } : {}),
      ...(seoProvider ? { seoProvider } : {}),
      ...(seoModel ? { seoModel } : {}),
    },
  };
}

export async function markEnBotDraftReady(
  bot: BotIdentity,
  articleId: string,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "ready");
  const existing = await findOwned(articleId, bot);
  if (!existing || botSourceOf(existing) !== BOT_DRAFT_SOURCE) throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  if (existing.status !== BOT_DRAFT_STATUS) {
    throw new BotDraftError(409, "not_a_draft", botDraftReadyBlockedMessage(existing.status), { status: existing.status });
  }
  const [row] = await db
    .update(enArticles)
    .set({ status: "ready_to_publish", updatedAt: new Date() })
    .where(and(
      eq(enArticles.id, articleId),
      eq(enArticles.status, BOT_DRAFT_STATUS),
      sql`${enArticles.seoMetadata}->>'source' = 'bot'`,
      enOwnership(bot),
    ))
    .returning();
  if (!row) throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء التعليم", { status: "unknown" });
  memoryCache.invalidatePattern("^articles:");
  await logEn(row, bot, "ready", ctx);
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

async function assertMayPublish(bot: BotIdentity, row: EnRow): Promise<void> {
  if (isPersonalBotNewspaperNews(bot, row)) return;
  const [{ assertMediaLicenseAllowsSubmission }, { resolveContentBylineUserId }] = await Promise.all([
    import("./mediaLicenseService"),
    import("@shared/mediaLicense"),
  ]);
  const bylineUserId = resolveContentBylineUserId({ articleType: row.articleType, authorId: row.authorId, reporterId: row.reporterId });
  const gate = await assertMediaLicenseAllowsSubmission(bylineUserId);
  if (!gate.ok) throw new BotDraftError(403, "license_required", gate.message, { licenseCode: gate.code });
}

function publishActorKey(bot: BotIdentity): string {
  return bot.personal ? `personal:${bot.personal.userId}` : `legacy:${bot.name}`;
}

function publishFingerprint(): string {
  return createHash("sha256").update(JSON.stringify({ sensitiveOverride: false, overrideReason: null })).digest("hex");
}

function legacyFingerprint(options: { sensitiveOverride?: boolean; overrideReason?: string }): string | null {
  if (options.sensitiveOverride !== true) return null;
  return createHash("sha256").update(JSON.stringify({ sensitiveOverride: true, overrideReason: options.overrideReason ?? "" })).digest("hex");
}

function operationResponse(row: ReceiptRow): BotDraftPublishOperationResponse {
  const result: BotDraftPublishOperationResponse = {
    operationId: row.operationId,
    articleId: row.articleId,
    action: "publish",
    status: row.status as BotDraftPublishOperationResponse["status"],
  };
  if (row.response && typeof row.response === "object") result.response = row.response as unknown as BotDraftResponse;
  if (row.error && typeof row.error === "object") {
    const { executionOutcome, ...safeError } = row.error as Record<string, unknown>;
    result.error = safeError as BotDraftPublishOperationResponse["error"];
    if (executionOutcome === "not_applied") result.executionOutcome = "not_applied";
  }
  return result;
}

async function claimEnPublishOperation(
  bot: BotIdentity,
  articleId: string,
  operationId: string,
  legacy: { sensitiveOverride?: boolean; overrideReason?: string },
): Promise<{ claimed: boolean; row: ReceiptRow }> {
  const actorKey = publishActorKey(bot);
  const bodyFingerprint = publishFingerprint();
  const [created] = await db
    .insert(enArticlePublishOperations)
    .values({ operationId, actorKey, articleId, bodyFingerprint, status: "processing", claimedAt: new Date() })
    .onConflictDoNothing({
      target: [enArticlePublishOperations.actorKey, enArticlePublishOperations.articleId, enArticlePublishOperations.operationId],
    })
    .returning();
  if (created) return { claimed: true, row: created };
  const [existing] = await db
    .select()
    .from(enArticlePublishOperations)
    .where(and(
      eq(enArticlePublishOperations.actorKey, actorKey),
      eq(enArticlePublishOperations.articleId, articleId),
      eq(enArticlePublishOperations.operationId, operationId),
    ))
    .limit(1);
  if (!existing) throw new BotDraftError(503, "server_error", "تعذر قراءة نتيجة عملية النشر");
  if (existing.bodyFingerprint !== bodyFingerprint && existing.bodyFingerprint !== legacyFingerprint(legacy)) {
    throw new BotDraftError(409, "operation_id_collision", "operationId مستخدم لطلب نشر مختلف");
  }
  return { claimed: false, row: existing };
}

async function markEnPublishFailed(operationId: string, actorKey: string, articleId: string, error: BotDraftError): Promise<void> {
  await db
    .update(enArticlePublishOperations)
    .set({
      status: "failed",
      error: { code: error.code, message: error.message, details: error.details, executionOutcome: "not_applied" },
      completedAt: new Date(),
    })
    .where(and(
      eq(enArticlePublishOperations.operationId, operationId),
      eq(enArticlePublishOperations.actorKey, actorKey),
      eq(enArticlePublishOperations.articleId, articleId),
      eq(enArticlePublishOperations.status, "processing"),
    ));
}

export async function publishEnBotDraft(
  bot: BotIdentity,
  articleId: string,
  ctx: BotRequestContext = {},
  options: { operationId?: string; sensitiveOverride?: boolean; overrideReason?: string } = {},
): Promise<BotDraftResponse | BotDraftPublishOperationResponse> {
  assertPersonalCapability(bot, "publish");
  const existing = await findOwned(articleId, bot);
  if (!existing || botSourceOf(existing) !== BOT_DRAFT_SOURCE) {
    throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  }

  let claimed: ReceiptRow | undefined;
  if (options.operationId) {
    const claim = await claimEnPublishOperation(bot, articleId, options.operationId, options);
    if (!claim.claimed) return operationResponse(claim.row);
    claimed = claim.row;
  }
  throwBlock(botDraftReleaseBlock(statusView(existing)));

  const actorKey = publishActorKey(bot);
  let response: BotDraftResponse | undefined;
  try {
    await assertMayPublish(bot, existing);
    const now = new Date();
    const written = await db.transaction(async (tx) => {
      if (claimed) {
        const [lockedReceipt] = await tx.select().from(enArticlePublishOperations).where(eq(enArticlePublishOperations.id, claimed.id)).limit(1).for("update");
        if (!lockedReceipt) throw new BotDraftError(503, "server_error", "تعذر قفل نتيجة عملية النشر");
        if (lockedReceipt.status !== "processing") return { terminal: operationResponse(lockedReceipt) };
      }
      const [locked] = await tx
        .select()
        .from(enArticles)
        .where(and(
          eq(enArticles.id, articleId),
          sql`${enArticles.seoMetadata}->>'source' = 'bot'`,
          inArray(enArticles.status, ["draft", "ready_to_publish"]),
          enOwnership(bot),
        ))
        .limit(1)
        .for("update");
      if (!locked) throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء النشر", { status: "unknown" });
      await assertMayPublish(bot, locked);
      if (claimed && typeof tx.execute === "function") {
        const privilege = await tx.execute(sql`SELECT has_table_privilege(current_user, 'en_article_publish_operations', 'UPDATE') AS receipt_update`);
        const privilegeResult = privilege as unknown as { rows?: Array<{ receipt_update?: boolean }> } | Array<{ receipt_update?: boolean }>;
        const privilegeRow = Array.isArray(privilegeResult) ? privilegeResult[0] : privilegeResult.rows?.[0];
        if (!privilegeRow || privilegeRow.receipt_update !== true) {
          throw new BotDraftError(503, "server_error", "صلاحيات سجل النشر الإنجليزي غير مكتملة — لم تُكتب المادة");
        }
      }
      const publishPatch = buildBotDraftPublishUpdate(now, locked.publishedAt);
      const [saved] = await tx.update(enArticles).set({
        ...publishPatch,
        ...(locked.englishSlug ? {} : { englishSlug: generateEnglishSlug(locked.title) }),
      }).where(eq(enArticles.id, articleId)).returning();
      if (!saved) throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء النشر", { status: "unknown" });
      if (isBreakingNewsType(saved.newsType)) await clearOtherEnBreakingArticles(saved.id, tx);
      const [category] = await tx.select({ slug: enCategories.slug }).from(enCategories).where(eq(enCategories.id, saved.categoryId ?? "")).limit(1);
      response = toEnBotDraftResponse(saved, category?.slug ?? null);
      if (claimed) {
        const [receipt] = await tx
          .update(enArticlePublishOperations)
          .set({ status: "succeeded", response: response as unknown as Record<string, unknown>, error: null, completedAt: new Date() })
          .where(and(eq(enArticlePublishOperations.id, claimed.id), eq(enArticlePublishOperations.status, "processing")))
          .returning();
        if (!receipt) throw new BotDraftError(503, "server_error", "تعذر حفظ نتيجة عملية النشر");
      }
      return { row: saved };
    });
    if ("terminal" in written && written.terminal) return written.terminal;
    queueEnBotDraftSurfaceEffects(written.row!, "publish");
    await logEn(written.row!, bot, "published", ctx);
    console.log(`[EnBotDrafts] published ${written.row!.id} by bot=${bot.name}`);
    return claimed
      ? { operationId: claimed.operationId, articleId, action: "publish", status: "succeeded", response: response! }
      : response!;
  } catch (error) {
    if (claimed && error instanceof BotDraftError) {
      await markEnPublishFailed(claimed.operationId, actorKey, articleId, error).catch((markError) => {
        console.error("[EnBotDrafts] failed to persist publish failure receipt:", markError);
      });
    }
    throw error;
  }
}

export async function getEnBotDraftPublishOperation(
  bot: BotIdentity,
  articleId: string,
  operationId: string,
): Promise<BotDraftPublishOperationResponse> {
  assertPersonalCapability(bot, "publish");
  const article = await findOwned(articleId, bot);
  if (!article || botSourceOf(article) !== BOT_DRAFT_SOURCE) throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  const [row] = await db
    .select()
    .from(enArticlePublishOperations)
    .where(and(
      eq(enArticlePublishOperations.actorKey, publishActorKey(bot)),
      eq(enArticlePublishOperations.articleId, articleId),
      eq(enArticlePublishOperations.operationId, operationId),
    ))
    .limit(1);
  if (!row) throw new BotDraftError(404, "operation_not_found", "عملية النشر غير موجودة");
  return operationResponse(row);
}

async function releasable(bot: BotIdentity, articleId: string): Promise<EnRow> {
  const existing = await findOwned(articleId, bot);
  throwBlock(botDraftReleaseBlock(existing ? statusView(existing) : null));
  if (!existing) throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  await assertMayPublish(bot, existing);
  return existing;
}

export async function scheduleEnBotDraft(
  bot: BotIdentity,
  articleId: string,
  publishAt: Date,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "schedule");
  if (!(publishAt instanceof Date) || Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
    throw new BotDraftError(400, "validation_error", "موعد النشر في الماضي أو اللحظة الحالية. أرسل وقت الرياض بإزاحة +03:00 أو ما يعادله UTC.", {
      publishAt: publishAt instanceof Date && !Number.isNaN(publishAt.getTime()) ? publishAt.toISOString() : null,
    });
  }
  const existing = await releasable(bot, articleId);
  const now = new Date();
  const meta = readSeo(existing);
  if (bot.personal) {
    meta.publisherTokenId = bot.personal.tokenId;
    delete meta.scheduleFailure;
  }
  const [row] = await db
    .update(enArticles)
    .set({
      ...buildBotDraftScheduleUpdate(publishAt, now),
      ...(existing.englishSlug ? {} : { englishSlug: generateEnglishSlug(existing.title) }),
      seoMetadata: meta,
    })
    .where(and(
      eq(enArticles.id, articleId),
      sql`${enArticles.seoMetadata}->>'source' = 'bot'`,
      inArray(enArticles.status, ["draft", "ready_to_publish"]),
      enOwnership(bot),
    ))
    .returning();
  if (!row) throw new BotDraftError(409, "not_a_draft", botDraftPublishBlockedMessage("unknown"), { status: "unknown" });
  memoryCache.invalidatePattern("^articles:");
  await logEn(row, bot, "scheduled", ctx, { scheduledAt: publishAt.toISOString() });
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

export async function rescheduleEnBotDraft(
  bot: BotIdentity,
  articleId: string,
  publishAt: Date,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "reschedule");
  if (!(publishAt instanceof Date) || Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
    throw new BotDraftError(400, "validation_error", "موعد النشر في الماضي أو اللحظة الحالية. أرسل وقت الرياض بإزاحة +03:00 أو ما يعادله UTC.");
  }
  const existing = await findOwned(articleId, bot);
  throwBlock(botDraftScheduledBlock(existing ? statusView(existing) : null));
  const [row] = await db
    .update(enArticles)
    .set(buildBotDraftRescheduleUpdate(publishAt, new Date()))
    .where(and(eq(enArticles.id, articleId), eq(enArticles.status, "scheduled"), sql`${enArticles.seoMetadata}->>'source' = 'bot'`, enOwnership(bot)))
    .returning();
  if (!row) throw new BotDraftError(409, "not_scheduled", "تغيّرت حالة المادة أثناء تغيير الموعد");
  await logEn(row, bot, "rescheduled", ctx);
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

export async function unscheduleEnBotDraft(
  bot: BotIdentity,
  articleId: string,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "cancelSchedule");
  const existing = await findOwned(articleId, bot);
  throwBlock(botDraftScheduledBlock(existing ? statusView(existing) : null));
  const [row] = await db
    .update(enArticles)
    .set(buildBotDraftUnscheduleUpdate(new Date()))
    .where(and(eq(enArticles.id, articleId), eq(enArticles.status, "scheduled"), sql`${enArticles.seoMetadata}->>'source' = 'bot'`, enOwnership(bot)))
    .returning();
  if (!row) throw new BotDraftError(409, "not_scheduled", "تغيّرت حالة المادة أثناء إلغاء الجدولة");
  memoryCache.invalidatePattern("^articles:");
  await logEn(row, bot, "unscheduled", ctx);
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

export async function archiveEnBotDraft(
  bot: BotIdentity,
  articleId: string,
  input: { reason?: string },
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "archive");
  const existing = await findOwned(articleId, bot);
  throwBlock(botDraftPublishedBlock(existing ? statusView(existing) : null));
  const [row] = await db
    .update(enArticles)
    .set(buildBotDraftArchiveUpdate(new Date(), input.reason))
    .where(and(eq(enArticles.id, articleId), eq(enArticles.status, "published"), sql`${enArticles.seoMetadata}->>'source' = 'bot'`, enOwnership(bot)))
    .returning();
  if (!row) throw new BotDraftError(409, "not_published", "تغيّرت حالة المادة أثناء الأرشفة");
  queueEnBotDraftSurfaceEffects(row, "archive");
  await logEn(row, bot, "archived", ctx, { reason: input.reason ?? null });
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

export async function restoreEnBotDraft(
  bot: BotIdentity,
  articleId: string,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  assertPersonalCapability(bot, "archive");
  const existing = await findOwned(articleId, bot);
  throwBlock(botDraftArchivedBlock(existing ? statusView(existing) : null));
  const [row] = await db
    .update(enArticles)
    .set(buildBotDraftRestoreUpdate(new Date()))
    .where(and(eq(enArticles.id, articleId), eq(enArticles.status, "archived"), sql`${enArticles.seoMetadata}->>'source' = 'bot'`, enOwnership(bot)))
    .returning();
  if (!row) throw new BotDraftError(409, "not_archived", "تغيّرت حالة المادة أثناء الاستعادة");
  memoryCache.invalidatePattern("^articles:");
  memoryCache.invalidatePattern("^en:article:base:");
  await logEn(row, bot, "restored", ctx);
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

export async function updateEnBotDraftVisibility(
  bot: BotIdentity,
  articleId: string,
  input: BotDraftVisibilityInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  if (input.isFeatured !== undefined) assertPersonalCapability(bot, input.isFeatured ? "featured" : "unfeatured");
  if (input.newsType !== undefined) assertPersonalCapability(bot, input.newsType === "breaking" ? "breaking" : "regular");
  if (input.hideFromHomepage !== undefined) assertPersonalCapability(bot, input.hideFromHomepage ? "hide" : "show");
  const existing = await findOwned(articleId, bot);
  throwBlock(botDraftPublishedBlock(existing ? statusView(existing) : null));
  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [saved] = await tx
      .update(enArticles)
      .set(buildBotDraftVisibilityUpdate(input, now))
      .where(and(eq(enArticles.id, articleId), eq(enArticles.status, "published"), sql`${enArticles.seoMetadata}->>'source' = 'bot'`, enOwnership(bot)))
      .returning();
    if (!saved) throw new BotDraftError(409, "not_published", "تغيّرت حالة المادة أثناء ضبط الظهور");
    if (isBreakingNewsType(saved.newsType)) await clearOtherEnBreakingArticles(saved.id, tx);
    const sourceId = readSeo(saved).sourceArticleId;
    if (sourceId && input.newsType) {
      await tx.update(articles).set({ newsType: input.newsType, updatedAt: now }).where(eq(articles.id, sourceId));
      if (isBreakingNewsType(input.newsType)) await clearOtherBreakingArticles(sourceId, tx);
    }
    return saved;
  });
  queueEnBotDraftSurfaceEffects(row, "visibility");
  await logEn(row, bot, "visibility", ctx, { newsType: row.newsType, isFeatured: row.isFeatured });
  return toEnBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

function enPersonalWriteCondition(row: EnRow): SQL | undefined {
  const meta = readSeo(row);
  if (!meta.publisherUserId) return undefined;
  const publisher = meta.publisherId
    ? sql`${enArticles.seoMetadata}->>'publisherId' = ${meta.publisherId}`
    : sql`(${enArticles.seoMetadata}->>'publisherId' IS NULL OR ${enArticles.seoMetadata}->>'publisherId' = '')`;
  return and(
    sql`${enArticles.seoMetadata}->>'publisherUserId' = ${meta.publisherUserId}`,
    sql`${enArticles.seoMetadata}->>'publisherTokenId' = ${meta.publisherTokenId ?? ""}`,
    publisher,
    inArray(enArticles.articleType, ["news", "infographic"]),
    or(
      eq(enArticles.reporterId, SABQ_NEWSPAPER_ACCOUNT_ID),
      and(isNull(enArticles.reporterId), eq(enArticles.authorId, SABQ_NEWSPAPER_ACCOUNT_ID)),
    ),
    sql`exists (
      select 1 from ${botPublisherTokens}
      where ${botPublisherTokens.id} = ${meta.publisherTokenId ?? ""}
        and ${botPublisherTokens.userId} = ${meta.publisherUserId}
        and ${botPublisherTokens.revokedAt} is null
        and ${botPublisherTokens.expiresAt} > now()
    )`,
  );
}

async function enPersonalScheduleAllowed(row: EnRow): Promise<boolean | "unknown"> {
  const meta = readSeo(row);
  if (!meta.publisherUserId || !meta.publisherTokenId) return false;
  try {
    const principal = await authenticatePublisherTokenId(meta.publisherTokenId);
    if (!principal || principal.userId !== meta.publisherUserId || !principal.capabilities.includes("publish")) return false;
    if ((principal.publisherId ?? null) !== (meta.publisherId ?? null)) return false;
    if (row.articleType !== "news" && row.articleType !== "infographic") return false;
    if ((row.reporterId || row.authorId) !== SABQ_NEWSPAPER_ACCOUNT_ID) return false;
    return true;
  } catch (error) {
    console.error(`[EnBotDrafts] schedule auth lookup failed for ${row.id}:`, error);
    return "unknown";
  }
}

async function stopEnSchedule(row: EnRow): Promise<void> {
  const now = new Date();
  const meta = readSeo(row);
  const reason = "أوقفت الجدولة وأعيدت المادة مسودة لأن اعتماد المستخدم أو صلاحية النشر لم تعد صالحة.";
  meta.scheduleFailure = { at: now.toISOString(), reason };
  await db
    .update(enArticles)
    .set({ status: "draft", publishType: "instant", scheduledAt: null, updatedAt: now, seoMetadata: meta })
    .where(and(eq(enArticles.id, row.id), eq(enArticles.status, "scheduled"), eq(enArticles.updatedAt, row.updatedAt)));
}

/**
 * ينشر مواد الإنجليزية المجدولة التي ختمها البوت فقط.
 * استعلام المقالات العربية في publishScheduledArticles يبقى كما هو.
 */
export async function publishDueScheduledEnBotArticles(now = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(enArticles)
    .where(and(
      eq(enArticles.status, "scheduled"),
      lte(enArticles.scheduledAt, now),
      sql`${enArticles.seoMetadata}->>'source' = 'bot'`,
    ))
    .limit(5);
  let count = 0;
  for (const row of due) {
    try {
      if (readSeo(row).publisherUserId) {
        const allowed = await enPersonalScheduleAllowed(row);
        if (allowed === "unknown") continue;
        if (!allowed) {
          await stopEnSchedule(row);
          continue;
        }
      }
      const publishTime = now;
      const [published] = await db.transaction(async (tx) => {
        const rows = await tx
          .update(enArticles)
          .set({
            status: "published",
            publishType: "instant",
            publishedAt: publishTime,
            updatedAt: publishTime,
            displayOrder: Math.floor(publishTime.getTime() / 1000),
          })
          .where(and(
            eq(enArticles.id, row.id),
            eq(enArticles.status, "scheduled"),
            lte(enArticles.scheduledAt, publishTime),
            sql`${enArticles.seoMetadata}->>'source' = 'bot'`,
            enPersonalWriteCondition(row),
          ))
          .returning();
        if (rows[0] && isBreakingNewsType(rows[0].newsType)) await clearOtherEnBreakingArticles(rows[0].id, tx);
        return rows;
      });
      if (!published) continue;
      count += 1;
      queueEnBotDraftSurfaceEffects(published, "publish");
      await logActivity({
        userId: readSeo(published).publisherUserId || published.authorId,
        action: "published",
        entityType: "en_article",
        entityId: published.id,
        newValue: { title: published.title, status: "published", scheduled: true },
      }).catch((error) => console.error("[EnBotDrafts] scheduled activity log failed:", error));
    } catch (error) {
      console.error(`[EnBotDrafts] scheduled publish failed for ${row.id}:`, error);
    }
  }
  return count;
}
