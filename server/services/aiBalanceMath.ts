// «أرصدة النماذج» — الحسابات الصافية (بلا شبكة ولا قاعدة بيانات) حتى تُختبر وحدها.
//
//  - الحالة: جيد / منخفض (تحت الحد) / حرج (تحت ربع الحد) / غير مضبوط / غير متاح.
//  - الرصيد التقديري = خط الأساس (آخر شحنة أو رصيد لوحة أدخله المدير) − الصرف منذه.
//  - الأيام المتبقية = الرصيد ÷ متوسط الصرف اليومي لآخر 7 أيام كاملة.
//  - تحليل ردود DeepSeek وElevenLabs وتقارير التكلفة الإدارية لـ OpenAI وAnthropic.
//  - قرار إشعار عبور الحد (مرة لكل مستوى، ويُعاد التسليح بعد التعافي/الشحن).

export const AI_BALANCE_PROVIDERS = ["deepseek", "openai", "anthropic", "gemini", "elevenlabs"] as const;
export type AiBalanceProvider = (typeof AI_BALANCE_PROVIDERS)[number];

export type AiBalanceKind = "actual" | "estimated" | "budget";
export type AiBalanceState = "healthy" | "low" | "critical" | "not_configured" | "unavailable";
export type AiBalanceReason = "missing_key" | "no_topup" | "no_budget" | "fetch_failed" | null;
export type AiBalanceUnit = "usd" | "cny" | "characters";
export type AiBalanceSpendSource = "provider" | "provider_admin_api" | "sabq_tracked" | "balance_snapshots";
export type AiBalanceAlertLevel = "low" | "critical";

export function isAiBalanceProvider(value: unknown): value is AiBalanceProvider {
  return typeof value === "string" && (AI_BALANCE_PROVIDERS as readonly string[]).includes(value);
}

export interface AiBalanceProviderMeta {
  label: string;
  kind: AiBalanceKind;
  /** حد التنبيه الافتراضي (بوحدة المزوّد) قبل أن يضبطه المدير. */
  defaultThreshold: number;
  /** خيارات الحد السريعة في ورقة التحديث. */
  presets: number[];
}

export const AI_BALANCE_META: Record<AiBalanceProvider, AiBalanceProviderMeta> = {
  deepseek: { label: "DeepSeek", kind: "actual", defaultThreshold: 20, presets: [10, 20, 50] },
  openai: { label: "OpenAI", kind: "estimated", defaultThreshold: 100, presets: [50, 100, 200] },
  anthropic: { label: "Anthropic", kind: "estimated", defaultThreshold: 100, presets: [50, 100, 200] },
  gemini: { label: "Gemini", kind: "budget", defaultThreshold: 20, presets: [10, 20, 50] },
  elevenlabs: { label: "ElevenLabs", kind: "actual", defaultThreshold: 50_000, presets: [25_000, 50_000, 100_000] },
};

/** ترتيب الأولوية في القائمة: الحرج ثم المنخفض ثم غير المضبوط ثم غير المتاح ثم الجيد. */
const STATE_RANK: Record<AiBalanceState, number> = {
  critical: 0,
  low: 1,
  not_configured: 2,
  unavailable: 3,
  healthy: 4,
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** المستوى الحرج = ربع حد التنبيه (كما في المقترح المعتمد). */
export function criticalThreshold(low: number): number {
  return round2(Math.max(0, low) / 4);
}

/** «حرج» تحت ربع الحد، «منخفض» تحت الحد، وإلا «جيد». الصفر أو أقل حرج دائماً. */
export function computeBalanceState(amount: number, low: number): "healthy" | "low" | "critical" {
  if (!Number.isFinite(amount) || amount <= 0) return "critical";
  if (amount < criticalThreshold(low)) return "critical";
  if (amount < low) return "low";
  return "healthy";
}

/** الرصيد التقديري = خط الأساس − الصرف منذه (لا يقل عن صفر في العرض). */
export function estimateBalance(baselineAmount: number, spentSince: number): number {
  const spent = Number.isFinite(spentSince) && spentSince > 0 ? spentSince : 0;
  return round2(Math.max(0, baselineAmount - spent));
}

/** نسبة امتلاء الشريط بين 0 و1، أو null إن لم يُعرف الكل. */
export function barFraction(part: number | null, total: number | null): number | null {
  if (part == null || total == null || !Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(1, Math.max(0, part / total));
}

export interface DailyPoint {
  /** YYYY-MM-DD (UTC، مثل جداول الاستخدام). */
  date: string;
  value: number;
}

export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function startOfUtcDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** سلسلة 30 يوماً (الأقدم أولاً، اليوم آخرها) من خريطة تاريخ→قيمة، والأيام الناقصة صفر. */
export function buildDailySeries(values: Map<string, number>, now: Date, days = 30): DailyPoint[] {
  const today = startOfUtcDay(now);
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = utcDateKey(addUtcDays(today, -i));
    out.push({ date: key, value: round2(values.get(key) ?? 0) });
  }
  return out;
}

/** متوسط آخر 7 أيام كاملة (بلا اليوم الجاري). أيام بلا بيانات تُحسب أصفاراً. */
export function averageDailySpend(series: DailyPoint[], now: Date, window = 7): number | null {
  const today = utcDateKey(now);
  const full = series.filter((p) => p.date < today).slice(-window);
  if (full.length === 0) return null;
  const total = full.reduce((sum, p) => sum + (Number.isFinite(p.value) ? p.value : 0), 0);
  const avg = total / full.length;
  return avg > 0 ? avg : null;
}

/** عدد الأيام التقريبي الذي يكفيه الرصيد بمعدل الصرف الأخير، أو null بلا صرف. */
export function estimateDaysLeft(amount: number | null, avgDaily: number | null): number | null {
  if (amount == null || avgDaily == null || avgDaily <= 0 || !Number.isFinite(amount)) return null;
  const days = Math.max(0, amount) / avgDaily;
  return Math.round(days * 10) / 10;
}

export function sumSeriesFrom(series: DailyPoint[], fromDateKey: string): number {
  return round2(series.filter((p) => p.date >= fromDateKey).reduce((s, p) => s + p.value, 0));
}

// ── تحليل ردود المزوّدين ─────────────────────────────────────────────

export interface ParsedDeepSeekBalance {
  amount: number;
  unit: "usd" | "cny";
  isAvailable: boolean;
}

/** GET https://api.deepseek.com/user/balance — يفضّل الدولار إن وُجد. */
export function parseDeepSeekBalance(body: unknown): ParsedDeepSeekBalance | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as { is_available?: unknown; balance_infos?: unknown };
  if (!Array.isArray(raw.balance_infos) || raw.balance_infos.length === 0) return null;
  const infos = raw.balance_infos
    .map((info) => {
      const i = info as { currency?: unknown; total_balance?: unknown };
      const amount = Number(i.total_balance);
      const currency = typeof i.currency === "string" ? i.currency.toUpperCase() : "";
      return { amount, currency };
    })
    .filter((i) => Number.isFinite(i.amount) && (i.currency === "USD" || i.currency === "CNY"));
  const pick = infos.find((i) => i.currency === "USD") ?? infos[0];
  if (!pick) return null;
  return {
    amount: round2(pick.amount),
    unit: pick.currency === "USD" ? "usd" : "cny",
    isAvailable: raw.is_available !== false,
  };
}

export interface ParsedElevenLabsSubscription {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string | null;
}

/** GET https://api.elevenlabs.io/v1/user/subscription */
export function parseElevenLabsSubscription(body: unknown): ParsedElevenLabsSubscription | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as { character_count?: unknown; character_limit?: unknown; next_character_count_reset_unix?: unknown };
  const used = Number(raw.character_count);
  const limit = Number(raw.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  const resetUnix = Number(raw.next_character_count_reset_unix);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: Number.isFinite(resetUnix) && resetUnix > 0 ? new Date(resetUnix * 1000).toISOString() : null,
  };
}

/** صفحة من GET /v1/organization/costs (OpenAI): المبالغ بالدولار. يضيف إلى الخريطة. */
export function accumulateOpenAiCosts(page: unknown, into: Map<string, number>): void {
  const data = (page as { data?: unknown })?.data;
  if (!Array.isArray(data)) return;
  for (const bucket of data) {
    const b = bucket as { start_time?: unknown; results?: unknown };
    const start = Number(b.start_time);
    if (!Number.isFinite(start) || !Array.isArray(b.results)) continue;
    const key = utcDateKey(new Date(start * 1000));
    let sum = 0;
    for (const r of b.results) {
      const amount = (r as { amount?: { value?: unknown; currency?: unknown } })?.amount;
      const value = Number(amount?.value);
      const currency = typeof amount?.currency === "string" ? amount.currency.toLowerCase() : "usd";
      if (Number.isFinite(value) && currency === "usd") sum += value;
    }
    into.set(key, (into.get(key) ?? 0) + sum);
  }
}

/** صفحة من GET /v1/organizations/cost_report (Anthropic): المبالغ بالسنت كنص عشري. */
export function accumulateAnthropicCosts(page: unknown, into: Map<string, number>): void {
  const data = (page as { data?: unknown })?.data;
  if (!Array.isArray(data)) return;
  for (const bucket of data) {
    const b = bucket as { starting_at?: unknown; results?: unknown };
    const start = typeof b.starting_at === "string" ? new Date(b.starting_at) : null;
    if (!start || Number.isNaN(start.getTime()) || !Array.isArray(b.results)) continue;
    const key = utcDateKey(start);
    let cents = 0;
    for (const r of b.results) {
      const item = r as { amount?: unknown; currency?: unknown };
      const value = Number(item.amount);
      const currency = typeof item.currency === "string" ? item.currency.toUpperCase() : "USD";
      if (Number.isFinite(value) && currency === "USD") cents += value;
    }
    into.set(key, (into.get(key) ?? 0) + cents / 100);
  }
}

/**
 * صرف يومي مستنتج من لقطات رصيد فعلي (آخر قيمة لكل يوم): الفرق بين يومين
 * متتاليين حين ينقص الرصيد. الزيادة (شحنة) لا تُحسب صرفاً.
 */
export function spendFromSnapshots(days: Record<string, number>): Map<string, number> {
  const keys = Object.keys(days).filter((k) => Number.isFinite(days[k])).sort();
  const out = new Map<string, number>();
  for (let i = 1; i < keys.length; i++) {
    const diff = days[keys[i - 1]] - days[keys[i]];
    out.set(keys[i], diff > 0 ? round2(diff) : 0);
  }
  return out;
}

/** يُبقي آخر `keep` يوماً من اللقطات ويضع قيمة اليوم. */
export function recordSnapshot(days: Record<string, number>, dateKey: string, amount: number, keep = 35): Record<string, number> {
  const next: Record<string, number> = { ...days, [dateKey]: round2(amount) };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keep))) delete next[k];
  return next;
}

// ── خط الأساس والشحنات ───────────────────────────────────────────────

export interface AiBalanceBaseline {
  /** الرصيد عند `at` (دولار). */
  amountUsd: number;
  /** ISO. */
  at: string;
  /** مصدر الصرف وقت الحفظ؛ يُطرح `offsetUsd` فقط إن بقي المصدر نفسه. */
  source: AiBalanceSpendSource | null;
  /** صرف يوم خط الأساس قبل لحظة الحفظ (للمصادر اليومية فقط). */
  offsetUsd: number;
}

export type AiBalanceTopupMode = "add" | "set" | "budget";

export interface AiBalanceTopupRecord {
  mode: AiBalanceTopupMode;
  amountUsd: number;
  topupAt: string;
  savedAt: string;
  byUserId: string;
  byName: string;
  balanceAfterUsd: number;
}

export interface AiBalanceConfig {
  threshold?: number;
  baseline?: AiBalanceBaseline;
  monthlyBudgetUsd?: number;
  topups?: AiBalanceTopupRecord[];
  updatedAt?: string;
  updatedBy?: { id: string; name: string };
}

export const MAX_TOPUP_HISTORY = 20;

/**
 * خط الأساس الجديد بعد «أضفتُ شحنة جديدة» أو «الرصيد الحالي في اللوحة».
 *  - add مع رصيد سابق: الرصيد التقديري الآن + الشحنة، اعتباراً من الآن.
 *  - add بلا رصيد سابق: مبلغ الشحنة اعتباراً من تاريخها (يُطرح الصرف بعده).
 *  - set: الرقم المعروض في لوحة المزوّد الآن.
 */
export function nextBaseline(input: {
  mode: "add" | "set";
  amountUsd: number;
  topupAt: Date;
  now: Date;
  currentEstimate: number | null;
}): { amountUsd: number; at: Date } {
  if (input.mode === "set") return { amountUsd: round2(input.amountUsd), at: input.now };
  if (input.currentEstimate != null) {
    return { amountUsd: round2(input.currentEstimate + input.amountUsd), at: input.now };
  }
  const at = input.topupAt.getTime() > input.now.getTime() ? input.now : input.topupAt;
  return { amountUsd: round2(input.amountUsd), at };
}

export function appendTopup(history: AiBalanceTopupRecord[] | undefined, record: AiBalanceTopupRecord): AiBalanceTopupRecord[] {
  return [record, ...(history ?? [])].slice(0, MAX_TOPUP_HISTORY);
}

// ── قرار الإشعار ─────────────────────────────────────────────────────

const LEVEL_RANK = { none: 0, low: 1, critical: 2 } as const;
export type StoredAlertLevel = keyof typeof LEVEL_RANK;
/** "unseeded" = لا صف مخزَّن بعد (أول تشغيل بعد النشر، أو مزوّد لم يُقيَّم قط). */
export type ReadAlertLevel = StoredAlertLevel | "unseeded";

/**
 * يقرر ما يُرسل وما يُخزَّن بعد قراءة الحالة الحالية:
 *  - عبور إلى مستوى أشد من المخزَّن ⇒ إشعار واحد بالمستوى الجديد.
 *  - العودة إلى «جيد» أو مستوى أخف (بعد شحن) ⇒ تخزين المستوى الأخف بلا إشعار
 *    (إعادة تسليح، فالعبور التالي يُشعر من جديد).
 *  - غير مضبوط / غير متاح ⇒ لا تغيير.
 *  - لا مستوى مخزَّن بعد (أول تشغيل بعد النشر) ⇒ تخزين المستوى الحالي بصمت،
 *    فلا تصل دفعة إشعارات لمزوّدات منخفضة أصلاً؛ العبور التالي فقط يُشعر.
 */
export function decideBalanceAlert(
  stored: ReadAlertLevel,
  state: AiBalanceState,
): { push: AiBalanceAlertLevel | null; store: StoredAlertLevel | null } {
  if (state === "not_configured" || state === "unavailable") return { push: null, store: null };
  const current: StoredAlertLevel = state === "critical" ? "critical" : state === "low" ? "low" : "none";
  if (stored === "unseeded") return { push: null, store: current };
  if (LEVEL_RANK[current] > LEVEL_RANK[stored]) {
    return { push: current as AiBalanceAlertLevel, store: current };
  }
  if (LEVEL_RANK[current] < LEVEL_RANK[stored]) return { push: null, store: current };
  return { push: null, store: null };
}

// ── الصياغة ──────────────────────────────────────────────────────────

/** $1.85 / $500 / ¥12.40 / 182.4K حرف. `whole` يحذف الكسور الصفرية. */
export function formatBalanceAmount(value: number, unit: AiBalanceUnit, opts: { whole?: boolean } = {}): string {
  if (unit === "characters") return `${formatCompact(value)} حرف`;
  const symbol = unit === "cny" ? "¥" : "$";
  const fixed = opts.whole && Math.abs(value - Math.round(value)) < 0.005 ? String(Math.round(value)) : value.toFixed(2);
  return `${symbol}${fixed}`;
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const trim = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(value / 1_000)}K`;
  return String(Math.round(value));
}

/** «يوم واحد» / «يومين» / «4 أيام» / «35 يومًا» / «أقل من يوم». */
export function arabicDays(days: number): string {
  const n = Math.round(days);
  if (n < 1) return "أقل من يوم";
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومين";
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

export interface BalanceSummaryInput {
  label: string;
  state: AiBalanceState;
}

/** فقاعة المساعد أعلى القائمة. */
export function buildBalanceSummaryText(items: BalanceSummaryInput[]): string {
  const critical = items.filter((i) => i.state === "critical").map((i) => i.label);
  const low = items.filter((i) => i.state === "low").map((i) => i.label);
  const notConfigured = items.filter((i) => i.state === "not_configured").map((i) => i.label);
  const join = (names: string[]) =>
    names.length <= 1 ? names.join("") : `${names.slice(0, -1).join("، ")} و${names[names.length - 1]}`;
  const parts: string[] = [];
  if (critical.length) parts.push(`رصيد ${join(critical)} شبه نافد`);
  if (low.length) parts.push(`${critical.length ? "و" : "رصيد "}${join(low)} تحت الحد`);
  const attention = critical.length + low.length;
  if (attention === 0) {
    const base = "كل الأرصدة فوق حدود التنبيه.";
    return notConfigured.length ? `${base} ${join(notConfigured)} ${notConfigured.length > 1 ? "تحتاج" : "يحتاج"} ضبط الرصيد.` : base;
  }
  const advice = attention === 1 ? "أنصح بشحنه اليوم." : attention === 2 ? "أنصح بشحن الاثنين اليوم." : "أنصح بشحنها اليوم.";
  return `${parts.join("، ")}. ${advice}`;
}

export function compareBalancePriority(
  a: { state: AiBalanceState; provider: AiBalanceProvider },
  b: { state: AiBalanceState; provider: AiBalanceProvider },
): number {
  const diff = STATE_RANK[a.state] - STATE_RANK[b.state];
  if (diff !== 0) return diff;
  return AI_BALANCE_PROVIDERS.indexOf(a.provider) - AI_BALANCE_PROVIDERS.indexOf(b.provider);
}

export interface BalancePushInput {
  provider: AiBalanceProvider;
  label: string;
  kind: AiBalanceKind;
  unit: AiBalanceUnit;
  level: AiBalanceAlertLevel;
  amount: number;
  total: number | null;
  threshold: number;
  daysLeft: number | null;
  resetsAt: string | null;
}

function riyadhShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
      day: "numeric",
      month: "long",
      timeZone: "Asia/Riyadh",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** نص إشعار شاشة القفل (كما في المقترح: حرج فعلي لـ DeepSeek، منخفض تقديري لـ OpenAI). */
export function buildBalancePush(input: BalancePushInput): { title: string; body: string } {
  const amt = formatBalanceAmount(input.amount, input.unit);
  const amtWhole = formatBalanceAmount(input.amount, input.unit, { whole: true });
  const low = formatBalanceAmount(input.threshold, input.unit, { whole: true });
  const crit = formatBalanceAmount(criticalThreshold(input.threshold), input.unit, { whole: true });
  const total = input.total != null ? formatBalanceAmount(input.total, input.unit, { whole: true }) : null;
  const days = input.daysLeft != null ? `، ويكفي نحو ${arabicDays(input.daysLeft)}` : "";
  const critical = input.level === "critical";

  if (input.kind === "estimated") {
    const approx = `نحو ${input.unit === "characters" ? amtWhole : formatBalanceAmount(Math.round(input.amount), input.unit, { whole: true })}`;
    return {
      title: critical ? `رصيد ${input.label} شبه نافد` : `رصيد ${input.label} التقديري تحت الحد`,
      body: `${approx}${total ? ` من شحنة ${total}` : ""} (${critical ? `الحرج تحت ${crit}` : `حدّك ${low}`}). اضغط لتحديث الرصيد بعد الشحن.`,
    };
  }
  if (input.kind === "budget") {
    return {
      title: critical ? `ميزانية ${input.label} شبه نافدة` : `ميزانية ${input.label} تقترب من النفاد`,
      body: `بقي ${amt}${total ? ` من ميزانية ${total} لهذا الشهر` : ""} (${critical ? `الحرج تحت ${crit}` : `حدّك ${low}`}).`,
    };
  }
  if (input.unit === "characters") {
    const reset = input.resetsAt ? ` · يتجدد ${riyadhShortDate(input.resetsAt)}` : "";
    return {
      title: critical ? `أحرف ${input.label} شبه نافدة` : `أحرف ${input.label} تحت الحد`,
      body: `بقي ${amtWhole}${total ? ` من ${formatCompact(input.total!)}` : ""} (حدّك ${formatCompact(input.threshold)})${days}${reset}.`,
    };
  }
  return critical
    ? {
        title: `رصيد ${input.label} شبه نافد`,
        body: `بقي ${amt} فقط (رصيد فعلي)${days}. اشحن من لوحة ${input.label} لتجنّب توقّف المهام.`,
      }
    : {
        title: `رصيد ${input.label} تحت الحد`,
        body: `بقي ${amt} (رصيد فعلي، حدّك ${low})${days}.`,
      };
}
