/**
 * رموز التحقق (OTP) المولَّدة داخل سبق — مستقلة عن المزوّد.
 *
 * الرمز 6 أرقام، يُخزّن مهشّرًا (sha256 + secret + salt عشوائي) في Redis
 * (fallback ذاكرة محليًا) بمفتاح otp:{purpose}:{phone}:
 *   • صلاحية 5 دقائق، 5 محاولات تحقق ثم يُحذف.
 *   • حد إرسال: 3 رسائل لكل رقم/غرض خلال 15 دقيقة، وفاصل 60 ثانية بين رسالتين.
 *   • النص يحمل سطر `@sabq.org #123456` في آخره ليعمل التعبئة التلقائية
 *     في iOS/Android دون قوالب لدى المزوّد.
 *
 * الإرسال عبر server/services/sms/smsRouter.ts (Bevatel أساسًا، Twilio تراجعًا).
 * إن لم يكن أي موصل مهيّأً نعيد configured=false ليتراجع المستدعي لمسار Twilio Verify القديم.
 */
import crypto from "crypto";
import { getRedisSessionAdapter } from "../redis";
import { maskPhone, sendSms, type RoutedSmsResult } from "./sms/smsRouter";

export type OtpPurpose = "login" | "2fa" | "phone_verify";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_SEND_WINDOW_SECONDS = 15 * 60;
export const OTP_SEND_MAX_PER_WINDOW = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

interface OtpRecord {
  hash: string;
  salt: string;
  attempts: number;
  expiresAt: number; // epoch ms
}
interface SendLog {
  count: number;
  lastSentAt: number;
  windowExpiresAt: number;
}

const memory = new Map<string, { value: string; expiresAt: number }>();
function sweep() {
  const now = Date.now();
  for (const [k, e] of memory) if (e.expiresAt <= now) memory.delete(k);
}

async function kvGet(key: string): Promise<string | null> {
  const redis = getRedisSessionAdapter();
  if (redis) return redis.get(key);
  sweep();
  const e = memory.get(key);
  return e && e.expiresAt > Date.now() ? e.value : null;
}
async function kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisSessionAdapter();
  if (redis) {
    await redis.set(key, value, { expiration: { type: "EX", value: ttlSeconds } });
    return;
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
async function kvDel(key: string): Promise<void> {
  const redis = getRedisSessionAdapter();
  if (redis) {
    await redis.del(key);
    return;
  }
  memory.delete(key);
}

const codeKey = (purpose: OtpPurpose, phone: string) => `otp:${purpose}:${phone}`;
const sendKey = (purpose: OtpPurpose, phone: string) => `otpsend:${purpose}:${phone}`;

function secret(): string {
  return process.env.OTP_HASH_SECRET || process.env.SESSION_SECRET || "sabq-otp";
}
function hashCode(code: string, salt: string): string {
  return crypto.createHash("sha256").update(`${secret()}:${salt}:${code}`).digest("hex");
}
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function buildOtpMessage(code: string, purpose: OtpPurpose): string {
  const lead =
    purpose === "2fa"
      ? "رمز التحقق بخطوتين لحسابك في سبق"
      : "رمز التحقق من سبق";
  return `${lead}: ${code}\nصالح لمدة 5 دقائق، ولا تشاركه مع أحد.\n\n@sabq.org #${code}`;
}

export interface SendOtpResult {
  success: boolean;
  /** false = لا موصل SMS مهيّأ (لم نُرسل شيئًا). */
  configured: boolean;
  message: string;
  provider?: RoutedSmsResult["provider"];
  retryAfterSeconds?: number;
}

/** يولّد رمزًا ويخزّنه ويرسله. لا يرمي. */
export async function sendOtp(phoneE164: string, purpose: OtpPurpose): Promise<SendOtpResult> {
  const now = Date.now();
  const logRaw = await kvGet(sendKey(purpose, phoneE164));
  let log: SendLog = logRaw ? JSON.parse(logRaw) : { count: 0, lastSentAt: 0, windowExpiresAt: now + OTP_SEND_WINDOW_SECONDS * 1000 };
  if (log.windowExpiresAt <= now) log = { count: 0, lastSentAt: 0, windowExpiresAt: now + OTP_SEND_WINDOW_SECONDS * 1000 };

  const sinceLast = (now - log.lastSentAt) / 1000;
  if (log.lastSentAt && sinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast);
    return { success: false, configured: true, message: `أُرسل رمز قبل قليل. حاول بعد ${wait} ثانية.`, retryAfterSeconds: wait };
  }
  if (log.count >= OTP_SEND_MAX_PER_WINDOW) {
    const wait = Math.ceil((log.windowExpiresAt - now) / 1000);
    return { success: false, configured: true, message: "تجاوزت الحد المسموح لإرسال الرموز. حاول لاحقًا.", retryAfterSeconds: wait };
  }

  const code = generateOtpCode();
  const salt = crypto.randomBytes(8).toString("hex");
  const record: OtpRecord = { hash: hashCode(code, salt), salt, attempts: 0, expiresAt: now + OTP_TTL_SECONDS * 1000 };

  const sent = await sendSms(phoneE164, buildOtpMessage(code, purpose));
  if (!sent.configured) {
    return { success: false, configured: false, message: "خدمة الرسائل غير مهيّأة" };
  }
  if (!sent.ok) {
    console.error(`[otp] send failed ${purpose} ${maskPhone(phoneE164)}:`, sent.attempts);
    return { success: false, configured: true, message: "تعذّر إرسال رمز التحقق. حاول مرة أخرى بعد قليل." };
  }

  // نخزّن الرمز بعد نجاح الإرسال فقط (رمز لم يصل لا يستهلك محاولات ولا يبطل السابق).
  await kvSet(codeKey(purpose, phoneE164), JSON.stringify(record), OTP_TTL_SECONDS);
  const ttlLeft = Math.max(60, Math.ceil((log.windowExpiresAt - now) / 1000));
  await kvSet(sendKey(purpose, phoneE164), JSON.stringify({ ...log, count: log.count + 1, lastSentAt: now }), ttlLeft);

  console.log(`[otp] sent ${purpose} via ${sent.provider} to ${maskPhone(phoneE164)}`);
  return { success: true, configured: true, message: "تم إرسال رمز التحقق إلى رقم جوالك", provider: sent.provider };
}

export interface VerifyOtpResult {
  valid: boolean;
  /** لا رمز محفوظ لهذا الرقم/الغرض (منتهٍ أو لم يُرسل عبر هذا النظام). */
  notFound?: boolean;
  message: string;
}

/** يتحقق من الرمز؛ نجاحه يحذفه (استخدام واحد). */
export async function verifyOtp(phoneE164: string, code: string, purpose: OtpPurpose): Promise<VerifyOtpResult> {
  const clean = String(code ?? "").replace(/\D/g, "");
  const key = codeKey(purpose, phoneE164);
  const raw = await kvGet(key);
  if (!raw) return { valid: false, notFound: true, message: "الرمز غير صحيح أو منتهي الصلاحية" };

  const record: OtpRecord = JSON.parse(raw);
  if (record.expiresAt <= Date.now()) {
    await kvDel(key);
    return { valid: false, notFound: true, message: "انتهت صلاحية الرمز. اطلب رمزًا جديدًا." };
  }
  if (clean.length === 6 && safeEqual(hashCode(clean, record.salt), record.hash)) {
    await kvDel(key);
    return { valid: true, message: "تم التحقق بنجاح" };
  }
  record.attempts += 1;
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await kvDel(key);
    return { valid: false, message: "تجاوزت عدد المحاولات. اطلب رمزًا جديدًا." };
  }
  const ttlLeft = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  await kvSet(key, JSON.stringify(record), ttlLeft);
  return { valid: false, message: "الرمز غير صحيح" };
}

/** للاختبارات فقط. */
export function __resetOtpMemory() {
  memory.clear();
}
