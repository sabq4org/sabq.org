/** معادلة الزخم — نقية بلا DB (قابلة للاختبار) */

export function computeMomentumScore(input: {
  sourceCount: number;
  mentionsLastHour: number;
  mentionsPrevHour: number;
  xEngagement: number;
  hoursSinceLastMention: number;
}): { momentumScore: number; acceleration: number } {
  const acceleration = input.mentionsLastHour - input.mentionsPrevHour;
  const xNorm = Math.min(input.xEngagement / 5000, 1);
  const momentumRaw =
    0.4 * Math.min(input.sourceCount / 5, 1) +
    0.35 * Math.min(input.mentionsLastHour / 10, 1) +
    0.25 * xNorm;
  let momentumScore = Math.round(100 * momentumRaw);
  if (input.hoursSinceLastMention > 48) {
    momentumScore = Math.max(
      0,
      Math.round(momentumScore * Math.exp(-(input.hoursSinceLastMention - 48) / 48))
    );
  } else if (input.hoursSinceLastMention > 24) {
    momentumScore = Math.round(momentumScore * 0.7);
  }
  return { momentumScore: Math.max(0, Math.min(100, momentumScore)), acceleration };
}
