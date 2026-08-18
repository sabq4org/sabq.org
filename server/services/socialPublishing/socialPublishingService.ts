// خدمة النشر الاجتماعي — CRUD المنشورات، آلة الحالات، خط النشر،
// والمطالبة الآمنة (exactly-once) للفوري والمجدول.
//
// آلة الحالات:
//   draft ── publish-now ──▶ processing ──▶ published
//     │  └── schedule ──▶ scheduled ──(worker claim)──▶ processing
//     │                      │  └── cancel ──▶ canceled
//     └── cancel ──▶ canceled
//   processing ── فشل مؤقت وattempts < MAX ──▶ scheduled (يعاد لاحقاً)
//   processing ── فشل دائم أو استنفاد ──▶ failed ──(retry)──▶ processing
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db";
import {
  articles,
  users,
  socialPlatformAccounts,
  socialPosts,
  socialPostAttempts,
  type SocialPlatformAccount,
  type SocialPost,
  type SocialPostAttempt,
} from "@shared/schema";
import { composeXPostText, validateXPostText } from "@shared/socialPostText";
import { assertSafeImageUrl } from "../../utils/safeImageUrl";
import { absolutizeImageUrl, resolveImageForSocialUpload } from "./imageResolver";
import { sanitizeSecretText } from "./tokenCrypto";
import { SocialProviderError, type SocialPublishProvider } from "./types";
import { xProvider } from "./xApiClient";
import { activeSocialTransport, publerProvider } from "./publerApiClient";
import { notifyAuthorOfSocialPostStatus } from "../editorialNotifications";

export const MAX_PUBLISH_ATTEMPTS = 3;
const STALE_LOCK_MINUTES = 10;
const LOG_PREFIX = "[SocialPublish]";

const providers: Record<string, SocialPublishProvider> = {
  [xProvider.platform]: xProvider,
};

/**
 * منصة X لها وسيلتا نقل: X API مباشرة (OAuth) أو Publer (مفتاح API).
 * SOCIAL_PUBLISH_TRANSPORT=publer + تهيئة Publer تُفعّل الثانية —
 * التبديل تهيئة لا كود، والرجوع للمباشر ممكن دائماً.
 */
export function getProvider(platform: string): SocialPublishProvider {
  if (platform === "x" && activeSocialTransport() === "publer") {
    return publerProvider;
  }
  const provider = providers[platform];
  if (!provider) {
    throw new SocialProviderError(`منصة غير مدعومة: ${platform}`, { retryable: false });
  }
  return provider;
}

// ── سياق الخبر ─────────────────────────────────────────────────────

function publicOrigin(): string {
  return process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "https://sabq.org";
}

export function buildArticleUrl(article: { slug: string; englishSlug: string | null }): string {
  return `${publicOrigin().replace(/\/$/, "")}/article/${article.englishSlug || article.slug}`;
}

export interface ArticleShareContext {
  articleId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  excerpt: string | null;
}

export async function getArticleShareContext(articleId: string): Promise<ArticleShareContext | null> {
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      excerpt: articles.excerpt,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!article) return null;
  return {
    articleId: article.id,
    title: article.title,
    url: buildArticleUrl(article),
    imageUrl: article.imageUrl || null,
    excerpt: article.excerpt || null,
  };
}

// ── الحسابات ───────────────────────────────────────────────────────

/** يعيد الحسابات بلا أي حقول اعتماد — آمنة للعميل */
export type SafeAccount = Omit<SocialPlatformAccount, "credentialsEncrypted">;

function toSafeAccount(account: SocialPlatformAccount): SafeAccount {
  const { credentialsEncrypted: _omitted, ...safe } = account;
  return safe;
}

export async function listAccounts(): Promise<SafeAccount[]> {
  const rows = await db.select().from(socialPlatformAccounts);
  return rows.map(toSafeAccount);
}

export async function getConnectedAccount(platform: string): Promise<SocialPlatformAccount | null> {
  const [row] = await db
    .select()
    .from(socialPlatformAccounts)
    .where(eq(socialPlatformAccounts.platform, platform))
    .limit(1);
  return row ?? null;
}

export async function saveConnectedAccount(input: {
  platform: string;
  handle: string;
  externalAccountId: string;
  displayName: string;
  /** null لوسيلة نقل Publer — لا اعتماد اجتماعي يُخزن لدينا */
  credentialsEncrypted: string | null;
  tokenExpiresAt: Date | null;
  scopes: string;
  connectedByUserId: string;
}): Promise<SafeAccount> {
  const existing = await getConnectedAccount(input.platform);
  const values = {
    handle: input.handle,
    externalAccountId: input.externalAccountId,
    displayName: input.displayName,
    status: "connected" as const,
    credentialsEncrypted: input.credentialsEncrypted,
    tokenExpiresAt: input.tokenExpiresAt,
    scopes: input.scopes,
    lastVerifiedAt: new Date(),
    connectedByUserId: input.connectedByUserId,
    updatedAt: new Date(),
  };
  if (existing) {
    const [updated] = await db
      .update(socialPlatformAccounts)
      .set(values)
      .where(eq(socialPlatformAccounts.id, existing.id))
      .returning();
    return toSafeAccount(updated);
  }
  const [created] = await db
    .insert(socialPlatformAccounts)
    .values({ platform: input.platform, ...values })
    .returning();
  return toSafeAccount(created);
}

export async function disconnectAccount(accountId: string): Promise<boolean> {
  const [updated] = await db
    .update(socialPlatformAccounts)
    .set({ status: "disconnected", credentialsEncrypted: null, tokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(socialPlatformAccounts.id, accountId))
    .returning({ id: socialPlatformAccounts.id });
  return Boolean(updated);
}

// ── إنشاء/تعديل المنشورات ──────────────────────────────────────────

export interface CreatePostInput {
  /** غيابه = تغريدة مستقلة من صفحة النشر الاجتماعي */
  articleId?: string | null;
  platform?: string;
  text: string;
  textSource: "title" | "title_link" | "custom" | "ai";
  includeLink: boolean;
  imageSource: "article" | "upload" | "library" | "none";
  imageUrl?: string | null;
  /** وسائط التأليف المستقل: image = حتى 4 صور، video = رابط واحد */
  mediaKind?: "none" | "image" | "video";
  mediaUrls?: string[];
  createdByUserId: string;
}

export const MAX_POST_IMAGES = 4;

/** تحقق خالص لوسائط التأليف — يُستخدم في الإنشاء والاختبارات */
export function validateComposeMedia(
  mediaKind: "none" | "image" | "video",
  mediaUrls: string[],
): void {
  if (mediaKind === "none") {
    if (mediaUrls.length > 0) {
      throw new SocialPublishValidationError("وسائط مرفقة بلا نوع محدد");
    }
    return;
  }
  if (mediaKind === "image") {
    if (mediaUrls.length < 1 || mediaUrls.length > MAX_POST_IMAGES) {
      throw new SocialPublishValidationError(`الصور من 1 إلى ${MAX_POST_IMAGES} كحد أقصى`);
    }
    return;
  }
  if (mediaUrls.length !== 1) {
    throw new SocialPublishValidationError("الفيديو رابط واحد بالضبط");
  }
}

export class SocialPublishValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "SocialPublishValidationError";
  }
}

async function requireConnectedAccount(platform: string): Promise<SocialPlatformAccount> {
  const account = await getConnectedAccount(platform);
  if (!account || account.status !== "connected") {
    throw new SocialPublishValidationError(
      "لا يوجد حساب X مرتبط — اربط الحساب من صفحة النشر الاجتماعي أولاً",
      409,
    );
  }
  return account;
}

export async function createDraftPost(input: CreatePostInput): Promise<SocialPost> {
  const platform = input.platform ?? "x";
  // تغريدة مستقلة (بلا خبر) أو منشور مرتبط بخبر
  const context = input.articleId ? await getArticleShareContext(input.articleId) : null;
  if (input.articleId && !context) {
    throw new SocialPublishValidationError("الخبر غير موجود", 404);
  }
  const account = await requireConnectedAccount(platform);

  const mediaKind = input.mediaKind ?? "none";
  const mediaUrls = (input.mediaUrls ?? []).map((u) => u.trim()).filter(Boolean);
  validateComposeMedia(mediaKind, mediaUrls);
  // حارس مبكر للمضيفين (الجالب يعيد الفحص عند النشر) — رسالة 400 فورية أوضح
  for (const url of mediaUrls) {
    try {
      assertSafeImageUrl(absolutizeImageUrl(url));
    } catch (err: any) {
      throw new SocialPublishValidationError(
        `رابط الوسائط مرفوض: ${err?.message || "غير مسموح"}`,
      );
    }
  }

  const linkUrl = input.includeLink && context ? context.url : null;
  const validation = validateXPostText(input.text, linkUrl);
  if (validation.empty) throw new SocialPublishValidationError("نص المنشور فارغ");
  if (!validation.valid) {
    throw new SocialPublishValidationError(
      `النص يتجاوز الحد الأقصى لمنصة X (${validation.weightedLength}/25000)`,
    );
  }
  if (input.imageSource !== "none" && !input.imageUrl) {
    throw new SocialPublishValidationError("مصدر الصورة محدد بلا رابط صورة");
  }

  const [post] = await db
    .insert(socialPosts)
    .values({
      articleId: input.articleId ?? null,
      platform,
      accountId: account.id,
      textSource: input.textSource,
      text: input.text.trim(),
      linkUrl,
      imageSource: input.imageUrl ? input.imageSource : "none",
      imageUrl: input.imageUrl ?? null,
      mediaKind,
      mediaUrls,
      status: "draft",
      createdByUserId: input.createdByUserId,
    })
    .returning();
  return post;
}

export interface UpdatePostInput {
  text?: string;
  includeLink?: boolean;
  imageSource?: "article" | "upload" | "library" | "none";
  imageUrl?: string | null;
  scheduledAt?: Date | null;
}

/** تعديل مسودة أو منشور مجدول — يرفض ما بدأ نشره أو انتهى */
export async function updateEditablePost(postId: string, input: UpdatePostInput): Promise<SocialPost> {
  const post = await getPost(postId);
  if (!post) throw new SocialPublishValidationError("المنشور غير موجود", 404);
  if (post.status !== "draft" && post.status !== "scheduled") {
    throw new SocialPublishValidationError(
      `لا يمكن تعديل منشور حالته «${post.status}»`,
      409,
    );
  }
  const context = post.articleId ? await getArticleShareContext(post.articleId) : null;
  if (post.articleId && !context) {
    throw new SocialPublishValidationError("الخبر غير موجود", 404);
  }

  const text = input.text !== undefined ? input.text : post.text;
  const includeLink = input.includeLink !== undefined ? input.includeLink : Boolean(post.linkUrl);
  const linkUrl = includeLink && context ? context.url : null;
  const validation = validateXPostText(text, linkUrl);
  if (validation.empty) throw new SocialPublishValidationError("نص المنشور فارغ");
  if (!validation.valid) {
    throw new SocialPublishValidationError(
      `النص يتجاوز الحد الأقصى لمنصة X (${validation.weightedLength}/25000)`,
    );
  }
  if (input.scheduledAt !== undefined && input.scheduledAt !== null) {
    assertValidScheduleTime(input.scheduledAt);
  }

  const imageSource = input.imageSource !== undefined ? input.imageSource : (post.imageSource as any);
  const imageUrl = input.imageUrl !== undefined ? input.imageUrl : post.imageUrl;

  // شرط الحالة داخل WHERE يمنع سباق «تعديل أثناء بدء العامل»:
  // لو التقط العامل المنشور (processing) بين القراءة والتحديث يفشل التحديث
  const [updated] = await db
    .update(socialPosts)
    .set({
      text: text.trim(),
      linkUrl,
      imageSource: imageUrl ? imageSource : "none",
      imageUrl: imageUrl ?? null,
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, postId), inArray(socialPosts.status, ["draft", "scheduled"])))
    .returning();
  if (!updated) {
    throw new SocialPublishValidationError("تعذر التعديل — المنشور دخل مرحلة النشر", 409);
  }
  return updated;
}

export function assertValidScheduleTime(scheduledAt: Date): void {
  const now = Date.now();
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new SocialPublishValidationError("وقت الجدولة غير صالح");
  }
  if (scheduledAt.getTime() <= now + 60 * 1000) {
    throw new SocialPublishValidationError("وقت الجدولة يجب أن يكون في المستقبل (بعد دقيقة على الأقل)");
  }
  if (scheduledAt.getTime() > now + 365 * 24 * 60 * 60 * 1000) {
    throw new SocialPublishValidationError("وقت الجدولة أبعد من سنة — غير مسموح");
  }
}

export async function schedulePost(postId: string, scheduledAt: Date): Promise<SocialPost> {
  assertValidScheduleTime(scheduledAt);
  const [updated] = await db
    .update(socialPosts)
    .set({ status: "scheduled", scheduledAt, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, postId), inArray(socialPosts.status, ["draft", "scheduled", "failed"])))
    .returning();
  if (!updated) {
    throw new SocialPublishValidationError("تعذرت الجدولة — تحقق من حالة المنشور", 409);
  }
  if (updated.articleId) {
    void notifyAuthorOfSocialPostStatus(updated.id, "social_scheduled").catch((err) => {
      console.error(`${LOG_PREFIX} فشل إشعار الكاتب بجدولة X:`, err);
    });
  }
  return updated;
}

export async function cancelPost(
  postId: string,
  canceledByUserId: string,
  reason?: string | null,
): Promise<SocialPost> {
  const [updated] = await db
    .update(socialPosts)
    .set({
      status: "canceled",
      canceledByUserId,
      lastError: reason ? sanitizeSecretText(reason) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, postId), inArray(socialPosts.status, ["draft", "scheduled"])))
    .returning();
  if (!updated) {
    throw new SocialPublishValidationError(
      "تعذر الإلغاء — المنشور نُشر أو دخل مرحلة النشر بالفعل",
      409,
    );
  }
  if (updated.articleId) {
    void notifyAuthorOfSocialPostStatus(updated.id, "social_rejected", {
      reviewerNote: reason,
    }).catch((err) => {
      console.error(`${LOG_PREFIX} فشل إشعار الكاتب بإلغاء X:`, err);
    });
  }
  return updated;
}

// ── الاستعلام ──────────────────────────────────────────────────────

export async function getPost(postId: string): Promise<SocialPost | null> {
  const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  return post ?? null;
}

export async function getPostAttempts(postId: string): Promise<SocialPostAttempt[]> {
  return db
    .select()
    .from(socialPostAttempts)
    .where(eq(socialPostAttempts.postId, postId))
    .orderBy(desc(socialPostAttempts.createdAt))
    .limit(50);
}

export async function listPostsForArticle(articleId: string): Promise<SocialPostListItem[]> {
  const creator = alias(users, "social_post_creator");
  const publisher = alias(users, "social_post_publisher");
  const rows = await db
    .select({
      post: socialPosts,
      articleTitle: articles.title,
      articleImageUrl: articles.imageUrl,
      articleAuthorId: articles.authorId,
      creatorFirst: creator.firstName,
      creatorLast: creator.lastName,
      publisherFirst: publisher.firstName,
      publisherLast: publisher.lastName,
    })
    .from(socialPosts)
    .leftJoin(articles, eq(socialPosts.articleId, articles.id))
    .leftJoin(creator, eq(socialPosts.createdByUserId, creator.id))
    .leftJoin(publisher, eq(socialPosts.publishedByUserId, publisher.id))
    .where(eq(socialPosts.articleId, articleId))
    .orderBy(desc(socialPosts.createdAt))
    .limit(50);
  const fullName = (first: string | null, last: string | null) =>
    [first, last].filter(Boolean).join(" ") || null;
  return rows.map((r) => ({
    ...r.post,
    articleTitle: r.articleTitle,
    articleImageUrl: r.articleImageUrl,
    createdByName: fullName(r.creatorFirst, r.creatorLast),
    publishedByName: fullName(r.publisherFirst, r.publisherLast),
    isAuthorProposal: Boolean(
      r.post.articleId && r.articleAuthorId && r.post.createdByUserId === r.articleAuthorId,
    ),
  }));
}

export type SocialPostListItem = SocialPost & {
  articleTitle: string | null;
  articleImageUrl: string | null;
  createdByName: string | null;
  publishedByName: string | null;
  isAuthorProposal?: boolean;
};

export async function listRecentPosts(limit = 50): Promise<SocialPostListItem[]> {
  const creator = alias(users, "social_post_creator");
  const publisher = alias(users, "social_post_publisher");
  const rows = await db
    .select({
      post: socialPosts,
      articleTitle: articles.title,
      articleImageUrl: articles.imageUrl,
      articleAuthorId: articles.authorId,
      creatorFirst: creator.firstName,
      creatorLast: creator.lastName,
      publisherFirst: publisher.firstName,
      publisherLast: publisher.lastName,
    })
    .from(socialPosts)
    .leftJoin(articles, eq(socialPosts.articleId, articles.id))
    .leftJoin(creator, eq(socialPosts.createdByUserId, creator.id))
    .leftJoin(publisher, eq(socialPosts.publishedByUserId, publisher.id))
    .orderBy(desc(socialPosts.createdAt))
    .limit(Math.min(limit, 100));
  const fullName = (first: string | null, last: string | null) =>
    [first, last].filter(Boolean).join(" ") || null;
  return rows.map((r) => ({
    ...r.post,
    articleTitle: r.articleTitle,
    articleImageUrl: r.articleImageUrl,
    createdByName: fullName(r.creatorFirst, r.creatorLast),
    publishedByName: fullName(r.publisherFirst, r.publisherLast),
    isAuthorProposal: Boolean(
      r.post.articleId && r.articleAuthorId && r.post.createdByUserId === r.articleAuthorId,
    ),
  }));
}

export interface SocialPublishStats {
  total: number;
  publishedToday: number;
  scheduledUpcoming: number;
  failed: number;
}

/** عدادات لوحة النشر الاجتماعي — استعلام تجميعي واحد */
export async function getPublishStats(): Promise<SocialPublishStats> {
  const result = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (
        WHERE status = 'published'
          AND published_at >= (now() AT TIME ZONE 'Asia/Riyadh')::date AT TIME ZONE 'Asia/Riyadh'
      )::int AS published_today,
      count(*) FILTER (WHERE status = 'scheduled')::int AS scheduled_upcoming,
      count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM social_posts
  `);
  const row = (result.rows?.[0] ?? {}) as Record<string, number>;
  return {
    total: Number(row.total ?? 0),
    publishedToday: Number(row.published_today ?? 0),
    scheduledUpcoming: Number(row.scheduled_upcoming ?? 0),
    failed: Number(row.failed ?? 0),
  };
}

// ── المطالبة (exactly-once) ────────────────────────────────────────

/**
 * مطالبة فورية بمنشور واحد: تنجح فقط إذا كانت الحالة draft | failed |
 * scheduled — النقر المزدوج أو إعادة الطلب الشبكية تجد الحالة processing
 * فتفشل المطالبة (null) ويرد الـ API بـ 409 دون نشر مكرر.
 */
export async function claimPostForImmediatePublish(postId: string): Promise<SocialPost | null> {
  const [claimed] = await db
    .update(socialPosts)
    .set({
      status: "processing",
      attempts: sql`${socialPosts.attempts} + 1`,
      lockedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, postId), inArray(socialPosts.status, ["draft", "failed", "scheduled"])))
    .returning();
  return claimed ?? null;
}

/** مطالبة دفعة المنشورات المجدولة المستحقة — FOR UPDATE SKIP LOCKED */
export async function claimDueScheduledPosts(batchSize = 5): Promise<SocialPost[]> {
  const result = await db.execute(sql`
    WITH claimed AS (
      SELECT id FROM social_posts
      WHERE status = 'scheduled'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= now()
        AND attempts < ${MAX_PUBLISH_ATTEMPTS}
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE social_posts AS p
    SET status = 'processing',
        attempts = p.attempts + 1,
        locked_at = now(),
        last_error = NULL,
        updated_at = now()
    FROM claimed
    WHERE p.id = claimed.id
    RETURNING p.*
  `);
  const rows = (result.rows || []) as any[];
  if (rows.length === 0) return [];
  // نعيد القراءة عبر Drizzle لضمان أسماء الحقول camelCase الموحدة
  return db
    .select()
    .from(socialPosts)
    .where(inArray(socialPosts.id, rows.map((r) => String(r.id))));
}

/** صفوف processing التي تجاوز قفلها المدة (تحطم replica) تعود قابلة للالتقاط */
export async function recoverStaleProcessingPosts(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE social_posts
    SET status = CASE WHEN attempts >= ${MAX_PUBLISH_ATTEMPTS} THEN 'failed' ELSE 'scheduled' END,
        last_error = COALESCE(last_error, 'انقطعت المعالجة (stale lock)'),
        locked_at = NULL,
        updated_at = now()
    WHERE status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_at < now() - (${STALE_LOCK_MINUTES} * interval '1 minute')
  `);
  return result.rowCount ?? 0;
}

// ── قرار ما بعد الفشل ──────────────────────────────────────────────

export interface FailureTransition {
  nextStatus: "scheduled" | "failed";
  terminal: boolean;
}

/**
 * attempts تُحتسب عند المطالبة، لذا القرار: خطأ دائم أو استنفاد المحاولات
 * ⇒ failed نهائياً؛ وإلا يعود scheduled ليلتقطه العامل في دورة قادمة.
 * المنشور الذي لم يكن مجدولاً (نشر فوري) يفشل نهائياً ليعيد المستخدم المحاولة يدوياً.
 */
export function decideFailureTransition(input: {
  attempts: number;
  retryable: boolean;
  wasScheduled: boolean;
}): FailureTransition {
  if (!input.retryable || input.attempts >= MAX_PUBLISH_ATTEMPTS || !input.wasScheduled) {
    return { nextStatus: "failed", terminal: true };
  }
  return { nextStatus: "scheduled", terminal: false };
}

// ── خط النشر ───────────────────────────────────────────────────────

async function recordAttempt(input: {
  postId: string;
  phase: string;
  outcome: "success" | "error";
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  durationMs?: number;
}): Promise<void> {
  try {
    await db.insert(socialPostAttempts).values({
      postId: input.postId,
      phase: input.phase,
      outcome: input.outcome,
      httpStatus: input.httpStatus ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ? sanitizeSecretText(input.errorMessage) : null,
      retryable: input.retryable ?? null,
      durationMs: input.durationMs ?? null,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} فشل تسجيل المحاولة:`, err);
  }
}

/**
 * ينشر منشوراً تمت المطالبة به (status=processing). يتكفل بالصورة ثم
 * إنشاء المنشور ثم تحديث الحالة النهائية. لا يرمي — يعيد المنشور المحدّث.
 */
export async function publishClaimedPost(
  claimed: SocialPost,
  actorUserId?: string,
): Promise<SocialPost> {
  const provider = getProvider(claimed.platform);
  const accountId = claimed.accountId;
  const wasScheduled = Boolean(claimed.scheduledAt);

  const failWith = async (err: unknown): Promise<SocialPost> => {
    const providerErr =
      err instanceof SocialProviderError
        ? err
        : new SocialProviderError(
            sanitizeSecretText(err instanceof Error ? err.message : String(err)),
            { retryable: false },
          );
    const transition = decideFailureTransition({
      attempts: claimed.attempts,
      retryable: providerErr.opts.retryable,
      wasScheduled,
    });
    const [updated] = await db
      .update(socialPosts)
      .set({
        status: transition.nextStatus,
        lastError: sanitizeSecretText(providerErr.message),
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(socialPosts.id, claimed.id), eq(socialPosts.status, "processing")))
      .returning();
    console.error(
      `${LOG_PREFIX} فشل نشر ${claimed.id} (محاولة ${claimed.attempts}/${MAX_PUBLISH_ATTEMPTS}, ${
        transition.terminal ? "نهائي" : "سيُعاد"
      }): ${providerErr.message}`,
    );
    return updated ?? { ...claimed, status: transition.nextStatus, lastError: providerErr.message };
  };

  if (!accountId) {
    return failWith(new SocialProviderError("المنشور بلا حساب مستهدف", { retryable: false }));
  }

  // 1) الوسائط (إن وجدت): فيديو واحد، أو حتى 4 صور، أو صورة الخبر القديمة
  const mediaIds: string[] = [];
  let videoMediaId: string | undefined;
  const composeUrls = Array.isArray(claimed.mediaUrls) ? claimed.mediaUrls : [];
  const hasComposeMedia = claimed.mediaKind !== "none" && composeUrls.length > 0;
  if (hasComposeMedia || (claimed.imageSource !== "none" && claimed.imageUrl)) {
    const started = Date.now();
    try {
      if (claimed.mediaKind === "video" && composeUrls[0]) {
        if (!provider.uploadVideoFromUrl) {
          throw new SocialProviderError(
            "نشر الفيديو مدعوم عبر وسيلة Publer فقط حالياً — فعّل SOCIAL_PUBLISH_TRANSPORT=publer",
            { retryable: false },
          );
        }
        const safeUrl = assertSafeImageUrl(absolutizeImageUrl(composeUrls[0]));
        videoMediaId = await provider.uploadVideoFromUrl(accountId, safeUrl);
      } else if (claimed.mediaKind === "image" && composeUrls.length > 0) {
        for (const url of composeUrls.slice(0, MAX_POST_IMAGES)) {
          const image = await resolveImageForSocialUpload(url);
          mediaIds.push(await provider.uploadImage(accountId, image));
        }
      } else if (claimed.imageUrl) {
        const image = await resolveImageForSocialUpload(claimed.imageUrl);
        mediaIds.push(await provider.uploadImage(accountId, image));
      }
      await recordAttempt({
        postId: claimed.id,
        phase: "media_upload",
        outcome: "success",
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const pErr = err instanceof SocialProviderError ? err : null;
      await recordAttempt({
        postId: claimed.id,
        phase: "media_upload",
        outcome: "error",
        httpStatus: pErr?.opts.httpStatus,
        errorCode: pErr?.opts.errorCode,
        errorMessage: err instanceof Error ? err.message : String(err),
        retryable: pErr?.opts.retryable ?? false,
        durationMs: Date.now() - started,
      });
      return failWith(err);
    }
  }

  // 2) إنشاء المنشور
  const started = Date.now();
  try {
    const finalText = composeXPostText(claimed.text, claimed.linkUrl);
    const result = await provider.createPost(accountId, {
      text: finalText,
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      videoMediaId,
    });
    await recordAttempt({
      postId: claimed.id,
      phase: "create_post",
      outcome: "success",
      durationMs: Date.now() - started,
    });
    const [updated] = await db
      .update(socialPosts)
      .set({
        status: "published",
        publishedAt: new Date(),
        externalPostId: result.externalPostId,
        externalPostUrl: result.externalPostUrl,
        publishedByUserId: actorUserId ?? claimed.createdByUserId,
        lastError: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, claimed.id))
      .returning();
    console.log(`${LOG_PREFIX} نُشر ${claimed.id} → ${result.externalPostUrl}`);

    if (updated?.articleId) {
      void notifyAuthorOfSocialPostStatus(updated.id, "social_published").catch((err) => {
        console.error(`${LOG_PREFIX} فشل إشعار الكاتب بالنشر على X:`, err);
      });
    }

    return updated;
  } catch (err) {
    const pErr = err instanceof SocialProviderError ? err : null;
    await recordAttempt({
      postId: claimed.id,
      phase: "create_post",
      outcome: "error",
      httpStatus: pErr?.opts.httpStatus,
      errorCode: pErr?.opts.errorCode,
      errorMessage: err instanceof Error ? err.message : String(err),
      retryable: pErr?.opts.retryable ?? false,
      durationMs: Date.now() - started,
    });
    return failWith(err);
  }
}

// ── مقترحات كتّاب الرأي (نافذة 24 ساعة) ───────────────────────────────

export const SOCIAL_POST_OPINION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OpinionSocialWindowCheck {
  eligible: boolean;
  reason?: "NOT_PUBLISHED" | "FUTURE_PUBLISHED" | "EXPIRED_24H" | "INVALID_DATE";
  remainingMs: number;
  windowExpiresAt: Date | null;
}

export function isWithinOpinionSocialWindow(
  publishedAt: Date | string | null | undefined,
  now = Date.now(),
): OpinionSocialWindowCheck {
  if (!publishedAt) {
    return { eligible: false, reason: "NOT_PUBLISHED", remainingMs: 0, windowExpiresAt: null };
  }
  const pubTime = new Date(publishedAt).getTime();
  if (Number.isNaN(pubTime)) {
    return { eligible: false, reason: "INVALID_DATE", remainingMs: 0, windowExpiresAt: null };
  }
  if (pubTime > now) {
    return { eligible: false, reason: "FUTURE_PUBLISHED", remainingMs: 0, windowExpiresAt: null };
  }
  const diffMs = now - pubTime;
  const remainingMs = SOCIAL_POST_OPINION_WINDOW_MS - diffMs;
  const windowExpiresAt = new Date(pubTime + SOCIAL_POST_OPINION_WINDOW_MS);
  if (diffMs > SOCIAL_POST_OPINION_WINDOW_MS) {
    return { eligible: false, reason: "EXPIRED_24H", remainingMs: 0, windowExpiresAt };
  }
  return { eligible: true, remainingMs: Math.max(0, remainingMs), windowExpiresAt };
}

export interface AuthorSocialProposalStatus {
  eligible: boolean;
  reason?: string;
  publishedAt: Date | null;
  windowExpiresAt: Date | null;
  remainingMs: number;
  article: {
    id: string;
    title: string;
    url: string;
    imageUrl: string | null;
  };
  existingProposal: SocialPost | null;
}

export async function getAuthorSocialProposalStatus(
  articleId: string,
  authorUserId: string,
): Promise<AuthorSocialProposalStatus> {
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      status: articles.status,
      articleType: articles.articleType,
      authorId: articles.authorId,
      submitterId: articles.submitterId,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) {
    throw new SocialPublishValidationError("المقال غير موجود", 404);
  }
  if (article.articleType !== "opinion") {
    throw new SocialPublishValidationError("هذه الميزة مخصصة لمقالات الرأي فقط", 400);
  }
  if (article.authorId !== authorUserId && article.submitterId !== authorUserId) {
    throw new SocialPublishValidationError("لا تملك صلاحية على هذا المقال", 403);
  }

  const articleSummary = {
    id: article.id,
    title: article.title,
    url: buildArticleUrl(article),
    imageUrl: article.imageUrl || null,
  };

  const [existingProposal] = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.articleId, articleId),
        eq(socialPosts.createdByUserId, authorUserId),
      ),
    )
    .orderBy(desc(socialPosts.createdAt))
    .limit(1);

  if (article.status !== "published" || !article.publishedAt) {
    return {
      eligible: false,
      reason: "NOT_PUBLISHED",
      publishedAt: article.publishedAt ?? null,
      windowExpiresAt: null,
      remainingMs: 0,
      article: articleSummary,
      existingProposal: existingProposal ?? null,
    };
  }

  const windowCheck = isWithinOpinionSocialWindow(article.publishedAt);
  return {
    eligible: windowCheck.eligible,
    reason: windowCheck.reason,
    publishedAt: article.publishedAt,
    windowExpiresAt: windowCheck.windowExpiresAt,
    remainingMs: windowCheck.remainingMs,
    article: articleSummary,
    existingProposal: existingProposal ?? null,
  };
}

export interface CreateAuthorSocialProposalInput {
  articleId: string;
  authorUserId: string;
  text: string;
  textSource: "title" | "custom";
}

export async function createOrUpdateAuthorSocialProposal(
  input: CreateAuthorSocialProposalInput,
): Promise<SocialPost> {
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      status: articles.status,
      articleType: articles.articleType,
      authorId: articles.authorId,
      submitterId: articles.submitterId,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(eq(articles.id, input.articleId))
    .limit(1);

  if (!article) {
    throw new SocialPublishValidationError("المقال غير موجود", 404);
  }
  if (article.articleType !== "opinion") {
    throw new SocialPublishValidationError("هذه الميزة مخصصة لمقالات الرأي فقط", 400);
  }
  if (article.authorId !== input.authorUserId && article.submitterId !== input.authorUserId) {
    throw new SocialPublishValidationError("لا تملك صلاحية على هذا المقال", 403);
  }
  if (article.status !== "published" || !article.publishedAt) {
    throw new SocialPublishValidationError("لا يمكن تقديم مقترح لمقال غير منشور بعد", 400);
  }

  const windowCheck = isWithinOpinionSocialWindow(article.publishedAt);
  if (!windowCheck.eligible) {
    if (windowCheck.reason === "EXPIRED_24H") {
      throw new SocialPublishValidationError(
        "انتهت مهلة الـ24 ساعة لتقديم مقترح النشر الاجتماعي لهذا المقال",
        400,
      );
    }
    throw new SocialPublishValidationError("المقال لم يُنشر بعد", 400);
  }

  const linkUrl = buildArticleUrl(article);
  const validation = validateXPostText(input.text, linkUrl);
  if (validation.empty) {
    throw new SocialPublishValidationError("نص المنشور فارغ");
  }
  if (!validation.valid) {
    throw new SocialPublishValidationError(
      `النص يتجاوز الحد الأقصى لمنصة X (${validation.weightedLength}/25000)`,
    );
  }

  const imageUrl = article.imageUrl || null;
  const imageSource = imageUrl ? "article" : "none";
  const account = await getConnectedAccount("x");
  const accountId = account?.id || null;

  // التحقق من وجود مسودة سابقة للكاتب لنفس المقال لتحديثها ومنع التكرار
  const [existingDraft] = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.articleId, input.articleId),
        eq(socialPosts.createdByUserId, input.authorUserId),
        eq(socialPosts.status, "draft"),
      ),
    )
    .limit(1);

  if (existingDraft) {
    const [updated] = await db
      .update(socialPosts)
      .set({
        text: input.text.trim(),
        textSource: input.textSource,
        linkUrl,
        imageSource,
        imageUrl,
        accountId: accountId || existingDraft.accountId,
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, existingDraft.id))
      .returning();
    return updated;
  }

  // إذا كان هناك منشور نُشر أو جُدول مسبقاً، نمنع إنشاء مسودة مكررة
  const [activePost] = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.articleId, input.articleId),
        eq(socialPosts.createdByUserId, input.authorUserId),
        inArray(socialPosts.status, ["scheduled", "processing", "published"]),
      ),
    )
    .limit(1);

  if (activePost) {
    throw new SocialPublishValidationError(
      "تمت معالجة أو جدولة مقترح هذا المقال بالفعل",
      409,
    );
  }

  const [post] = await db
    .insert(socialPosts)
    .values({
      articleId: article.id,
      platform: "x",
      accountId,
      textSource: input.textSource,
      text: input.text.trim(),
      linkUrl,
      imageSource,
      imageUrl,
      mediaKind: "none",
      mediaUrls: [],
      status: "draft",
      createdByUserId: input.authorUserId,
    })
    .returning();

  return post;
}
