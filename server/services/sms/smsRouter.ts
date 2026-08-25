/**
 * موجّه الرسائل النصية: الأساس Bevatel (باسم المرسل SABQ) وTwilio تراجعًا.
 *
 *   SMS_PRIMARY_PROVIDER = bevatel | twilio   (افتراضيًا bevatel إن كان مهيّأ)
 *   SMS_BEVATEL_COUNTRY_CODES = 966          (الدول التي يخدمها Bevatel؛ غيرها → Twilio مباشرة)
 *
 * القاعدة: جرّب الأساس، وعند الفشل جرّب الآخر. إن لم يكن أي موصل مهيّأً
 * نعيد configured=false ليقرر المستدعي مسارًا قديمًا (Twilio Verify).
 */
import { bevatelProvider } from "./bevatelProvider";
import { twilioProvider } from "./twilioProvider";
import type { SmsProvider, SmsProviderName, SmsSendResult } from "./types";

export interface SmsRouterDeps {
  providers?: SmsProvider[];
  env?: NodeJS.ProcessEnv;
}

export interface RoutedSmsResult extends SmsSendResult {
  /** false = لا موصل مهيّأ إطلاقًا (لم تُحاول أي عملية إرسال). */
  configured: boolean;
  attempts: Array<{ provider: SmsProviderName; ok: boolean; error?: string }>;
}

function bevatelCountryCodes(env: NodeJS.ProcessEnv): string[] {
  return (env.SMS_BEVATEL_COUNTRY_CODES || "966")
    .split(",")
    .map((s) => s.trim().replace(/^\+/, ""))
    .filter(Boolean);
}

/** ترتيب المحاولة لرقم معيّن. */
export function orderProviders(to: string, deps: SmsRouterDeps = {}): SmsProvider[] {
  const env = deps.env ?? process.env;
  const all = deps.providers ?? [bevatelProvider, twilioProvider];
  const configured = all.filter((p) => p.isConfigured());
  if (configured.length === 0) return [];

  const digits = to.replace(/^\+/, "");
  const bevatelServes = bevatelCountryCodes(env).some((cc) => digits.startsWith(cc));

  const primaryName: SmsProviderName =
    env.SMS_PRIMARY_PROVIDER === "twilio" ? "twilio" : "bevatel";

  const sorted = [...configured].sort((a, b) => {
    const rank = (p: SmsProvider) => {
      // Bevatel لا يخدم هذه الدولة → آخر الترتيب مهما كان الأساس.
      if (p.name === "bevatel" && !bevatelServes) return 2;
      return p.name === primaryName ? 0 : 1;
    };
    return rank(a) - rank(b);
  });
  return sorted;
}

export async function sendSms(to: string, body: string, deps: SmsRouterDeps = {}): Promise<RoutedSmsResult> {
  const chain = orderProviders(to, deps);
  const attempts: RoutedSmsResult["attempts"] = [];
  if (chain.length === 0) {
    return { ok: false, configured: false, provider: "bevatel", attempts, error: "no SMS provider configured" };
  }
  for (const provider of chain) {
    const r = await provider.send(to, body);
    attempts.push({ provider: provider.name, ok: r.ok, error: r.error });
    if (r.ok) return { ...r, configured: true, attempts };
    console.warn(`[sms] ${provider.name} failed for ${maskPhone(to)}: ${r.error}`);
  }
  const last = attempts[attempts.length - 1];
  return { ok: false, configured: true, provider: last.provider, error: last.error, attempts };
}

export function isAnySmsProviderConfigured(): boolean {
  return [bevatelProvider, twilioProvider].some((p) => p.isConfigured());
}

export function maskPhone(phone: string): string {
  return phone.replace(/(\+?\d{3})\d+(\d{3})$/, "$1****$2");
}
