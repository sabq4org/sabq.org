// عقد الاستراتيجية للمنصة المركزية — دوال نقية بلا db ولا آثار جانبية.
// كل القيم أعداد صحيحة بوحدة النقطة (المضاعفات ×100). الثابت المحفوظ في كل
// استراتيجيات البرك: awarded + carried + remainder === available.

import type { ContestType, ReasonCode, StrategyKey } from "@shared/predictions";

export type StrategyEntry = {
  entryId: string;
  userId: string;
  /** حمولة التوقع كما حُفظت (متحقق منها وقت الإرسال حسب نوع المسابقة). */
  payload: Record<string, unknown>;
  submittedAt: Date;
  /** مضاعفات skill_weighted ×100 — يوفرها محوّل البطولة (مثل تقييمات كأس آسيا). */
  boldnessMultiplier?: number;
  streakMultiplier?: number;
};

export type SettlementInput = {
  contestType: ContestType;
  entries: StrategyEntry[];
  resultPayload: Record<string, unknown>;
  /** الجائزة المرحّلة من مسابقات سابقة (0 إن لا ترحيل). */
  carryIn: number;
  /** وقت الإغلاق — لأوزان التبكير في long_term_pool. */
  locksAt: Date;
};

export type StrategyAward = {
  entryId: string;
  userId: string;
  basePoints: number;
  reasonCode: ReasonCode;
  breakdown: Record<string, unknown>;
};

export type StrategyResult = {
  awards: StrategyAward[];
  pool: {
    available: number;
    awarded: number;
    carried: number;
    remainder: number;
  };
};

export type ScoringStrategy<P = unknown> = {
  key: StrategyKey;
  /** يرتفع عند أي تغيير سلوكي — يُثبَّت في سجل التسوية. */
  version: number;
  /** يتحقق من params ويعيدها typed — يرمي خطأ zod عند القصور. */
  validateParams(params: unknown): P;
  settle(input: SettlementInput, params: P): StrategyResult;
};
