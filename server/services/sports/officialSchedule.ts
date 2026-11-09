/**
 * مواعيد رسمية تتقدّم على تواريخ المزوّد، وقاعدة إخفاء العدّاد البعيد.
 *
 * المزوّد (API-Football) قد يُبقي تواريخ موسم قديمة بعد قرار تأجيل رسمي؛ فيظهر
 * في شريط الرياضة عدّ تنازلي خاطئ. نثبّت هنا الموعد الرسمي المعلن، ويُتجاهل
 * التثبيت تلقائيًا متى صار تاريخ المزوّد مساويًا له أو بعده.
 */

/** أقصى مسافة (بالأيام) يُعرض معها عدّاد «ينطلق بعد N يومًا» في الواجهات. */
export const COUNTDOWN_MAX_DAYS = 60;

interface OfficialWindow {
  start: string;
  end: string;
}

/**
 * كأس آسيا السعودية 2027: أعلن الاتحاد الآسيوي في 2026-11-03 تأجيلها من
 * (7 يناير – 5 فبراير 2027) إلى (23 ديسمبر 2027 – 21 يناير 2028).
 */
export const OFFICIAL_COMPETITION_WINDOWS: Record<string, OfficialWindow> = {
  "asian-cup": { start: "2027-12-23", end: "2028-01-21" },
};

/** بداية/نهاية كأس آسيا الرسمية بتوقيت الرياض (لخدمة كأس آسيا وعدّادها). */
export const AC_OFFICIAL_START_ISO = "2027-12-23T17:00:00+03:00";
export const AC_OFFICIAL_END_ISO = "2028-01-21T21:00:00+03:00";

export function applyOfficialWindow(
  slug: string,
  start: string | null,
  end: string | null,
): { start: string | null; end: string | null } {
  const official = OFFICIAL_COMPETITION_WINDOWS[slug];
  if (!official) return { start, end };
  // المزوّد لحق بالموعد الرسمي (أو تجاوزه بتأجيل أحدث) — نثق به.
  if (start && start.slice(0, 10) >= official.start) return { start, end };
  return { start: official.start, end: official.end };
}

/**
 * التطبيقات المنشورة تبني عدّاد الشريط من `start` مباشرة بلا سقف؛ فنحجب
 * التاريخ عن القائمة العامة ما دام أبعد من السقف، ويعود تلقائيًا عند الاقتراب.
 */
export function hideFarFutureStart<T extends { start?: string | null }>(
  rows: T[],
  now: number = Date.now(),
  maxDays: number = COUNTDOWN_MAX_DAYS,
): T[] {
  return rows.map((row) => {
    if (!row.start) return row;
    const startMs = new Date(`${row.start.slice(0, 10)}T00:00:00+03:00`).getTime();
    if (Number.isNaN(startMs)) return row;
    return (startMs - now) / 86_400_000 > maxDays ? { ...row, start: null } : row;
  });
}
