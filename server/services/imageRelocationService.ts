import { and, asc, desc, eq, gt, inArray, like, sql } from "drizzle-orm";
import { db } from "../db";
import { articleEditLocks, articles, imageMigrations } from "@shared/schema";
import { newsImageStorageService } from "./newsImageStorageService";

/**
 * نقل صور Cloudflare Images النشطة إلى R2 (media.sabq.org).
 *
 * Cloudflare Images يحتسب كل تسليم للصورة حتى لو خرج من الكاش، بينما R2 لا
 * يحتسب الخروج. الرفع الجديد يذهب إلى R2 أصلًا؛ الذي يبقى على الخدمة المدفوعة
 * هو ما يُعاد استخدامه من مكتبة الوسائط القديمة والصور الثابتة (صور الكتّاب).
 *
 * القاعدة: ننسخ ولا نحذف. الأصل يبقى على imagedelivery.net فتستمر كل الروابط
 * القديمة بالعمل، وجدول image_migrations يحفظ الرابط القديم مقابل الجديد
 * للتراجع.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FAILED_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const CF_IMAGES_PREFIX = "https://imagedelivery.net/";

export const RELOCATION_PENDING = "pending";
/** صف في الطابور يطلب النسخة الصغيرة (صور شخصية تُعرض بمقاس صغير). */
export const RELOCATION_PENDING_THUMBNAIL = "pending_thumb";
export const RELOCATION_COMPLETED = "completed";
export const RELOCATION_FAILED = "failed";

export interface CloudflareImageRef {
  accountHash: string;
  imageId: string;
  /** رابط النسخة العامة؛ مفتاح الصف في image_migrations. */
  canonicalUrl: string;
  /** بادئة تطابق كل نسخ الصورة نفسها (public، والمقاسات المرنة). */
  prefix: string;
}

export function parseCloudflareImageUrl(rawUrl: unknown): CloudflareImageRef | null {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith(CF_IMAGES_PREFIX)) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.hostname !== "imagedelivery.net") return null;
  const [accountHash, imageId] = parsed.pathname.split("/").filter(Boolean);
  if (!accountHash || !imageId) return null;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(accountHash)) return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(imageId)) return null;
  const prefix = `${CF_IMAGES_PREFIX}${accountHash}/${imageId}/`;
  return { accountHash, imageId, canonicalUrl: `${prefix}public`, prefix };
}

/** الإيقاف من البيئة دون نشر: CF_IMAGE_RELOCATION=off. */
export function isImageRelocationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = String(env.CF_IMAGE_RELOCATION ?? "").trim().toLowerCase();
  return !["off", "0", "false", "disabled"].includes(flag);
}

export function shouldRetryFailedRelocation(lastAttemptAt: Date | null | undefined, now: Date): boolean {
  if (!lastAttemptAt) return true;
  return now.getTime() - lastAttemptAt.getTime() >= FAILED_RETRY_AFTER_MS;
}

/**
 * قيمة lite_optimized_image_url بعد النقل: إن كانت تشير إلى الصورة المنقولة
 * نفسها تصبح رابط R2 (كما تُخزَّن لأخبار R2)، وغير ذلك تبقى كما هي.
 */
export function relocatedLiteUrl(
  currentLiteUrl: string | null | undefined,
  ref: CloudflareImageRef,
  newUrl: string,
): string | null | undefined {
  if (typeof currentLiteUrl === "string" && currentLiteUrl.startsWith(ref.prefix)) return newUrl;
  return currentLiteUrl;
}

function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return map[mimeType] || "bin";
}

async function downloadSource(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(url, {
    // لا نطلب AVIF: نسخ WebP تُبنى من أوسع صيغة مدعومة في sharp.
    headers: { Accept: "image/webp,image/png,image/jpeg,image/gif" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`source responded ${response.status}`);
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/")) throw new Error(`source is not an image (${mimeType || "no type"})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("source is empty");
  if (buffer.length > MAX_SOURCE_BYTES) throw new Error(`source too large (${buffer.length} bytes)`);
  return { buffer, mimeType };
}

export interface RelocationResult {
  ok: boolean;
  newUrl?: string;
  /** true حين وُجد النقل مكتملًا مسبقًا ولم تُنسخ الصورة من جديد. */
  reused?: boolean;
  error?: string;
}

/**
 * ينسخ صورة Cloudflare Images إلى R2 مرة واحدة ويسجل المقابلة. آمن للتكرار:
 * النداء الثاني لنفس الصورة يعيد الرابط المسجل دون نسخ.
 */
export async function relocateCloudflareImageToR2(
  ref: CloudflareImageRef,
  options: { preferThumbnail?: boolean; now?: Date } = {},
): Promise<RelocationResult> {
  const now = options.now ?? new Date();
  const [existing] = await db
    .select()
    .from(imageMigrations)
    .where(eq(imageMigrations.oldUrl, ref.canonicalUrl))
    .limit(1);

  if (existing?.status === RELOCATION_COMPLETED && existing.newUrl) {
    return { ok: true, newUrl: existing.newUrl, reused: true };
  }
  if (existing?.status === RELOCATION_FAILED && !shouldRetryFailedRelocation(existing.completedAt, now)) {
    return { ok: false, error: existing.error || "previous attempt failed" };
  }
  const preferThumbnail = options.preferThumbnail || existing?.status === RELOCATION_PENDING_THUMBNAIL;

  try {
    const source = await downloadSource(ref.canonicalUrl);
    const upload = await newsImageStorageService.upload({
      buffer: source.buffer,
      filename: `${ref.imageId}.${extensionFor(source.mimeType)}`,
      mimeType: source.mimeType,
      purpose: "article-relocated",
      metadata: { source: "cf-images-relocation" },
      forceR2: true,
    });
    const newUrl = preferThumbnail ? upload.thumbnailUrl || upload.deliveryUrl : upload.deliveryUrl;
    if (!upload.success || !newUrl) throw new Error(upload.error || "R2 upload returned no URL");

    const completed = {
      newUrl,
      cloudflareId: ref.imageId,
      status: RELOCATION_COMPLETED,
      fileSize: source.buffer.length,
      error: null,
      completedAt: now,
    };
    await db
      .insert(imageMigrations)
      .values({ oldUrl: ref.canonicalUrl, ...completed })
      .onConflictDoUpdate({ target: imageMigrations.oldUrl, set: completed });
    return { ok: true, newUrl };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const failed = {
      cloudflareId: ref.imageId,
      status: RELOCATION_FAILED,
      error: message,
      completedAt: now,
    };
    await db
      .insert(imageMigrations)
      .values({ oldUrl: ref.canonicalUrl, ...failed })
      .onConflictDoUpdate({ target: imageMigrations.oldUrl, set: failed });
    return { ok: false, error: message };
  }
}

/** صفوف الطابور التي أدخلها المالك عبر SQL (صور شخصية وصور قديمة نشطة). */
export async function processRelocationQueue(limit: number): Promise<{ done: number; failed: number }> {
  const queued = await db
    .select({ oldUrl: imageMigrations.oldUrl, status: imageMigrations.status })
    .from(imageMigrations)
    .where(inArray(imageMigrations.status, [RELOCATION_PENDING, RELOCATION_PENDING_THUMBNAIL]))
    .orderBy(asc(imageMigrations.id))
    .limit(limit);

  let done = 0;
  let failed = 0;
  for (const row of queued) {
    const ref = parseCloudflareImageUrl(row.oldUrl);
    if (!ref || ref.canonicalUrl !== row.oldUrl) {
      await db
        .update(imageMigrations)
        .set({ status: RELOCATION_FAILED, error: "not a canonical imagedelivery.net/<hash>/<id>/public URL", completedAt: new Date() })
        .where(eq(imageMigrations.oldUrl, row.oldUrl));
      failed += 1;
      continue;
    }
    const result = await relocateCloudflareImageToR2(ref, {
      preferThumbnail: row.status === RELOCATION_PENDING_THUMBNAIL,
    });
    if (result.ok) done += 1;
    else failed += 1;
  }
  return { done, failed };
}

/**
 * الأخبار المنشورة حديثًا بصورة من الأرشيف القديم: تُنسخ صورتها إلى R2 ويُبدَّل
 * رابط الخبر. لا يُلمس خبر مفتوح في المحرر (قفل تحرير حي)، ولا يُغيَّر
 * updated_at حتى لا يفشل حفظ المحرر بتعارض نسخة زائف.
 */
export async function relocateRecentArticleImages(
  limit: number,
  windowDays = 3,
): Promise<{ swapped: number; failed: number }> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: articles.id,
      imageUrl: articles.imageUrl,
      liteOptimizedImageUrl: articles.liteOptimizedImageUrl,
    })
    .from(articles)
    .where(
      and(
        eq(articles.status, "published"),
        gt(articles.publishedAt, since),
        like(articles.imageUrl, `${CF_IMAGES_PREFIX}%`),
        sql`not exists (select 1 from ${articleEditLocks} l where l.article_id = ${articles.id} and l.expires_at > (clock_timestamp() at time zone 'UTC'))`,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit);

  let swapped = 0;
  let failed = 0;
  for (const article of candidates) {
    const ref = parseCloudflareImageUrl(article.imageUrl);
    if (!ref || !article.imageUrl) continue;
    const result = await relocateCloudflareImageToR2(ref);
    if (!result.ok || !result.newUrl) {
      failed += 1;
      continue;
    }
    // الشرط على الرابط القديم يمنع الكتابة فوق صورة غيّرها المحرر للتو.
    const updated = await db
      .update(articles)
      .set({
        imageUrl: result.newUrl,
        liteOptimizedImageUrl: relocatedLiteUrl(article.liteOptimizedImageUrl, ref, result.newUrl),
      })
      .where(and(eq(articles.id, article.id), eq(articles.imageUrl, article.imageUrl)))
      .returning({ id: articles.id });
    if (updated.length > 0) {
      swapped += 1;
      await db
        .update(imageMigrations)
        .set({ articlesUpdated: sql`coalesce(${imageMigrations.articlesUpdated}, 0) + 1` })
        .where(eq(imageMigrations.oldUrl, ref.canonicalUrl));
    }
  }
  return { swapped, failed };
}
