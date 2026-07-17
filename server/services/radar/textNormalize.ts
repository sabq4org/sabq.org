/**
 * تطبيع عربي/إنجليزي مشترك لتجميع القصص والفجوات والصلة.
 */

const ARABIC_STOPWORDS = new Set([
  "في", "من", "على", "الى", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي",
  "بعد", "قبل", "عبر", "ضد", "بين", "لدي", "خلال", "امام", "أمام", "حول", "دون",
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "at", "by", "with",
  "is", "are", "was", "were", "as", "it", "its", "from", "after", "before", "over",
]);

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function significantTokens(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((t) => t.length > 1 && !ARABIC_STOPWORDS.has(t));
}

/** بصمة موضوع — أبرز وحدات معجمية مرتبة */
export function topicFingerprintFor(title: string, maxTokens = 10): string {
  const tokens = Array.from(new Set(significantTokens(title))).sort();
  return tokens.slice(0, maxTokens).join(" ").substring(0, 300) || normalizeText(title).substring(0, 300);
}

/** احتواء الكلمات: common / min(|A|,|B|) */
export function keywordContainment(a: string, b: string): number {
  const setA = new Set(significantTokens(a));
  const setB = new Set(significantTokens(b));
  if (!setA.size || !setB.size) return 0;
  let common = 0;
  for (const token of setA) if (setB.has(token)) common++;
  return common / Math.min(setA.size, setB.size);
}
