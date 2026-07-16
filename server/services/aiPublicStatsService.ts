/**
 * إحصاءات الذكاء الاصطناعي العامة — تغذّي قسم «الأرقام تتحدث» في صفحة /sabq-ai.
 *
 * قاعدة المصداقية (من رأس SabqAI.tsx): لا أرقام لحظية وهمية — كل رقم هنا
 * استعلام قراءة حقيقي من جداول الإنتاج، مع كاش ذاكرة قصير حتى لا تلمس
 * الصفحة العامة القاعدة إلا مرة كل بضع دقائق.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { memoryCache } from "../memoryCache";

export interface AiPublicStats {
  /** وقت حساب الأرقام فعليًا — تعرضه الواجهة كـ«آخر تحديث» صادق */
  generatedAt: string;
  ai: {
    totalOps: number;
    todayOps: number;
    totalTokens: number;
    successRate: number; // 0–100 بمنزلة عشرية واحدة
    sinceDate: string | null; // أول يوم في سجل الاستخدام (إطلاق مركز القياس)
    daily: { date: string; count: number }[]; // آخر 14 يومًا تصاعديًا
  };
  comments: { total: number; aiAnalyzed: number };
  stories: { total: number };
  articles: { totalPublished: number; todayPublished: number };
}

const CACHE_KEY = "public:ai-stats";
const CACHE_TTL_MS = 5 * 60 * 1000;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function computeStats(): Promise<AiPublicStats> {
  // «اليوم» بتوقيت الرياض (UTC+3 ثابت بلا توقيت صيفي) والأعمدة timestamp
  // بلا منطقة مخزنة بـ UTC — الإزاحة اليدوية تُبقي الشرط نطاقيًا فيستفيد
  // من فهارس created_at/published_at.
  const riyadhDayStartUtc = sql`(date_trunc('day', now() + interval '3 hours') - interval '3 hours')`;

  const [aiAgg, aiDaily, commentsAgg, storiesAgg, articlesAgg] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::bigint AS total_ops,
        count(*) FILTER (WHERE created_at >= ${riyadhDayStartUtc})::bigint AS today_ops,
        coalesce(sum(input_tokens + output_tokens), 0)::bigint AS total_tokens,
        CASE WHEN count(*) = 0 THEN 0
             ELSE round(100.0 * count(*) FILTER (WHERE status = 'success') / count(*), 1)
        END AS success_rate,
        min(created_at + interval '3 hours')::date AS since_date
      FROM ai_usage_logs
    `),
    db.execute(sql`
      SELECT (created_at + interval '3 hours')::date AS date, count(*)::bigint AS count
      FROM ai_usage_logs
      WHERE created_at >= ${riyadhDayStartUtc} - interval '13 days'
      GROUP BY 1
      ORDER BY 1
    `),
    db.execute(sql`
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE ai_analyzed_at IS NOT NULL)::bigint AS ai_analyzed
      FROM comments
    `),
    db.execute(sql`SELECT count(*)::bigint AS total FROM stories`),
    db.execute(sql`
      SELECT count(*)::bigint AS total_published,
             count(*) FILTER (WHERE published_at >= ${riyadhDayStartUtc})::bigint AS today_published
      FROM articles
      WHERE status = 'published'
    `),
  ]);

  const agg = aiAgg.rows[0] ?? {};
  const commentsRow = commentsAgg.rows[0] ?? {};
  const articlesRow = articlesAgg.rows[0] ?? {};

  return {
    generatedAt: new Date().toISOString(),
    ai: {
      totalOps: num(agg.total_ops),
      todayOps: num(agg.today_ops),
      totalTokens: num(agg.total_tokens),
      successRate: num(agg.success_rate),
      sinceDate: agg.since_date ? String(agg.since_date) : null,
      daily: aiDaily.rows.map((r) => ({ date: String(r.date), count: num(r.count) })),
    },
    comments: {
      total: num(commentsRow.total),
      aiAnalyzed: num(commentsRow.ai_analyzed),
    },
    stories: { total: num(storiesAgg.rows[0]?.total) },
    articles: {
      totalPublished: num(articlesRow.total_published),
      todayPublished: num(articlesRow.today_published),
    },
  };
}

export async function getAiPublicStats(): Promise<AiPublicStats> {
  const cached = memoryCache.get<AiPublicStats>(CACHE_KEY);
  if (cached !== null) return cached;

  const stats = await computeStats();
  memoryCache.set(CACHE_KEY, stats, CACHE_TTL_MS);
  return stats;
}
