/**
 * محرّك الذكاء الرياضي — الإعدادات المشتركة (أعلام التفعيل، أوزان الأهمية،
 * أنواع اللقطات، ومساعد ترتيب الأهمية). لا اعتماد على db/AI هنا — وحدة نقيّة
 * يستوردها بقيّة المحرّك بلا دوائر استيراد.
 */
import type { CompetitionCategory } from "../saudiLeagueService";

/**
 * العلَم الرئيس: المحرّك (cron + التوليد التلقائي) مُطفأ افتراضياً حتى الاعتماد.
 * القراءة من الجدول تظلّ تعمل دائماً؛ العلَم يحكم التوليد فقط (كلفة/كمون).
 */
export function isSportsIntelEnabled(): boolean {
  return process.env.SPORTS_INTEL_ENABLED === "true";
}

/** نطاق اللقطة داخل الجدول. */
export type InsightScope = "global" | "competition" | "match" | "user";

/**
 * أنواع اللقطات — تُعرَض/تُرتَّب حسبها في الواجهة.
 *   scene: بطاقة «المشهد الآن» (مباراة بارزة).
 *   scene_summary: خلاصة المشهد العامة.
 *   match_pre|match_live|match_post: بطاقة المباراة الذكية حسب الطور.
 *   trend: قصّة موسم/نمط.
 *   anomaly: رقم/سلسلة صادمة.
 *   prediction: توقّع مفسّر.
 *   digest: موجز مخصّص.
 */
export type InsightKind =
  | "scene"
  | "scene_summary"
  | "match_pre"
  | "match_live"
  | "match_post"
  | "trend"
  | "anomaly"
  | "prediction"
  | "digest";

/** الأهمية الأساسية لكل فئة بطولة (0-100 قبل تعديلات المباراة). */
const CATEGORY_BASE: Record<CompetitionCategory, number> = {
  world: 90,
  saudi: 85,
  european: 72,
  gulf: 64,
  arab: 54,
};

export interface RankableFixture {
  category?: CompetitionCategory | null;
  competitionSlug?: string | null;
  status: { live: boolean; finished: boolean; elapsed: number | null };
  goals: { home: number | null; away: number | null };
}

/**
 * ترتيب أهمية مباراة (0-100) لعرض «المشهد الآن»: أساس الفئة + دفعات للأحداث
 * الحيّة والأهداف والنهايات المثيرة والمباريات المتقاربة قرب النهاية. حتمية
 * تماماً (لا AI) — تُستخدم لترتيب ما نعرضه/نولّد له لقطة.
 */
export function matchImportance(fx: RankableFixture): number {
  const base = fx.category ? CATEGORY_BASE[fx.category] ?? 55 : 55;
  let score = base;

  const gh = fx.goals.home ?? 0;
  const ga = fx.goals.away ?? 0;
  const total = gh + ga;
  const diff = Math.abs(gh - ga);
  const elapsed = fx.status.elapsed ?? 0;

  if (fx.status.live) {
    score += 6;
    score += Math.min(total * 2, 10); // مباراة غزيرة الأهداف
    if (elapsed >= 75 && diff <= 1) score += 8; // نهاية متقاربة مشتعلة
    else if (elapsed >= 75) score += 3;
  } else if (fx.status.finished) {
    score += 2;
    score += Math.min(total, 6);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** كم لقطة «مشهد» نُبقيها/نعرضها. */
export const SCENE_MAX_CARDS = 8;
