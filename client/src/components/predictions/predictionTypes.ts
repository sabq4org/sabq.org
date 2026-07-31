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

/** خيار اختيار جاهز لمسابقات الموسم (بطل/هدّاف) — يُدمج في metadata عند الإنشاء. */
export type PredPickOption = { id: string; name: string; logo?: string | null };

export type PredContestMeta = {
  home?: PredTeamMeta | null;
  away?: PredTeamMeta | null;
  round?: string | null;
  venue?: string | null;
  title?: string | null;
  options?: PredPickOption[] | null;
};

export type PredScorePayload = { predHome?: number; predAway?: number };
/** حمولة مسابقات الاختيار (بطل الموسم/الهدّاف) — مرآة longTermPickPayloadSchema. */
export type PredPickPayload = { pickId?: string; pickName?: string };
export type PredEntryPayload = PredScorePayload & PredPickPayload;

export type PredContest = {
  id: string;
  contestType: string;
  status: "open" | "locked" | "ready" | "settled" | "void" | string;
  opensAt?: string | null;
  locksAt: string;
  settledAt?: string | null;
  metadata?: PredContestMeta | null;
  result?: { finalHome?: number; finalAway?: number; winningPickIds?: string[] } | null;
  /** عدد المشاركين النشطين في توقّع هذه المسابقة. */
  entriesCount?: number;
  myEntry?: { id: string; payload?: PredEntryPayload | null } | null;
};

export type PredRule = {
  strategyKey: string;
  version: number;
  params?: {
    basePool?: number;
    tiers?: { exact?: number; signedMargin?: number; outcome?: number };
    winCriterion?: "exact" | "outcome";
    distribution?: "equal" | "early_weighted" | string;
    earlyTiers?: { beforeHours?: number; weight?: number }[];
  } | null;
};

/** قاعدة على مستوى البطولة (من detail.rules) — الملف النشط لكل نوع مسابقة. */
export type PredCompetitionRule = PredRule & { contestType: string };

export type PredCompetitionDetail = {
  competition: { id: string; slug: string; nameAr: string; seasonKey: string };
  contests: PredContest[];
  rules?: PredCompetitionRule[];
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
      return `جائزة المباراة ${basePool} نقطة: ${exact}٪ للنتيجة الدقيقة، ${margin}٪ للفارق الصحيح، ${outcome}٪ للاتجاه — وما لا يُوزَّع يتراكم للمباراة التالية`;
    }
    case "shared_pool":
      return winCriterion === "exact"
        ? `جائزة ${basePool} نقطة تُقسم بالتساوي على أصحاب النتيجة الدقيقة`
        : `جائزة ${basePool} نقطة تُقسم بالتساوي على من أصابوا اتجاه المباراة`;
    case "skill_weighted":
      return "نقاط مهارية: دقة توقّعك × جرأته × سلسلة إصاباتك";
    case "fixed_points":
      return "نقاط ثابتة حسب دقة التوقّع";
    case "long_term_pool": {
      const early = rule.params.distribution === "early_weighted";
      const maxWeight = Math.max(1, ...(rule.params.earlyTiers ?? []).map((t) => t.weight ?? 1));
      return early
        ? `جائزة ${basePool} نقطة تُقسم على المصيبين — وكلما بكّرت بتوقّعك زاد وزنه (حتى ×${maxWeight})`
        : `جائزة ${basePool} نقطة تُقسم بالتساوي على المصيبين آخر الموسم`;
    }
    default:
      return "تُحتسب النقاط بعد صافرة النهاية";
  }
}

/** تسمية نوع المسابقة للعرض — مرآة CONTEST_TYPE_LABELS في عقود الخادم. */
export function contestTypeLabelAr(contestType: string): string {
  switch (contestType) {
    case "match_score": return "توقّع المباريات";
    case "champion": return "بطل الموسم";
    case "top_scorer": return "هدّاف الموسم";
    case "match_scorer": return "هدّاف المباراة";
    case "first_scorer": return "أول هدّاف";
    default: return "التوقّعات";
  }
}

/**
 * قاعدة العرض الموحّدة للنتائج في RTL: الرقم الملاصق لليمين للمضيف دائمًا.
 * الخادم يخزّن النصوص «مضيف-ضيف» (breakdown)، فنقلبها للعرض داخل span
 * dir="ltr" حتى لا تتلاعب خوارزمية bidi بالترتيب.
 */
export function scoreRtlAr(score: string | null | undefined): string | null {
  if (!score) return null;
  const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(score.trim());
  return m ? `${m[2]}–${m[1]}` : score;
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
