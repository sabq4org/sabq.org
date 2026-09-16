/**
 * إحصاءات الذكاء الاصطناعي العامة — تغذّي قسم «الأرقام تتحدث» في صفحة /sabq-ai.
 *
 * قاعدة المصداقية (من رأس SabqAI.tsx): لا أرقام لحظية وهمية — كل رقم هنا
 * استعلام قراءة حقيقي من جداول الإنتاج، مع كاش ذاكرة قصير حتى لا تلمس
 * الصفحة العامة القاعدة إلا مرة كل بضع دقائق.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { withSWR } from "../memoryCache";

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
    /** عمليات اليوم موزعة على المجالات — تحرير هو «كل ما عدا الثلاثة الأخرى» */
    todayByDomain: { editorial: number; sports: number; visual: number; audio: number };
  };
  comments: { total: number; aiAnalyzed: number };
  stories: { total: number };
  articles: { totalPublished: number; todayPublished: number };
  audio: { totalMinutes: number }; // دقائق صوت منتجة فعليًا (tts_usage_logs الناجحة)
  radar: { totalItems: number }; // مواد رصدها الرادار من المصادر العالمية
  sports: { totalOps: number }; // عمليات الذكاء في التغطيات الرياضية
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

  // مفاتيح المجال الرياضي كما في docs/systems/registry.json (نظام sports-tournaments)
  const sportsKeyPredicate = sql`(
    feature_key LIKE 'sports-%'
    OR feature_key LIKE 'saudi-league-%'
    OR feature_key IN ('world-cup-news', 'sportmonks-news', 'kings-cup-news')
  )`;

  const [aiAgg, aiDaily, commentsAgg, storiesAgg, articlesAgg, ttsAgg, radarAgg, sportsAgg, domainAgg] = await Promise.all([
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
      SELECT
        (SELECT count(*)::bigint FROM articles WHERE status = 'published') AS total_published,
        (SELECT count(*)::bigint FROM articles
         WHERE status = 'published' AND published_at >= ${riyadhDayStartUtc}) AS today_published
    `),
    db.execute(sql`
      SELECT coalesce(sum(duration_ms), 0)::bigint AS total_duration_ms
      FROM tts_usage_logs
      WHERE success = true
    `),
    db.execute(sql`SELECT count(*)::bigint AS total FROM radar_items`),
    db.execute(sql`
      SELECT count(*)::bigint AS total
      FROM ai_usage_logs
      WHERE ${sportsKeyPredicate}
    `),
    db.execute(sql`
      SELECT
        CASE
          WHEN ${sportsKeyPredicate} THEN 'sports'
          WHEN operation = 'image' OR feature_key IN (
            'visual-ai', 'nano-banana-images', 'smart-thumbnail', 'infographic-ai',
            'image-generation', 'story-cards', 'media-caption'
          ) THEN 'visual'
          WHEN operation = 'tts' OR feature_key = 'audio-newsletter' THEN 'audio'
          ELSE 'editorial'
        END AS domain,
        count(*)::bigint AS count
      FROM ai_usage_logs
      WHERE created_at >= ${riyadhDayStartUtc}
      GROUP BY 1
    `),
  ]);

  const agg = aiAgg.rows[0] ?? {};
  const commentsRow = commentsAgg.rows[0] ?? {};
  const articlesRow = articlesAgg.rows[0] ?? {};

  const todayByDomain = { editorial: 0, sports: 0, visual: 0, audio: 0 };
  for (const row of domainAgg.rows) {
    const domain = String(row.domain) as keyof typeof todayByDomain;
    if (domain in todayByDomain) todayByDomain[domain] = num(row.count);
  }

  return {
    generatedAt: new Date().toISOString(),
    ai: {
      totalOps: num(agg.total_ops),
      todayOps: num(agg.today_ops),
      totalTokens: num(agg.total_tokens),
      successRate: num(agg.success_rate),
      sinceDate: agg.since_date ? String(agg.since_date) : null,
      daily: aiDaily.rows.map((r) => ({ date: String(r.date), count: num(r.count) })),
      todayByDomain,
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
    audio: { totalMinutes: Math.round(num(ttsAgg.rows[0]?.total_duration_ms) / 60_000) },
    radar: { totalItems: num(radarAgg.rows[0]?.total) },
    sports: { totalOps: num(sportsAgg.rows[0]?.total) },
  };
}

export async function getAiPublicStats(): Promise<AiPublicStats> {
  // One nine-query batch per process, including cold concurrent requests.
  // Keep the last measured snapshot visible while its replacement is computed;
  // generatedAt remains the actual measurement time (never refreshed on a hit).
  return withSWR(CACHE_KEY, CACHE_TTL_MS, CACHE_TTL_MS, computeStats);
}
