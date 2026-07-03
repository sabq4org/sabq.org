/**
 * محرّك الذكاء الرياضي (Sabq Sports Intelligence) — نقطة التصدير الموحّدة.
 * طبقة AI خلفية تقرأ المشهد الرياضي من مزوّداتنا، تولّد «التقاطات» مصنّفة
 * بالأهمية وتخزّنها، وتقدّمها عبر مسارات /api/sports/intel/* للواجهة.
 */
export * from "./config";
export * from "./insightsStore";
export { getScene, refreshScene } from "./sceneReader";
export { getMatchInsight, type SmartMatchCard, type MatchPhase } from "./matchInsight";
export {
  getCompetitionTrends,
  refreshCompetitionTrends,
  getExplainedPrediction,
  type ExplainedPrediction,
} from "./trendsDetector";
export { buildDigest, getStoredDigest, type SportsDigest } from "./digestBuilder";
export { askCopilot, type CopilotAnswer } from "./copilot";
