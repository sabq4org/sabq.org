import { db } from "../db";
import { userLoyaltyEvents, users } from "@shared/schema";
import { and, count, eq, gte, sql, desc } from "drizzle-orm";
import { storage } from "../storage";
import {
  LOYALTY_ACTION_POINTS,
  LOYALTY_ACTIONS,
  LOYALTY_DAILY_CAPS,
  LOYALTY_DEDUP_HOURS,
  streakMultiplier,
  type LoyaltyAction,
} from "@shared/loyalty";

export type AwardOutcome =
  | { awarded: true;  points: number; totalPoints: number; rankChanged: boolean; newRank?: string }
  | { awarded: false; reason: "DAILY_CAP" | "DEDUP" | "NEGATIVE_POINTS" };

export type AwardInput = {
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
/** Same-transaction form for settlement engines that already own a tx. */
export async function awardPointsInTransaction(tx: any, input: AwardInput): Promise<AwardOutcome> {
  const points = input.points ?? LOYALTY_ACTION_POINTS[input.action];
  if (points <= 0) {
    return { awarded: false, reason: "NEGATIVE_POINTS" };
  }

  // One transaction and one per-user lock cover cap, dedup, event and balance.
  // This avoids nested pool acquisition and also serializes different sources
  // of the same capped action instead of letting each source race its own count.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`loyalty-balance:${input.userId}`}))`,
  );

  const dailyCap = LOYALTY_DAILY_CAPS[input.action];
  if (dailyCap !== null && dailyCap !== undefined) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ value }] = await tx
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
    const [existing] = await tx
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

  const result = await storage.recordLoyaltyPointsInTx(
    tx,
    {
      userId: input.userId,
      action: input.action,
      points,
      source: input.source,
      metadata: input.metadata,
    },
    true,
  );

  return {
    awarded: true,
    points: result.pointsEarned,
    totalPoints: result.totalPoints,
    rankChanged: result.rankChanged,
    newRank: result.newRank,
  };
}

/** Non-transactional side effect; call only after the owning transaction commits. */
export async function finalizeAwardPoints(userId: string, action: LoyaltyAction): Promise<void> {
  await storage.triggerLoyaltyPassUpdate(userId, action);
}

export async function awardPoints(input: AwardInput): Promise<AwardOutcome> {
  const outcome = await db.transaction((tx) => awardPointsInTransaction(tx, input));
  if (outcome.awarded) await finalizeAwardPoints(input.userId, input.action);
  return outcome;
}

// ----------------------------------------------------------------------------
// Streak bonus — multiplies DAILY_LOGIN points by the user's current streak
// tier. Computed against the last 30 days of activity so a single missed
// day resets the streak.
//
// Call this INSTEAD of awardPoints for DAILY_LOGIN — it handles both the
// streak math and the eventual awardPoints invocation with a bumped point
// total. Returns the same AwardOutcome plus the multiplier applied so the
// caller can surface a celebratory toast on iOS / web.
// ----------------------------------------------------------------------------

export type DailyLoginOutcome = AwardOutcome & {
  streakDays?: number;
  multiplier?: number;
  streakLabel?: string;
};

export async function awardDailyLogin(userId: string): Promise<DailyLoginOutcome> {
  // Streak = number of consecutive UTC days up to today where the user
  // recorded at least one loyalty event. Resets on any missed day.
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentDays = await db
    .select({ day: sql<string>`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM-DD')` })
    .from(userLoyaltyEvents)
    .where(
      and(
        eq(userLoyaltyEvents.userId, userId),
        gte(userLoyaltyEvents.createdAt, monthAgo),
      ),
    )
    .groupBy(sql`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM-DD')`));

  const eventDays = new Set(recentDays.map((r) => r.day));
  let streak = 0;
  const cursor = new Date();
  // We count today as continuing yesterday's streak — today's login is
  // what creates today's event, so the streak BEFORE the bonus is
  // computed from past-day events only.
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (eventDays.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  // Today's login extends the streak by one — the multiplier applies
  // to the streak the user would have AFTER today's award.
  const effectiveStreak = streak + 1;
  const tier = streakMultiplier(effectiveStreak);

  const base = LOYALTY_ACTION_POINTS.DAILY_LOGIN;
  const points = Math.round(base * tier.multiplier);

  const outcome = await awardPoints({
    userId,
    action: LOYALTY_ACTIONS.DAILY_LOGIN,
    points,
    metadata: {
      streakDays: effectiveStreak,
      multiplier: tier.multiplier,
      streakLabel: tier.labelAr,
    },
  });

  return {
    ...outcome,
    streakDays: effectiveStreak,
    multiplier: tier.multiplier,
    streakLabel: tier.labelAr,
  };
}

// ----------------------------------------------------------------------------
// One-time profile completion bonus. Wired into the /members/profile update
// path so the user gets +50 the first time their profile has all the
// expected fields filled. Safe to call on every profile save — the daily
// cap + source-dedup on PROFILE_COMPLETE prevent re-issuance.
//
// Field set was chosen to match the "profile complete" badge logic on the
// dashboard side: firstName + lastName + bio + city + gender. If you add
// a new "required" profile field later, update the check here AND the
// dashboard's profile-completeness indicator so they stay in sync.
// ----------------------------------------------------------------------------

export async function awardProfileCompletionBonus(userId: string): Promise<AwardOutcome | null> {
  const [u] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      bio: users.bio,
      city: users.city,
      gender: users.gender,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;

  const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const complete = filled(u.firstName) && filled(u.lastName) && filled(u.bio)
    && filled(u.city) && filled(u.gender);
  if (!complete) return null;

  return awardPoints({
    userId,
    action: LOYALTY_ACTIONS.PROFILE_COMPLETE,
    source: "lifetime",
  });
}

// ----------------------------------------------------------------------------
// One-time email verification bonus. Called from verifyEmailToken right
// after the email_verified+status flip. Self-deduplicates via the same
// cap-of-1 + source="lifetime" pattern.
// ----------------------------------------------------------------------------

export async function awardEmailVerificationBonus(userId: string): Promise<AwardOutcome | null> {
  return awardPoints({
    userId,
    action: LOYALTY_ACTIONS.EMAIL_VERIFIED,
    source: "lifetime",
  });
}
