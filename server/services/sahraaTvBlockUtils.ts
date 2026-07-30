/**
 * دوال نقية لبلوك قناة الصحراء — بلا اعتماد على DB/storage (للاختبارات).
 */

export const SAHRAA_TV_BLOCK_KEY = "sahraa_tv_block";

/** مسار التشغيل العام — بروكسي يتجنّب 403 من video.twimg.com على Referer سبق */
export const SAHRAA_MEDIA_PATH = "/api/sahraa-tv-block/media";

export const DEFAULT_SAHRAA_TITLE = "قناة الصحراء";

/** رابط افتراضي لأول نشر — يُستبدل يومياً من لوحة التحكم */
export const DEFAULT_SAHRAA_X_POST_URL =
  "https://x.com/Sahraachannel/status/2082154114893361183/video/1";

export const DEFAULT_SAHRAA_DESCRIPTION =
  "أحدث مقطع فيديو من قناة الصحراء";

export interface SahraaTvBlockConfig {
  isActive: boolean;
  title: string;
  description: string;
  /** رابط منشور إكس الأصلي (مصدر الفيديو فقط — لا يُعرض كتغريدة) */
  xPostUrl: string;
  /** رابط MP4 مباشر للتشغيل الأصلي */
  videoUrl: string;
  /** صورة غلاف الفيديو إن توفرت */
  posterUrl: string;
  updatedAt: string | null;
}

export interface SahraaTvBlockPublic {
  isVisible: boolean;
  title?: string;
  description?: string;
  videoUrl?: string;
  posterUrl?: string;
  updatedAt?: string | null;
}

export interface XVideoVariant {
  url: string;
  bitrate?: number;
  content_type?: string;
  format?: string;
  container?: string;
}

const STATUS_URL_RE =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/i;

/** يستخرج معرف المنشور من رابط إكس */
export function extractTweetId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = normalizeXPostUrl(raw);
  if (!normalized) return null;
  const m = normalized.match(/\/status\/(\d{5,25})$/i);
  return m?.[1] ?? null;
}

/** يستخرج/يطبع رابط منشور إكس؛ يعيد null إن كان غير صالح. */
export function normalizeXPostUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(candidate);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return null;
    // يقبل /status/{id} و/status/{id}/video/1 وغيرها من لواحق إكس
    const m = url.pathname.match(
      /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:\/(?:video|photo)\/\d+)?\/?/i,
    );
    if (!m) return null;
    return `https://twitter.com/${m[1]}/status/${m[2]}`;
  } catch {
    return null;
  }
}

/**
 * يختار أفضل MP4 للرئيسية: يفضّل ~720p ثم أعلى جودة متاحة.
 * لا يعيد m3u8 — التشغيل عبر <video src> يحتاج ملفاً مباشراً.
 */
export function pickBestMp4Url(variants: XVideoVariant[]): string | null {
  const mp4s = variants.filter((v) => {
    if (!v?.url || typeof v.url !== "string") return false;
    if (/\.m3u8(\?|$)/i.test(v.url) || /mpegURL/i.test(v.content_type ?? "")) return false;
    const isMp4 =
      /\.mp4(\?|$)/i.test(v.url) ||
      v.content_type === "video/mp4" ||
      v.format === "video/mp4" ||
      v.container === "mp4";
    return isMp4;
  });
  if (mp4s.length === 0) return null;

  const sorted = [...mp4s].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const around720 = sorted.find(
    (v) => (v.bitrate ?? 0) >= 1_500_000 && (v.bitrate ?? 0) <= 3_000_000,
  );
  return (around720 ?? sorted[0]).url;
}

/** إعدادات الإطلاق قبل أول حفظ من اللوحة */
export function defaultSahraaTvBlockConfig(): SahraaTvBlockConfig {
  return {
    isActive: true,
    title: DEFAULT_SAHRAA_TITLE,
    description: DEFAULT_SAHRAA_DESCRIPTION,
    xPostUrl: DEFAULT_SAHRAA_X_POST_URL,
    videoUrl: "",
    posterUrl: "",
    updatedAt: null,
  };
}

export function isValidXPostUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const n = normalizeXPostUrl(raw);
  return !!n && STATUS_URL_RE.test(n);
}

export function parseSahraaTvBlockConfig(value: unknown): SahraaTvBlockConfig {
  if (!value || typeof value !== "object") {
    return defaultSahraaTvBlockConfig();
  }
  const v = value as Record<string, unknown>;
  const defaults = defaultSahraaTvBlockConfig();
  const title =
    typeof v.title === "string" && v.title.trim()
      ? v.title.trim().slice(0, 80)
      : defaults.title;
  const description =
    typeof v.description === "string"
      ? v.description.trim().slice(0, 500)
      : defaults.description;
  const xPostUrl =
    typeof v.xPostUrl === "string" ? v.xPostUrl.trim() : defaults.xPostUrl;
  const videoUrl = typeof v.videoUrl === "string" ? v.videoUrl.trim() : "";
  const posterUrl = typeof v.posterUrl === "string" ? v.posterUrl.trim() : "";
  const updatedAt =
    typeof v.updatedAt === "string" && Number.isFinite(Date.parse(v.updatedAt))
      ? v.updatedAt
      : null;

  return {
    // قبل أول حفظ: ظاهر. بعد الحفظ: يتبع القيمة المخزّنة (حتى false)
    isActive: typeof v.isActive === "boolean" ? v.isActive : defaults.isActive,
    title,
    description,
    xPostUrl: xPostUrl || defaults.xPostUrl,
    videoUrl,
    posterUrl,
    updatedAt,
  };
}

export function toPublicSahraaTvBlock(config: SahraaTvBlockConfig): SahraaTvBlockPublic {
  if (!config.isActive || !config.videoUrl) {
    return { isVisible: false };
  }
  return {
    isVisible: true,
    title: config.title,
    description: config.description,
    videoUrl: config.videoUrl,
    posterUrl: config.posterUrl || undefined,
    updatedAt: config.updatedAt,
  };
}

export interface SaveSahraaTvBlockInput {
  isActive?: boolean;
  title?: string;
  description?: string;
  xPostUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
}

export function mergeSahraaTvBlockConfig(
  current: SahraaTvBlockConfig,
  input: SaveSahraaTvBlockInput,
  nowIso: string = new Date().toISOString(),
): SahraaTvBlockConfig {
  const nextUrlRaw =
    input.xPostUrl !== undefined ? String(input.xPostUrl ?? "").trim() : current.xPostUrl;

  if (nextUrlRaw && !normalizeXPostUrl(nextUrlRaw)) {
    const err = new Error("INVALID_X_POST_URL");
    (err as Error & { code: string }).code = "INVALID_X_POST_URL";
    throw err;
  }

  const urlChanged =
    input.xPostUrl !== undefined &&
    normalizeXPostUrl(nextUrlRaw) !== normalizeXPostUrl(current.xPostUrl);

  return {
    isActive: input.isActive !== undefined ? !!input.isActive : current.isActive,
    title:
      input.title !== undefined
        ? (String(input.title).trim().slice(0, 80) || DEFAULT_SAHRAA_TITLE)
        : current.title,
    description:
      input.description !== undefined
        ? String(input.description).trim().slice(0, 500)
        : current.description,
    xPostUrl: nextUrlRaw,
    // عند تغيير رابط إكس نُفرّغ الفيديو ليُعاد استخراجه
    videoUrl:
      input.videoUrl !== undefined
        ? String(input.videoUrl ?? "").trim()
        : urlChanged
          ? ""
          : current.videoUrl,
    posterUrl:
      input.posterUrl !== undefined
        ? String(input.posterUrl ?? "").trim()
        : urlChanged
          ? ""
          : current.posterUrl,
    updatedAt: nowIso,
  };
}
