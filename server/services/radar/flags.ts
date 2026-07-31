/** أعلام تشغيل رادار المرحلة أ/ب — بلا آثار جانبية */

/**
 * قفل إيقاف إجباري للرادار — يغلب RADAR_ENABLED وأي تشغيل يدوي/آلي.
 * غيّره إلى false فقط عند إعادة تفعيل الرصد عن قصد في الكود.
 * أُعيد التفعيل 2026-07-31 بقرار المالك مع إطلاق ممرات «عين على السعودية»
 * (كان مقفلًا منذ ~2026-07-19 ضمن حملة خفض الصرف).
 */
export const RADAR_FORCE_DISABLED = false;

export function isRadarForceDisabled(): boolean {
  return RADAR_FORCE_DISABLED;
}

export function isClusteringEnabled(): boolean {
  return process.env.RADAR_CLUSTERING_ENABLED === "true";
}

export function isMomentumEnabled(): boolean {
  return process.env.RADAR_MOMENTUM_ENABLED === "true";
}

export function isRelevanceEnabled(): boolean {
  return process.env.RADAR_RELEVANCE_ENABLED === "true";
}

export function isGapV2Enabled(): boolean {
  return process.env.RADAR_GAP_V2_ENABLED === "true";
}

export function clusterThreshold(): number {
  const n = Number(process.env.RADAR_CLUSTER_THRESHOLD ?? 0.85);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.85;
}
