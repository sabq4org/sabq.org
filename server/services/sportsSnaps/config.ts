/**
 * إعدادات لقطات VARA الذكية. هذه الوحدة نقيّة: لا DB ولا AI، فقط ثوابت وأنواع
 * مشتركة بين التوليد، الحراسة، الخلاصة، والدفع.
 */

export function isSportsSnapsEnabled(): boolean {
  return process.env.SPORTS_SNAPS_ENABLED === "true";
}

export type SportsSnapKind =
  | "upcoming_match"
  | "behavioral_big_match"
  | "post_match_recap"
  | "streak_note"
  | "h2h_context"
  | "schedule_congestion"
  | "standings_stake";

export type SportsSnapAccent = "green" | "gold" | "crimson";

export interface SportsSnapKindConfig {
  kind: SportsSnapKind;
  phase: 1 | 4;
  defaultImportance: number;
  pushEligible: boolean;
}

export const SPORTS_SNAP_KIND_CATALOG: readonly SportsSnapKindConfig[] = [
  { kind: "upcoming_match", phase: 1, defaultImportance: 90, pushEligible: true },
  { kind: "behavioral_big_match", phase: 1, defaultImportance: 82, pushEligible: true },
  { kind: "post_match_recap", phase: 1, defaultImportance: 72, pushEligible: true },
  { kind: "streak_note", phase: 4, defaultImportance: 58, pushEligible: false },
  { kind: "h2h_context", phase: 4, defaultImportance: 56, pushEligible: false },
  { kind: "schedule_congestion", phase: 4, defaultImportance: 54, pushEligible: false },
  { kind: "standings_stake", phase: 4, defaultImportance: 62, pushEligible: false },
] as const;

export const PHASE_ONE_SNAP_KINDS: readonly SportsSnapKind[] = SPORTS_SNAP_KIND_CATALOG
  .filter((item) => item.phase === 1)
  .map((item) => item.kind);

export const SPORTS_SNAP_KINDS = new Set<SportsSnapKind>(
  SPORTS_SNAP_KIND_CATALOG.map((item) => item.kind),
);

export const SPORTS_SNAP_ACCENTS = new Set<SportsSnapAccent>(["green", "gold", "crimson"]);

export const SNAP_HEADLINE_MAX_CHARS = 60;
export const SNAP_BODY_MAX_CHARS = 140;
export const SNAP_FEED_LIMIT = 6;

export const SPORTS_SNAPS_WINDOWS = {
  upcomingMatchLeadHoursMin: 20,
  upcomingMatchLeadHoursMax: 28,
  behavioralLookbackDays: 7,
  behavioralUpcomingHours: 72,
  postMatchDelayMinutes: 30,
  matchViewRetentionDays: 30,
} as const;

export const SPORTS_SNAPS_CACHE = {
  teamTtlMs: 60 * 60 * 1000,
  fallbackTtlMs: 15 * 60 * 1000,
} as const;

export const SPORTS_SNAPS_PUSH_CAPS = {
  perUserPerDay: 1,
  perUserPerWeek: 4,
  behavioralPerUserPerWeek: 2,
  quietHoursStart: "23:30",
  quietHoursEnd: "08:00",
  timezone: "Asia/Riyadh",
} as const;
