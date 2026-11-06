/**
 * تقسيم جدول بطولة إلى مباشر/اليوم/قادمة/نتائج/مؤجلة — منطق نقي بلا قاعدة بيانات.
 *
 * المؤجلة (PST) والملغاة والموقوفة لا موعد لعب فعليًا لها: المزوّد يبقي تاريخها
 * القديم، فكانت تظهر في «اليوم» و«القادمة» بساعة انطلاق كأنها ستُلعب (جولة 13
 * من دوري روشن أُجّلت 2026-11-03 وبقيت تظهر يوم 6 نوفمبر). تُفصل في حزمة
 * `postponed` مستقلة: النسخ المثبّتة من التطبيقات تتجاهل الحقل الجديد فتتوقف عن
 * عرضها كمواعيد، والعملاء الجدد يعرضونها بوسم «مؤجلة».
 */

export interface BucketableFixture {
  timestamp: number;
  status: { code: string; live: boolean; finished: boolean };
}

/**
 * حالات بلا موعد لعب فعلي: مؤجلة/ملغاة/مُلغاة بعد البدء. لا تُدرج TBD (مباراة
 * قائمة بلا ساعة محدّدة) ولا SUSP/INT (توقّف أثناء اللعب) — تلك مباريات حقيقية.
 */
const NO_PLAY_DATE_STATUS = new Set(["PST", "CANC", "ABD"]);

export function isPostponedFixture(f: BucketableFixture): boolean {
  if (f.status.live || f.status.finished) return false;
  return NO_PLAY_DATE_STATUS.has(String(f.status.code || "").toUpperCase());
}

/** مباشر → قادمة → منتهية (يمنع ظهور «انتهت» فوق «مباشر» داخل نفس القائمة). */
export function compareByMatchPhase(a: BucketableFixture, b: BucketableFixture): number {
  const rank = (f: BucketableFixture) => (f.status.live ? 0 : f.status.finished ? 2 : 1);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 2) return b.timestamp - a.timestamp;
  return a.timestamp - b.timestamp;
}

const RIYADH_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** مفتاح يوم بتوقيت الرياض (YYYY-MM-DD). */
export function riyadhDayKey(ts: number): string {
  return RIYADH_DAY_FMT.format(new Date(ts * 1000));
}

// 54 ≈ 6 جولات × 9 مباريات (روشن) — السقف السابق 20 كان يقطع منتصف الجولة
// الثالثة. الجدول الكامل يبقى عبر /rounds + /round لا عبر هذه المعاينة.
const PREVIEW_CAP = 54;

export function bucketFixtures<T extends BucketableFixture>(fixtures: T[], nowSec = Math.floor(Date.now() / 1000)) {
  const todayKey = riyadhDayKey(nowSec);
  const playable = fixtures.filter((f) => !isPostponedFixture(f));

  const live = playable.filter((f) => f.status.live).sort(compareByMatchPhase);
  // «اليوم» = كل مباريات يوم الرياض بما فيها الجارية (فلتر اليوم ليس «غير المباشر»).
  const today = playable.filter((f) => riyadhDayKey(f.timestamp) === todayKey).sort(compareByMatchPhase);
  const upcoming = playable
    .filter((f) => !f.status.live && !f.status.finished && riyadhDayKey(f.timestamp) !== todayKey)
    .sort(compareByMatchPhase)
    .slice(0, PREVIEW_CAP);
  const results = playable
    .filter((f) => f.status.finished && riyadhDayKey(f.timestamp) !== todayKey)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, PREVIEW_CAP);
  const postponed = fixtures
    .filter(isPostponedFixture)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, PREVIEW_CAP);

  return { live, today, upcoming, results, postponed };
}
