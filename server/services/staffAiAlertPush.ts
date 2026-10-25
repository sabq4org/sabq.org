// إشعارات «صحة الذكاء الاصطناعي» لمشرفي تطبيق الديسك (حزمة com.sabq.desk فقط).
//
//  - تغيّر حالة نموذج (down / degraded / quota_exceeded / تعافٍ): يُستدعى من
//    aiCriticalAlerts بجوار واتساب، بنفس التهدئة (15 دقيقة لكل مزود:نموذج:حالة).
//  - استنفاد سلسلة البدائل (chain_exhausted): يُوصل بـ setIncidentHandler في
//    بوابة الذكاء، مع تهدئة إضافية ≥10 دقائق لكل featureKey، ويُسجَّل في
//    مخزن دائري بالذاكرة تقرؤه /api/v1/staff/alerts.
//  - حدود الميزانية (80% / 100%): تُقيَّم في وظيفة aiProviderHealthCheck،
//    وتُرسل مرة واحدة لكل ميزانية/شهر/حد بعلامة في system_settings.
//
// كل الدوال هنا لا ترمي — الفشل يُسجَّل فقط ولا يمس مسار الذكاء الاصطناعي.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { aiBudgets, systemSettings } from "@shared/schema";
import type { BreakerStatus, BreakerStatusChange } from "../ai/gateway/circuitBreaker";
import type { AIIncident } from "../ai/gateway/notifier";
import { STAFF_APP_SETTINGS_CATEGORY } from "./staffAlertPrefsService";
import { formatRiyadhTime, sendStaffAdminPush } from "./staffAppPushService";

const LOG_PREFIX = "[StaffAiAlerts]";
const SYSTEM_DEEPLINK = "sabqdesk://system";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  gemini: "Google Gemini",
  "google-gemini": "Google Gemini",
  elevenlabs: "ElevenLabs",
  "google-tts": "Google TTS",
  humain: "HUMAIN",
};

export function aiProviderLabel(provider: string): string {
  return PROVIDER_LABEL[provider?.toLowerCase?.() ?? provider] || provider;
}

/** يزيل ما قد يشبه المفاتيح/التوكنات ويختصر الرسالة إلى ≤ max حرفاً. */
export function shortenAiError(message: string | null | undefined, max = 140): string | null {
  if (!message) return null;
  const cleaned = message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|pk|rk|xai|gsk)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/((?:api[_-]?key|key|token|secret|access_token|authorization)\s*[=:]\s*)["']?[^\s&"',]+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
}

// ── 1) تغيّر حالة النموذج ───────────────────────────────────────────

const STATUS_COOLDOWN_MS =
  (Number(process.env.AI_CRITICAL_ALERT_COOLDOWN_MINUTES) || 15) * 60 * 1000;
const lastStatusPushAt = new Map<string, number>();

function statusTitle(change: BreakerStatusChange): string | null {
  switch (change.newStatus) {
    case "down":
      return "توقّف نموذج ذكاء اصطناعي";
    case "quota_exceeded":
      return "نفاد رصيد مزوّد الذكاء الاصطناعي";
    case "degraded":
      return "تدهور أداء نموذج ذكاء اصطناعي";
    case "healthy":
      return change.prevStatus && change.prevStatus !== "healthy" ? "تعافى نموذج الذكاء الاصطناعي" : null;
    default:
      return null;
  }
}

function statusArabic(status: BreakerStatus): string {
  switch (status) {
    case "healthy":
      return "يعمل";
    case "degraded":
      return "متدهور";
    case "quota_exceeded":
      return "نفد الرصيد";
    case "down":
      return "متوقف";
    default:
      return status;
  }
}

export async function notifyStaffOfAiStatusChange(
  change: BreakerStatusChange,
  now: () => number = Date.now,
): Promise<boolean> {
  try {
    const title = statusTitle(change);
    if (!title) return false;
    const key = `${change.provider}:${change.modelId}:${change.newStatus}`;
    const last = lastStatusPushAt.get(key) ?? 0;
    if (now() - last < STATUS_COOLDOWN_MS) return false;
    lastStatusPushAt.set(key, now());

    const detail = change.newStatus === "healthy" ? null : shortenAiError(change.lastErrorCode || change.lastError, 80);
    const body = [
      `${aiProviderLabel(change.provider)} · ${change.modelId}`,
      `${statusArabic(change.prevStatus)} ← ${statusArabic(change.newStatus)}`,
      detail,
      formatRiyadhTime(new Date(now())),
    ]
      .filter(Boolean)
      .join(" — ");

    await sendStaffAdminPush("aiAlerts", {
      title,
      body,
      type: "ai_status",
      deeplink: SYSTEM_DEEPLINK,
      collapseId: `desk-ai-${change.provider}-${change.modelId}`.slice(0, 64),
      interruptionLevel: change.newStatus === "healthy" ? "active" : "time-sensitive",
    });
    return true;
  } catch (err) {
    console.warn(`${LOG_PREFIX} status push failed:`, (err as Error).message);
    return false;
  }
}

// ── 2) chain_exhausted: مخزن دائري + تهدئة لكل ميزة ────────────────────

export interface RecordedAiIncident {
  featureKey: string;
  provider: string;
  modelId: string;
  errorCode: string | null;
  message: string | null;
  occurredAt: string;
}

const RING_CAPACITY = 50;
const RING_WINDOW_MS = 24 * 60 * 60 * 1000;
const ring: RecordedAiIncident[] = [];

export const CHAIN_EXHAUSTED_DEBOUNCE_MS = 10 * 60 * 1000;
const lastChainPushAt = new Map<string, number>();

export function recordChainExhaustedIncident(incident: AIIncident, at: Date = new Date()): void {
  ring.push({
    featureKey: incident.featureKey,
    provider: incident.provider,
    modelId: incident.modelId,
    errorCode: incident.errorCode ?? null,
    message: shortenAiError(incident.message),
    occurredAt: at.toISOString(),
  });
  if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
}

/** حوادث chain_exhausted آخر 24 ساعة (هذه النسخة من الخادم فقط)، الأحدث أولاً. */
export function listRecentChainExhaustedIncidents(now: Date = new Date()): RecordedAiIncident[] {
  const since = now.getTime() - RING_WINDOW_MS;
  return ring.filter((r) => Date.parse(r.occurredAt) >= since).reverse();
}

/** للاختبارات فقط. */
export function __resetStaffAiAlertStateForTests(): void {
  ring.length = 0;
  lastChainPushAt.clear();
  lastStatusPushAt.clear();
}

/** يُرجع true إن كان يجب الإرسال الآن (ويحجز النافذة). */
export function shouldPushChainExhausted(featureKey: string, nowMs: number): boolean {
  const last = lastChainPushAt.get(featureKey);
  if (last !== undefined && nowMs - last < CHAIN_EXHAUSTED_DEBOUNCE_MS) return false;
  lastChainPushAt.set(featureKey, nowMs);
  return true;
}

/** معالج حوادث البوابة: chain_exhausted فقط. */
export async function handleAiGatewayIncident(
  incident: AIIncident,
  now: () => number = Date.now,
): Promise<boolean> {
  try {
    if (incident.kind !== "chain_exhausted") return false;
    const at = new Date(now());
    recordChainExhaustedIncident(incident, at);
    if (!shouldPushChainExhausted(incident.featureKey, at.getTime())) return false;

    const detail = shortenAiError(incident.errorCode || incident.message, 80);
    await sendStaffAdminPush("aiAlerts", {
      title: "تعذّر تنفيذ مهمة ذكاء اصطناعي",
      body: [`فشلت كل النماذج البديلة لميزة ${incident.featureKey}`, detail, formatRiyadhTime(at)]
        .filter(Boolean)
        .join(" — "),
      type: "ai_status",
      deeplink: SYSTEM_DEEPLINK,
      collapseId: `desk-ai-chain-${incident.featureKey}`.slice(0, 64),
      interruptionLevel: "time-sensitive",
    });
    return true;
  } catch (err) {
    console.warn(`${LOG_PREFIX} incident push failed:`, (err as Error).message);
    return false;
  }
}

// ── 3) حدود الميزانية ────────────────────────────────────────────────

export interface BudgetSpend {
  id: string;
  scope: string;
  scopeKey: string;
  monthlyLimitUsd: number;
  alertAt80: boolean;
  alertAt100: boolean;
  isEnabled: boolean;
  spentThisMonthUsd: number;
}

export function budgetPercent(spent: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return Math.round((spent / limit) * 100);
}

/** أعلى حد مستحق لهذه الميزانية حسب أعلامها، أو null. */
export function budgetThresholdReached(b: BudgetSpend): 80 | 100 | null {
  if (!b.isEnabled || !(b.monthlyLimitUsd > 0)) return null;
  const ratio = b.spentThisMonthUsd / b.monthlyLimitUsd;
  if (ratio >= 1 && b.alertAt100) return 100;
  if (ratio >= 0.8 && b.alertAt80) return 80;
  return null;
}

export function budgetLabel(b: { scope: string; scopeKey: string }): string {
  if (b.scope === "global") return "الإجمالي";
  if (b.scope === "provider") return aiProviderLabel(b.scopeKey);
  return b.scopeKey || b.scope;
}

/** الشهر بتوقيت UTC (نفس حساب listBudgets في aiHubService). */
export function budgetPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function budgetAlertMarkerKey(budgetId: string, period: string, level: 80 | 100): string {
  return `staff_app.ai_budget_alert:${budgetId}:${period}:${level}`;
}

/** يحجز العلامة ذرياً؛ true إن كانت هذه أول مرة (عبر كل النسخ). */
async function claimBudgetMarker(key: string, value: Record<string, unknown>): Promise<boolean> {
  const inserted = await db
    .insert(systemSettings)
    .values({ key, value, category: STAFF_APP_SETTINGS_CATEGORY, isPublic: false })
    .onConflictDoNothing({ target: systemSettings.key })
    .returning({ id: systemSettings.id });
  return inserted.length > 0;
}

/**
 * يقيّم ai_budgets ويرسل إشعاراً لكل حد يُتجاوز أول مرة في الشهر.
 * الجدول فارغ ⇒ استعلام واحد خفيف ولا شيء آخر.
 */
export async function evaluateAiBudgetAlerts(now: Date = new Date()): Promise<number> {
  const enabled = await db
    .select({ id: aiBudgets.id })
    .from(aiBudgets)
    .where(eq(aiBudgets.isEnabled, true))
    .limit(1);
  if (enabled.length === 0) return 0;

  const { listBudgets } = await import("./aiHubService");
  const budgets = (await listBudgets()) as BudgetSpend[];
  const period = budgetPeriodKey(now);
  let pushed = 0;

  for (const b of budgets) {
    const level = budgetThresholdReached(b);
    if (!level) continue;
    const percent = budgetPercent(b.spentThisMonthUsd, b.monthlyLimitUsd);
    const marker = { percent, spentUsd: b.spentThisMonthUsd, limitUsd: b.monthlyLimitUsd, at: now.toISOString() };
    const claimed = await claimBudgetMarker(budgetAlertMarkerKey(b.id, period, level), marker);
    // بلوغ 100% مباشرة يحجز علامة 80% أيضاً حتى لا يصل إشعار 80% متأخراً.
    if (level === 100 && b.alertAt80) {
      await claimBudgetMarker(budgetAlertMarkerKey(b.id, period, 80), marker);
    }
    if (!claimed) continue;

    const label = budgetLabel(b);
    await sendStaffAdminPush("aiAlerts", {
      title: level === 100 ? "تجاوز ميزانية الذكاء الاصطناعي" : "اقتراب من حد ميزانية الذكاء الاصطناعي",
      body: `${label}: ${percent}% — $${b.spentThisMonthUsd.toFixed(2)} من $${b.monthlyLimitUsd.toFixed(0)} — ${formatRiyadhTime(now)}`,
      type: "ai_status",
      deeplink: SYSTEM_DEEPLINK,
      collapseId: `desk-ai-budget-${b.id}`.slice(0, 64),
      interruptionLevel: level === 100 ? "time-sensitive" : "active",
    });
    pushed++;
  }
  return pushed;
}
