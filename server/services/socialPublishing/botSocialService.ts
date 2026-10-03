// عمليات بوت النشر على X. التأليف والطول هنا، والنشر نفسه عبر
// socialPublishingService (نفس المطالبة والعامل ومزوّد X/Publer).
import { and, desc, eq } from "drizzle-orm";
import { composeXPostText, validateXPostText } from "@shared/socialPostText";
import {
  articles,
  socialPlatformAccounts,
  socialPostBotKeys,
  socialPosts,
  users,
  type SocialPost,
} from "@shared/schema";
import { SABQ_NEWSPAPER_ACCOUNT_ID } from "@shared/sabqNewspaper";
import type {
  BotSocialCancelInput,
  BotSocialListQuery,
  BotSocialPreviewInput,
  BotSocialPublishInput,
  BotSocialScheduleInput,
} from "@shared/botSocial";
import { db } from "../../db";
import { logActivity } from "../../rbac";
import { assertSafeImageUrl } from "../../utils/safeImageUrl";
import { absolutizeImageUrl } from "./imageResolver";
import {
  BotSocialError,
  assertArticleTweetable,
  ORIGINAL_PREVIEW_CONTENT_ID,
  ORIGINAL_X_MAX_WEIGHTED_LENGTH,
  applySabqXMeasurementTags,
  decideCancelAction,
  decidePublishAction,
  decideScheduleAction,
  formatSuggestedText,
  isOriginalBotSocial,
  isUniqueViolation,
  originalPreviewLimits,
  parseBotSocialArticleUrl,
  previewLimits,
  resolveBotSocialCompose,
  resolveOriginalPost,
  type BotSocialCompose,
  type BotSocialIdentity,
  type OriginalPostCompose,
} from "./botSocialLogic";
import {
  SocialPublishValidationError,
  buildArticleUrl,
  cancelPost,
  claimPostForImmediatePublish,
  createDraftPost,
  getPost,
  publishClaimedPost,
  schedulePost,
  updateEditablePost,
} from "./socialPublishingService";
import {
  needsPublerStatusBackfill,
  resolvePublishedPostLink,
  xProfileUrlFromHandle,
  type ResolvedXStatus,
} from "./publerApiClient";
import { suggestSocialPostForArticle } from "./suggestService";

export interface BotSocialRequestContext {
  ip?: string;
  userAgent?: string;
}

export interface BotSocialPostResponse {
  id: string;
  articleId: string | null;
  platform: string;
  status: string;
  text: string;
  textSource: string;
  includeLink: boolean;
  linkUrl: string | null;
  imageSource: string;
  imageUrl: string | null;
  imageUrls: string[];
  kind: "article" | "original";
  composedText: string;
  weightedLength: number;
  remaining: number;
  valid: boolean;
  overStandard: boolean;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  clientReference: string;
  botName: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ArticleTweetTarget {
  id: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  url: string;
}

interface Binding {
  botName: string;
  clientReference: string;
  post: SocialPost;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function storedImageUrls(post: SocialPost): string[] {
  const fromMedia = Array.isArray(post.mediaUrls) ? post.mediaUrls.filter((url) => typeof url === "string" && url.trim()) : [];
  if (fromMedia.length > 0) return fromMedia;
  return post.imageUrl ? [post.imageUrl] : [];
}

export function toBotSocialPost(binding: Binding): BotSocialPostResponse {
  const validation = validateXPostText(binding.post.text, binding.post.linkUrl);
  const original = binding.post.articleId == null;
  const withinOriginalCap = validation.weightedLength > 0 && validation.weightedLength <= ORIGINAL_X_MAX_WEIGHTED_LENGTH;
  return {
    id: binding.post.id,
    articleId: binding.post.articleId,
    platform: binding.post.platform,
    status: binding.post.status,
    text: binding.post.text,
    textSource: binding.post.textSource,
    includeLink: Boolean(binding.post.linkUrl),
    linkUrl: binding.post.linkUrl,
    imageSource: binding.post.imageSource,
    imageUrl: binding.post.imageUrl,
    imageUrls: storedImageUrls(binding.post),
    kind: original ? "original" : "article",
    composedText: composeXPostText(binding.post.text, binding.post.linkUrl),
    weightedLength: validation.weightedLength,
    remaining: validation.remaining,
    valid: original ? withinOriginalCap : validation.valid,
    overStandard: validation.overStandard,
    scheduledAt: iso(binding.post.scheduledAt),
    publishedAt: iso(binding.post.publishedAt),
    externalPostId: binding.post.externalPostId,
    externalPostUrl: binding.post.externalPostUrl,
    clientReference: binding.clientReference,
    botName: binding.botName,
    attempts: binding.post.attempts,
    lastError: binding.post.lastError,
    createdAt: iso(binding.post.createdAt) || new Date(0).toISOString(),
    updatedAt: iso(binding.post.updatedAt) || new Date(0).toISOString(),
  };
}

/** قراءة البوت لا تنتظر استطلاع النشر؛ طلب واحد قصير لكل منشور معلّق. */
const PUBLER_BACKFILL_TIMEOUT_MS = 4_000;
const PUBLER_BACKFILL_MAX = 8;

async function loadPublerAccountRef(accountId: string): Promise<{ externalAccountId: string | null; handle: string | null }> {
  const [row] = await db
    .select({
      externalAccountId: socialPlatformAccounts.externalAccountId,
      handle: socialPlatformAccounts.handle,
    })
    .from(socialPlatformAccounts)
    .where(eq(socialPlatformAccounts.id, accountId))
    .limit(1);
  return {
    externalAccountId: row?.externalAccountId ?? null,
    handle: row?.handle ?? null,
  };
}

async function saveExternalLink(
  post: SocialPost,
  patch: { externalPostId: string; externalPostUrl: string | null },
): Promise<SocialPost> {
  const [updated] = await db
    .update(socialPosts)
    .set({
      externalPostId: patch.externalPostId,
      externalPostUrl: patch.externalPostUrl,
      updatedAt: new Date(),
    })
    .where(and(
      eq(socialPosts.id, post.id),
      eq(socialPosts.status, "published"),
      eq(socialPosts.externalPostId, post.externalPostId ?? ""),
    ))
    .returning();
  return updated ?? post;
}

/**
 * منشور Publer بلا رابط status: نسأل GET /posts مرة واحدة ونخزّن التغريدة.
 * إن لم يظهر post_link نستبدل أي رابط مبني من اسم العرض برابط الملف أو null،
 * ونُبقي `publer:<jobId>` حتى تنجح قراءة لاحقة.
 */
async function hydrateBotPosts(posts: SocialPost[]): Promise<SocialPost[]> {
  const pendingIndexes: number[] = [];
  posts.forEach((post, index) => {
    if (needsPublerStatusBackfill(post)) pendingIndexes.push(index);
  });
  if (pendingIndexes.length === 0) return posts;
  const next = posts.slice();
  const accounts = new Map<string, Promise<{ externalAccountId: string | null; handle: string | null }>>();
  const loadAccount = (accountId: string) => {
    let pending = accounts.get(accountId);
    if (!pending) {
      pending = loadPublerAccountRef(accountId);
      accounts.set(accountId, pending);
    }
    return pending;
  };

  await Promise.all(pendingIndexes.slice(0, PUBLER_BACKFILL_MAX).map(async (index) => {
    const original = posts[index];
    try {
      const account = original.accountId ? await loadAccount(original.accountId) : null;
      let resolved: ResolvedXStatus | null = null;
      if (account?.externalAccountId) {
        resolved = await resolvePublishedPostLink(
          account.externalAccountId,
          composeXPostText(original.text, original.linkUrl),
          {
            timeoutMs: PUBLER_BACKFILL_TIMEOUT_MS,
            linkUrl: original.linkUrl,
            publishedAt: original.publishedAt,
          },
        );
      }
      if (resolved) {
        next[index] = await saveExternalLink(original, {
          externalPostId: resolved.tweetId,
          externalPostUrl: resolved.statusUrl,
        });
        return;
      }
      const pendingUrl = xProfileUrlFromHandle(account?.handle);
      if ((original.externalPostUrl ?? null) === pendingUrl) return;
      next[index] = await saveExternalLink(original, {
        externalPostId: original.externalPostId ?? "",
        externalPostUrl: pendingUrl,
      });
    } catch (error) {
      console.warn(
        `[BotSocial] تعذر إكمال رابط Publer للمنشور ${original.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }));
  return next;
}

async function presentBindings(bindings: Binding[]): Promise<BotSocialPostResponse[]> {
  const hydrated = await hydrateBotPosts(bindings.map((binding) => binding.post));
  return bindings.map((binding, index) =>
    toBotSocialPost({ ...binding, post: hydrated[index] ?? binding.post }),
  );
}

async function presentBinding(binding: Binding): Promise<BotSocialPostResponse> {
  const [post] = await presentBindings([binding]);
  return post;
}

function rethrowKnown(error: unknown): never {
  if (error instanceof BotSocialError) throw error;
  if (error instanceof SocialPublishValidationError) {
    let code = "validation_error";
    if (error.status === 404) code = "not_found";
    else if (error.status === 409 && error.message.includes("حساب")) code = "account_not_connected";
    else if (error.status === 409) code = "conflict";
    throw new BotSocialError(error.status, code, error.message);
  }
  throw error;
}

function mismatch(binding: Binding): BotSocialError {
  return new BotSocialError(
    409,
    "reference_article_mismatch",
    "clientReference مستخدم لخبر آخر — اختر مرجعاً جديداً",
    { articleId: binding.post.articleId, postId: binding.post.id, status: binding.post.status },
  );
}

function assertCustomImage(url: string): void {
  try {
    assertSafeImageUrl(absolutizeImageUrl(url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "رابط الصورة مرفوض";
    throw new BotSocialError(400, "validation_error", `رابط الصورة مرفوض: ${message}`);
  }
}

function composeFor(
  article: ArticleTweetTarget,
  body: BotSocialPublishInput | BotSocialPreviewInput,
  existing: SocialPost | null,
): BotSocialCompose {
  const composed = resolveBotSocialCompose({
    article,
    body,
    existing: existing
      ? {
          text: existing.text,
          textSource: existing.textSource,
          linkUrl: existing.linkUrl,
          imageSource: existing.imageSource,
          imageUrl: existing.imageUrl,
        }
      : null,
  });
  if ((composed.imageSource === "upload" || composed.imageSource === "library") && composed.imageUrl) {
    assertCustomImage(composed.imageUrl);
  }
  return composed;
}

async function requireActor(): Promise<string> {
  const configured =
    (process.env.SABQ_BOT_SOCIAL_USER_ID || process.env.BOT_DRAFTS_AUTHOR_USER_ID || "").trim() ||
    SABQ_NEWSPAPER_ACCOUNT_ID;
  const [row] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, configured))
    .limit(1);
  if (!row || row.status !== "active") {
    throw new BotSocialError(
      503,
      "author_not_configured",
      "حساب إسناد النشر الاجتماعي للبوت غير موجود أو غير نشط",
    );
  }
  return row.id;
}

interface ArticleLocator {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  status: string;
  publishedAt: Date | null;
}

const articleLocatorColumns = {
  id: articles.id,
  title: articles.title,
  slug: articles.slug,
  englishSlug: articles.englishSlug,
  status: articles.status,
  publishedAt: articles.publishedAt,
};

/**
 * ترتيب حل مقطع /article/:x بعد فك الترميز، بما يطابق ما تفتحه الصفحة:
 * الرمز القصير هو english_slug، ثم slug العربي، ثم legacy_slug (غالباً فارغ)،
 * ثم articles.id إن كان المقطع UUID (احتياط GET /api/articles/:slug).
 * كل عمود استعلام مستقل حتى يفوز english_slug إن تطابق أكثر من صف.
 */
const ARTICLE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function selectArticleBy(column: typeof articles.englishSlug | typeof articles.slug | typeof articles.legacySlug | typeof articles.id, token: string): Promise<ArticleLocator | null> {
  const [row] = await db
    .select(articleLocatorColumns)
    .from(articles)
    .where(eq(column, token))
    .limit(1);
  return row ?? null;
}

async function findArabicArticleByPublicToken(token: string): Promise<ArticleLocator | null> {
  const byEnglish = await selectArticleBy(articles.englishSlug, token);
  if (byEnglish) return byEnglish;

  const bySlug = await selectArticleBy(articles.slug, token);
  if (bySlug) return bySlug;

  const byLegacy = await selectArticleBy(articles.legacySlug, token);
  if (byLegacy) return byLegacy;

  if (!ARTICLE_UUID_RE.test(token)) return null;
  return selectArticleBy(articles.id, token);
}

async function locateArticleFromUrl(articleUrl: string): Promise<ArticleLocator> {
  const parsed = parseBotSocialArticleUrl(articleUrl);
  const row = await findArabicArticleByPublicToken(parsed.slug);
  if (!row) throw new BotSocialError(404, "not_found", "الخبر غير موجود");
  return row;
}

async function resolveInputArticleId(input: { articleId?: string; articleUrl?: string }): Promise<string> {
  if (!input.articleUrl) {
    if (!input.articleId) {
      throw new BotSocialError(400, "validation_error", "يلزم articleId أو articleUrl");
    }
    return input.articleId;
  }
  const row = await locateArticleFromUrl(input.articleUrl);
  if (input.articleId && input.articleId !== row.id) {
    throw new BotSocialError(
      400,
      "validation_error",
      "articleId وarticleUrl لا يشيران إلى الخبر نفسه",
      { articleId: input.articleId, resolvedArticleId: row.id },
    );
  }
  return row.id;
}

export async function resolveBotSocialArticleUrl(articleUrl: string) {
  const row = await locateArticleFromUrl(articleUrl);
  return {
    articleId: row.id,
    title: row.title,
    status: row.status,
    publishedAt: iso(row.publishedAt),
    linkUrl: buildArticleUrl(row),
    lang: "ar" as const,
  };
}

async function loadArticle(articleId: string): Promise<ArticleTweetTarget> {
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      excerpt: articles.excerpt,
      status: articles.status,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!article) throw new BotSocialError(404, "not_found", "الخبر غير موجود");
  assertArticleTweetable(article.status, article.publishedAt);
  return {
    id: article.id,
    title: article.title,
    excerpt: article.excerpt || null,
    imageUrl: article.imageUrl || null,
    url: buildArticleUrl(article),
  };
}

async function findBinding(botName: string, clientReference: string): Promise<Binding | null> {
  const [row] = await db
    .select({ key: socialPostBotKeys, post: socialPosts })
    .from(socialPostBotKeys)
    .innerJoin(socialPosts, eq(socialPostBotKeys.postId, socialPosts.id))
    .where(and(eq(socialPostBotKeys.botName, botName), eq(socialPostBotKeys.clientReference, clientReference)))
    .limit(1);
  if (!row) return null;
  return { botName: row.key.botName, clientReference: row.key.clientReference, post: row.post };
}

async function findBindingByPostId(botName: string, postId: string): Promise<Binding | null> {
  const [row] = await db
    .select({ key: socialPostBotKeys, post: socialPosts })
    .from(socialPostBotKeys)
    .innerJoin(socialPosts, eq(socialPostBotKeys.postId, socialPosts.id))
    .where(and(eq(socialPostBotKeys.botName, botName), eq(socialPostBotKeys.postId, postId)))
    .limit(1);
  if (!row) return null;
  return { botName: row.key.botName, clientReference: row.key.clientReference, post: row.post };
}

async function audit(input: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  bot: BotSocialIdentity;
  clientReference?: string;
  ctx: BotSocialRequestContext;
  status?: string;
  idempotentReplay?: boolean;
}): Promise<void> {
  await logActivity({
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    newValue: { status: input.status ?? null },
    metadata: {
      bot: input.bot.name,
      clientReference: input.clientReference ?? null,
      channel: "bot-social-api",
      idempotentReplay: Boolean(input.idempotentReplay),
      ip: input.ctx.ip,
      userAgent: input.ctx.userAgent,
    },
  });
}

async function createBinding(
  bot: BotSocialIdentity,
  article: ArticleTweetTarget,
  composed: BotSocialCompose,
  clientReference: string,
  actorId: string,
): Promise<Binding> {
  let post: SocialPost;
  try {
    post = await createDraftPost({
      articleId: article.id,
      text: composed.text,
      textSource: composed.textSource,
      includeLink: composed.includeLink,
      imageSource: composed.imageSource,
      imageUrl: composed.imageUrl,
      createdByUserId: actorId,
    });
  } catch (error) {
    rethrowKnown(error);
  }
  try {
    await db.insert(socialPostBotKeys).values({
      botName: bot.name,
      clientReference,
      postId: post.id,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await db
      .delete(socialPosts)
      .where(and(eq(socialPosts.id, post.id), eq(socialPosts.status, "draft"), eq(socialPosts.attempts, 0)));
    const winner = await findBinding(bot.name, clientReference);
    if (!winner) throw error;
    if (winner.post.articleId !== article.id) throw mismatch(winner);
    return winner;
  }
  return { botName: bot.name, clientReference, post };
}

async function applyEdits(post: SocialPost, composed: BotSocialCompose): Promise<SocialPost> {
  try {
    return await updateEditablePost(post.id, {
      text: composed.text,
      includeLink: composed.includeLink,
      imageSource: composed.imageSource,
      imageUrl: composed.imageUrl,
    });
  } catch (error) {
    rethrowKnown(error);
  }
}

function assertOriginalImages(urls: string[]): void {
  for (const url of urls) assertCustomImage(url);
}

function originalExisting(post: SocialPost | null) {
  if (!post) return null;
  return {
    text: post.text,
    textSource: post.textSource,
    linkUrl: post.linkUrl,
    imageUrls: storedImageUrls(post),
  };
}

async function createOriginalBinding(
  bot: BotSocialIdentity,
  composed: OriginalPostCompose,
  clientReference: string,
  actorId: string,
): Promise<{ binding: Binding; created: boolean }> {
  let post: SocialPost;
  try {
    post = await createDraftPost({
      articleId: null,
      text: composed.text,
      textSource: composed.textSource,
      includeLink: false,
      imageSource: composed.imageSource,
      imageUrl: composed.imageUrl,
      mediaKind: composed.imageUrls.length > 0 ? "image" : "none",
      mediaUrls: composed.imageUrls,
      createdByUserId: actorId,
    });
  } catch (error) {
    rethrowKnown(error);
  }
  try {
    await db.insert(socialPostBotKeys).values({
      botName: bot.name,
      clientReference,
      postId: post.id,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await db
      .delete(socialPosts)
      .where(and(eq(socialPosts.id, post.id), eq(socialPosts.status, "draft"), eq(socialPosts.attempts, 0)));
    const winner = await findBinding(bot.name, clientReference);
    if (!winner) throw error;
    if (winner.post.articleId) throw mismatch(winner);
    return { binding: winner, created: false };
  }
  return { binding: { botName: bot.name, clientReference, post }, created: true };
}

async function stampOriginalLink(post: SocialPost, composed: OriginalPostCompose): Promise<SocialPost> {
  const linkUrl = composed.rawLinkUrl
    ? applySabqXMeasurementTags(composed.rawLinkUrl, post.id, composed.campaign)
    : null;
  try {
    return await updateEditablePost(post.id, {
      text: composed.text,
      includeLink: Boolean(linkUrl),
      linkUrl,
      imageSource: composed.imageSource,
      imageUrl: composed.imageUrl,
      mediaKind: composed.imageUrls.length > 0 ? "image" : "none",
      mediaUrls: composed.imageUrls,
      maxWeightedLength: ORIGINAL_X_MAX_WEIGHTED_LENGTH,
    });
  } catch (error) {
    rethrowKnown(error);
  }
}

async function loadOrCreateOriginal(
  bot: BotSocialIdentity,
  input: { clientReference: string; text?: string; textSource?: "custom" | "ai"; linkUrl?: string | null; imageUrl?: string | null; imageUrls?: string[]; campaign?: string },
  mode: "publish" | "schedule",
): Promise<{ binding: Binding; actorId: string; replay: boolean }> {
  let binding = await findBinding(bot.name, input.clientReference);
  if (binding?.post.articleId) throw mismatch(binding);
  if (binding) {
    const decision = mode === "publish" ? decidePublishAction(binding.post.status) : decideScheduleAction(binding.post.status);
    if (decision.action === "replay") {
      return { binding, actorId: binding.post.createdByUserId, replay: true };
    }
    if (decision.action === "reject") {
      throw new BotSocialError(decision.httpStatus, decision.code, decision.message, { post: toBotSocialPost(binding) });
    }
  }
  const composed = resolveOriginalPost({
    body: input,
    existing: originalExisting(binding?.post ?? null),
    contentId: binding?.post.id ?? ORIGINAL_PREVIEW_CONTENT_ID,
  });
  assertOriginalImages(composed.imageUrls);
  const actorId = await requireActor();
  let createdNow = false;
  if (!binding) {
    const created = await createOriginalBinding(bot, composed, input.clientReference, actorId);
    binding = created.binding;
    createdNow = created.created;
    if (binding.post.articleId) throw mismatch(binding);
    const decision = mode === "publish" ? decidePublishAction(binding.post.status) : decideScheduleAction(binding.post.status);
    if (decision.action === "replay") return { binding, actorId, replay: true };
    if (decision.action === "reject") {
      throw new BotSocialError(decision.httpStatus, decision.code, decision.message, { post: toBotSocialPost(binding) });
    }
    if (!createdNow) return { binding, actorId, replay: false };
  }
  const stamped = await stampOriginalLink(binding.post, composed);
  return {
    binding: { ...binding, post: { ...stamped, status: binding.post.status } },
    actorId,
    replay: false,
  };
}

export async function previewBotSocialPost(input: BotSocialPreviewInput) {
  if (isOriginalBotSocial(input)) {
    const composed = resolveOriginalPost({ body: input, contentId: ORIGINAL_PREVIEW_CONTENT_ID });
    assertOriginalImages(composed.imageUrls);
    const { rawLinkUrl: _rawLinkUrl, ...publicCompose } = composed;
    return {
      kind: "original" as const,
      articleId: null,
      title: null,
      excerpt: null,
      status: null,
      ...publicCompose,
      ...originalPreviewLimits(),
    };
  }
  const article = await loadArticle(await resolveInputArticleId(input));
  const composed = composeFor(article, input, null);
  return {
    articleId: article.id,
    title: article.title,
    excerpt: article.excerpt,
    status: "published" as const,
    ...composed,
    ...previewLimits(),
  };
}

export async function suggestBotSocialPost(
  bot: BotSocialIdentity,
  input: { articleId?: string; articleUrl?: string },
  ctx: BotSocialRequestContext = {},
) {
  const articleId = await resolveInputArticleId(input);
  const article = await loadArticle(articleId);
  const actorId = await requireActor();
  let suggestion: { post: string; hashtags: string[] };
  try {
    suggestion = await suggestSocialPostForArticle({ articleId, userId: actorId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر توليد الاقتراح";
    throw new BotSocialError(502, "suggest_failed", message);
  }
  const suggestedText = formatSuggestedText(suggestion.post, suggestion.hashtags);
  await audit({
    userId: actorId,
    action: "bot_social_suggest",
    entityType: "article",
    entityId: article.id,
    bot,
    ctx,
    status: "suggested",
  });
  return {
    articleId: article.id,
    post: suggestion.post,
    hashtags: suggestion.hashtags,
    suggestedText,
    title: article.title,
    linkUrl: article.url,
    imageUrl: article.imageUrl,
  };
}

async function loadOrCreate(
  bot: BotSocialIdentity,
  article: ArticleTweetTarget,
  input: BotSocialPublishInput,
  mode: "publish" | "schedule",
): Promise<{ binding: Binding; actorId: string; replay: boolean }> {
  let binding = await findBinding(bot.name, input.clientReference);
  if (binding && binding.post.articleId !== article.id) throw mismatch(binding);
  if (binding) {
    const decision = mode === "publish" ? decidePublishAction(binding.post.status) : decideScheduleAction(binding.post.status);
    if (decision.action === "replay") {
      return { binding, actorId: binding.post.createdByUserId, replay: true };
    }
    if (decision.action === "reject") {
      throw new BotSocialError(decision.httpStatus, decision.code, decision.message, { post: toBotSocialPost(binding) });
    }
  }
  const composed = composeFor(article, input, binding?.post ?? null);
  const actorId = await requireActor();
  if (!binding) {
    binding = await createBinding(bot, article, composed, input.clientReference, actorId);
    const decision = mode === "publish" ? decidePublishAction(binding.post.status) : decideScheduleAction(binding.post.status);
    if (decision.action === "replay") {
      return { binding, actorId, replay: true };
    }
    if (decision.action === "reject") {
      throw new BotSocialError(decision.httpStatus, decision.code, decision.message, { post: toBotSocialPost(binding) });
    }
    return { binding, actorId, replay: false };
  }
  const previousStatus = binding.post.status;
  const edited = await applyEdits(binding.post, composed);
  return {
    binding: { ...binding, post: { ...edited, status: previousStatus } },
    actorId,
    replay: false,
  };
}

export async function publishBotSocialPost(
  bot: BotSocialIdentity,
  input: BotSocialPublishInput,
  ctx: BotSocialRequestContext = {},
): Promise<{ post: BotSocialPostResponse; idempotentReplay: boolean }> {
  if (isOriginalBotSocial(input)) return publishOriginalBotSocialPost(bot, input, ctx);
  const article = await loadArticle(await resolveInputArticleId(input));
  const loaded = await loadOrCreate(bot, article, input, "publish");
  if (loaded.replay) {
    const post = await presentBinding(loaded.binding);
    await audit({
      userId: loaded.actorId,
      action: "bot_social_publish",
      entityType: "social_post",
      entityId: post.id,
      bot,
      clientReference: input.clientReference,
      ctx,
      status: post.status,
      idempotentReplay: true,
    });
    return { post, idempotentReplay: true };
  }

  const claimed = await claimPostForImmediatePublish(loaded.binding.post.id);
  if (!claimed) {
    const current = await getPost(loaded.binding.post.id);
    if (current?.status === "published") {
      const post = await presentBinding({ ...loaded.binding, post: current });
      await audit({
        userId: loaded.actorId,
        action: "bot_social_publish",
        entityType: "social_post",
        entityId: post.id,
        bot,
        clientReference: input.clientReference,
        ctx,
        status: post.status,
        idempotentReplay: true,
      });
      return { post, idempotentReplay: true };
    }
    const post = current ? toBotSocialPost({ ...loaded.binding, post: current }) : undefined;
    throw new BotSocialError(
      409,
      current?.status === "processing" ? "in_progress" : "conflict",
      current?.status === "processing"
        ? "المنشور قيد النشر — اقرأ الحالة ولا تعد الإرسال حتى تستقر"
        : "تعذر بدء النشر",
      post ? { post } : undefined,
    );
  }

  const result = await publishClaimedPost(claimed, loaded.actorId);
  const post = toBotSocialPost({ ...loaded.binding, post: result });
  await audit({
    userId: loaded.actorId,
    action: "bot_social_publish",
    entityType: "social_post",
    entityId: post.id,
    bot,
    clientReference: input.clientReference,
    ctx,
    status: post.status,
  });
  if (result.status !== "published") {
    throw new BotSocialError(502, "publish_failed", result.lastError || "فشل النشر", { post });
  }
  console.log(`[BotSocial] published ${post.id} bot=${bot.name}`);
  return { post, idempotentReplay: false };
}

async function publishOriginalBotSocialPost(
  bot: BotSocialIdentity,
  input: Extract<BotSocialPublishInput, { kind: "original" }>,
  ctx: BotSocialRequestContext,
): Promise<{ post: BotSocialPostResponse; idempotentReplay: boolean }> {
  const loaded = await loadOrCreateOriginal(bot, input, "publish");
  if (loaded.replay) {
    const post = await presentBinding(loaded.binding);
    await audit({
      userId: loaded.actorId,
      action: "bot_social_publish",
      entityType: "social_post",
      entityId: post.id,
      bot,
      clientReference: input.clientReference,
      ctx,
      status: post.status,
      idempotentReplay: true,
    });
    return { post, idempotentReplay: true };
  }
  const claimed = await claimPostForImmediatePublish(loaded.binding.post.id);
  if (!claimed) {
    const current = await getPost(loaded.binding.post.id);
    if (current?.status === "published") {
      const post = await presentBinding({ ...loaded.binding, post: current });
      await audit({
        userId: loaded.actorId,
        action: "bot_social_publish",
        entityType: "social_post",
        entityId: post.id,
        bot,
        clientReference: input.clientReference,
        ctx,
        status: post.status,
        idempotentReplay: true,
      });
      return { post, idempotentReplay: true };
    }
    const post = current ? toBotSocialPost({ ...loaded.binding, post: current }) : undefined;
    throw new BotSocialError(
      409,
      current?.status === "processing" ? "in_progress" : "conflict",
      current?.status === "processing"
        ? "المنشور قيد النشر — اقرأ الحالة ولا تعد الإرسال حتى تستقر"
        : "تعذر بدء النشر",
      post ? { post } : undefined,
    );
  }
  const result = await publishClaimedPost(claimed, loaded.actorId);
  const post = toBotSocialPost({ ...loaded.binding, post: result });
  await audit({
    userId: loaded.actorId,
    action: "bot_social_publish",
    entityType: "social_post",
    entityId: post.id,
    bot,
    clientReference: input.clientReference,
    ctx,
    status: post.status,
  });
  if (result.status !== "published") {
    throw new BotSocialError(502, "publish_failed", result.lastError || "فشل النشر", { post });
  }
  console.log(`[BotSocial] published original ${post.id} bot=${bot.name}`);
  return { post, idempotentReplay: false };
}

async function scheduleOriginalBotSocialPost(
  bot: BotSocialIdentity,
  input: Extract<BotSocialScheduleInput, { kind: "original" }>,
  ctx: BotSocialRequestContext,
): Promise<{ post: BotSocialPostResponse; idempotentReplay: boolean }> {
  const when = new Date(input.scheduledAt);
  const loaded = await loadOrCreateOriginal(bot, input, "schedule");
  if (loaded.replay) {
    const post = await presentBinding(loaded.binding);
    await audit({
      userId: loaded.actorId,
      action: "bot_social_schedule",
      entityType: "social_post",
      entityId: post.id,
      bot,
      clientReference: input.clientReference,
      ctx,
      status: post.status,
      idempotentReplay: true,
    });
    return { post, idempotentReplay: true };
  }
  let scheduled: SocialPost;
  try {
    scheduled = await schedulePost(loaded.binding.post.id, when, {
      resetAttempts: loaded.binding.post.status === "failed",
    });
  } catch (error) {
    rethrowKnown(error);
  }
  const post = toBotSocialPost({ ...loaded.binding, post: scheduled });
  await audit({
    userId: loaded.actorId,
    action: "bot_social_schedule",
    entityType: "social_post",
    entityId: post.id,
    bot,
    clientReference: input.clientReference,
    ctx,
    status: post.status,
  });
  console.log(`[BotSocial] scheduled original ${post.id} bot=${bot.name}`);
  return { post, idempotentReplay: false };
}

export async function scheduleBotSocialPost(
  bot: BotSocialIdentity,
  input: BotSocialScheduleInput,
  ctx: BotSocialRequestContext = {},
): Promise<{ post: BotSocialPostResponse; idempotentReplay: boolean }> {
  if (isOriginalBotSocial(input)) return scheduleOriginalBotSocialPost(bot, input, ctx);
  const article = await loadArticle(await resolveInputArticleId(input));
  const when = new Date(input.scheduledAt);
  const loaded = await loadOrCreate(bot, article, input, "schedule");
  if (loaded.replay) {
    const post = await presentBinding(loaded.binding);
    await audit({
      userId: loaded.actorId,
      action: "bot_social_schedule",
      entityType: "social_post",
      entityId: post.id,
      bot,
      clientReference: input.clientReference,
      ctx,
      status: post.status,
      idempotentReplay: true,
    });
    return { post, idempotentReplay: true };
  }
  let scheduled: SocialPost;
  try {
    scheduled = await schedulePost(loaded.binding.post.id, when, {
      resetAttempts: loaded.binding.post.status === "failed",
    });
  } catch (error) {
    rethrowKnown(error);
  }
  const post = toBotSocialPost({ ...loaded.binding, post: scheduled });
  await audit({
    userId: loaded.actorId,
    action: "bot_social_schedule",
    entityType: "social_post",
    entityId: post.id,
    bot,
    clientReference: input.clientReference,
    ctx,
    status: post.status,
  });
  console.log(`[BotSocial] scheduled ${post.id} bot=${bot.name}`);
  return { post, idempotentReplay: false };
}

export async function cancelBotSocialPost(
  bot: BotSocialIdentity,
  input: BotSocialCancelInput,
  ctx: BotSocialRequestContext = {},
): Promise<{ post: BotSocialPostResponse; idempotentReplay: boolean }> {
  const byReference = input.clientReference ? await findBinding(bot.name, input.clientReference) : null;
  const byId = input.id ? await findBindingByPostId(bot.name, input.id) : null;
  if (byReference && byId && byReference.post.id !== byId.post.id) {
    throw new BotSocialError(409, "reference_article_mismatch", "id وclientReference لا يشيران إلى المنشور نفسه");
  }
  const binding = byReference ?? byId;
  if (!binding) throw new BotSocialError(404, "not_found", "المنشور غير موجود");
  const decision = decideCancelAction(binding.post.status);
  if (decision.action === "replay") {
    const post = toBotSocialPost(binding);
    await audit({
      userId: binding.post.createdByUserId,
      action: "bot_social_cancel",
      entityType: "social_post",
      entityId: post.id,
      bot,
      clientReference: binding.clientReference,
      ctx,
      status: post.status,
      idempotentReplay: true,
    });
    return { post, idempotentReplay: true };
  }
  if (decision.action === "reject") {
    throw new BotSocialError(decision.httpStatus, decision.code, decision.message, { post: toBotSocialPost(binding) });
  }
  const actorId = await requireActor();
  let canceled: SocialPost;
  try {
    canceled = await cancelPost(binding.post.id, actorId, input.reason);
  } catch (error) {
    rethrowKnown(error);
  }
  const post = toBotSocialPost({ ...binding, post: canceled });
  await audit({
    userId: actorId,
    action: "bot_social_cancel",
    entityType: "social_post",
    entityId: post.id,
    bot,
    clientReference: binding.clientReference,
    ctx,
    status: post.status,
  });
  console.log(`[BotSocial] canceled ${post.id} bot=${bot.name}`);
  return { post, idempotentReplay: false };
}

export async function getBotSocialPost(bot: BotSocialIdentity, id: string): Promise<{ post: BotSocialPostResponse }> {
  const binding = await findBindingByPostId(bot.name, id);
  if (!binding) throw new BotSocialError(404, "not_found", "المنشور غير موجود");
  return { post: await presentBinding(binding) };
}

export async function listBotSocialPosts(
  bot: BotSocialIdentity,
  query: BotSocialListQuery,
): Promise<{ post: BotSocialPostResponse } | { posts: BotSocialPostResponse[] }> {
  if (query.clientReference) {
    const binding = await findBinding(bot.name, query.clientReference);
    if (!binding) throw new BotSocialError(404, "not_found", "المنشور غير موجود");
    return { post: await presentBinding(binding) };
  }
  const filters = [eq(socialPostBotKeys.botName, bot.name)];
  if (query.articleId) filters.push(eq(socialPosts.articleId, query.articleId));
  if (query.status) filters.push(eq(socialPosts.status, query.status));
  const rows = await db
    .select({ key: socialPostBotKeys, post: socialPosts })
    .from(socialPostBotKeys)
    .innerJoin(socialPosts, eq(socialPostBotKeys.postId, socialPosts.id))
    .where(and(...filters))
    .orderBy(desc(socialPosts.createdAt))
    .limit(query.limit ?? 20);
  return {
    posts: await presentBindings(rows.map((row) => ({
      botName: row.key.botName,
      clientReference: row.key.clientReference,
      post: row.post,
    }))),
  };
}
