/**
 * لقطة قسم الاقتصاد — ما تعرضه الواجهة (رأس القسم، بلوك الرئيسية، التطبيقات).
 * تُبنى من آخر مشاهدات قاعدة البيانات (ما رصده samaWatchJob) لا من ساما مباشرة،
 * فتبقى الصفحة سليمة حتى لو تعطّل ساما: آخر قيمة سليمة + وقتها.
 */
import { memoryCache } from "../../memoryCache";
import { ECONOMY_INDICATOR_KEYS, INDICATOR_DEFS, type EconomyIndicatorKey, type IndicatorSnapshot } from "../sama/samaIndicators";
import { FX_HEADLINE_CODES, type FxRate } from "../sama/samaFx";
import type { SamaNewsItem } from "../sama/samaNews";
import { getLatestObservationsBySource, getLatestReport, type ObservationSource } from "./economyStore";
import { ECONOMY_CACHE_PREFIX } from "./economyStream";
import { isDecisionNight, nextDecisionDate } from "./watchCadence";
import type { WeeklySpendingStory } from "./weeklyStory";
import type { MoneySupplyReport } from "../sama/parsers/moneySupplyReport";

export interface SnapshotIndicator extends IndicatorSnapshot {
  previousValue: number | null;
  observedAt: string;
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
    stories: WeeklySpendingStory["stories"];
    kpis: WeeklySpendingStory["kpis"];
  } | null;
  moneySupply: { asOf: string; m3Billion: number | null; m3WeeklyChangePct: number | null; m3PeriodChangePct: number | null } | null;
  samaNews: SamaNewsItem[];
  decision: { isDecisionNight: boolean; nextDecisionDate: string | null };
}

const SNAPSHOT_TTL_MS = 60_000;

async function latestMap(source: ObservationSource) {
  const rows = await getLatestObservationsBySource(source);
  return new Map(rows.map((r) => [r.key, r]));
}

export async function buildEconomySnapshot(): Promise<EconomySnapshot> {
  const [ind, fx, news, weeklyReport, msReport] = await Promise.all([
    latestMap("sama_indicator"),
    latestMap("sama_fx"),
    latestMap("sama_news"),
    getLatestReport("pos_weekly"),
    getLatestReport("money_supply_weekly"),
  ]);

  const indicators: SnapshotIndicator[] = [];
  for (const key of ECONOMY_INDICATOR_KEYS) {
    const row = ind.get(key);
    if (!row || row.value === null) continue;
    const p = (row.payload ?? {}) as Partial<IndicatorSnapshot>;
    const def = INDICATOR_DEFS[key as EconomyIndicatorKey];
    indicators.push({
      key: key as EconomyIndicatorKey,
      titleAr: def.titleAr,
      shortAr: def.shortAr,
      unit: def.unit,
      cadence: def.cadence,
      value: row.value,
      valueText: row.valueText ?? `${row.value}%`,
      samaTitle: p.samaTitle ?? "",
      asOf: row.asOf ?? null,
      quarter: p.quarter ?? null,
      year: p.year ?? null,
      sourceId: p.sourceId ?? null,
      previousValue: row.previousValue ?? null,
      observedAt: new Date(row.observedAt).toISOString(),
    });
  }

  const fxRates: FxRate[] = [];
  for (const code of FX_HEADLINE_CODES) {
    const row = fx.get(`fx:${code}`);
    if (!row || row.value === null) continue;
    const p = (row.payload ?? {}) as Partial<FxRate>;
    fxRates.push({
      code,
      nameAr: p.nameAr ?? code,
      rate: row.value,
      prevRate: p.prevRate ?? row.previousValue ?? null,
      date: row.asOf ?? "",
      prevDate: p.prevDate ?? null,
      changePct: p.changePct ?? (row.previousValue ? ((row.value - row.previousValue) / row.previousValue) * 100 : null),
      isGcc: Boolean(p.isGcc),
    });
  }

  const samaNews = Array.from(news.values())
    .map((r) => (r.payload ?? {}) as unknown as SamaNewsItem)
    .filter((n) => n && n.title)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || b.id - a.id)
    .slice(0, 6);

  const story = weeklyReport ? ((weeklyReport.parsed as { story?: WeeklySpendingStory }).story ?? null) : null;
  const ms = msReport ? ((msReport.parsed as { report?: MoneySupplyReport }).report ?? null) : null;
  const m3 = ms?.aggregates.find((a) => a.key === "M3");

  const now = new Date();
  return {
    updatedAt: now.toISOString(),
    indicators,
    fx: fxRates,
    fxAsOf: fxRates[0]?.date ?? null,
    weekly: story
      ? {
          weekLabelAr: story.weekLabelAr,
          periodEnd: story.periodEnd,
          totalValue: story.totals.value,
          totalChangePct: story.kpis[0]?.changePct ?? 0,
          headline: story.lead.headline,
          stories: story.stories,
          kpis: story.kpis,
        }
      : null,
    moneySupply: ms ? { asOf: ms.asOf, m3Billion: ms.m3Billion, m3WeeklyChangePct: m3?.weeklyChangePct ?? null, m3PeriodChangePct: m3?.periodChangePct ?? null } : null,
    samaNews,
    decision: { isDecisionNight: isDecisionNight(now), nextDecisionDate: nextDecisionDate(now) },
  };
}

export async function getEconomySnapshotCached(): Promise<EconomySnapshot> {
  const key = `${ECONOMY_CACHE_PREFIX}snapshot`;
  const hit = memoryCache.get<EconomySnapshot>(key);
  if (hit) return hit;
  const snap = await buildEconomySnapshot();
  memoryCache.set(key, snap, SNAPSHOT_TTL_MS);
  return snap;
}

export async function getWeeklyStoryCached(): Promise<WeeklySpendingStory | null> {
  const key = `${ECONOMY_CACHE_PREFIX}weekly`;
  const hit = memoryCache.get<WeeklySpendingStory | null>(key);
  if (hit) return hit;
  const report = await getLatestReport("pos_weekly");
  const story = report ? ((report.parsed as { story?: WeeklySpendingStory }).story ?? null) : null;
  if (story) memoryCache.set(key, story, 5 * 60_000);
  return story;
}
