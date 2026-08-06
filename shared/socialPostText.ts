// حساب طول منشور X الموزون — تقريب مطابق لإعداد twitter-text v3:
// المحارف في نطاقات «الوزن 100» (تشمل اللاتينية والعربية) تُحسب 1،
// وما عداها (إيموجي، CJK، …) يُحسب 2، وكل رابط يُحسب 23 بغض النظر عن طوله
// (اختصار t.co). يستخدمه العميل للعداد والخادم للتحقق قبل النشر.

export const X_MAX_WEIGHTED_LENGTH = 280;
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
  remaining: number;
  valid: boolean;
  empty: boolean;
}

/** تحقق موحّد للعميل والخادم: الطول، المتبقي، والصلاحية */
export function validateXPostText(text: string, linkUrl?: string | null): XTextValidation {
  const composed = composeXPostText(text, linkUrl);
  const weightedLength = xWeightedLength(composed);
  return {
    weightedLength,
    remaining: X_MAX_WEIGHTED_LENGTH - weightedLength,
    valid: weightedLength > 0 && weightedLength <= X_MAX_WEIGHTED_LENGTH,
    empty: composed.trim().length === 0,
  };
}
