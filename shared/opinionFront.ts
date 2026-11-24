// صفحة الرأي للقارئ (/opinion): قواعد ظهور عادلة بين الكتّاب.
// منطق خالص بلا قاعدة بيانات، يستعمله الخادم (opinionFrontService) وتختبره الوحدات.

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** مفتاح يوم الرياض «YYYY-MM-DD» لتاريخ ما. */
export function riyadhDayKey(date: Date): string {
  return new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** أيام الأسبوع الحالي بتوقيت الرياض من السبت إلى الجمعة. */
export function riyadhWeekDays(now: Date): { key: string; isFuture: boolean; isToday: boolean }[] {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const weekday = shifted.getUTCDay(); // 0 الأحد … 6 السبت
  const sinceSaturday = (weekday + 1) % 7;
  const todayKey = shifted.toISOString().slice(0, 10);
  const startMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - sinceSaturday * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => {
    const key = new Date(startMs + i * DAY_MS).toISOString().slice(0, 10);
    return { key, isToday: key === todayKey, isFuture: key > todayKey };
  });
}

/**
 * ترتيب متناوب: إزاحة دائرية تتقدم خانة كل ساعة، فيأخذ كل مقال من مقالات اليوم
 * دوره في أعلى الصفحة بالتساوي. ثابت خلال الساعة نفسها (يصلح للتخزين المؤقت).
 */
export function rotateByHour<T>(items: readonly T[], now: Date): T[] {
  if (items.length < 2) return [...items];
  const shift = Math.floor(now.getTime() / HOUR_MS) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

export type HotCandidate = {
  id: string;
  authorId: string | null;
  views: number;
  publishedAt: Date;
};

export const HOT_MIN_AGE_HOURS = 3;
export const HOT_MAX_AGE_HOURS = 72;
/** أقل عمر يُقسَم عليه، حتى لا يتصدّر مقال عمره ساعة بمشاهدات قليلة. */
const HOT_AGE_FLOOR_HOURS = 6;

/** سرعة القراءة: المشاهدات لكل ساعة منذ النشر. */
export function readingVelocity(c: HotCandidate, now: Date): number {
  const ageHours = (now.getTime() - c.publishedAt.getTime()) / HOUR_MS;
  return (c.views || 0) / Math.max(ageHours, HOT_AGE_FLOOR_HOURS);
}

/**
 * «يقرؤونه الآن»: مقالات عمرها بين 3 و72 ساعة، مرتبة بسرعة القراءة لا بمجموعها،
 * ومقال واحد فقط لكل كاتب.
 */
export function pickHotArticles<T extends HotCandidate>(candidates: readonly T[], now: Date, limit = 4): T[] {
  const minMs = HOT_MIN_AGE_HOURS * HOUR_MS;
  const maxMs = HOT_MAX_AGE_HOURS * HOUR_MS;
  const pool = candidates
    .filter((c) => {
      const age = now.getTime() - c.publishedAt.getTime();
      return age >= minMs && age <= maxMs;
    })
    .map((c) => ({ c, v: readingVelocity(c, now) }))
    .sort((a, b) => b.v - a.v || b.c.publishedAt.getTime() - a.c.publishedAt.getTime());
  const seen = new Set<string>();
  const out: T[] = [];
  for (const { c } of pool) {
    const key = c.authorId || c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export type SpotlightCandidate = {
  authorId: string;
  /** مجموع مشاهدات الكاتب في آخر 30 يومًا (مقياس الظهور). */
  recentViews: number;
  /** آخر نشر للكاتب. */
  lastPublishedAt: Date;
};

/**
 * «تعرّف على كاتب»: يتبدّل يوميًا بين ثلث الكتّاب الأقل ظهورًا ممن نشروا في آخر 14 يومًا.
 * ثابت طوال يوم الرياض.
 */
export function pickSpotlight<T extends SpotlightCandidate>(candidates: readonly T[], now: Date): T | null {
  const since = now.getTime() - 14 * DAY_MS;
  const active = candidates
    .filter((c) => c.lastPublishedAt.getTime() >= since)
    .sort((a, b) => a.recentViews - b.recentViews || a.authorId.localeCompare(b.authorId));
  if (active.length === 0) return null;
  const pool = active.slice(0, Math.max(1, Math.ceil(active.length / 3)));
  const dayNumber = Math.floor((now.getTime() + RIYADH_OFFSET_MS) / DAY_MS);
  return pool[dayNumber % pool.length];
}

/** إزالة اللقب من بداية الاسم للفرز الأبجدي («د.» و«أ.د.» و«م.»). */
export function nameSortKey(name: string): string {
  return name.replace(/^\s*(?:أ\.\s*د\.|د\.|أ\.|م\.)\s*/u, "").trim();
}

/** ترتيب أبجدي عربي لا يتأثر بالألقاب ولا بالمشاهدات. */
export function sortRosterByName<T extends { name: string }>(writers: readonly T[]): T[] {
  return [...writers].sort((a, b) => nameSortKey(a.name).localeCompare(nameSortKey(b.name), "ar"));
}
