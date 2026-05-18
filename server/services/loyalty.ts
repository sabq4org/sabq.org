import { db } from "../db";
import { userLoyaltyEvents } from "@shared/schema";
import { and, count, eq, gte } from "drizzle-orm";
import { storage } from "../storage";
import {
  LOYALTY_ACTION_POINTS,
  LOYALTY_DAILY_CAPS,
  LOYALTY_DEDUP_HOURS,
  type LoyaltyAction,
} from "@shared/loyalty";

export type AwardOutcome =
  | { awarded: true;  points: number; totalPoints: number; rankChanged: boolean; newRank?: string }
  | { awarded: false; reason: "DAILY_CAP" | "DEDUP" | "NEGATIVE_POINTS" };

type AwardInput = {
  userId: string;
  action: LoyaltyAction;
  source?: string;
  metadata?: Record<string, any>;
  /** Override the default action points (used by READ_DEEP which earns the
   *  3-point bonus on top of the prior READ event). Falls back to
   *  LOYALTY_ACTION_POINTS[action] when omitted. */
  points?: number;
};

// Central entry point for every "user did X, give them points" path.
// Wraps storage.recordLoyaltyPoints with the protections that audit
// showed were missing in production: per-day cap, per-source dedup,
// rank-level write. Existing 3 callsites (LIKE on react route,
// COMMENT on comment route, READ/READ_DEEP on behavior-log) all funnel
// through here in Phase 1.
export async function awardPoints(input: AwardInput): Promise<AwardOutcome> {
  const points = input.points ?? LOYALTY_ACTION_POINTS[input.action];
  if (points <= 0) {
    return { awarded: false, reason: "NEGATIVE_POINTS" };
  }

  const dailyCap = LOYALTY_DAILY_CAPS[input.action];
  if (dailyCap !== null && dailyCap !== undefined) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ value }] = await db
      .select({ value: count() })
      .from(userLoyaltyEvents)
      .where(
        and(
          eq(userLoyaltyEvents.userId, input.userId),
          eq(userLoyaltyEvents.action, input.action),
          gte(userLoyaltyEvents.createdAt, since),
        ),
      );
    if (Number(value) >= dailyCap) {
      return { awarded: false, reason: "DAILY_CAP" };
    }
  }

  const dedupHours = LOYALTY_DEDUP_HOURS[input.action];
  if (dedupHours !== null && dedupHours !== undefined && input.source) {
    const since = new Date(Date.now() - dedupHours * 60 * 60 * 1000);
    const [existing] = await db
      .select({ id: userLoyaltyEvents.id })
      .from(userLoyaltyEvents)
      .where(
        and(
          eq(userLoyaltyEvents.userId, input.userId),
          eq(userLoyaltyEvents.action, input.action),
          eq(userLoyaltyEvents.source, input.source),
          gte(userLoyaltyEvents.createdAt, since),
        ),
      )
      .limit(1);
    if (existing) {
      return { awarded: false, reason: "DEDUP" };
    }
  }

  const result = await storage.recordLoyaltyPoints({
    userId: input.userId,
    action: input.action,
    points,
    source: input.source,
    metadata: input.metadata,
  });

  return {
    awarded: true,
    points: result.pointsEarned,
    totalPoints: result.totalPoints,
    rankChanged: result.rankChanged,
    newRank: result.newRank,
  };
}
