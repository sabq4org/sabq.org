// Single source of truth for loyalty tiers, action point values, daily caps,
// and dedup windows. Imported by the backend service that awards points, by
// the React profile/dashboard surfaces, and (mirror-copied) by the iOS app.
// Action codes must match what already lives in user_loyalty_events.action
// in production — see the audit at storage.ts:9542 (the legacy
// `calculateRank` used these same strings).

export const LOYALTY_ACTIONS = {
  READ_OPEN: "READ",
  READ_DEEP: "READ_DEEP",
  LIKE: "LIKE",
  SHARE: "SHARE",
  COMMENT: "COMMENT",
  NOTIFICATION_OPEN: "NOTIFICATION_OPEN",
  DAILY_LOGIN: "DAILY_LOGIN",
  /** One-time bonus when the user completes their profile (first name +
   *  last name + bio + city + gender). Awarded by
   *  `awardProfileCompletionBonus` from the /members/profile update
   *  route. Daily cap=1 + dedup of 999h ensures it can only fire once
   *  per user even if the profile is edited repeatedly. */
  PROFILE_COMPLETE: "PROFILE_COMPLETE",
  /** One-time bonus when the user verifies their email. Wired into
   *  `verifyEmailToken` so it fires the same moment status flips
   *  pending→active. */
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
} as const;

export type LoyaltyAction = (typeof LOYALTY_ACTIONS)[keyof typeof LOYALTY_ACTIONS];

// Point values match what production was awarding before the audit.
// Changing these later is an explicit, separate decision — Phase 1 keeps
// them stable so the migration doesn't shift anyone's tier unexpectedly.
export const LOYALTY_ACTION_POINTS: Record<LoyaltyAction, number> = {
  READ: 2,
  READ_DEEP: 3,
  LIKE: 1,
  SHARE: 1,
  COMMENT: 1,
  NOTIFICATION_OPEN: 1,
  DAILY_LOGIN: 5,
  PROFILE_COMPLETE: 50,
  EMAIL_VERIFIED: 20,
};

// Per-user-per-day cap on each action. Anti-farming guard that did NOT
// exist before Phase 1 — the central awardPoints() helper enforces it.
// Null = no cap.
export const LOYALTY_DAILY_CAPS: Record<LoyaltyAction, number | null> = {
  READ: 30,
  READ_DEEP: 30,
  LIKE: 50,
  SHARE: 20,
  COMMENT: 10,
  NOTIFICATION_OPEN: 20,
  DAILY_LOGIN: 1,
  // One-time bonuses cap at 1 — combined with a long dedup window they
  // can only fire once per user lifetime.
  PROFILE_COMPLETE: 1,
  EMAIL_VERIFIED: 1,
};

// Window during which the same (action, source) for the same user does not
// re-award. e.g. opening the same article twice in 24h counts once.
// Null = no dedup (an action can repeat freely).
export const LOYALTY_DEDUP_HOURS: Record<LoyaltyAction, number | null> = {
  READ: 24,
  READ_DEEP: 24,
  LIKE: null,
  SHARE: 4,
  COMMENT: null,
  NOTIFICATION_OPEN: 1,
  DAILY_LOGIN: null,
  // One-time-only — dedup checks fall back to source-keyed lookup; since
  // we always pass source="lifetime" the existence check effectively
  // prevents re-issue forever even if the cap were higher.
  PROFILE_COMPLETE: 100000,
  EMAIL_VERIFIED: 100000,
};

// ----------------------------------------------------------------------------
// Streak bonus multipliers — applied to DAILY_LOGIN points based on the
// user's current consecutive-day streak. Keeps engagement sticky without
// being noisy for casual readers.
// ----------------------------------------------------------------------------

export const STREAK_BONUS_TIERS = [
  { minDays: 30, multiplier: 2.0, labelAr: "ولاء استثنائي" },
  { minDays: 14, multiplier: 1.75, labelAr: "متفاني" },
  { minDays: 7,  multiplier: 1.5, labelAr: "أسبوع متواصل" },
] as const;

/** Returns the multiplier + label to apply on the next DAILY_LOGIN. */
export function streakMultiplier(currentStreakDays: number) {
  const tier = STREAK_BONUS_TIERS.find((t) => currentStreakDays >= t.minDays);
  return tier ?? { minDays: 0, multiplier: 1, labelAr: "" };
}

export type LoyaltyTier = {
  level: 1 | 2 | 3 | 4 | 5;
  nameAr: string;
  nameEn: string;
  minLifetimePoints: number;
  color: string;
};

// Tier 4 (القارئ الموثوق) is new in Phase 1. Tier 5 (سفير سبق) is the
// renamed/relifted old tier 4. Existing users whose currentRank text =
// "سفير سبق" are grandfathered to level 5 by the migration regardless of
// points — see scripts/migrate-loyalty-tiers.ts.
export const LOYALTY_TIERS: readonly LoyaltyTier[] = [
  { level: 1, nameAr: "القارئ الجديد",   nameEn: "New Reader",      minLifetimePoints: 0,     color: "#9CA3AF" },
  { level: 2, nameAr: "المتفاعل",         nameEn: "Engaged",         minLifetimePoints: 100,   color: "#3B82F6" },
  { level: 3, nameAr: "العضو الذهبي",     nameEn: "Gold Member",     minLifetimePoints: 500,   color: "#F59E0B" },
  { level: 4, nameAr: "القارئ الموثوق",   nameEn: "Trusted Reader",  minLifetimePoints: 2000,  color: "#A78BFA" },
  { level: 5, nameAr: "سفير سبق",         nameEn: "Sabq Ambassador", minLifetimePoints: 10000, color: "#7C3AED" },
] as const;

export function computeTier(lifetimePoints: number): LoyaltyTier {
  let current: LoyaltyTier = LOYALTY_TIERS[0];
  for (const tier of LOYALTY_TIERS) {
    if (lifetimePoints >= tier.minLifetimePoints) current = tier;
  }
  return current;
}

export function nextTier(level: LoyaltyTier["level"]): LoyaltyTier | null {
  return LOYALTY_TIERS.find((t) => t.level === level + 1) ?? null;
}

// Returns { current, next, pointsToNext }. Used by profile UIs to render
// the progress bar above each user's tier badge.
export function tierProgress(lifetimePoints: number) {
  const current = computeTier(lifetimePoints);
  const next = nextTier(current.level);
  const pointsToNext = next ? Math.max(0, next.minLifetimePoints - lifetimePoints) : 0;
  return { current, next, pointsToNext };
}

// Grandfather rule applied during the Phase 1 migration: anyone whose
// currentRank text was the legacy top tier keeps level 5, no demotion.
// Defined here so the migration script and any future audit code share
// one definition.
export const GRANDFATHER_LEGACY_TOP_RANK = "سفير سبق";
