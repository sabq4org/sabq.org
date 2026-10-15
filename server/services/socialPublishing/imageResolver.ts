// جلب صورة المنشور الاجتماعي وتجهيزها لرفعها إلى X:
// - حارس SSRF عبر assertSafeImageUrl (https فقط + allowlist مضيفين)
// - المسارات النسبية (/public-objects/…) تُطلَق على أصل الموقع العام
// - X يقبل JPEG/PNG/GIF فقط للصور — WebP/AVIF تُحوَّل إلى JPEG عبر sharp
// - سقف 5MB بعد التحويل (حد X لصور المنشورات)
import sharp from "sharp";
import { assertSafeImageUrl } from "../../utils/safeImageUrl";
import { SocialProviderError } from "./types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

function publicOrigin(): string {
  return process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "https://sabq.org";
}

/** يحول مسار صورة نسبياً إلى URL مطلق على أصل الموقع العام */
export function absolutizeImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${publicOrigin().replace(/\/$/, "")}${trimmed}`;
  throw new SocialProviderError("رابط الصورة غير مدعوم — يلزم https أو مسار يبدأ بـ /", {
    retryable: false,
  });
}

export interface ResolvedSocialImage {
  buffer: Buffer;
  mimeType: string;
}

export async function resolveImageForSocialUpload(rawUrl: string): Promise<ResolvedSocialImage> {
  const absolute = absolutizeImageUrl(rawUrl);
  let safeUrl: string;
  try {
    safeUrl = assertSafeImageUrl(absolute);
  } catch (err: any) {
    throw new SocialProviderError(
      `رابط الصورة مرفوض أمنياً: ${err?.message || "غير مسموح"}`,
      { retryable: false },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(safeUrl, { signal: controller.signal, redirect: "error" });
  } catch (err: any) {
    throw new SocialProviderError(
      err?.name === "AbortError"
        ? "مهلة جلب صورة المنشور"
        : `تعذر جلب صورة المنشور: ${err?.message || "network error"}`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new SocialProviderError(`تعذر جلب صورة المنشور (HTTP ${res.status})`, {
      httpStatus: res.status,
      retryable: res.status === 429 || res.status >= 500,
    });
  }
  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith("image/")) {
    throw new SocialProviderError(`الرابط لا يعيد صورة (content-type: ${contentType})`, {
      retryable: false,
    });
  }
  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength > MAX_IMAGE_BYTES * 2) {
    throw new SocialProviderError("الصورة أكبر من الحد المسموح للجلب", { retryable: false });
  }
  let buffer = Buffer.from(arrayBuf);

  // تحديد الصيغة الفعلية من البايتات لا من الامتداد
  let format: string | undefined;
  try {
    format = (await sharp(buffer).metadata()).format;
  } catch {
    throw new SocialProviderError("الملف المجلوب ليس صورة صالحة", { retryable: false });
  }

  let mimeType: string;
  if (format === "jpeg" || format === "jpg") {
    mimeType = "image/jpeg";
  } else if (format === "png") {
    mimeType = "image/png";
  } else if (format === "gif") {
    mimeType = "image/gif";
  } else if (format === "webp" || format === "avif" || format === "heif") {
    // X لا يقبل WebP/AVIF في منشورات الصور — نحول إلى JPEG
    buffer = await sharp(buffer).jpeg({ quality: 88 }).toBuffer();
    mimeType = "image/jpeg";
  } else {
    throw new SocialProviderError(`صيغة الصورة غير مدعومة للنشر على X (${format || "غير معروفة"})`, {
      retryable: false,
    });
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    // محاولة ضغط أخيرة قبل الرفض
    buffer = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
    mimeType = "image/jpeg";
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new SocialProviderError("الصورة تتجاوز 5MB بعد الضغط — اختر صورة أصغر", {
        retryable: false,
      });
    }
  }
  return { buffer, mimeType };
}
