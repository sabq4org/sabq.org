import { PERMISSION_TRACKS, type PublishLevel } from "@shared/userAdmin";

const LEVEL_BARS: Record<PublishLevel, number> = {
  none: 0,
  writes_opinion: 1,
  submits: 2,
  reviews_opinion: 3,
  publishes: 4,
  all: 5,
};

export function levelBars(level: PublishLevel): number {
  return LEVEL_BARS[level] ?? 0;
}

export const STEP_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_TRACKS.flatMap((t) => t.steps.map((s) => [s.code, s.label] as const)),
);

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  pending: "بانتظار التفعيل",
  suspended: "معلّق",
  banned: "محظور",
  locked: "مقفل",
};

export type Tone = "ok" | "warn" | "bad" | "idle";

export function statusTone(status: string): Tone {
  if (status === "active") return "ok";
  if (status === "suspended" || status === "locked") return "warn";
  if (status === "banned") return "bad";
  return "idle";
}

const fmtDate = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { day: "numeric", month: "long" });
const fmtDateYear = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { day: "numeric", month: "long", year: "numeric" });
const fmtMonthYear = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { month: "long", year: "numeric" });

export function formatDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (withYear ? fmtDateYear : fmtDate).format(d);
}

export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fmtMonthYear.format(d);
}

const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "always" });

export function relativeTimeAr(iso: string | null | undefined): string {
  if (!iso) return "لم يدخل بعد";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "الآن";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(iso, true);
}

/** وسم الحالة مع تاريخ الانتهاء إن وُجد. */
export function statusText(status: string, suspendedUntil: string | null, bannedUntil: string | null): string {
  const base = ACCOUNT_STATUS_LABELS[status] ?? status;
  if (status === "suspended" && suspendedUntil) return `${base} حتى ${formatDate(suspendedUntil)}`;
  if (status === "banned" && bannedUntil) return `${base} حتى ${formatDate(bannedUntil)}`;
  return base;
}

export function initialOf(name: string | null | undefined): string {
  const t = (name || "").trim();
  return t ? Array.from(t)[0] : "؟";
}

export function pluralChanges(n: number): string {
  if (n === 1) return "تغيير واحد";
  if (n === 2) return "تغييران";
  if (n <= 10) return `${n} تغييرات`;
  return `${n} تغييرًا`;
}

export function errorMessage(e: unknown, fallback = "تعذّر إكمال الطلب"): string {
  if (e instanceof Error && e.message) {
    return e.message.replace(/^\d{3}:\s*/, "").replace(/^\{.*"message":"([^"]+)".*\}$/, "$1") || fallback;
  }
  return fallback;
}

/** الخادم يعيد code=STALE_VERSION لكن apiRequest يمرّر الرسالة فقط؛ نطابق نصها. */
export function isStaleVersionError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("عدّل شخص آخر");
}

export const PHONE_RE = /^(05\d{8}|\+9665\d{8})$/;
