// «أرصدة النماذج» لتطبيق الديسك (للمدراء فقط).
//
//  - DeepSeek: رصيد فعلي من GET https://api.deepseek.com/user/balance.
//  - ElevenLabs: أحرف فعلية من GET /v1/user/subscription.
//  - OpenAI وAnthropic: رصيد تقديري = آخر شحنة/رصيد أدخله المدير − الصرف منذه.
//    الصرف من واجهات التكلفة الرسمية إن ضُبط OPENAI_ADMIN_KEY / ANTHROPIC_ADMIN_KEY،
//    وإلا من تكاليف سبق المسجّلة (ai_usage_logs / ai_usage_daily).
//  - Gemini: الصرف المسجّل هذا الشهر مقابل ميزانية شهرية يضعها المدير.
//
// التخزين في system_settings (فئة staff_app) — بلا جداول ولا ترحيلات:
//   staff_app.ai_balance:<provider>             الإعداد (حد، خط أساس، ميزانية، سجل الشحنات)
//   staff_app.ai_balance_snapshots:deepseek     آخر رصيد لكل يوم (لاستنتاج الصرف اليومي)
//   staff_app.ai_balance_alert:<provider>       آخر مستوى أُشعر به (low/critical/none)
//
// لا تُسجَّل قيم المفاتيح ولا تُعاد أبداً؛ رسائل الأخطاء تمر عبر shortenAiError.
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { aiBudgets, aiUsageDaily, aiUsageLogs, systemSettings } from "@shared/schema";
import { STAFF_APP_SETTINGS_CATEGORY } from "./staffAlertPrefsService";
import {
  AI_BALANCE_META,
  AI_BALANCE_PROVIDERS,
  type AiBalanceBaseline,
  type AiBalanceConfig,
  type AiBalanceKind,
  type AiBalanceProvider,
  type AiBalanceReason,
  type AiBalanceSpendSource,
  type AiBalanceState,
  type AiBalanceTopupMode,
  type AiBalanceTopupRecord,
  type AiBalanceUnit,
  type DailyPoint,
  accumulateAnthropicCosts,
  accumulateOpenAiCosts,
  addUtcDays,
  appendTopup,
  averageDailySpend,
  barFraction,
  buildBalanceSummaryText,
  buildDailySeries,
  compareBalancePriority,
  computeBalanceState,
  criticalThreshold,
  estimateBalance,
  estimateDaysLeft,
  nextBaseline,
  parseDeepSeekBalance,
  parseElevenLabsSubscription,
  recordSnapshot,
  round2,
  spendFromSnapshots,
  startOfUtcDay,
  sumSeriesFrom,
  utcDateKey,
} from "./aiBalanceMath";

const LOG_PREFIX = "[AiBalances]";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
/** ai_usage_logs تُقلَّم بعد 90 يوماً (aiUsageRollup)؛ نترك هامش يوم. */
const RAW_LOG_WINDOW_DAYS = 89;
const SERIES_DAYS = 30;
const SNAPSHOT_MIN_INTERVAL_MS = 60 * 60 * 1000;

export const configKey = (p: AiBalanceProvider) => `staff_app.ai_balance:${p}`;
export const snapshotsKey = (p: AiBalanceProvider) => `staff_app.ai_balance_snapshots:${p}`;
export const alertKey = (p: AiBalanceProvider) => `staff_app.ai_balance_alert:${p}`;

/** Gemini تُسجَّل باسم gemini أو google حسب المسار. */
const TRACKED_PROVIDER_NAMES: Record<AiBalanceProvider, string[]> = {
  deepseek: ["deepseek"],
  openai: ["openai"],
  anthropic: ["anthropic"],
  gemini: ["gemini", "google", "google-gemini"],
  elevenlabs: ["elevenlabs"],
};

// ── الأنواع المعادة ──────────────────────────────────────────────────

export interface AiBalanceView {
  provider: AiBalanceProvider;
  label: string;
  kind: AiBalanceKind;
  unit: AiBalanceUnit;
  state: AiBalanceState;
  reason: AiBalanceReason;
  /** المتبقي (فعلي/تقديري) أو المصروف هذا الشهر (ميزانية). */
  amount: number | null;
  /** آخر خط أساس / الميزانية / حد الأحرف. */
  total: number | null;
  /** امتلاء الشريط 0..1 (المتبقي/الكل؛ وللميزانية المصروف/الميزانية). */
  fraction: number | null;
  /** للميزانية: الميزانية − المصروف (ما تُقاس عليه الحالة). */
  remaining: number | null;
  threshold: { low: number; critical: number; presets: number[]; isDefault: boolean };
  todaySpend: number | null;
  monthSpend: number | null;
  /** وحدة todaySpend/monthSpend/series: usd أو cny أو characters. */
  spendUnit: AiBalanceUnit;
  spentSinceBaseline: number | null;
  daysLeft: number | null;
  resetsAt: string | null;
  baseline: { amount: number; at: string } | null;
  lastTopup: { mode: AiBalanceTopupMode; amount: number; topupAt: string; byName: string } | null;
  spendSource: AiBalanceSpendSource | null;
  canUpdateBalance: boolean;
  fetchedAt: string;
  error: string | null;
}

export interface AiBalanceDetailView extends AiBalanceView {
  series: DailyPoint[];
  topups: AiBalanceTopupRecord[];
}

export interface AiBalanceListView {
  generatedAt: string;
  summary: { critical: number; low: number; notConfigured: number; attention: number; text: string };
  providers: AiBalanceView[];
}

// ── أدوات ────────────────────────────────────────────────────────────

function envKey(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return null;
}

export function providerKeyEnv(provider: AiBalanceProvider): string | null {
  switch (provider) {
    case "deepseek":
      return envKey("DEEPSEEK_API_KEY");
    case "elevenlabs":
      return envKey("ELEVENLABS_API_KEY");
    case "openai":
      return envKey("AI_INTEGRATIONS_OPENAI_API_KEY", "OPENAI_API_KEY");
    case "anthropic":
      return envKey("AI_INTEGRATIONS_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY");
    case "gemini":
      return envKey("AI_INTEGRATIONS_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY");
  }
}

function adminKeyEnv(provider: AiBalanceProvider): string | null {
  if (provider === "openai") return envKey("OPENAI_ADMIN_KEY");
  if (provider === "anthropic") return envKey("ANTHROPIC_ADMIN_KEY");
  return null;
}

/** يزيل ما يشبه المفاتيح ويختصر. (نسخة محلية لتجنّب استيراد دائري مع staffAiAlertPush.) */
export function sanitizeBalanceError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const cleaned = raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|pk|rk|xai|gsk)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/((?:api[_-]?key|key|token|secret|authorization)\s*[=:]\s*)["']?[^\s&"',]+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  const text = cleaned || "تعذّر الاتصال بالمزوّد";
  return text.length <= 120 ? text : `${text.slice(0, 119)}…`;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    // لا نعيد جسم الرد (قد يحمل تفاصيل الحساب)؛ رمز الحالة يكفي.
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

// ── التخزين في system_settings ───────────────────────────────────────

async function readSetting<T>(key: string): Promise<T | null> {
  const rows = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  const value = rows[0]?.value;
  return value && typeof value === "object" ? (value as T) : null;
}

async function writeSetting(key: string, value: Record<string, unknown>): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, category: STAFF_APP_SETTINGS_CATEGORY, isPublic: false })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
}

export async function readBalanceConfig(provider: AiBalanceProvider): Promise<AiBalanceConfig> {
  return (await readSetting<AiBalanceConfig>(configKey(provider))) ?? {};
}

// ── الصرف المسجّل في سبق ─────────────────────────────────────────────

type TrackedField = "cost" | "units";

function sumExpr(field: TrackedField, table: typeof aiUsageLogs | typeof aiUsageDaily) {
  return field === "cost"
    ? sql<number>`coalesce(sum(${table.estimatedCostUsd}), 0)::float8`
    : sql<number>`coalesce(sum(${table.unitCount}), 0)::float8`;
}

function providerFilter(table: typeof aiUsageLogs | typeof aiUsageDaily, provider: AiBalanceProvider) {
  const names = TRACKED_PROVIDER_NAMES[provider];
  return sql`${table.provider} in (${sql.join(names.map((n) => sql`${n}`), sql`, `)})`;
}

/** خريطة تاريخ UTC → صرف، من ai_usage_daily للأيام السابقة + السجل الخام لليوم. */
async function trackedDaily(provider: AiBalanceProvider, from: Date, now: Date, field: TrackedField): Promise<Map<string, number>> {
  const today = startOfUtcDay(now);
  const out = new Map<string, number>();
  const daily = await db
    .select({ date: aiUsageDaily.date, total: sumExpr(field, aiUsageDaily) })
    .from(aiUsageDaily)
    .where(and(providerFilter(aiUsageDaily, provider), gte(aiUsageDaily.date, utcDateKey(from)), lt(aiUsageDaily.date, utcDateKey(today))))
    .groupBy(aiUsageDaily.date);
  for (const row of daily) out.set(String(row.date).slice(0, 10), Number(row.total) || 0);
  const raw = await db
    .select({ total: sumExpr(field, aiUsageLogs) })
    .from(aiUsageLogs)
    .where(and(providerFilter(aiUsageLogs, provider), gte(aiUsageLogs.createdAt, today)));
  out.set(utcDateKey(today), Number(raw[0]?.total) || 0);
  return out;
}

/** صرف سبق المسجّل منذ لحظة بعينها (دقيق باللحظة ضمن نافذة السجل الخام). */
async function trackedSpendSince(provider: AiBalanceProvider, since: Date, now: Date): Promise<number> {
  if (now.getTime() - since.getTime() <= RAW_LOG_WINDOW_DAYS * 86_400_000) {
    const rows = await db
      .select({ total: sumExpr("cost", aiUsageLogs) })
      .from(aiUsageLogs)
      .where(and(providerFilter(aiUsageLogs, provider), gte(aiUsageLogs.createdAt, since)));
    return round2(Number(rows[0]?.total) || 0);
  }
  // أقدم من نافذة السجل الخام: الأيام الكاملة بعد يوم خط الأساس من الجدول اليومي + اليوم.
  const map = await trackedDaily(provider, addUtcDays(startOfUtcDay(since), 1), now, "cost");
  return round2([...map.values()].reduce((a, b) => a + b, 0));
}

// ── واجهات التكلفة الإدارية (اختيارية) ───────────────────────────────

async function openAiAdminDaily(adminKey: string, from: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let page: string | null = null;
  for (let i = 0; i < 6; i++) {
    const params = new URLSearchParams({ start_time: String(Math.floor(from.getTime() / 1000)), bucket_width: "1d", limit: "180" });
    if (page) params.set("page", page);
    const body = (await fetchJson(`https://api.openai.com/v1/organization/costs?${params}`, {
      Authorization: `Bearer ${adminKey}`,
    })) as { has_more?: boolean; next_page?: string | null };
    accumulateOpenAiCosts(body, out);
    if (!body?.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return out;
}

async function anthropicAdminDaily(adminKey: string, from: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let page: string | null = null;
  for (let i = 0; i < 12; i++) {
    const params = new URLSearchParams({ starting_at: from.toISOString(), bucket_width: "1d", limit: "31" });
    if (page) params.set("page", page);
    const body = (await fetchJson(`https://api.anthropic.com/v1/organizations/cost_report?${params}`, {
      "x-api-key": adminKey,
      "anthropic-version": "2023-06-01",
    })) as { has_more?: boolean; next_page?: string | null };
    accumulateAnthropicCosts(body, out);
    if (!body?.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return out;
}

interface SpendData {
  source: AiBalanceSpendSource;
  /** تاريخ → صرف بالدولار، يغطي على الأقل [from, today]. */
  daily: Map<string, number>;
}

async function dailySpend(provider: AiBalanceProvider, from: Date, now: Date): Promise<SpendData> {
  const adminKey = adminKeyEnv(provider);
  if (adminKey) {
    try {
      const daily = provider === "openai" ? await openAiAdminDaily(adminKey, from) : await anthropicAdminDaily(adminKey, from);
      return { source: "provider_admin_api", daily };
    } catch (err) {
      console.warn(`${LOG_PREFIX} ${provider} admin cost API failed, using tracked costs:`, sanitizeBalanceError(err));
    }
  }
  return { source: "sabq_tracked", daily: await trackedDaily(provider, from, now, "cost") };
}

/**
 * الصرف منذ خط الأساس:
 *  - مصدر سبق: دقيق باللحظة.
 *  - واجهة المزوّد (يومية): مجموع الأيام من يوم خط الأساس − صرف ذلك اليوم قبل الحفظ (offset).
 */
async function spendSinceBaseline(provider: AiBalanceProvider, baseline: AiBalanceBaseline, spend: SpendData, now: Date): Promise<number> {
  const at = new Date(baseline.at);
  if (spend.source === "provider_admin_api") {
    const total = sumSeriesFrom(
      [...spend.daily.entries()].map(([date, value]) => ({ date, value })),
      utcDateKey(at),
    );
    const offset = baseline.source === "provider_admin_api" ? baseline.offsetUsd || 0 : 0;
    return round2(Math.max(0, total - offset));
  }
  return trackedSpendSince(provider, at, now);
}

// ── الحساب لكل مزوّد ─────────────────────────────────────────────────

function thresholdFor(provider: AiBalanceProvider, config: AiBalanceConfig, budget: number | null) {
  const meta = AI_BALANCE_META[provider];
  const custom = typeof config.threshold === "number" && config.threshold > 0 ? config.threshold : null;
  let low = custom ?? meta.defaultThreshold;
  if (!custom && provider === "gemini" && budget) low = Math.max(1, Math.round(budget * 0.2));
  return { low, critical: criticalThreshold(low), presets: meta.presets, isDefault: custom == null };
}

function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function baseView(provider: AiBalanceProvider, config: AiBalanceConfig, now: Date): AiBalanceView {
  const meta = AI_BALANCE_META[provider];
  const last = config.topups?.[0];
  return {
    provider,
    label: meta.label,
    kind: meta.kind,
    unit: provider === "elevenlabs" ? "characters" : "usd",
    state: "not_configured",
    reason: null,
    amount: null,
    total: null,
    fraction: null,
    remaining: null,
    threshold: thresholdFor(provider, config, null),
    todaySpend: null,
    monthSpend: null,
    spendUnit: provider === "elevenlabs" ? "characters" : "usd",
    spentSinceBaseline: null,
    daysLeft: null,
    resetsAt: null,
    baseline: config.baseline ? { amount: config.baseline.amountUsd, at: config.baseline.at } : null,
    lastTopup: last ? { mode: last.mode, amount: last.amountUsd, topupAt: last.topupAt, byName: last.byName } : null,
    spendSource: null,
    canUpdateBalance: meta.kind !== "actual",
    fetchedAt: now.toISOString(),
    error: null,
  };
}

function applySeries(view: AiBalanceView, series: DailyPoint[], now: Date) {
  const today = utcDateKey(now);
  view.todaySpend = round2(series.find((p) => p.date === today)?.value ?? 0);
  view.monthSpend = sumSeriesFrom(series, utcDateKey(monthStartUtc(now)));
}

async function computeDeepSeek(config: AiBalanceConfig, now: Date): Promise<AiBalanceDetailView> {
  const view = baseView("deepseek", config, now);
  const key = providerKeyEnv("deepseek");
  if (!key) return { ...view, state: "unavailable", reason: "missing_key", series: [], topups: config.topups ?? [] };
  try {
    const parsed = parseDeepSeekBalance(await fetchJson("https://api.deepseek.com/user/balance", { Authorization: `Bearer ${key}`, Accept: "application/json" }));
    if (!parsed) throw new Error("رد غير متوقع من DeepSeek");
    view.unit = parsed.unit;
    view.spendUnit = parsed.unit;
    view.amount = parsed.amount;
    view.spendSource = "balance_snapshots";

    const stored = (await readSetting<{ days?: Record<string, number>; at?: string }>(snapshotsKey("deepseek"))) ?? {};
    const todayKey = utcDateKey(now);
    let days = stored.days ?? {};
    const lastAt = stored.at ? new Date(stored.at).getTime() : 0;
    if (days[todayKey] !== parsed.amount && (days[todayKey] == null || now.getTime() - lastAt >= SNAPSHOT_MIN_INTERVAL_MS)) {
      days = recordSnapshot(days, todayKey, parsed.amount);
      await writeSetting(snapshotsKey("deepseek"), { days, at: now.toISOString(), unit: parsed.unit });
    }
    const series = buildDailySeries(spendFromSnapshots(days), now, SERIES_DAYS);
    applySeries(view, series, now);
    view.daysLeft = estimateDaysLeft(parsed.amount, averageDailySpend(series, now));
    const peak = Math.max(parsed.amount, ...Object.values(days), view.threshold.low * 2);
    view.total = null;
    view.fraction = barFraction(parsed.amount, peak);
    view.state = parsed.isAvailable ? computeBalanceState(parsed.amount, view.threshold.low) : "critical";
    return { ...view, series, topups: config.topups ?? [] };
  } catch (err) {
    return { ...view, state: "unavailable", reason: "fetch_failed", error: sanitizeBalanceError(err), series: [], topups: config.topups ?? [] };
  }
}

async function computeElevenLabs(config: AiBalanceConfig, now: Date): Promise<AiBalanceDetailView> {
  const view = baseView("elevenlabs", config, now);
  const key = providerKeyEnv("elevenlabs");
  if (!key) return { ...view, state: "unavailable", reason: "missing_key", series: [], topups: [] };
  try {
    const sub = parseElevenLabsSubscription(await fetchJson("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": key }));
    if (!sub) throw new Error("رد غير متوقع من ElevenLabs");
    view.amount = sub.remaining;
    view.total = sub.limit;
    view.fraction = barFraction(sub.remaining, sub.limit);
    view.resetsAt = sub.resetsAt;
    view.spendSource = "sabq_tracked";
    view.state = computeBalanceState(sub.remaining, view.threshold.low);
    let series: DailyPoint[] = [];
    try {
      series = buildDailySeries(await trackedDaily("elevenlabs", addUtcDays(startOfUtcDay(now), -(SERIES_DAYS - 1)), now, "units"), now, SERIES_DAYS);
      applySeries(view, series, now);
      view.daysLeft = estimateDaysLeft(sub.remaining, averageDailySpend(series, now));
    } catch (err) {
      console.warn(`${LOG_PREFIX} elevenlabs tracked series failed:`, sanitizeBalanceError(err));
    }
    return { ...view, series, topups: [] };
  } catch (err) {
    return { ...view, state: "unavailable", reason: "fetch_failed", error: sanitizeBalanceError(err), series: [], topups: [] };
  }
}

async function computeEstimated(provider: "openai" | "anthropic", config: AiBalanceConfig, now: Date): Promise<AiBalanceDetailView> {
  const view = baseView(provider, config, now);
  const topups = config.topups ?? [];
  const seriesFrom = addUtcDays(startOfUtcDay(now), -(SERIES_DAYS - 1));
  const baselineAt = config.baseline ? startOfUtcDay(new Date(config.baseline.at)) : null;
  const from = baselineAt && baselineAt < seriesFrom ? baselineAt : seriesFrom;
  try {
    const spend = await dailySpend(provider, from, now);
    view.spendSource = spend.source;
    const series = buildDailySeries(spend.daily, now, SERIES_DAYS);
    applySeries(view, series, now);
    if (!config.baseline) {
      return { ...view, state: "not_configured", reason: "no_topup", series, topups };
    }
    const spent = await spendSinceBaseline(provider, config.baseline, spend, now);
    const amount = estimateBalance(config.baseline.amountUsd, spent);
    view.spentSinceBaseline = spent;
    view.amount = amount;
    view.total = config.baseline.amountUsd;
    view.fraction = barFraction(amount, config.baseline.amountUsd);
    view.daysLeft = estimateDaysLeft(amount, averageDailySpend(series, now));
    view.state = computeBalanceState(amount, view.threshold.low);
    return { ...view, series, topups };
  } catch (err) {
    return { ...view, state: "unavailable", reason: "fetch_failed", error: sanitizeBalanceError(err), series: [], topups };
  }
}

async function geminiBudgetFallback(): Promise<number | null> {
  try {
    const rows = await db
      .select({ scopeKey: aiBudgets.scopeKey, limit: aiBudgets.monthlyLimitUsd })
      .from(aiBudgets)
      .where(and(eq(aiBudgets.scope, "provider"), eq(aiBudgets.isEnabled, true)));
    const row = rows.find((r) => TRACKED_PROVIDER_NAMES.gemini.includes(String(r.scopeKey).toLowerCase()));
    const v = Number(row?.limit);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

async function computeGemini(config: AiBalanceConfig, now: Date): Promise<AiBalanceDetailView> {
  const view = baseView("gemini", config, now);
  const topups = config.topups ?? [];
  try {
    const budget = config.monthlyBudgetUsd && config.monthlyBudgetUsd > 0 ? config.monthlyBudgetUsd : await geminiBudgetFallback();
    view.threshold = thresholdFor("gemini", config, budget);
    view.spendSource = "sabq_tracked";
    const from = addUtcDays(startOfUtcDay(now), -(SERIES_DAYS - 1));
    const month = monthStartUtc(now);
    const daily = await trackedDaily("gemini", from < month ? from : month, now, "cost");
    const series = buildDailySeries(daily, now, SERIES_DAYS);
    view.todaySpend = round2(daily.get(utcDateKey(now)) ?? 0);
    view.monthSpend = round2([...daily.entries()].filter(([d]) => d >= utcDateKey(month)).reduce((s, [, v]) => s + v, 0));
    view.amount = view.monthSpend;
    if (!budget) return { ...view, state: "not_configured", reason: "no_budget", series, topups };
    const remaining = round2(Math.max(0, budget - view.monthSpend));
    view.total = budget;
    view.remaining = remaining;
    view.fraction = barFraction(view.monthSpend, budget);
    view.daysLeft = estimateDaysLeft(remaining, averageDailySpend(series, now));
    view.state = computeBalanceState(remaining, view.threshold.low);
    return { ...view, series, topups };
  } catch (err) {
    return { ...view, state: "unavailable", reason: "fetch_failed", error: sanitizeBalanceError(err), series: [], topups };
  }
}

async function computeProvider(provider: AiBalanceProvider, now: Date): Promise<AiBalanceDetailView> {
  let config: AiBalanceConfig = {};
  try {
    config = await readBalanceConfig(provider);
  } catch (err) {
    console.warn(`${LOG_PREFIX} config read failed for ${provider}:`, sanitizeBalanceError(err));
  }
  switch (provider) {
    case "deepseek":
      return computeDeepSeek(config, now);
    case "elevenlabs":
      return computeElevenLabs(config, now);
    case "openai":
    case "anthropic":
      return computeEstimated(provider, config, now);
    case "gemini":
      return computeGemini(config, now);
  }
}

// ── الذاكرة المؤقتة (~10 دقائق لكل نسخة) ─────────────────────────────

const cache = new Map<AiBalanceProvider, { at: number; value: Promise<AiBalanceDetailView> }>();

export function clearAiBalanceCache(provider?: AiBalanceProvider) {
  if (provider) cache.delete(provider);
  else cache.clear();
}

export async function getProviderBalance(provider: AiBalanceProvider, opts: { now?: Date; fresh?: boolean } = {}): Promise<AiBalanceDetailView> {
  const now = opts.now ?? new Date();
  const hit = cache.get(provider);
  if (!opts.fresh && hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = computeProvider(provider, now);
  cache.set(provider, { at: now.getTime(), value });
  value.catch(() => cache.delete(provider));
  return value;
}

export function toListItem(detail: AiBalanceDetailView): AiBalanceView {
  const { series: _series, topups: _topups, ...rest } = detail;
  return rest;
}

export async function getAllBalances(opts: { now?: Date; fresh?: boolean } = {}): Promise<AiBalanceListView> {
  const now = opts.now ?? new Date();
  const details = await Promise.all(AI_BALANCE_PROVIDERS.map((p) => getProviderBalance(p, { ...opts, now })));
  const providers = details.map(toListItem).sort(compareBalancePriority);
  const critical = providers.filter((p) => p.state === "critical").length;
  const low = providers.filter((p) => p.state === "low").length;
  const notConfigured = providers.filter((p) => p.state === "not_configured").length;
  return {
    generatedAt: now.toISOString(),
    summary: {
      critical,
      low,
      notConfigured,
      attention: critical + low + notConfigured,
      text: buildBalanceSummaryText(providers),
    },
    providers,
  };
}

// ── الحفظ (للمدراء) ──────────────────────────────────────────────────

export class AiBalanceInputError extends Error {
  constructor(public code: "unsupported_mode" | "invalid_amount" | "estimate_unavailable", message: string) {
    super(message);
  }
}

export interface AiBalanceActor {
  id: string;
  name: string;
}

export async function saveBalanceTopup(
  provider: AiBalanceProvider,
  input: { mode: AiBalanceTopupMode; amountUsd: number; topupAt?: string | null; threshold?: number | null },
  actor: AiBalanceActor,
  now: Date = new Date(),
): Promise<{ before: AiBalanceConfig; after: AiBalanceConfig; balance: AiBalanceDetailView }> {
  const kind = AI_BALANCE_META[provider].kind;
  if (kind === "actual") throw new AiBalanceInputError("unsupported_mode", "رصيد هذا المزوّد يُقرأ من واجهته مباشرة");
  if (kind === "budget" && input.mode !== "budget") throw new AiBalanceInputError("unsupported_mode", "لـ Gemini ميزانية شهرية فقط");
  if (kind === "estimated" && input.mode === "budget") throw new AiBalanceInputError("unsupported_mode", "استخدم شحنة أو رصيد اللوحة");
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) throw new AiBalanceInputError("invalid_amount", "أدخل مبلغاً أكبر من صفر");

  const before = await readBalanceConfig(provider);
  const after: AiBalanceConfig = { ...before };
  const topupAt = input.topupAt ? new Date(input.topupAt) : now;
  const safeTopupAt = Number.isNaN(topupAt.getTime()) || topupAt > now ? now : topupAt;
  let balanceAfter: number;

  if (input.mode === "budget") {
    after.monthlyBudgetUsd = round2(input.amountUsd);
    balanceAfter = after.monthlyBudgetUsd;
  } else {
    let currentEstimate: number | null = null;
    if (before.baseline && input.mode === "add") {
      const current = await getProviderBalance(provider, { now, fresh: true });
      if (current.state === "unavailable" || current.amount == null) {
        throw new AiBalanceInputError("estimate_unavailable", "تعذّر حساب الرصيد الحالي الآن، حاول لاحقاً أو أدخل رصيد اللوحة");
      }
      currentEstimate = current.amount;
    }
    const next = nextBaseline({ mode: input.mode, amountUsd: input.amountUsd, topupAt: safeTopupAt, now, currentEstimate });
    // لمصدر يومي (واجهة المزوّد): صرف يوم خط الأساس حتى الآن يُطرح لاحقاً.
    let source: AiBalanceSpendSource = "sabq_tracked";
    let offsetUsd = 0;
    if (adminKeyEnv(provider)) {
      try {
        const spend = await dailySpend(provider, startOfUtcDay(next.at), now);
        source = spend.source;
        if (source === "provider_admin_api" && next.at.getTime() === now.getTime()) {
          offsetUsd = round2(spend.daily.get(utcDateKey(now)) ?? 0);
        }
      } catch {
        source = "sabq_tracked";
      }
    }
    after.baseline = { amountUsd: next.amountUsd, at: next.at.toISOString(), source, offsetUsd };
    balanceAfter = next.amountUsd;
  }

  if (typeof input.threshold === "number" && input.threshold > 0) after.threshold = round2(input.threshold);
  after.topups = appendTopup(before.topups, {
    mode: input.mode,
    amountUsd: round2(input.amountUsd),
    topupAt: (input.mode === "add" ? safeTopupAt : now).toISOString(),
    savedAt: now.toISOString(),
    byUserId: actor.id,
    byName: actor.name,
    balanceAfterUsd: balanceAfter,
  });
  after.updatedAt = now.toISOString();
  after.updatedBy = { id: actor.id, name: actor.name };

  await writeSetting(configKey(provider), after as Record<string, unknown>);
  // شحنة جديدة تعيد تسليح التنبيه: الإشعار التالي يصل عند العبور من جديد.
  await writeSetting(alertKey(provider), { level: "none", at: now.toISOString(), reason: "topup" });
  clearAiBalanceCache(provider);
  const balance = await getProviderBalance(provider, { now, fresh: true });
  return { before, after, balance };
}

export async function saveBalanceThreshold(
  provider: AiBalanceProvider,
  threshold: number,
  actor: AiBalanceActor,
  now: Date = new Date(),
): Promise<{ before: AiBalanceConfig; after: AiBalanceConfig; balance: AiBalanceDetailView }> {
  if (!Number.isFinite(threshold) || threshold <= 0) throw new AiBalanceInputError("invalid_amount", "أدخل حداً أكبر من صفر");
  const before = await readBalanceConfig(provider);
  const after: AiBalanceConfig = {
    ...before,
    threshold: provider === "elevenlabs" ? Math.round(threshold) : round2(threshold),
    updatedAt: now.toISOString(),
    updatedBy: { id: actor.id, name: actor.name },
  };
  await writeSetting(configKey(provider), after as Record<string, unknown>);
  clearAiBalanceCache(provider);
  const balance = await getProviderBalance(provider, { now, fresh: true });
  return { before, after, balance };
}

/** ملخص آمن للتدقيق (بلا سجل الشحنات الكامل). */
export function auditSnapshot(config: AiBalanceConfig) {
  return {
    threshold: config.threshold ?? null,
    baseline: config.baseline ? { amountUsd: config.baseline.amountUsd, at: config.baseline.at } : null,
    monthlyBudgetUsd: config.monthlyBudgetUsd ?? null,
  };
}

// ── حالة التنبيه (تستخدمها staffAiAlertPush) ─────────────────────────

export async function readAlertLevel(provider: AiBalanceProvider): Promise<"unseeded" | "none" | "low" | "critical"> {
  const v = await readSetting<{ level?: string }>(alertKey(provider));
  if (!v) return "unseeded";
  return v.level === "low" || v.level === "critical" ? v.level : "none";
}

/**
 * يكتب المستوى الجديد ذرياً فقط إن اختلف عن المخزَّن؛ true إن كتبته هذه النسخة
 * (فتُرسل هي الإشعار — لا يتكرر عبر نسختي Railway).
 */
export async function claimAlertLevel(provider: AiBalanceProvider, level: "none" | "low" | "critical", now: Date): Promise<boolean> {
  const key = alertKey(provider);
  const value = { level, at: now.toISOString() };
  const rows = await db
    .insert(systemSettings)
    .values({ key, value, category: STAFF_APP_SETTINGS_CATEGORY, isPublic: false })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: now },
      setWhere: sql`coalesce(${systemSettings.value}->>'level', 'none') <> ${level}`,
    })
    .returning({ id: systemSettings.id });
  return rows.length > 0;
}
