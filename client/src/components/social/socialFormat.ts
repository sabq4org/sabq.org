// تنسيقات النشر الاجتماعي الموحدة — ميلادي دائماً، أرقام لاتينية،
// بتوقيت الرياض. (ar-SA الافتراضي يعطي التقويم الهجري — لا نستخدمه هنا)
const AR_GREGORIAN_LATN = "ar-u-ca-gregory-nu-latn";
const RIYADH = "Asia/Riyadh";

const dateFmt = new Intl.DateTimeFormat(AR_GREGORIAN_LATN, {
  timeZone: RIYADH,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat(AR_GREGORIAN_LATN, {
  timeZone: RIYADH,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** «7 أغسطس 2026 · 10:08 ص» */
export function fmtSocialDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

/** وقت نسبي للمجدول: «بعد ساعتين» / «بعد 35 دقيقة» / «حان موعده» */
export function fmtRelativeToNow(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const diffMin = Math.round((d.getTime() - Date.now()) / 60_000);
  if (Number.isNaN(diffMin)) return "";
  if (diffMin <= 0) return "حان موعده";
  if (diffMin < 60) return `بعد ${diffMin} دقيقة`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return hours === 1 ? "بعد ساعة" : hours === 2 ? "بعد ساعتين" : `بعد ${hours} ساعات`;
  const days = Math.round(hours / 24);
  return days === 1 ? "غداً" : `بعد ${days} أيام`;
}
