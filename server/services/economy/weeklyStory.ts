/**
 * محرك «أرقام الأسبوع» — يحوّل تقرير نقاط البيع إلى مؤشرات وقصص بعناوين صحفية.
 *
 * كل رقم في أي عنوان يأتي من الحمولة المحسوبة هنا (لا نموذج لغوي في هذه الطبقة)،
 * فالعناوين «رنانة» لكنها مضمونة رقميًا. النموذج اللغوي — إن استُخدم لاحقًا لصياغة
 * الخبر — يتلقّى هذه الحمولة ويُمنع من إضافة أرقام.
 *
 * دالة صرفة: لا شبكة ولا قاعدة. مُختبَرة في tests/unit/economyWeeklyStory.test.ts.
 */
import type { PosReport, PosRow } from "../sama/parsers/posReport";

export interface WeeklyKpi {
  key: "total" | "count" | "avgTicket" | "vs4w";
  labelAr: string;
  value: number;
  unitAr: string;
  /** تغير % (عن الأسبوع السابق، أو عن متوسط 4 أسابيع لـ vs4w) */
  changePct: number | null;
  noteAr?: string;
  /** سلسلة 4 أسابيع لخط الشرارة */
  series: number[];
}

export type StoryTone = "up" | "down" | "neutral";

export interface WeeklyStory {
  key: string;
  /** عنوان صحفي جاهز للنشر */
  headline: string;
  /** عنوان بديل أقصر للبطاقة */
  cardTitle: string;
  /** الرقم البارز كما يُعرض */
  figure: string;
  detailAr: string;
  tone: StoryTone;
  /** ثقل القصة لترتيبها (0–100) */
  weight: number;
  /** ما يلزم لتوليد الخبر: الأرقام الخام */
  facts: Record<string, number | string>;
}

export interface WeeklySpendingStory {
  weekLabelAr: string;
  periodStart: string;
  periodEnd: string;
  kpis: WeeklyKpi[];
  stories: WeeklyStory[];
  /** الخبر الرئيسي: عنوان + عنوان فرعي + مقدمة جاهزة */
  lead: { headline: string; subheadline: string; intro: string };
  sectors: Array<{ en: string; ar: string; value: number; count: number; changePct: number; countChangePct: number; share: number; isGroup: boolean; group: string | null; series: number[] }>;
  cities: Array<{ en: string; ar: string; value: number; count: number; changePct: number; countChangePct: number; share: number; avgTicket: number; series: number[] }>;
  citiesShareTop: Array<{ ar: string; share: number }>;
  otherCitiesShare: number;
  risers: Array<{ ar: string; changePct: number }>;
  fallers: Array<{ ar: string; changePct: number }>;
  totals: { value: number; count: number; series: number[]; countSeries: number[] };
}

const L = 3; // آخر أسبوع في المصفوفات

// ---------- تنسيق عربي ----------
export function fmtSar(thousands: number, digits = 2): string {
  const r = thousands * 1000;
  if (r >= 1e9) return `${trim(r / 1e9, digits)} مليار`;
  if (r >= 1e6) return `${trim(r / 1e6, 1)} مليون`;
  return Math.round(r).toLocaleString("en-US");
}
export function fmtCount(thousands: number): string {
  const r = thousands * 1000;
  if (r >= 1e6) return `${trim(r / 1e6, 1)} مليون`;
  return Math.round(r).toLocaleString("en-US");
}
function trim(n: number, d: number): string {
  return Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
}
export function fmtPct(p: number, d = 1): string {
  return `${trim(Math.abs(p), d)}%`;
}
function pctChange(a: number, b: number): number {
  return b === 0 ? 0 : ((a - b) / b) * 100;
}
function share(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

/** «التعليم يقفز» / «الفنادق تتراجع» — جمع غير العاقل يُعامل مفردًا مؤنثًا، والمدن مؤنثة؛
 * رؤوس مذكّرة معروفة في تسميات ساما تُستثنى. */
const MASCULINE_HEADS = new Set(["النقل", "الطيران", "تأجير", "الترفيه", "الأثاث", "التعليم", "الإجمالي"]);
function verbFor(name: string, up: boolean): string {
  const head = name.trim().split(/\s+/)[0] ?? "";
  const masc = MASCULINE_HEADS.has(head);
  if (up) return masc ? "يقفز" : "تقفز";
  return masc ? "يتراجع" : "تتراجع";
}

/** موسمية بسيطة تُضيف سياقًا للعنوان (تُوسَّع لاحقًا بالتقويم الهجري). */
export function seasonalContext(periodEnd: string): string | null {
  const m = Number(periodEnd.slice(5, 7)), d = Number(periodEnd.slice(8, 10));
  if ((m === 8 && d >= 15) || (m === 9 && d <= 10)) return "مع عودة المدارس";
  if (m === 12 && d >= 20) return "مع إجازة نهاية العام";
  return null;
}

function consecutiveDeclines(series: number[]): number {
  let n = 0;
  for (let i = series.length - 1; i > 0; i--) {
    if (series[i] < series[i - 1]) n++;
    else break;
  }
  return n;
}

export function buildWeeklySpendingStory(report: PosReport): WeeklySpendingStory {
  const total = report.total;
  const week = report.weeks[L];
  const leaves: PosRow[] = report.activities.filter((a) => !a.isGroup);

  const avg = total.v[L] / total.n[L];
  const avgPrev = total.v[L - 1] / total.n[L - 1];
  const m4 = total.v.reduce((s, x) => s + x, 0) / 4;
  const kpis: WeeklyKpi[] = [
    { key: "total", labelAr: "إجمالي الإنفاق", value: total.v[L] * 1000, unitAr: "ريال", changePct: total.dv, series: total.v },
    { key: "count", labelAr: "عدد العمليات", value: total.n[L] * 1000, unitAr: "عملية", changePct: total.dn, series: total.n },
    {
      key: "avgTicket",
      labelAr: "متوسط العملية",
      value: avg,
      unitAr: "ريال",
      changePct: pctChange(avg, avgPrev),
      noteAr: avg > avgPrev ? "الناس يشترون أقل مرات بمبالغ أكبر" : "عمليات أكثر بمبالغ أصغر",
      series: total.v.map((v, i) => v / total.n[i]),
    },
    { key: "vs4w", labelAr: "مقابل متوسط 4 أسابيع", value: pctChange(total.v[L], m4), unitAr: "%", changePct: null, noteAr: `المتوسط ${fmtSar(m4)} ريال`, series: total.v },
  ];

  const byDv = [...leaves].sort((a, b) => b.dv - a.dv);
  const byV = [...leaves].sort((a, b) => b.v[L] - a.v[L]);
  const byDn = [...leaves].sort((a, b) => b.dn - a.dn);
  const cByDv = [...report.cities].sort((a, b) => b.dv - a.dv);
  const cByV = [...report.cities].sort((a, b) => b.v[L] - a.v[L]);
  const season = seasonalContext(week.end);

  const stories: WeeklyStory[] = [];
  const topS = byDv[0];
  if (topS && topS.dv > 0) {
    const ctx = season ? ` ${season}` : "";
    stories.push({
      key: "sectorRiser",
      headline: `${topS.ar} ${verbFor(topS.ar, true)} ${fmtPct(topS.dv)} في أسبوع${ctx}`,
      cardTitle: "القطاع الأعلى صعودًا",
      figure: `▲ ${fmtPct(topS.dv)}`,
      detailAr: `من ${fmtSar(topS.v[L - 1])} إلى ${fmtSar(topS.v[L])} ريال${ctx}`,
      tone: "up",
      weight: Math.min(100, 40 + topS.dv / 2 + share(topS.v[L], total.v[L]) * 2),
      facts: { sector: topS.ar, changePct: topS.dv, value: topS.v[L] * 1000, prev: topS.v[L - 1] * 1000 },
    });
  }
  const botS = byDv[byDv.length - 1];
  if (botS && botS.dv < 0) {
    const streak = consecutiveDeclines(botS.v);
    stories.push({
      key: "sectorFaller",
      headline: streak >= 3
        ? `${botS.ar} ${verbFor(botS.ar, false)} ${fmtPct(botS.dv)}… ${streak} أسابيع من الهبوط المتواصل`
        : `${botS.ar} ${verbFor(botS.ar, false)} ${fmtPct(botS.dv)} في أسبوع`,
      cardTitle: "القطاع الأعلى هبوطًا",
      figure: `▼ ${fmtPct(botS.dv)}`,
      detailAr: streak >= 2 ? `هبوط للأسبوع ${streak === 2 ? "الثاني" : streak === 3 ? "الثالث" : "الرابع"} على التوالي: ${fmtSar(botS.v[0])} → ${fmtSar(botS.v[L])}` : `من ${fmtSar(botS.v[L - 1])} إلى ${fmtSar(botS.v[L])} ريال`,
      tone: "down",
      weight: Math.min(100, 35 + Math.abs(botS.dv) / 2 + share(botS.v[L], total.v[L]) * 2 + streak * 5),
      facts: { sector: botS.ar, changePct: botS.dv, streak, value: botS.v[L] * 1000 },
    });
  }
  const big = byV[0];
  if (big) {
    const sh = share(big.v[L], total.v[L]);
    stories.push({
      key: "sectorShare",
      headline: `${fmtPct(sh)} من إنفاق السعوديين هذا الأسبوع ذهبت إلى ${big.ar}`,
      cardTitle: "أكبر حصة من الإنفاق",
      figure: fmtPct(sh),
      detailAr: `${fmtSar(big.v[L])} ريال في ${fmtCount(big.n[L])} عملية`,
      tone: "neutral",
      weight: 30 + sh,
      facts: { sector: big.ar, share: sh, value: big.v[L] * 1000 },
    });
  }
  const topC = cByDv[0];
  if (topC && topC.dv > 0) {
    stories.push({
      key: "cityRiser",
      headline: `${topC.ar} الأعلى نموًا في إنفاق المملكة: +${fmtPct(topC.dv)} في أسبوع`,
      cardTitle: "المدينة الأعلى نموًا",
      figure: `▲ ${fmtPct(topC.dv)}`,
      detailAr: `${fmtSar(topC.v[L - 1])} → ${fmtSar(topC.v[L])} ريال`,
      tone: "up",
      weight: 30 + topC.dv,
      facts: { city: topC.ar, changePct: topC.dv, value: topC.v[L] * 1000 },
    });
  }
  const bigC = cByV[0];
  if (bigC) {
    const sh = share(bigC.v[L], total.v[L]);
    stories.push({
      key: "cityShare",
      headline: `${bigC.ar} تستحوذ على ${fmtPct(sh)} من إنفاق الأسبوع بـ${fmtSar(bigC.v[L])} ريال`,
      cardTitle: "المدينة الأكبر إنفاقًا",
      figure: fmtPct(sh),
      detailAr: `${fmtSar(bigC.v[L])} ريال ${bigC.dv >= 0 ? "▲" : "▼"} ${fmtPct(bigC.dv)} عن الأسبوع الماضي`,
      tone: bigC.dv >= 0 ? "up" : "down",
      weight: 25 + Math.abs(bigC.dv) * 2,
      facts: { city: bigC.ar, share: sh, changePct: bigC.dv, value: bigC.v[L] * 1000 },
    });
  }
  const jump = byDn.find((r) => r.en !== topS?.en);
  if (jump && jump.dn > 0) {
    stories.push({
      key: "countJump",
      headline: `${jump.ar}: ${fmtCount(jump.n[L])} عملية في أسبوع بارتفاع ${fmtPct(jump.dn)}`,
      cardTitle: "أكبر قفزة في عدد العمليات",
      figure: `▲ ${fmtPct(jump.dn)}`,
      detailAr: `${fmtCount(jump.n[L - 1])} → ${fmtCount(jump.n[L])} عملية`,
      tone: "up",
      weight: 20 + jump.dn / 2,
      facts: { sector: jump.ar, countChangePct: jump.dn, count: jump.n[L] * 1000 },
    });
  }
  stories.push({
    key: "avgTicket",
    headline: avg > avgPrev
      ? `السعوديون يشترون أقل مرات بمبالغ أكبر: متوسط العملية ${trim(avg, 1)} ريالًا`
      : `عمليات أكثر بمبالغ أصغر: متوسط العملية يهبط إلى ${trim(avg, 1)} ريالًا`,
    cardTitle: "متوسط العملية",
    figure: `${trim(avg, 1)} ريال`,
    detailAr: `${avg > avgPrev ? "▲" : "▼"} ${fmtPct(pctChange(avg, avgPrev))} عن الأسبوع الماضي`,
    tone: avg > avgPrev ? "up" : "down",
    weight: 15 + Math.abs(pctChange(avg, avgPrev)) * 3,
    facts: { avgTicket: Number(avg.toFixed(2)), changePct: pctChange(avg, avgPrev) },
  });
  stories.sort((a, b) => b.weight - a.weight);

  const totalHeadline = `${fmtSar(total.v[L])} ريال أنفقها السعوديون عبر نقاط البيع في أسبوع${total.dv >= 0 ? " بارتفاع" : " بتراجع"} ${fmtPct(total.dv)}`;
  const lead = {
    headline: stories[0]?.headline ?? totalHeadline,
    subheadline: totalHeadline,
    intro:
      `كشف تقرير البنك المركزي السعودي لعمليات نقاط البيع أن إجمالي الإنفاق خلال الأسبوع ${week.labelAr} بلغ ${fmtSar(total.v[L])} ريال عبر ${fmtCount(total.n[L])} عملية، ` +
      `${total.dv >= 0 ? "بارتفاع" : "بتراجع"} ${fmtPct(total.dv)} في القيمة و${total.dn >= 0 ? "ارتفاع" : "تراجع"} ${fmtPct(total.dn)} في عدد العمليات مقارنة بالأسبوع السابق.` +
      (topS ? ` وتصدّر ${topS.ar} قائمة الصعود بنسبة ${fmtPct(topS.dv)}${season ? ` ${season}` : ""}،` : "") +
      (botS ? ` فيما سجّل ${botS.ar} أكبر تراجع بنسبة ${fmtPct(botS.dv)}.` : ""),
  };

  const sectors = report.activities.map((a) => ({
    en: a.en, ar: a.ar, value: a.v[L] * 1000, count: a.n[L] * 1000, changePct: a.dv, countChangePct: a.dn,
    share: share(a.v[L], total.v[L]), isGroup: Boolean(a.isGroup), group: a.group ?? null, series: a.v.map((x) => x * 1000),
  }));
  const cities = cByV.map((c) => ({
    en: c.en, ar: c.ar, value: c.v[L] * 1000, count: c.n[L] * 1000, changePct: c.dv, countChangePct: c.dn,
    share: share(c.v[L], total.v[L]), avgTicket: c.n[L] ? c.v[L] / c.n[L] : 0, series: c.v.map((x) => x * 1000),
  }));
  const top6 = cByV.slice(0, 6);
  const citiesShareTop = top6.map((c) => ({ ar: c.ar, share: share(c.v[L], total.v[L]) }));
  const otherCitiesShare = 100 - citiesShareTop.reduce((s, c) => s + c.share, 0);

  return {
    weekLabelAr: week.labelAr,
    periodStart: week.start,
    periodEnd: week.end,
    kpis,
    stories,
    lead,
    sectors,
    cities,
    citiesShareTop,
    otherCitiesShare,
    risers: cByDv.slice(0, 7).map((c) => ({ ar: c.ar, changePct: c.dv })),
    fallers: cByDv.slice(-7).reverse().map((c) => ({ ar: c.ar, changePct: c.dv })),
    totals: { value: total.v[L] * 1000, count: total.n[L] * 1000, series: total.v.map((x) => x * 1000), countSeries: total.n.map((x) => x * 1000) },
  };
}
