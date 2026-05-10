import {
  extractArticleKeywords,
  getReadingHistory,
  type ArticleLike,
  type ReadingEntry,
} from "./readingHistory";

export interface MatchResult {
  score: number;
  reason: string;
  hasEnoughHistory: boolean;
  level: "high" | "medium" | "low";
}

const MIN_HISTORY = 3;
const RECENCY_HALF_LIFE_DAYS = 7;
const FALLBACK_REASON = "ابدأ القراءة لتفعيل التوصيات";

function levelFor(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function computeMatchScore(
  article: ArticleLike,
  history?: ReadingEntry[],
): MatchResult {
  const h = history ?? getReadingHistory();
  if (h.length < MIN_HISTORY) {
    return {
      score: 0,
      reason: FALLBACK_REASON,
      hasEnoughHistory: false,
      level: "low",
    };
  }

  const articleCatId = article.categoryId || article.category?.id || undefined;
  const articleCatName = article.category?.nameAr || undefined;
  const articleKeywords = extractArticleKeywords(article);

  // Category frequency factor (40%)
  let catCount = 0;
  if (articleCatId) {
    catCount = h.filter((e) => e.categoryId === articleCatId).length;
  }
  const catScore = Math.min(1, catCount / Math.min(Math.max(h.length, 4), 8));

  // Keyword/tag overlap factor (30%)
  const userKw = new Map<string, number>();
  for (const e of h) {
    for (const k of e.keywords) {
      userKw.set(k, (userKw.get(k) || 0) + 1);
    }
  }
  let kwHits = 0;
  let topMatchedTerm: string | undefined;
  let topMatchedCount = 0;
  for (const k of articleKeywords) {
    const c = userKw.get(k);
    if (c) {
      kwHits += c;
      if (c > topMatchedCount) {
        topMatchedCount = c;
        topMatchedTerm = k;
      }
    }
  }
  const kwScore = Math.min(1, kwHits / 5);

  // Recency factor (30%): how recently we read same category
  const now = Date.now();
  let recencyScore = 0;
  if (articleCatId) {
    const same = h.filter((e) => e.categoryId === articleCatId);
    if (same.length > 0) {
      const mostRecent = Math.max(...same.map((e) => e.timestamp));
      const ageDays = (now - mostRecent) / (24 * 60 * 60 * 1000);
      recencyScore = Math.pow(0.5, Math.max(ageDays, 0) / RECENCY_HALF_LIFE_DAYS);
    }
  }

  const weighted = catScore * 0.4 + kwScore * 0.3 + recencyScore * 0.3;
  const score = Math.max(0, Math.min(100, Math.round(weighted * 100)));

  const contribs = [
    { type: "category" as const, value: catScore * 0.4 },
    { type: "keyword" as const, value: kwScore * 0.3 },
    { type: "recency" as const, value: recencyScore * 0.3 },
  ].sort((a, b) => b.value - a.value);

  const top = contribs[0];
  let reason = "خبر شائع قد يهمّك";
  if (top.value > 0) {
    if (top.type === "category" && articleCatName && catCount > 0) {
      reason = `تتابع «${articleCatName}»`;
    } else if (top.type === "keyword" && topMatchedTerm) {
      reason = `يخص «${topMatchedTerm}»`;
    } else if (top.type === "recency" && articleCatName) {
      reason = `قسم «${articleCatName}»`;
    } else {
      reason = "مقترح بناءً على قراءاتك الأخيرة";
    }
  }

  return {
    score,
    reason,
    hasEnoughHistory: true,
    level: levelFor(score),
  };
}
