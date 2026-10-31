// «أداء أخباري» / «أدائي» في تطبيق «سبق» (2026-10-31): عقد استجابة واحدة
// تحل محل /contributor/analytics + /contributor/ranking في الصفحة المعاد
// تصميمها. منطق خالص هنا، والاستعلامات في
// server/services/contributorPerformanceService.ts.

import { z } from "zod";

export const PERFORMANCE_PERIODS = ["7", "30", "all"] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

export const performanceQuerySchema = z.object({
  period: z.enum(PERFORMANCE_PERIODS).default("30"),
});

export interface PerformanceDay {
  date: string; // YYYY-MM-DD
  views: number;
}

export interface PerformanceTopArticle {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  views: number;
  likes: number;
  comments: number;
}

export interface ContributorPerformance {
  role: "reporter" | "writer";
  period: PerformancePeriod;
  generatedAt: string;
  views: number;
  /** نسبة التغير عن الفترة السابقة بنفس الطول؛ null في «كل الوقت» أو بلا أساس. */
  viewsTrendPct: number | null;
  publishedInPeriod: number;
  series: PerformanceDay[];
  peak: PerformanceDay | null;
  likes: number;
  comments: number;
  bookmarks: number;
  newFollowers: number;
  topArticles: PerformanceTopArticle[];
  statusCounts: { published: number; pending: number; needsChanges: number; scheduled: number; draft: number };
  activity: { thisWeekCount: number; lastPublishedAt: string | null };
  rank: { rank: number; total: number } | null;
  featuredComment: { content: string; articleTitle: string } | null;
}

export function periodDays(period: PerformancePeriod): number | null {
  return period === "all" ? null : Number(period);
}

/** YYYY-MM-DD بتوقيت UTC (جدول article_daily_stats بالتاريخ فقط). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** سلسلة أيام كاملة (اليوم الأخير = اليوم) مع أصفار للأيام الفارغة. */
export function fillSeries(rows: Array<{ date: string; views: number }>, days: number, today: Date): PerformanceDay[] {
  const byDate = new Map<string, number>();
  for (const row of rows) byDate.set(String(row.date).slice(0, 10), (byDate.get(String(row.date).slice(0, 10)) ?? 0) + (Number(row.views) || 0));
  const out: PerformanceDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = isoDay(addDays(today, -i));
    out.push({ date, views: byDate.get(date) ?? 0 });
  }
  return out;
}

export function trendPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function peakDay(series: PerformanceDay[]): PerformanceDay | null {
  let best: PerformanceDay | null = null;
  for (const day of series) if (day.views > 0 && (!best || day.views >= best.views)) best = day;
  return best;
}

/** ترتيب المستخدم بين أصحاب الأخبار (مرتبة تنازليًا بالمشاهدات). */
export function rankOf(rows: Array<{ ownerId: string | null; views: number }>, userId: string): { rank: number; total: number } | null {
  const sorted = rows.filter((r) => r.ownerId).sort((a, b) => b.views - a.views);
  const index = sorted.findIndex((r) => r.ownerId === userId);
  return index >= 0 ? { rank: index + 1, total: sorted.length } : null;
}

/**
 * `article_daily_stats.views` لقطة تراكمية (إجمالي مشاهدات الخبر نهاية اليوم)
 * لا مشاهدات اليوم وحده، ولا يُكتب صف اليوم الجاري. لذلك مشاهدات اليوم D =
 * لقطة D ناقص لقطة اليوم السابق، ومشاهدات اليوم الجاري = العدّاد الحالي ناقص
 * آخر لقطة. `baseDay` يوم قبل بداية السلسلة ويُستعمل أساسًا فقط.
 * الخبر المنشور بعد `baseDay` يبدأ من صفر؛ والأقدم بلا لقطة أساس لا يُحسب
 * فرق أول صف له حتى لا يظهر إجماليه كله في يوم واحد.
 */
export function snapshotViewDeltas(input: {
  rows: Array<{ articleId: string; date: string; views: number }>;
  articles: Array<{ id: string; views: number; publishedAt: Date | null }>;
  baseDay: string;
  today: string;
}): Array<{ articleId: string; date: string; views: number }> {
  const byArticle = new Map<string, Array<{ date: string; views: number }>>();
  for (const row of input.rows) {
    const date = String(row.date).slice(0, 10);
    const list = byArticle.get(row.articleId) ?? [];
    list.push({ date, views: Number(row.views) || 0 });
    byArticle.set(row.articleId, list);
  }
  const out: Array<{ articleId: string; date: string; views: number }> = [];
  for (const article of input.articles) {
    const fresh = article.publishedAt ? isoDay(article.publishedAt) > input.baseDay : false;
    let prev: number | null = fresh ? 0 : null;
    const rows = (byArticle.get(article.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    for (const row of rows) {
      if (row.date <= input.baseDay) { prev = row.views; continue; }
      if (prev !== null && row.views > prev) out.push({ articleId: article.id, date: row.date, views: row.views - prev });
      prev = row.views;
    }
    const current = Number(article.views) || 0;
    if (prev !== null && current > prev) out.push({ articleId: article.id, date: input.today, views: current - prev });
  }
  return out;
}
