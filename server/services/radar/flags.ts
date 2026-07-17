/** أعلام تشغيل رادار المرحلة أ/ب — بلا آثار جانبية */

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
