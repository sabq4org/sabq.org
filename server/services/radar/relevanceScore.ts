/**
 * حساب الصلة السعودية — نقي (قواميس مضمّنة، بلا DB).
 */
import { normalizeText } from "./textNormalize";
import { SAUDI_NEGATIVE_TERMS, SAUDI_POSITIVE_TERMS } from "./relevanceTerms";

let positiveCache: string[] | null = null;
let negativeCache: string[] | null = null;

function positiveTerms(): string[] {
  if (!positiveCache) positiveCache = SAUDI_POSITIVE_TERMS.map((t) => normalizeText(t)).filter(Boolean);
  return positiveCache;
}

function negativeTerms(): string[] {
  if (!negativeCache) negativeCache = SAUDI_NEGATIVE_TERMS.map((t) => normalizeText(t)).filter(Boolean);
  return negativeCache;
}

function containsAny(hay: string, terms: string[]): string | null {
  for (const term of terms) {
    if (term && hay.includes(term)) return term;
  }
  return null;
}

export function scoreSaudiRelevance(input: {
  title: string;
  body?: string | null;
  categorySlug?: string | null;
  inSaudiTrend?: boolean;
}): { score: number; reasons: string[] } {
  const title = normalizeText(input.title || "");
  const body = normalizeText(input.body || "");
  const reasons: string[] = [];
  let score = 0;

  const pos = positiveTerms();
  const neg = negativeTerms();

  const titleHit = containsAny(title, pos);
  if (titleHit) {
    score += 40;
    reasons.push(`كيان في العنوان: ${titleHit}`);
  } else {
    const bodyHit = containsAny(body, pos);
    if (bodyHit) {
      score += 25;
      reasons.push(`كيان في المتن: ${bodyHit}`);
    }
  }

  if (input.inSaudiTrend) {
    score += 20;
    reasons.push("ترند سعودي في X");
  }

  const slug = (input.categorySlug || "").toLowerCase();
  if (slug.includes("saudi") || slug === "local" || slug === "sports") {
    score += 15;
    reasons.push("تصنيف محلي/رياضي");
  }

  if (
    containsAny(title + " " + body, [
      "مصر",
      "سوريا",
      "العراق",
      "فلسطين",
      "غزة",
      "لبنان",
      "اليمن",
      "iran",
      "إيران",
    ])
  ) {
    score += 10;
    reasons.push("كيان إقليمي");
  }

  const negHit = containsAny(title + " " + body, neg);
  if (negHit) {
    score -= 20;
    reasons.push(`أجنبي ضيق: ${negHit}`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}
