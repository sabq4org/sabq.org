/**
 * دوال نقية لبلوك قناة الصحراء — بلا اعتماد على DB/storage (للاختبارات).
 */

export const SAHRAA_TV_BLOCK_KEY = "sahraa_tv_block";

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
  /** رابط منشور إكس الأصلي (قد يكون x.com أو twitter.com) */
  xPostUrl: string;
  updatedAt: string | null;
}

export interface SahraaTvBlockPublic {
  isVisible: boolean;
  title?: string;
  description?: string;
  /** رابط مطبّع لـ twitter.com ليعمل widgets.js */
  xPostUrl?: string;
  updatedAt?: string | null;
}

const STATUS_URL_RE =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/i;

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

/** إعدادات الإطلاق قبل أول حفظ من اللوحة */
export function defaultSahraaTvBlockConfig(): SahraaTvBlockConfig {
  return {
    isActive: true,
    title: DEFAULT_SAHRAA_TITLE,
    description: DEFAULT_SAHRAA_DESCRIPTION,
    xPostUrl: DEFAULT_SAHRAA_X_POST_URL,
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
    updatedAt,
  };
}

export function toPublicSahraaTvBlock(config: SahraaTvBlockConfig): SahraaTvBlockPublic {
  const normalized = normalizeXPostUrl(config.xPostUrl);
  if (!config.isActive || !normalized) {
    return { isVisible: false };
  }
  return {
    isVisible: true,
    title: config.title,
    description: config.description,
    xPostUrl: normalized,
    updatedAt: config.updatedAt,
  };
}

export interface SaveSahraaTvBlockInput {
  isActive?: boolean;
  title?: string;
  description?: string;
  xPostUrl?: string;
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
    updatedAt: nowIso,
  };
}
