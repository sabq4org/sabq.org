/**
 * مواعيد الجدولة في لوحة التحكم بتوقيت الرياض دائمًا، مثل تطبيقي iOS وأندرويد.
 *
 * قرار المالك (2026-11-23): الجدولة والورديات تبقى بتوقيت الرياض مع تنويه صريح،
 * لأن بعض الزملاء يعملون من مصر. بقية الأوقات (النشر، التعديل) تتبع جهاز المستخدم
 * عبر displayTimeZone().
 *
 * منتقي التاريخ يتعامل مع Date محلي؛ نمرر له «ساعة حائط» الرياض كأنها محلية،
 * ونحفظ الحقل نصًا «YYYY-MM-DDTHH:mm» بتوقيت الرياض، ثم نحوّله للحظة UTC عند الإرسال.
 * الرياض UTC+3 ثابتة بلا توقيت صيفي.
 */

import { displayTimeZone, RIYADH_TIME_ZONE } from "@/lib/displayTimeZone";

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export const RIYADH_NOTE = "بتوقيت الرياض";

/** لحظة → «YYYY-MM-DDTHH:mm» بساعة الرياض. */
export function toRiyadhWall(value: string | number | Date): string {
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + RIYADH_OFFSET_MS).toISOString().slice(0, 16);
}

/** «YYYY-MM-DDTHH:mm» بساعة الرياض → ISO UTC، أو null إن كان النص غير صالح. */
export function riyadhWallToIso(wall: string): string | null {
  if (!WALL_RE.test(wall)) return null;
  const ms = Date.parse(`${wall}:00+03:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ساعة حائط الرياض كـ Date محلي ليعرضه منتقي التاريخ كما هو. */
export function wallToPickerDate(wall: string): Date | null {
  const m = WALL_RE.exec(wall);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/** ما يختاره المنتقي (حقول محلية) → «YYYY-MM-DDTHH:mm» يُقرأ بساعة الرياض. */
export function pickerDateToWall(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** «الآن» بساعة الرياض للمنتقي (الحد الأدنى للجدولة). */
export function riyadhNowPickerDate(now = Date.now()): Date {
  return wallToPickerDate(toRiyadhWall(now)) ?? new Date(now);
}

/** وسم المسودات المحلية التي حُفظ موعدها بساعة الرياض. */
export const DRAFT_SCHEDULE_ZONE = RIYADH_TIME_ZONE;

/**
 * موعد مسودة محلية بساعة الرياض. المسودات الأقدم (بلا وسم scheduledAtZone) حفظت الموعد
 * بساعة الجهاز، فنقرؤه كوقت محلي ونحوّله؛ وإلا يُنشر قبل موعده بساعة عند زميل في القاهرة.
 */
export function draftScheduledAtToRiyadh(scheduledAt: unknown, zone: unknown): string {
  if (typeof scheduledAt !== "string" || !scheduledAt) return "";
  if (zone === DRAFT_SCHEDULE_ZONE || !WALL_RE.test(scheduledAt)) return scheduledAt;
  const local = new Date(scheduledAt); // بلا منطقة = وقت الجهاز
  return Number.isFinite(local.getTime()) ? toRiyadhWall(local) : scheduledAt;
}

/** هل يختلف جهاز المستخدم الآن عن الرياض؟ يُظهر التنويه في القوائم عندها فقط. */
export function deviceDiffersFromRiyadh(at = Date.now(), timeZone = displayTimeZone()): boolean {
  if (timeZone === RIYADH_TIME_ZONE) return false;
  try {
    const fmt = (tz: string) =>
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", day: "2-digit", hourCycle: "h23" }).format(new Date(at));
    return fmt(timeZone) !== fmt(RIYADH_TIME_ZONE);
  } catch {
    return false;
  }
}
