/**
 * محلّل تقرير «عمليات نقاط البيع الأسبوعية» (PDF، 3 صفحات):
 *   جدول 1: حسب الأنشطة (30 نشاطًا في مجموعات + الإجمالي)
 *   جدول 2.1 / 2.2: حسب المدن (60 مدينة + أخرى)
 * كل صف: 4 أسابيع × (عدد، قيمة) + تغير أسبوعي للعدد والقيمة. القيم بالآلاف.
 *
 * البنية الهرمية (النقل ← الطيران…) لا تُقرأ من PDF بل تُستنتج: الصف الذي تساوي
 * قيمته مجموع الصفوف التالية له (±0.5%) هو مجموعة. هذا يصمد لو أضافت ساما نشاطًا.
 */
import { extractPdfPages, type PdfLine } from "../pdfText";
import { POS_ACTIVITY_AR, POS_CITY_AR } from "./posLabels";

export interface PosWeek {
  /** ISO */
  start: string;
  end: string;
  /** "16–22 أغسطس" */
  labelAr: string;
}

export interface PosRow {
  en: string;
  ar: string;
  /** عدد العمليات (بالآلاف) لأربعة أسابيع، الأحدث أخيرًا */
  n: number[];
  /** قيمة العمليات (بآلاف الريالات) */
  v: number[];
  /** تغير أسبوعي % للعدد والقيمة */
  dn: number;
  dv: number;
  /** الصف مجموعة تُلخّص الصفوف التالية */
  isGroup?: boolean;
  /** اسم المجموعة الإنجليزي إن كان الصف فرعًا */
  group?: string;
}

export interface PosReport {
  weeks: PosWeek[];
  activities: PosRow[];
  cities: PosRow[];
  /** صف الإجمالي من جدول الأنشطة */
  total: PosRow;
  /** صف «أخرى» من جدول المدن (لا يُعدّ مدينة) */
  otherCities: PosRow | null;
}

const NUM = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;
const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const MONTHS_AR = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function toNum(t: string): number {
  return Number(t.replace(/,/g, ""));
}

/** يرجع الأرقام العشرة في ذيل السطر إن وُجدت، مع النص المتبقي. */
function splitNumericTail(line: string): { tail: number[]; label: string } | null {
  const toks = line.split(/\s+/).filter(Boolean);
  const tail: string[] = [];
  for (let i = toks.length - 1; i >= 0 && NUM.test(toks[i]); i--) tail.unshift(toks[i]);
  if (tail.length < 10) return null;
  const nums = tail.slice(-10).map(toNum);
  return { tail: nums, label: toks.slice(0, toks.length - tail.length).join(" ") };
}

/** "26 Jul,26 - 1 Aug,26 2 Aug,26 - 8 Aug,26 …" → أسابيع ISO. */
export function parseWeekHeader(line: string): PosWeek[] {
  const re = /(\d{1,2})\s+([A-Za-z]{3}),(\d{2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3}),(\d{2})/g;
  const weeks: PosWeek[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [, d1, m1, y1, d2, m2, y2] = m;
    const mm1 = MONTHS[m1], mm2 = MONTHS[m2];
    if (!mm1 || !mm2) continue;
    const start = `20${y1}-${String(mm1).padStart(2, "0")}-${d1.padStart(2, "0")}`;
    const end = `20${y2}-${String(mm2).padStart(2, "0")}-${d2.padStart(2, "0")}`;
    const labelAr = mm1 === mm2 ? `${d1}–${d2} ${MONTHS_AR[mm1]}` : `${d1} ${MONTHS_AR[mm1]} – ${d2} ${MONTHS_AR[mm2]}`;
    weeks.push({ start, end, labelAr });
  }
  return weeks;
}

function isArabic(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}

/** يفكّ "Abha أبها" إلى (en, ar) وفق اتجاه الأحرف. */
function splitBilingual(label: string): { en: string; ar: string } {
  const toks = label.split(/\s+/).filter(Boolean);
  const en = toks.filter((t) => !isArabic(t)).join(" ").trim();
  const ar = toks.filter((t) => isArabic(t)).join(" ").trim();
  return { en, ar };
}

function rowsFromLines(lines: PdfLine[], mode: "activities" | "cities"): PosRow[] {
  const rows: PosRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = splitNumericTail(lines[i].text);
    if (!parsed) continue;
    let en = "", ar = "";
    if (parsed.label) {
      ({ en, ar } = splitBilingual(parsed.label));
    }
    if (mode === "activities" && !en) {
      // الأرقام في سطر مستقل: العربي قبله والإنجليزي بعده
      ar = ar || (lines[i - 1]?.text ?? "").trim();
      en = (lines[i + 1]?.text ?? "").trim();
      if (isArabic(en)) en = "";
    }
    if (!en && !ar) continue;
    const t = parsed.tail;
    const dict = mode === "activities" ? POS_ACTIVITY_AR : POS_CITY_AR;
    rows.push({
      en: en || ar,
      ar: (en && dict[en]) || ar || en,
      n: [t[0], t[2], t[4], t[6]],
      v: [t[1], t[3], t[5], t[7]],
      dn: t[8],
      dv: t[9],
    });
  }
  return rows;
}

/** يكتشف المجموعات: صف قيمته ≈ مجموع الصفوف التالية (حتى 8) لكل الأسابيع. */
export function annotateGroups(rows: PosRow[]): PosRow[] {
  const out = rows.map((r) => ({ ...r }));
  let i = 0;
  while (i < out.length) {
    const head = out[i];
    let found = 0;
    for (let k = 2; k <= 8 && i + k < out.length; k++) {
      const members = out.slice(i + 1, i + 1 + k);
      const ok = [0, 1, 2, 3].every((w) => {
        const sum = members.reduce((s, m) => s + m.v[w], 0);
        return head.v[w] > 0 && Math.abs(sum - head.v[w]) / head.v[w] <= 0.005;
      });
      if (ok) { found = k; break; }
    }
    if (found) {
      head.isGroup = true;
      for (let j = 1; j <= found; j++) out[i + j].group = head.en;
      i += found + 1;
    } else i++;
  }
  return out;
}

export async function parsePosReport(pdf: Buffer | Uint8Array): Promise<PosReport> {
  const pages = await extractPdfPages(pdf);
  if (pages.length < 2) throw new Error("POS report: expected ≥2 pages");

  const allLines = pages.flatMap((p) => p.lines);
  const headerLine = allLines.find((l) => /\d{1,2}\s+[A-Za-z]{3},\d{2}\s*-/.test(l.text));
  const weeks = headerLine ? parseWeekHeader(headerLine.text) : [];
  if (weeks.length !== 4) throw new Error(`POS report: expected 4 week ranges, got ${weeks.length}`);

  const isActivityPage = (p: PdfLine[]) => p.some((l) => /Table 1\b/.test(l.text));
  const actPages = pages.filter((p) => isActivityPage(p.lines));
  const cityPages = pages.filter((p) => !isActivityPage(p.lines) && p.lines.some((l) => /Table 2/.test(l.text)));

  const actRaw = rowsFromLines(actPages.flatMap((p) => p.lines), "activities");
  const totalIdx = actRaw.findIndex((r) => /^total$/i.test(r.en) || r.ar === "الإجمالي");
  if (totalIdx < 0) throw new Error("POS report: total row not found");
  const total = { ...actRaw[totalIdx], en: "Total", ar: "الإجمالي" };
  const activities = annotateGroups(actRaw.filter((_, i) => i !== totalIdx));
  if (activities.length < 20) throw new Error(`POS report: only ${activities.length} activity rows`);

  const cityRaw = rowsFromLines(cityPages.flatMap((p) => p.lines), "cities");
  const otherIdx = cityRaw.findIndex((r) => /^others?$/i.test(r.en));
  const otherCities = otherIdx >= 0 ? { ...cityRaw[otherIdx], ar: "مدن أخرى" } : null;
  const cities = cityRaw.filter((_, i) => i !== otherIdx);
  if (cities.length < 40) throw new Error(`POS report: only ${cities.length} city rows`);

  // فحص اتساق: مجموع المدن + أخرى ≈ الإجمالي (±1%)
  const citySum = cities.reduce((s, c) => s + c.v[3], 0) + (otherCities?.v[3] ?? 0);
  if (Math.abs(citySum - total.v[3]) / total.v[3] > 0.01) {
    throw new Error(`POS report: cities sum ${citySum} ≠ total ${total.v[3]}`);
  }
  return { weeks, activities, cities, total, otherCities };
}
