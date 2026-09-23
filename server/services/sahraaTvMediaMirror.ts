/**
 * نسخ فيديو الصحراء إلى R2 مرة واحدة — بدل بث كل مشاهدة عبر بروكسي Express.
 *
 * الفيديو يومي واحد؛ قبل هذا كانت كل مشاهدة تسحب MP4 كاملًا عبر خادم الـAPI
 * على Railway (طلبات 1-3 ثوانٍ + أخطاء ERR_STREAM_PREMATURE_CLOSE مستمرة في
 * حادثة بطء 2026-08-07). بعد النسخ يُقدَّم من media.sabq.org (حافة كلاودفلير)
 * ويبقى بروكسي /media احتياطًا لما قبل اكتمال النسخ أو عند غياب إعداد R2.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 90_000;

interface SahraaR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

/** نفس بيئة فيديوهات/صور الأخبار (NEWS_IMAGES_R2_*) — المفاتيح موجودة في الإنتاج. */
function getR2Config(): SahraaR2Config | null {
  const accountId = (process.env.NEWS_IMAGES_R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.NEWS_IMAGES_R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = (process.env.NEWS_IMAGES_R2_BUCKET_NAME || "").trim();
  const publicUrl = (process.env.NEWS_IMAGES_R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

// single-flight لكل tweetId — فتحات متزامنة للرئيسية لا تنسخ الفيديو مرتين
const inflight = new Map<string, Promise<string | null>>();

export function mirrorSahraaVideoToR2(
  videoUrl: string,
  tweetId: string,
): Promise<string | null> {
  const existing = inflight.get(tweetId);
  if (existing) return existing;
  const promise = doMirror(videoUrl, tweetId).finally(() => inflight.delete(tweetId));
  inflight.set(tweetId, promise);
  return promise;
}

async function doMirror(videoUrl: string, tweetId: string): Promise<string | null> {
  const config = getR2Config();
  if (!config) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(videoUrl, {
      headers: {
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (compatible; SabqSahraaTv/1.0; +https://sabq.org)",
        // twimg يرفض Referer سبق — نفس أسلوب البروكسي
        Referer: "https://x.com/",
        Origin: "https://x.com",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!upstream.ok) {
      console.warn("[SahraaTvBlock] mirror upstream", upstream.status, videoUrl);
      return null;
    }
    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_VIDEO_BYTES) {
      console.warn(`[SahraaTvBlock] mirror skipped: declared ${declaredLength} bytes > cap`);
      return null;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_VIDEO_BYTES) {
      console.warn(`[SahraaTvBlock] mirror skipped: size ${buffer.byteLength}`);
      return null;
    }

    const key = `sahraa-tv/${tweetId}.mp4`;
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: upstream.headers.get("content-type") || "video/mp4",
        // المفتاح لكل tweetId — منشور جديد = مفتاح جديد، فالخلود آمن بلا purge
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const url = `${config.publicUrl}/${key}`;
    console.log(
      `[SahraaTvBlock] mirrored to R2 (${Math.round(buffer.byteLength / 1024)}KB): ${url}`,
    );
    return url;
  } catch (e) {
    console.warn("[SahraaTvBlock] mirror failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
