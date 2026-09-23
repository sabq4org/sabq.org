/**
 * حراس اكتمال مخرجات التحرير التوليدي.
 *
 * الخلفية (حادثة 2026-08-03): مع Structured Outputs، إذا أصدر النموذج علامة
 * تنصيص ASCII خامًا (") داخل حقل content بدل الصيغة المهرَّبة (\")، تعتبرها
 * قواعد الفرض النحوي إغلاقًا لسلسلة JSON وتُكمل بقية البنية بشكل صالح تمامًا —
 * فيصل المحتوى مبتورًا عند علامة التنصيص بلا max_tokens ولا خطأ parse.
 * حراس البتر السابقة (#352) تفحص stop_reason فقط فلا تلتقط هذه الحالة.
 */

/** يجرّد HTML إلى نص صافٍ لمقارنة الأطوال */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** لا نطبق فحص النسبة على المدخلات الضخمة (سلاسل بريد) حيث التنظيف المشروع يزيل معظمها */
const RATIO_CHECK_MIN_INPUT = 400;
const RATIO_CHECK_MAX_INPUT = 10_000;
const MIN_OUTPUT_RATIO = 0.5;

/**
 * يرمي خطأ إذا بدا المحتوى المحرر مبتورًا. يُستدعى بعد JSON.parse في مسار
 * النموذج الأساسي (فيسقط للبديل) وبعد مسار البديل (فيصعد لإعادة المحاولة).
 *
 * فحصان:
 * 1. محتوى HTML لا ينتهي بوسم إغلاق = قُطع داخل فقرة (البصمة الحتمية للعلة).
 * 2. النص الصافي أقصر من نصف المدخل الصافي = أُسقطت فقرات كاملة (شبكة أمان
 *    احتياطية، تُتجاوز للمدخلات الضخمة حيث التنظيف المشروع يقلّص كثيرًا).
 */
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)));
}

/**
 * أرقام ذات دلالة في النص (أسعار، نسب، إحصاءات) — تُستثنى الخانات داخل هاش/معرف.
 * لا نُقفل رقماً من خانة واحدة بلا فاصل عشري (يتكرر في كل نص).
 */
const SOURCE_NUMBER_RE =
  /(?<![A-Za-z0-9_.])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?(?![A-Za-z0-9_])/g;

function isLockedNumberToken(token: string): boolean {
  const core = toLatinDigits(token).replace(/,/g, "").replace(/%/g, "").replace(/[+-]/g, "");
  if (core.includes(".")) return true;
  return core.replace(/\D/g, "").length >= 2;
}

function digitCore(token: string): string {
  return toLatinDigits(token).replace(/[^\d.]/g, "");
}

function canonicalNumber(token: string): string | null {
  const latin = toLatinDigits(token).replace(/,/g, "");
  const pct = latin.endsWith("%");
  const raw = pct ? latin.slice(0, -1) : latin;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return `${pct ? "pct" : "n"}:${value}`;
}

function matchNumberTokens(text: string): string[] {
  return [...text.matchAll(new RegExp(SOURCE_NUMBER_RE.source, "g"))].map((match) => match[0]);
}

export function extractLockedSourceNumbers(source: string): string[] {
  const latinSource = toLatinDigits(source);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of matchNumberTokens(latinSource)) {
    if (!isLockedNumberToken(token)) continue;
    const key = canonicalNumber(token);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff += 1;
  }
  return diff;
}

function isLikelyMutatedNumber(sourceToken: string, candidateToken: string): boolean {
  const sourceCore = digitCore(sourceToken);
  const candidateCore = digitCore(candidateToken);
  if (!sourceCore || sourceCore === candidateCore) return false;
  if (sourceToken.endsWith("%") !== candidateToken.endsWith("%")) return false;

  if (hammingDistance(sourceCore, candidateCore) === 1) return true;

  const sourceValue = Number(sourceCore);
  const candidateValue = Number(candidateCore);
  if (!Number.isFinite(sourceValue) || !Number.isFinite(candidateValue)) return false;
  const delta = Math.abs(sourceValue - candidateValue);
  return delta === 1 || delta === 10 || delta === 100 || delta === 1000;
}

export type RestoredSourceNumbers = {
  text: string;
  restored: Array<{ from: string; to: string }>;
};

/**
 * يعيد أرقام المصدر إن بدّلها النموذج برقم قريب (مثل 4433.62 → 3433.62).
 * لا يخترع أرقاماً ناقصة من المتن؛ يصحّح التحريف الواضح فقط.
 */
export function restoreSourceNumbers(source: string, output: string): RestoredSourceNumbers {
  if (!output) return { text: output, restored: [] };

  const locked = extractLockedSourceNumbers(source);
  if (locked.length === 0) return { text: output, restored: [] };

  const sourceKeys = new Set(
    locked.map((token) => canonicalNumber(token)).filter((key): key is string => Boolean(key)),
  );

  let text = output;
  const restored: Array<{ from: string; to: string }> = [];

  for (const original of locked) {
    const originalKey = canonicalNumber(original);
    if (!originalKey) continue;

    const present = matchNumberTokens(text).some(
      (token) => canonicalNumber(token) === originalKey,
    );
    if (present) continue;

    const candidates = matchNumberTokens(text).filter((token) => {
      const key = canonicalNumber(token);
      if (!key || sourceKeys.has(key)) return false;
      return isLikelyMutatedNumber(original, token);
    });

    const unique = [...new Set(candidates)];
    if (unique.length !== 1) continue;

    const mutated = unique[0];
    text = text.split(mutated).join(original);
    restored.push({ from: mutated, to: original });
  }

  return { text, restored };
}

export function assertEditedContentComplete(content: string, inputText: string): void {
  // مواد الـ spam (درجة < 10) قد تعود بمحتوى فارغ عمدًا — الغياب ليس بترًا
  if (!content) return;

  const trimmed = content.trimEnd();
  const usesHtmlBlocks = /<p[\s>]/i.test(trimmed);
  if (usesHtmlBlocks && !/<\/[a-z][a-z0-9]*>$/i.test(trimmed)) {
    throw new Error(
      "Edited content truncated: HTML body does not end with a closing tag (unescaped quote closed the JSON string early?)"
    );
  }

  const inputPlain = htmlToPlainText(inputText);
  if (inputPlain.length < RATIO_CHECK_MIN_INPUT || inputPlain.length > RATIO_CHECK_MAX_INPUT) return;

  const contentPlain = htmlToPlainText(content);
  if (contentPlain.length < inputPlain.length * MIN_OUTPUT_RATIO) {
    throw new Error(
      `Edited content truncated: output ${contentPlain.length} chars < ${MIN_OUTPUT_RATIO * 100}% of input ${inputPlain.length} chars`
    );
  }
}
