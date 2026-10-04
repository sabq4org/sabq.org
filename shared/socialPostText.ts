// حساب طول منشور X الموزون — تقريب مطابق لإعداد twitter-text v3:
// المحارف في نطاقات «الوزن 100» (تشمل اللاتينية والعربية) تُحسب 1،
// وما عداها (إيموجي، CJK، …) يُحسب 2، وكل رابط يُحسب 23 بغض النظر عن طوله
// (اختصار t.co). يستخدمه العميل للعداد والخادم للتحقق قبل النشر.

/** العتبة القياسية — بعدها تظهر التغريدة مطوية («عرض المزيد») في الخط الزمني */
export const X_MAX_WEIGHTED_LENGTH = 280;
/** حد الرفض الفعلي — منشورات Premium/التوثيق المؤسسي الطويلة (حساب @sabqorg) */
export const X_MAX_PREMIUM_WEIGHTED_LENGTH = 25_000;
export const X_URL_WEIGHT = 23;

// نطاقات codepoint ذات الوزن 1 كما في twitter-text v3 config
const SINGLE_WEIGHT_RANGES: Array<[number, number]> = [
  [0, 4351], // لاتيني + عربي + عبري + سريلي وغيرها
  [8192, 8205], // مسافات وفواصل طباعية
  [8208, 8223], // شرطات وعلامات اقتباس
  [8242, 8247], // برايم
];

const URL_REGEX = /https?:\/\/[^\s]+/g;

function codepointWeight(cp: number): number {
  for (const [lo, hi] of SINGLE_WEIGHT_RANGES) {
    if (cp >= lo && cp <= hi) return 1;
  }
  return 2;
}

/** الطول الموزون لنص بدون روابط */
function weightedLengthOfPlain(text: string): number {
  let total = 0;
  for (const ch of text) {
    total += codepointWeight(ch.codePointAt(0) ?? 0);
  }
  return total;
}

/** الطول الموزون الكامل — كل رابط يُستبدل بوزن ثابت 23 */
export function xWeightedLength(text: string): number {
  let total = 0;
  let lastIndex = 0;
  URL_REGEX.lastIndex = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    total += weightedLengthOfPlain(text.slice(lastIndex, match.index));
    total += X_URL_WEIGHT;
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  total += weightedLengthOfPlain(text.slice(lastIndex));
  return total;
}

/**
 * يزيل علامات التغميق في Markdown (`**نص**` و`__نص__`). X لا يعرض Markdown،
 * فتظهر النجوم حرفياً في التغريدة. الروابط لا تُمس، و`__` الملاصقة لحرف أو
 * رقم (عربي أو لاتيني) جزء من وسم أو معرّف وليست تغميقاً.
 */
const EMPHASIS_STARS = /\*\*(?=\S)([^*\n]*?\S)\*\*/g;
const EMPHASIS_UNDERSCORES = /(?<![\p{L}\p{N}_])__(?=\S)([^_\n]*?\S)__(?![\p{L}\p{N}_])/gu;

function stripEmphasisPlain(text: string): string {
  return text.replace(EMPHASIS_STARS, "$1").replace(EMPHASIS_UNDERSCORES, "$1");
}

export function stripMarkdownEmphasis(text: string): string {
  let out = "";
  let lastIndex = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    out += stripEmphasisPlain(text.slice(lastIndex, match.index)) + match[0];
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  return out + stripEmphasisPlain(text.slice(lastIndex));
}

/**
 * يركّب النص النهائي للمنشور: النص + الرابط في سطر جديد (إن وُجد).
 * الرابط لا يُدمج داخل النص حتى يبقى قابلاً للإزالة والعدّ المستقل.
 */
export function composeXPostText(text: string, linkUrl?: string | null): string {
  const trimmed = text.trim();
  if (!linkUrl) return trimmed;
  return trimmed.length > 0 ? `${trimmed}\n${linkUrl}` : linkUrl;
}

export interface XTextValidation {
  weightedLength: number;
  /** المتبقي حتى العتبة القياسية 280 (قد يكون سالباً لمنشور Premium طويل) */
  remaining: number;
  /** صالح حتى حد Premium ‏(25k) — الرفض الفعلي */
  valid: boolean;
  /** تجاوز 280 — سيظهر مطوياً ويتطلب اشتراك Premium على الحساب */
  overStandard: boolean;
  empty: boolean;
}

/** تحقق موحّد للعميل والخادم: الطول، المتبقي، والصلاحية */
export function validateXPostText(text: string, linkUrl?: string | null): XTextValidation {
  const composed = composeXPostText(text, linkUrl);
  const weightedLength = xWeightedLength(composed);
  return {
    weightedLength,
    remaining: X_MAX_WEIGHTED_LENGTH - weightedLength,
    valid: weightedLength > 0 && weightedLength <= X_MAX_PREMIUM_WEIGHTED_LENGTH,
    overStandard: weightedLength > X_MAX_WEIGHTED_LENGTH,
    empty: composed.trim().length === 0,
  };
}
