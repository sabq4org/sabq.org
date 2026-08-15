// العقود المشتركة للمنصة المركزية لتوقعات سبق الرياضي (Prediction Core).
// مصدر واحد للأنواع ورموز الحالات والأخطاء ومخططات zod للمعاملات والتوقعات،
// يستهلكه الخادم والويب (ومرآة iOS/Android لاحقًا). لا منطق احتساب هنا —
// الاستراتيجيات في server/services/predictions/strategies/.
//
// القاعدة الحاكمة (من مقترح المنصة المركزية v2): القواعد المتغيرة إعدادات
// مُرقّمة الإصدار تُتحقق بمخططات zod أدناه؛ منطق التنفيذ استراتيجيات برمجية
// مسجلة بالاسم فقط — لا كود قابل للتنفيذ داخل JSON.

import { z } from "zod";

// ---------------------------------------------------------------------------
// أنواع المسابقات
// ---------------------------------------------------------------------------

export const CONTEST_TYPES = {
  MATCH_SCORE: "match_score",
  MATCH_SCORER: "match_scorer",
  FIRST_SCORER: "first_scorer",
  CHAMPION: "champion",
  TOP_SCORER: "top_scorer",
} as const;

export type ContestType = (typeof CONTEST_TYPES)[keyof typeof CONTEST_TYPES];

export const CONTEST_TYPE_VALUES = Object.values(CONTEST_TYPES) as [ContestType, ...ContestType[]];

// ---------------------------------------------------------------------------
// الحالات (text-as-enum — نفس عرف بقية الجداول)
// ---------------------------------------------------------------------------

export const COMPETITION_STATUSES = ["draft", "active", "paused", "completed"] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export const PROFILE_STATUSES = ["draft", "active", "retired"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const CONTEST_STATUSES = ["draft", "open", "locked", "ready", "settled", "void"] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

export const ENTRY_STATUSES = ["active", "withdrawn", "invalid"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const SETTLEMENT_STATUSES = ["processing", "settled", "failed", "reversed"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const OUTBOX_STATUSES = ["pending", "delivered", "failed"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const SOURCE_PLATFORMS = ["web", "ios", "android"] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

export const POINT_SCOPES = ["competition", "fantasy"] as const;
export type PointScope = (typeof POINT_SCOPES)[number];

// ---------------------------------------------------------------------------
// رموز أسباب المنح (reason codes) — تُعرض للمستخدم عبر خرائط التسمية أدناه
// ---------------------------------------------------------------------------

export const REASON_CODES = {
  EXACT: "exact",
  MARGIN: "margin",
  OUTCOME: "outcome",
  SCORER: "scorer",
  FIRST_SCORER: "first_scorer",
  CHAMPION: "champion",
  TOP_SCORER: "top_scorer",
  SKILL: "skill",
  REVERSAL: "reversal",
  LEGACY_IMPORT: "legacy_import",
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];

export const REASON_LABELS_AR: Record<ReasonCode, string> = {
  exact: "نتيجة دقيقة",
  margin: "فارق صحيح",
  outcome: "اتجاه صحيح",
  scorer: "هداف المباراة",
  first_scorer: "أول هداف",
  champion: "بطل البطولة",
  top_scorer: "هداف البطولة",
  skill: "توقع ذكي",
  reversal: "تصحيح نتيجة",
  legacy_import: "رصيد سابق",
};

// ---------------------------------------------------------------------------
// رموز أخطاء API الموحدة
// ---------------------------------------------------------------------------

export const PREDICTION_ERROR_CODES = {
  PREDICTION_LOCKED: "PREDICTION_LOCKED",
  CONTEST_NOT_OPEN: "CONTEST_NOT_OPEN",
  CONTEST_NOT_FOUND: "CONTEST_NOT_FOUND",
  INVALID_PREDICTION_PAYLOAD: "INVALID_PREDICTION_PAYLOAD",
  RESULT_NOT_FINAL: "RESULT_NOT_FINAL",
  SETTLEMENT_PENDING: "SETTLEMENT_PENDING",
  COMPETITION_DISABLED: "COMPETITION_DISABLED",
  WITHDRAWAL_NOT_ALLOWED: "WITHDRAWAL_NOT_ALLOWED",
  ENTRY_NOT_FOUND: "ENTRY_NOT_FOUND",
} as const;

export type PredictionErrorCode =
  (typeof PREDICTION_ERROR_CODES)[keyof typeof PREDICTION_ERROR_CODES];

// ---------------------------------------------------------------------------
// الاستراتيجيات المسجلة ومعاملاتها (zod)
// ---------------------------------------------------------------------------

export const STRATEGY_KEYS = {
  TIERED_POOL: "tiered_pool",
  SHARED_POOL: "shared_pool",
  FIXED_POINTS: "fixed_points",
  SKILL_WEIGHTED: "skill_weighted",
  PLAYER_POOL: "player_pool",
  LONG_TERM_POOL: "long_term_pool",
} as const;

export type StrategyKey = (typeof STRATEGY_KEYS)[keyof typeof STRATEGY_KEYS];

/** بركة متدرجة (خليجي 27 والمسبح المعمّم): طبقات حصرية بنسب قابلة للضبط + ترحيل. */
export const tieredPoolParamsSchema = z.object({
  basePool: z.number().int().positive(),
  tiers: z
    .object({
      exact: z.number().min(0).max(1),
      signedMargin: z.number().min(0).max(1),
      outcome: z.number().min(0).max(1),
    })
    .refine((t) => Math.abs(t.exact + t.signedMargin + t.outcome - 1) < 1e-9, {
      message: "مجموع نسب الطبقات يجب أن يساوي 1",
    }),
  /** none = لا ترحيل (يذهب غير الموزَّع إلى remainder). */
  carryMode: z.enum(["same_competition_next_contest", "none"]).default("same_competition_next_contest"),
});
export type TieredPoolParams = z.infer<typeof tieredPoolParamsSchema>;

/** بركة تُقسم بالتساوي على المصيبين (محرك كأس العالم/الدوري الحالي). */
export const sharedPoolParamsSchema = z.object({
  basePool: z.number().int().positive(),
  /** معيار الإصابة — الكود القائم لكأس العالم يقسم على مصيبي الاتجاه. */
  winCriterion: z.enum(["exact", "outcome"]),
  carryMode: z.enum(["same_competition_next_contest", "none"]).default("none"),
});
export type SharedPoolParams = z.infer<typeof sharedPoolParamsSchema>;

/** نقاط ثابتة حسب الطبقة (النظام الكلاسيكي 3/1/0). */
export const fixedPointsParamsSchema = z.object({
  exact: z.number().int().min(0),
  signedMargin: z.number().int().min(0).default(0),
  outcome: z.number().int().min(0),
});
export type FixedPointsParams = z.infer<typeof fixedPointsParamsSchema>;

/** نقاط مهارية (كأس آسيا الذكي): طبقات × جرأة × سلسلة. المضاعفات أعداد صحيحة ×100. */
export const skillWeightedParamsSchema = z.object({
  tierPoints: z.object({
    exact: z.number().int().min(0),
    signedMargin: z.number().int().min(0),
    outcome: z.number().int().min(0),
  }),
  /** حدود المضاعفات (×100) — تُقصّ القيم الواردة من المحوّل إليها. */
  boldnessMultiplierRange: z
    .object({ min: z.number().int().min(0), max: z.number().int().min(100) })
    .default({ min: 100, max: 300 }),
  streakMultiplierRange: z
    .object({ min: z.number().int().min(0), max: z.number().int().min(100) })
    .default({ min: 100, max: 200 }),
});
export type SkillWeightedParams = z.infer<typeof skillWeightedParamsSchema>;

/** بركة اختيار لاعب (هداف المباراة 300 / أول هداف 200 حاليًا). */
export const playerPoolParamsSchema = z.object({
  basePool: z.number().int().positive(),
  carryMode: z.enum(["same_competition_next_contest", "none"]).default("none"),
});
export type PlayerPoolParams = z.infer<typeof playerPoolParamsSchema>;

/** بركة طويلة المدى (بطل/هداف) بتوزيع متساوٍ أو موزون بالتبكير. */
export const longTermPoolParamsSchema = z.object({
  basePool: z.number().int().positive(),
  distribution: z.enum(["equal", "early_weighted"]),
  /** أوزان التبكير: قبل locksAt بـ beforeHours ساعة فأكثر → weight. تُرتَّب تنازليًا. */
  earlyTiers: z
    .array(z.object({ beforeHours: z.number().int().min(0), weight: z.number().int().positive() }))
    .default([]),
});
export type LongTermPoolParams = z.infer<typeof longTermPoolParamsSchema>;

export const STRATEGY_PARAMS_SCHEMAS = {
  [STRATEGY_KEYS.TIERED_POOL]: tieredPoolParamsSchema,
  [STRATEGY_KEYS.SHARED_POOL]: sharedPoolParamsSchema,
  [STRATEGY_KEYS.FIXED_POINTS]: fixedPointsParamsSchema,
  [STRATEGY_KEYS.SKILL_WEIGHTED]: skillWeightedParamsSchema,
  [STRATEGY_KEYS.PLAYER_POOL]: playerPoolParamsSchema,
  [STRATEGY_KEYS.LONG_TERM_POOL]: longTermPoolParamsSchema,
} as const;

// ---------------------------------------------------------------------------
// حمولات التوقع (prediction_payload) حسب نوع المسابقة
// ---------------------------------------------------------------------------

export const matchScorePayloadSchema = z.object({
  predHome: z.number().int().min(0).max(99),
  predAway: z.number().int().min(0).max(99),
});
export type MatchScorePayload = z.infer<typeof matchScorePayloadSchema>;

export const playerPickPayloadSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().min(1).optional(),
});
export type PlayerPickPayload = z.infer<typeof playerPickPayloadSchema>;

export const longTermPickPayloadSchema = z.object({
  /** معرف الفريق (بطل) أو اللاعب (هداف) لدى مصدر النتائج. */
  pickId: z.string().min(1),
  pickName: z.string().min(1).optional(),
});
export type LongTermPickPayload = z.infer<typeof longTermPickPayloadSchema>;

export const ENTRY_PAYLOAD_SCHEMAS: Record<ContestType, z.ZodTypeAny> = {
  match_score: matchScorePayloadSchema,
  match_scorer: playerPickPayloadSchema,
  first_scorer: playerPickPayloadSchema,
  champion: longTermPickPayloadSchema,
  top_scorer: longTermPickPayloadSchema,
};

// ---------------------------------------------------------------------------
// حمولات النتيجة الرسمية (result_payload) حسب نوع المسابقة
// ---------------------------------------------------------------------------

export const matchScoreResultSchema = z.object({
  finalHome: z.number().int().min(0),
  finalAway: z.number().int().min(0),
});
export type MatchScoreResult = z.infer<typeof matchScoreResultSchema>;

export const playerPickResultSchema = z.object({
  /** المصيبون: هدافو المباراة أو [أول هداف] — قد تكون فارغة (لا أهداف). */
  winningPlayerIds: z.array(z.string().min(1)),
});
export type PlayerPickResult = z.infer<typeof playerPickResultSchema>;

export const longTermResultSchema = z.object({
  winningPickIds: z.array(z.string().min(1)).min(1),
});
export type LongTermResult = z.infer<typeof longTermResultSchema>;

export const RESULT_PAYLOAD_SCHEMAS: Record<ContestType, z.ZodTypeAny> = {
  match_score: matchScoreResultSchema,
  match_scorer: playerPickResultSchema,
  first_scorer: playerPickResultSchema,
  champion: longTermResultSchema,
  top_scorer: longTermResultSchema,
};

// ---------------------------------------------------------------------------
// Breakdown الموحّد المعروض للمستخدم (يُخزَّن في قيد النقاط)
// ---------------------------------------------------------------------------

export type AwardBreakdown = {
  reasonCode: ReasonCode;
  /** حصة الطبقة الكلية وعدد المتقاسمين — للبرك فقط. */
  pool?: {
    base: number;
    carriedIn: number;
    tierShare?: number;
    tierPoints?: number;
    winners: number;
  };
  /** للاستراتيجية المهارية. */
  skill?: {
    tierPoints: number;
    boldnessMultiplier: number; // ×100
    streakMultiplier: number; // ×100
  };
  ruleVersion: number;
};
