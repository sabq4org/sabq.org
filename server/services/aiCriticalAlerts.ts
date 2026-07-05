/**
 * AI Critical Alerts — WhatsApp
 * -----------------------------
 * Sends critical operational alerts about the AI Hub (منظومة الذكاء الاصطناعي)
 * to the Editor-in-Chief's WhatsApp number(s) registered under
 * "تنبيهات رئيس التحرير" (system_settings key = "editor_alerts").
 *
 * Triggered by AI-gateway circuit-breaker status transitions:
 *   → degraded        : تدهور أداء نموذج
 *   → quota_exceeded  : نفاد رصيد المزوّد
 *   → down            : توقّف/فشل نموذج
 *   → healthy (تعافٍ) : عودة النموذج للعمل (إشعار مطمئِن)
 *
 * The gateway wires `handleAiProviderStatusChange` into the circuit breaker at
 * boot (see server/ai/gateway/index.ts). This module never throws into the
 * breaker path — everything is fire-and-forget and defensively guarded.
 */
import type { BreakerStatusChange, BreakerStatus } from "../ai/gateway/circuitBreaker";
import { getEditorAlertSettingsPublic } from "./editorAlerts";
import { sendWhatsAppMessage } from "./whatsapp";

// --- Throttle: one alert per (provider:model:newStatus) per cooldown window ---
const COOLDOWN_MS =
  (Number(process.env.AI_CRITICAL_ALERT_COOLDOWN_MINUTES) || 15) * 60 * 1000;
const lastAlertedAt = new Map<string, number>();

function throttleKey(change: BreakerStatusChange): string {
  return `${change.provider}:${change.modelId}:${change.newStatus}`;
}

// --- Presentation helpers ---
const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  gemini: "Google Gemini",
  "google-gemini": "Google Gemini",
  elevenlabs: "ElevenLabs",
  "google-tts": "Google TTS",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider?.toLowerCase?.() ?? provider] || provider;
}

interface AlertMeta {
  emoji: string;
  title: string;
  /** Whether this transition is worth notifying about at all. */
  critical: boolean;
}

function describe(change: BreakerStatusChange): AlertMeta | null {
  switch (change.newStatus) {
    case "quota_exceeded":
      return { emoji: "🔴", title: "نفاد رصيد المزوّد", critical: true };
    case "down":
      return { emoji: "🔴", title: "توقّف النموذج (فشل)", critical: true };
    case "degraded":
      return { emoji: "🟠", title: "تدهور أداء النموذج", critical: true };
    case "healthy":
      // Only meaningful as a "recovered" notice when coming back from a bad state.
      if (change.prevStatus && change.prevStatus !== "healthy") {
        return { emoji: "🟢", title: "تعافى النموذج وعاد للعمل", critical: false };
      }
      return null;
    default:
      return null;
  }
}

function statusArabic(status: BreakerStatus): string {
  switch (status) {
    case "healthy":
      return "صحي";
    case "degraded":
      return "متدهور";
    case "quota_exceeded":
      return "نفد الرصيد";
    case "down":
      return "معطّل";
    default:
      return status;
  }
}

function formatArabicDateTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
      numberingSystem: "latn",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function dashboardUrl(): string {
  const base =
    process.env.FRONTEND_URL ||
    process.env.REPLIT_DOMAINS?.split(",")[0] ||
    "https://sabq.org";
  return `${base.replace(/\/$/, "")}/dashboard/ai-hub`;
}

function buildMessage(change: BreakerStatusChange, meta: AlertMeta): string {
  const lines: string[] = [];
  lines.push(`${meta.emoji} تنبيه حرج — منظومة الذكاء الاصطناعي`);
  lines.push("");
  lines.push(`⚠️ ${meta.title}`);
  lines.push(`المزوّد: ${providerLabel(change.provider)}`);
  lines.push(`النموذج: ${change.modelId}`);
  if (change.prevStatus && change.prevStatus !== change.newStatus) {
    lines.push(
      `الحالة: ${statusArabic(change.prevStatus)} ← ${statusArabic(change.newStatus)}`,
    );
  }
  if (change.lastErrorCode) {
    lines.push(`الرمز: ${change.lastErrorCode}`);
  }
  if (change.lastError) {
    const detail = change.lastError.replace(/\s+/g, " ").trim().slice(0, 180);
    if (detail) lines.push(`التفاصيل: ${detail}`);
  }
  lines.push("");
  lines.push(`🕒 ${formatArabicDateTime(new Date())}`);
  lines.push(`🔗 لوحة المراقبة: ${dashboardUrl()}`);
  return lines.join("\n");
}

export interface SendAiCriticalAlertResult {
  sent: number;
  attempted: number;
  skipped: string | null;
}

/**
 * Evaluate a status transition and, if it's alert-worthy, message the
 * editor-in-chief's WhatsApp number(s). Safe to call for any transition —
 * non-alertable ones return `{ skipped }` without sending.
 */
export async function sendAiCriticalAlert(
  change: BreakerStatusChange,
  opts: { bypassThrottle?: boolean } = {},
): Promise<SendAiCriticalAlertResult> {
  const empty = (skipped: string): SendAiCriticalAlertResult => ({
    sent: 0,
    attempted: 0,
    skipped,
  });

  const meta = describe(change);
  if (!meta) return empty("not-alertable");

  let settings;
  try {
    settings = await getEditorAlertSettingsPublic();
  } catch (err) {
    console.warn(
      "[AI Alerts] could not load editor-alert settings:",
      (err as Error).message,
    );
    return empty("settings-error");
  }

  if (!opts.bypassThrottle) {
    if (settings.aiCriticalAlertsEnabled === false) return empty("ai-alerts-disabled");
    if (settings.whatsappEnabled === false) return empty("whatsapp-disabled");
  }

  const numbers =
    settings.whatsappNumbers && settings.whatsappNumbers.length > 0
      ? settings.whatsappNumbers
      : settings.whatsappNumber
        ? [settings.whatsappNumber]
        : [];
  if (numbers.length === 0) return empty("no-recipients");

  // Throttle after we know we would actually send, so a suppressed transition
  // doesn't burn the cooldown slot when there was no recipient anyway.
  if (!opts.bypassThrottle) {
    const key = throttleKey(change);
    const last = lastAlertedAt.get(key) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return empty("throttled");
    lastAlertedAt.set(key, Date.now());
  }

  const body = buildMessage(change, meta);
  let sent = 0;
  for (const to of numbers) {
    try {
      const ok = await sendWhatsAppMessage({ to, body });
      if (ok) sent++;
    } catch (err) {
      console.warn(
        `[AI Alerts] WhatsApp send failed for ${String(to).slice(0, 8)}…:`,
        (err as Error).message,
      );
    }
  }

  console.log(
    `[AI Alerts] ${meta.title} — ${change.provider}/${change.modelId}: sent ${sent}/${numbers.length}`,
  );
  return { sent, attempted: numbers.length, skipped: null };
}

/**
 * Fire-and-forget entry point wired into the circuit breaker. Never blocks the
 * breaker path and never lets an alerting failure surface as an AI-call error.
 */
export function handleAiProviderStatusChange(change: BreakerStatusChange): void {
  void sendAiCriticalAlert(change).catch((err) => {
    console.warn("[AI Alerts] handler failed:", (err as Error).message);
  });
}
