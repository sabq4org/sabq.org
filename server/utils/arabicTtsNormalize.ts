/**
 * Arabic TTS text normalization — تفقيط الأرقام والنسب والتواريخ.
 *
 * ElevenLabs / OpenAI / Google often misread Western digits in Arabic news
 * scripts ("2026" → English-style, "15%" → "fifteen percent"). Converting
 * them to spoken Arabic words before synthesis fixes most of that without
 * changing providers.
 *
 * Applied at the leaf TTS services so every caller (newsletters, article
 * summary audio, job queue, voice tests) benefits.
 */

export type TtsNormalizeLanguage = "ar" | "en" | "ur";

const EASTERN_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const ONES_M = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
];
const ONES_M_ACCUSATIVE = [
  "", "واحداً", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
];
const TEENS = [
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر",
  "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
];
const TENS = [
  "", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون",
];
const TENS_ACCUSATIVE = [
  "", "عشرة", "عشرين", "ثلاثين", "أربعين", "خمسين", "ستين", "سبعين", "ثمانين", "تسعين",
];
const HUNDREDS = [
  "", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة",
  "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة",
];

const MONTHS_AR = [
  "", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const DIGIT_WORDS = [
  "صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
];

/** Digits not glued to Latin letters (Arabic letters OK). */
const NUM = String.raw`(?<![A-Za-z0-9])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+)(?![A-Za-z0-9])`;

function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩۰-۹]/g, (d) => EASTERN_DIGITS[d] ?? d)
    .replace(/٬/g, ",")
    .replace(/٫/g, ".");
}

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ");
}

function joinAnd(parts: string[]): string {
  const clean = parts.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} و${clean[1]}`;
  return `${clean.slice(0, -1).join(" و")} و${clean[clean.length - 1]}`;
}

/** Convert 0–999 to Arabic words (masculine absolute form). */
function underThousand(n: number, accusative = false): string {
  if (n === 0) return "";
  if (n < 0 || n > 999 || !Number.isFinite(n)) return String(n);

  const ones = accusative ? ONES_M_ACCUSATIVE : ONES_M;
  const tens = accusative ? TENS_ACCUSATIVE : TENS;
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];

  if (hundreds > 0) parts.push(HUNDREDS[hundreds]);

  if (rem > 0) {
    if (rem < 10) {
      parts.push(ones[rem]);
    } else if (rem < 20) {
      parts.push(TEENS[rem - 10]);
    } else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      if (o === 0) parts.push(tens[t]);
      else parts.push(`${ones[o] || ONES_M[o]} و${tens[t]}`);
    }
  }

  return joinAnd(parts);
}

/**
 * Integer → Arabic words. Supports up to 999,999,999,999.
 * Uses news-friendly absolute masculine forms.
 */
export function integerToArabicWords(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "صفر";
  if (value < 0) return `سالب ${integerToArabicWords(Math.abs(value))}`;

  const n = Math.floor(value);
  if (n > 999_999_999_999) return String(n);

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];

  if (billions === 1) parts.push("مليار");
  else if (billions === 2) parts.push("ملياران");
  else if (billions >= 3 && billions <= 10) parts.push(`${underThousand(billions)} مليارات`);
  else if (billions > 10) parts.push(`${underThousand(billions)} مليار`);

  if (millions === 1) parts.push("مليون");
  else if (millions === 2) parts.push("مليونان");
  else if (millions >= 3 && millions <= 10) parts.push(`${underThousand(millions)} ملايين`);
  else if (millions > 10) parts.push(`${underThousand(millions)} مليون`);

  if (thousands === 1) parts.push("ألف");
  else if (thousands === 2) parts.push("ألفان");
  else if (thousands >= 3 && thousands <= 10) parts.push(`${underThousand(thousands)} آلاف`);
  else if (thousands > 10) parts.push(`${underThousand(thousands)} ألف`);

  if (rest > 0) parts.push(underThousand(rest));

  return joinAnd(parts);
}

/** Year like 2026 → "ألفين وستة وعشرين" (common news reading). */
export function yearToArabicWords(year: number): string {
  if (year < 1000 || year > 9999) return integerToArabicWords(year);
  if (year >= 2000 && year < 3000) {
    const rem = year - 2000;
    if (rem === 0) return "ألفين";
    return `ألفين و${underThousand(rem, true)}`;
  }
  return integerToArabicWords(year);
}

function decimalToArabicWords(raw: string): string {
  const normalized = raw.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return raw;
  const [intPart, fracPart] = normalized.split(".");
  const intWords = integerToArabicWords(parseInt(intPart, 10));
  if (!fracPart || /^0+$/.test(fracPart)) return intWords;
  if (fracPart.length <= 2) {
    const fracNum = parseInt(fracPart, 10);
    return `${intWords} فاصلة ${integerToArabicWords(fracNum)}`;
  }
  const fracDigits = fracPart.split("").map((d) => DIGIT_WORDS[parseInt(d, 10)]).join(" ");
  return `${intWords} فاصلة ${fracDigits}`;
}

function digitsIndividually(digits: string): string {
  return digits.split("").map((d) => DIGIT_WORDS[parseInt(d, 10)] ?? d).join(" ");
}

function looksLikeIdOrPhone(digits: string): boolean {
  return digits.length >= 8;
}

function verbalizeNumberToken(raw: string): string {
  const cleaned = raw.replace(/,/g, "");
  if (!cleaned) return raw;
  if (looksLikeIdOrPhone(cleaned.replace(/\./g, ""))) {
    return digitsIndividually(cleaned.replace(/\./g, ""));
  }
  if (cleaned.includes(".")) return decimalToArabicWords(cleaned);
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n)) return raw;
  if (cleaned.length === 4 && n >= 1900 && n <= 2100) return yearToArabicWords(n);
  return integerToArabicWords(n);
}

function dateToArabic(year: number, month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return `${integerToArabicWords(day)}/${integerToArabicWords(month)}/${yearToArabicWords(year)}`;
  }
  return `${integerToArabicWords(day)} ${MONTHS_AR[month]} ${yearToArabicWords(year)}`;
}

function timeToArabic(hour: number, minute: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "صباحاً" : "مساءً";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (minute === 0) return `الساعة ${integerToArabicWords(h12)} ${period}`;
  if (minute === 30) return `الساعة ${integerToArabicWords(h12)} والنصف ${period}`;
  return `الساعة ${integerToArabicWords(h12)} و${integerToArabicWords(minute)} دقيقة ${period}`;
}

function isMostlyArabic(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return false;
  const arabic = (letters.match(/[\u0600-\u06FF]/g) || []).length;
  return arabic / letters.length >= 0.25;
}

export interface NormalizeTextForTtsOptions {
  language?: TtsNormalizeLanguage | "auto";
}

/**
 * Normalize a script for Arabic TTS: strip HTML, Eastern→Western digits,
 * then verbalize dates, times, percentages, currency, and remaining numbers.
 */
export function normalizeTextForTts(
  text: string,
  options: NormalizeTextForTtsOptions | TtsNormalizeLanguage = "ar",
): string {
  if (!text) return text;

  const opts: NormalizeTextForTtsOptions =
    typeof options === "string" ? { language: options } : options;
  const lang = opts.language ?? "ar";

  let out = toWesternDigits(stripHtml(text));

  if (lang === "en" || lang === "ur") return out;
  if (lang === "auto" && !isMostlyArabic(out)) return out;

  out = out.replace(
    /(?<![A-Za-z0-9])(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?![A-Za-z0-9])/g,
    (_m, a, b, c) => dateToArabic(parseInt(a, 10), parseInt(b, 10), parseInt(c, 10)),
  );
  out = out.replace(
    /(?<![A-Za-z0-9])(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?![A-Za-z0-9])/g,
    (_m, d, mo, y) => dateToArabic(parseInt(y, 10), parseInt(mo, 10), parseInt(d, 10)),
  );

  out = out.replace(/(?:الساعة\s*)?([01]?\d|2[0-3]):([0-5]\d)(?![A-Za-z0-9])/g, (_m, hh, mm) =>
    timeToArabic(parseInt(hh, 10), parseInt(mm, 10)),
  );

  out = out.replace(
    new RegExp(`${NUM}\\s*[%٪]`, "g"),
    (_m, num) => `${decimalToArabicWords(String(num).replace(/,/g, ""))} بالمئة`,
  );
  out = out.replace(
    new RegExp(`${NUM}\\s*بالمئة`, "g"),
    (_m, num) => `${decimalToArabicWords(String(num).replace(/,/g, ""))} بالمئة`,
  );

  out = out.replace(
    new RegExp(`${NUM}\\s*(مليون|مليار|ألف)?\\s*(ريال|ر\\.?\\s*س\\.?|SAR)\\b`, "gi"),
    (_m, num, scale) => {
      const base = decimalToArabicWords(String(num).replace(/,/g, ""));
      if (scale === "مليون") return `${base} مليون ريال`;
      if (scale === "مليار") return `${base} مليار ريال`;
      if (scale === "ألف") return `${base} ألف ريال`;
      return `${base} ريال`;
    },
  );

  out = out.replace(
    new RegExp(`${NUM}\\s*(ملايين|مليونان|مليون|مليارات|ملياران|مليار|آلاف|ألفان|ألف)(?=\\s|$|[،,.])`, "g"),
    (_m, num, scale) => `${decimalToArabicWords(String(num).replace(/,/g, ""))} ${scale}`,
  );

  out = out.replace(
    /(?<![A-Za-z0-9])(\d{1,4})\s*[–—-]\s*(\d{1,4})(?![A-Za-z0-9])/g,
    (_m, a, b) => `${verbalizeNumberToken(a)} إلى ${verbalizeNumberToken(b)}`,
  );

  out = out.replace(new RegExp(NUM, "g"), (_m, num) => verbalizeNumberToken(num));

  return out.replace(/[ \t]{2,}/g, " ").replace(/ \n/g, "\n").trim();
}
