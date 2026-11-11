/**
 * كلمات محظورة من النشر — المنطق البحت (بلا قاعدة بيانات) ليُختبر وحده.
 *
 * القائمة يديرها مدير النظام من اللوحة. أي مادة يرد فيها أحد عناصرها لا
 * تُنشر ولا تُجدول من غير حساب المسؤول. هذا قرار تحريري صريح بقائمة يكتبها
 * الإنسان، وليس تقدير «حساسية» آليًا (ذاك معلوماتي فقط ولا يمنع النشر).
 */

export const BANNED_WORD_CODE = "BANNED_WORD";
export const BANNED_WORD_MIN_LENGTH = 2;
export const BANNED_WORD_MAX_LENGTH = 80;

export type BannedWordEntry = { id: string; word: string };

/** الحقول التي تُفحص، بترتيب ظهورها في رسالة المنع. */
export const BANNED_WORD_FIELDS = ["title", "subtitle", "excerpt", "content", "keywords"] as const;
export type BannedWordField = (typeof BANNED_WORD_FIELDS)[number];

export const BANNED_WORD_FIELD_LABELS: Record<BannedWordField, string> = {
  title: "العنوان",
  subtitle: "العنوان الفرعي",
  excerpt: "المقتطف",
  content: "النص",
  keywords: "الوسوم",
};

export type BannedWordContent = Partial<Record<BannedWordField, unknown>> & {
  seo?: unknown;
};

export type BannedWordMatch = {
  id: string;
  word: string;
  fields: Array<{ field: BannedWordField; count: number }>;
};

/**
 * توحيد الكتابة العربية حتى لا يُتجاوز المنع بتشكيل أو تطويل أو همزة:
 * التشكيل، التطويل، أ/إ/آ/ٱ → ا، ى → ي، ة → ه، ؤ → و، ئ → ي. والمسافات
 * المتتالية (ومنها غير المنكسرة) مسافة واحدة.
 */
export function normalizeBannedText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640\u200C-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}

/** نص المحرر HTML: نزيل الوسوم ونفك الكيانات الشائعة قبل الفحص. */
export function bannedPlainText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => bannedPlainText(item)).join(" \n ");
  if (typeof value !== "string") return "";
  return value
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/blockquote)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * مطابقة العبارة كاملة: محاطة بما ليس حرفًا ولا رقمًا (\b لا تعمل مع العربية).
 * «نحو الرؤية» لا تطابق «رؤية 2030» ولا «نحو الرؤيتين».
 */
export function countBannedOccurrences(normalizedText: string, normalizedWord: string): number {
  if (!normalizedWord) return 0;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegex(normalizedWord)}(?![\\p{L}\\p{N}_])`,
    "gu",
  );
  return normalizedText.match(pattern)?.length ?? 0;
}

function fieldTexts(content: BannedWordContent): Record<BannedWordField, string> {
  const seo = content.seo && typeof content.seo === "object" ? (content.seo as { keywords?: unknown }) : null;
  return {
    title: normalizeBannedText(bannedPlainText(content.title)),
    subtitle: normalizeBannedText(bannedPlainText(content.subtitle)),
    excerpt: normalizeBannedText(bannedPlainText(content.excerpt)),
    content: normalizeBannedText(bannedPlainText(content.content)),
    keywords: normalizeBannedText(
      [bannedPlainText(content.keywords), bannedPlainText(seo?.keywords)].join(" \n "),
    ),
  };
}

export function findBannedWords(words: BannedWordEntry[], content: BannedWordContent): BannedWordMatch[] {
  if (words.length === 0) return [];
  const texts = fieldTexts(content);
  const matches: BannedWordMatch[] = [];
  for (const entry of words) {
    const needle = normalizeBannedText(entry.word);
    if (needle.length < BANNED_WORD_MIN_LENGTH) continue;
    const fields: BannedWordMatch["fields"] = [];
    for (const field of BANNED_WORD_FIELDS) {
      const count = countBannedOccurrences(texts[field], needle);
      if (count > 0) fields.push({ field, count });
    }
    if (fields.length > 0) matches.push({ id: entry.id, word: entry.word, fields });
  }
  return matches;
}

/**
 * عند تعديل مادة منشورة أصلًا: نمنع فقط الكلمة التي **أُدخلت** بهذا الحفظ.
 * مادة نُشرت قبل إضافة الكلمة للقائمة تبقى قابلة للتصحيح دون أن يعلق محررها.
 */
export function newlyIntroducedBannedWords(
  words: BannedWordEntry[],
  before: BannedWordContent,
  after: BannedWordContent,
): BannedWordMatch[] {
  const existed = new Set(findBannedWords(words, before).map((match) => match.id));
  return findBannedWords(words, after).filter((match) => !existed.has(match.id));
}

function countLabel(count: number): string {
  if (count === 1) return "";
  if (count === 2) return " (مرتان)";
  return ` (${count} مرات)`;
}

export function bannedWordLocations(match: BannedWordMatch): string {
  return match.fields
    .map(({ field, count }) => `${BANNED_WORD_FIELD_LABELS[field]}${countLabel(count)}`)
    .join("، ");
}

/** رسالة المنع التي يراها المحرر في اللوحة و«مكتب سبق» و«نشر سبق». */
export function bannedWordMessage(matches: BannedWordMatch[]): string {
  if (matches.length === 0) return "";
  const names = matches.map((match) => `«${match.word}»`).join(" و");
  const intro =
    matches.length === 1
      ? `لا يمكن نشر هذا الخبر: ورد فيه ${names}، وهي ضمن الكلمات المحظورة من النشر بقرار إدارة التحرير.`
      : `لا يمكن نشر هذا الخبر: وردت فيه ${names}، وهي ضمن الكلمات المحظورة من النشر بقرار إدارة التحرير.`;
  const where =
    matches.length === 1
      ? ` وردت في: ${bannedWordLocations(matches[0])}.`
      : "";
  return `${intro}${where} احذفها ثم انشر، أو راجع إدارة التحرير.`;
}

/** تنظيف ما يكتبه المدير قبل الحفظ؛ يعيد null إن كان غير صالح. */
export function cleanBannedWordInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const word = raw.replace(/[\s\u00A0]+/g, " ").trim().replace(/^[«"'“”]+|[»"'“”]+$/g, "").trim();
  const normalized = normalizeBannedText(word);
  if (normalized.length < BANNED_WORD_MIN_LENGTH || word.length > BANNED_WORD_MAX_LENGTH) return null;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return null;
  return word;
}

/**
 * مواضع العبارة في نص خام (مواضع الأحرف الأصلية) بالمطابقة الموحّدة نفسها،
 * ليُظلّلها المحرر ويقفز إليها. نطاق واحد لكل ورود: [البداية، النهاية).
 */
export function locateBannedWord(text: string, word: string): Array<[number, number]> {
  const needle = normalizeBannedText(word);
  if (!needle) return [];
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[\s\u00A0]/.test(char)) {
      if (normalized.endsWith(" ") || normalized.length === 0) continue;
      normalized += " ";
      starts.push(index);
      ends.push(index + 1);
      continue;
    }
    const mapped = normalizeBannedText(char);
    for (const piece of mapped) {
      normalized += piece;
      starts.push(index);
      ends.push(index + 1);
    }
    // حرف يُحذف بالتوحيد (تشكيل/تطويل) يتبع الحرف الذي قبله في التظليل.
    if (mapped.length === 0 && ends.length > 0) ends[ends.length - 1] = index + 1;
  }
  const ranges: Array<[number, number]> = [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(needle)}(?![\\p{L}\\p{N}_])`, "gu");
  for (const match of normalized.matchAll(pattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length - 1;
    ranges.push([starts[from], ends[to]]);
  }
  return ranges;
}
