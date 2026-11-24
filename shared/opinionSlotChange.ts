/**
 * فرصة تغيير الموعد الأسبوعي لكاتب الرأي — منطق خالص يستعمله الخادم والويب.
 * تفتح إدارة التحرير «فرصة» (جولة)، فيرى كل كاتب له موعد أسبوعي بطاقةً بها،
 * يقرأ الإيضاحات ويوافق عليها، ثم يختار يومًا ووقتًا جديدين مرة واحدة في الجولة.
 * التغيير نهائي، واليوم الممتلئ (حد المقالات اليومي) لا يُقبل.
 */
import { OPINION_WRITERS_PER_DAY_CAP } from "./opinionWriterConstants";

export const SLOT_CHANGE_TERMS: readonly string[] = [
  "يمكنك تغيير يوم نشرك الأسبوعي ووقته مرة واحدة فقط، ولا تتكرر الفرصة حتى تعلن إدارة التحرير فرصة جديدة.",
  "التغيير نهائي ولا يمكن التراجع عنه بعد الاعتماد.",
  "يحق لإدارة التحرير تعديل موعدك إذا تكدست المقالات في يوم واحد.",
  `لا يتجاوز النشر ${OPINION_WRITERS_PER_DAY_CAP} مقالة في اليوم، فالأيام المكتملة لا يمكن اختيارها.`,
  "مقالك المجدول حاليًا يبقى في موعده، والموعد الجديد يبدأ من مقالك التالي.",
];

/** أوقات النشر المسموحة: كل نصف ساعة من 05:00 حتى 23:30 بتوقيت الرياض. */
export const SLOT_CHANGE_TIMES: readonly string[] = (() => {
  const out: string[] = [];
  for (let h = 5; h <= 23; h++) {
    for (const m of [0, 30]) out.push(`${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`);
  }
  return out;
})();

export const SLOT_CHANGE_DURATION_DAYS = [3, 7, 14] as const;

export type SlotChangeRoundLike = {
  closesAt: Date | string | null;
  closedAt: Date | string | null;
};

/** هل الجولة مفتوحة الآن؟ (لم تُغلق يدويًا، ولم تنته مدتها) */
export function isRoundOpen(round: SlotChangeRoundLike | null | undefined, nowMs: number): boolean {
  if (!round || round.closedAt) return false;
  if (round.closesAt == null) return true;
  return new Date(round.closesAt).getTime() > nowMs;
}

/**
 * خطأ اختيار الكاتب بالعربية، أو null إن كان صالحًا.
 * dayLoads: عدد الكتّاب النشطين في كل يوم (0=الأحد) بما فيهم الكاتب نفسه في يومه الحالي.
 */
export function slotChangeTargetError(input: {
  fromWeekday: number;
  fromTime: string;
  toWeekday: number;
  toTime: string;
  dayLoads: readonly number[];
  cap?: number;
}): string | null {
  const cap = input.cap ?? OPINION_WRITERS_PER_DAY_CAP;
  if (!Number.isInteger(input.toWeekday) || input.toWeekday < 0 || input.toWeekday > 6) return "اختر يومًا";
  if (!SLOT_CHANGE_TIMES.includes(input.toTime)) return "اختر وقتًا من القائمة";
  if (input.toWeekday === input.fromWeekday && input.toTime === input.fromTime) {
    return "هذا موعدك الحالي، اختر موعدًا مختلفًا";
  }
  // الكاتب نفسه محسوب في يومه الحالي، فتغيير الوقت داخل اليوم نفسه لا يزيد الحمل
  if (input.toWeekday !== input.fromWeekday && (input.dayLoads[input.toWeekday] ?? 0) >= cap) {
    return `يوم ${WEEKDAY_NAMES_AR[input.toWeekday]} مكتمل (${cap} مقالة)، اختر يومًا آخر`;
  }
  return null;
}

export const WEEKDAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

/** «06:30» → «6:30 ص» بأرقام لاتينية */
export function formatSlotTimeAr(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const suffix = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}
