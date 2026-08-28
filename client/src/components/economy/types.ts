/** أنواع استجابات /api/economy/* — نسخة الواجهة (المصدر: server/services/economy). */
export type IndicatorKey = "repo" | "reverseRepo" | "inflation" | "gdp" | "m3Growth";

export interface SnapshotIndicator {
  key: IndicatorKey;
  titleAr: string;
  shortAr: string;
  unit: "%";
  cadence: "decision" | "monthly" | "quarterly";
  value: number;
  valueText: string;
  samaTitle: string;
  asOf: string | null;
  quarter: string | null;
  year: string | null;
  previousValue: number | null;
  observedAt: string;
}

export interface FxRate {
  code: string;
  nameAr: string;
  rate: number;
  prevRate: number | null;
  date: string;
  prevDate: string | null;
  changePct: number | null;
  isGcc: boolean;
}

export interface WeeklyKpi {
  key: "total" | "count" | "avgTicket" | "vs4w";
  labelAr: string;
  value: number;
  unitAr: string;
  changePct: number | null;
  noteAr?: string;
  series: number[];
}

export interface WeeklyStory {
  key: string;
  headline: string;
  cardTitle: string;
  figure: string;
  detailAr: string;
  tone: "up" | "down" | "neutral";
  weight: number;
  facts: Record<string, number | string>;
}

export interface WeeklySpendingStory {
  weekLabelAr: string;
  periodStart: string;
  periodEnd: string;
  kpis: WeeklyKpi[];
  stories: WeeklyStory[];
  lead: { headline: string; subheadline: string; intro: string };
  sectors: Array<{ en: string; ar: string; value: number; count: number; changePct: number; countChangePct: number; share: number; isGroup: boolean; group: string | null; series: number[] }>;
  cities: Array<{ en: string; ar: string; value: number; count: number; changePct: number; countChangePct: number; share: number; avgTicket: number; series: number[] }>;
  citiesShareTop: Array<{ ar: string; share: number }>;
  otherCitiesShare: number;
  risers: Array<{ ar: string; changePct: number }>;
  fallers: Array<{ ar: string; changePct: number }>;
  totals: { value: number; count: number; series: number[]; countSeries: number[] };
}

export interface SamaNewsItem {
  id: number;
  title: string;
  summary: string;
  publishedAt: string | null;
  url: string;
  imageUrl: string | null;
}

export interface EconomySnapshot {
  updatedAt: string;
  indicators: SnapshotIndicator[];
  fx: FxRate[];
  fxAsOf: string | null;
  weekly: {
    weekLabelAr: string;
    periodEnd: string;
    totalValue: number;
    totalChangePct: number;
    headline: string;
    stories: WeeklyStory[];
    kpis: WeeklyKpi[];
  } | null;
  moneySupply: { asOf: string; m3Billion: number | null; m3WeeklyChangePct: number | null; m3PeriodChangePct: number | null } | null;
  samaNews: SamaNewsItem[];
  decision: { isDecisionNight: boolean; nextDecisionDate: string | null };
}
