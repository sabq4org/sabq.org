// وصف عمر رمز النشر لصف المرسل: نسبة الشريط ولونه والنص تحته. منطق خالص يُختبر وحده.

export const TOKEN_EXPIRY_WARNING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TokenAgeTone = "fresh" | "warning" | "expired" | "open";

export interface TokenAgeInfo {
  percent: number;
  tone: TokenAgeTone;
  text: string;
  /** الرمز السابق ما زال مقبولًا (مهلة التدوير قائمة). */
  graceActive: boolean;
}

interface TokenAgeSender {
  createdAt: string | Date;
  tokenCreatedAt?: string | Date | null;
  tokenExpiresAt?: string | Date | null;
  previousTokenValidUntil?: string | Date | null;
}

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const riyadhDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
const riyadhTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false });

/** التاريخ داخل عزل اتجاه (LRI…PDI) حتى لا يقلبه سياق العربية إلى يوم-شهر-سنة. */
export function formatTokenDate(date: Date, withTime = false): string {
  return `\u2066${riyadhDate.format(date)}${withTime ? ` ${riyadhTime.format(date)}` : ""}\u2069`;
}

function days(count: number): string {
  if (count <= 0) return "اليوم";
  if (count === 1) return "يوم واحد";
  if (count === 2) return "يومين";
  return count <= 10 ? `${count} أيام` : `${count} يومًا`;
}

export function describeTokenAge(sender: TokenAgeSender, now: Date = new Date()): TokenAgeInfo {
  const created = toDate(sender.tokenCreatedAt) ?? toDate(sender.createdAt) ?? now;
  const expires = toDate(sender.tokenExpiresAt);
  const graceUntil = toDate(sender.previousTokenValidUntil);
  const graceActive = !!graceUntil && graceUntil.getTime() > now.getTime();
  const ageDays = Math.max(0, Math.floor((now.getTime() - created.getTime()) / DAY_MS));
  const age = ageDays === 0 ? "صدر اليوم" : `عمره ${days(ageDays)}`;

  let percent = 100;
  let tone: TokenAgeTone = "open";
  let text = `بلا تاريخ انتهاء · ${age}`;

  if (expires) {
    const total = Math.max(DAY_MS, expires.getTime() - created.getTime());
    const remainingDays = Math.ceil((expires.getTime() - now.getTime()) / DAY_MS);
    percent = Math.min(100, Math.max(4, Math.round(((now.getTime() - created.getTime()) / total) * 100)));
    if (remainingDays <= 0) {
      percent = 100;
      tone = "expired";
      text = `انتهى في ${formatTokenDate(expires)} · لا يقبل النشر`;
    } else if (remainingDays <= TOKEN_EXPIRY_WARNING_DAYS) {
      tone = "warning";
      text = `ينتهي بعد ${days(remainingDays)} · ${formatTokenDate(expires)}`;
    } else {
      tone = "fresh";
      text = `${age} · ينتهي في ${formatTokenDate(expires)}`;
    }
  }

  if (graceActive && graceUntil && tone !== "expired") {
    text = `${ageDays === 0 ? "دُوّر اليوم" : `دُوّر قبل ${days(ageDays)}`} · الرمز القديم يعمل حتى ${formatTokenDate(graceUntil, true)}`;
  }

  return { percent, tone, text, graceActive };
}
