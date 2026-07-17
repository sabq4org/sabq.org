// أنواع «المنصة المركزية للتوقعات» — مرآة عقود الخادم في shared/predictions.ts
// عبر مسارات الويب /api/predictions/* (جلسة Passport). كل البطولات ما عدا
// مونديال 2026 (يبقى على صفحاته القديمة حتى نهايته).

export type PredCompetitionSummary = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn?: string | null;
  seasonKey: string;
  status: string;
  openContests: number;
  myPoints?: number;
};

export type PredTeamMeta = { name?: string | null; logo?: string | null };

export type PredContestMeta = {
  home?: PredTeamMeta | null;
  away?: PredTeamMeta | null;
  round?: string | null;
  venue?: string | null;
};

export type PredScorePayload = { predHome?: number; predAway?: number };

export type PredContest = {
  id: string;
  contestType: string;
  status: "open" | "locked" | "ready" | "settled" | "void" | string;
  opensAt?: string | null;
  locksAt: string;
  settledAt?: string | null;
  metadata?: PredContestMeta | null;
  result?: { finalHome?: number; finalAway?: number } | null;
  myEntry?: { id: string; payload?: PredScorePayload | null } | null;
};

export type PredCompetitionDetail = {
  competition: { id: string; slug: string; nameAr: string; seasonKey: string };
  contests: PredContest[];
};

export type PredRule = {
  strategyKey: string;
  version: number;
  params?: {
    basePool?: number;
    tiers?: { exact?: number; signedMargin?: number; outcome?: number };
    winCriterion?: "exact" | "outcome";
  } | null;
};

export type PredContestDetail = PredContest & { rule?: PredRule | null };

export type PredLedgerItem = {
  id: string;
  contestId?: string | null;
  points: number;
  reasonCode: string;
  reasonLabelAr: string;
  createdAt: string;
};

export type PredLedgerResponse = { items: PredLedgerItem[]; nextCursor: string | null };

export type PredLeaderEntry = {
  rank: number;
  userId: string;
  name: string;
  profileImageUrl?: string | null;
  points: number;
  exactCount: number;
};

export type PredLeaderboardResponse = {
  nameAr: string;
  seasonKey?: string;
  entries: PredLeaderEntry[];
  myRank: { rank: number; points: number } | null;
};

export type PredMyAward = {
  points: number;
  reasonCode: string;
  reasonLabelAr: string;
  breakdown?: {
    prediction?: string;
    finalScore?: string;
    pool?: { base?: number; carriedIn?: number; tierShare?: number; tierPoints?: number; winners?: number };
  } | null;
  referenceId: string;
  wallet?: { multiplier: number; walletPoints: number; delivered: boolean } | null;
};

export type PredSettlementResponse = {
  contestId: string;
  result?: { finalHome?: number; finalAway?: number } | null;
  settledAt?: string | null;
  myAwards: PredMyAward[];
};

/** نص القاعدة المولّد من ملف الاحتساب الفعّال — لا نص ثابت يتقادم. */
export function ruleSummaryAr(rule: PredRule | null | undefined): string {
  if (!rule?.params) return "تُحتسب النقاط بعد صافرة النهاية";
  const { basePool = 0, tiers, winCriterion } = rule.params;
  switch (rule.strategyKey) {
    case "tiered_pool": {
      const exact = Math.round((tiers?.exact ?? 0) * 100);
      const margin = Math.round((tiers?.signedMargin ?? 0) * 100);
      const outcome = Math.round((tiers?.outcome ?? 0) * 100);
      return `بركة المباراة ${basePool} نقطة: ${exact}٪ للنتيجة الدقيقة، ${margin}٪ للفارق الصحيح، ${outcome}٪ للاتجاه — وما لا يُوزَّع يتراكم للمباراة التالية`;
    }
    case "shared_pool":
      return winCriterion === "exact"
        ? `بركة ${basePool} نقطة تُقسم بالتساوي على أصحاب النتيجة الدقيقة`
        : `بركة ${basePool} نقطة تُقسم بالتساوي على من أصابوا اتجاه المباراة`;
    case "skill_weighted":
      return "نقاط مهارية: دقة توقّعك × جرأته × سلسلة إصاباتك";
    case "fixed_points":
      return "نقاط ثابتة حسب دقة التوقّع";
    default:
      return "تُحتسب النقاط بعد صافرة النهاية";
  }
}

/** «يُقفل بعد ٢س ١٤د» — عدّ تنازلي حتى الإغلاق. */
export function lockCountdownAr(locksAt: string, now = Date.now()): string | null {
  const lockTime = Date.parse(locksAt);
  if (Number.isNaN(lockTime)) return null;
  const seconds = Math.floor((lockTime - now) / 1000);
  if (seconds <= 0) return null;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `يُقفل بعد ${days}ي ${hours}س`;
  if (hours > 0) return `يُقفل بعد ${hours}س ${minutes}د`;
  return `يُقفل بعد ${Math.max(minutes, 1)}د`;
}

export function kickoffTimeAr(locksAt: string): string {
  const date = new Date(locksAt);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

export function kickoffDayAr(locksAt: string): string {
  const date = new Date(locksAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
  }).format(date);
}
