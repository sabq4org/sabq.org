/**
 * محرك «السعوديون في شهر» — يحوّل النشرة الشهرية إلى بطاقات للقارئ العادي بعناوين صحفية.
 * دالة صرفة كمحرك الأسبوع: كل رقم من الحمولة، لا نموذج لغوي هنا.
 */
import type { MonthlyBulletin, MonthlyMetricKey, Period, QuarterlyMetricKey, SeriesPoint } from "../sama/parsers/monthlyBulletin";
import { fmtPct } from "./weeklyStory";

export interface MonthlyCard {
  key: string;
  cardTitle: string;
  headline: string;
  figure: string;
  detailAr: string;
  tone: "up" | "down" | "neutral";
  weight: number;
  facts: Record<string, number | string>;
  /** سلسلة 13 شهرًا للرسم (القيمة الرئيسية للبطاقة) */
  series: SeriesPoint[];
  /** عنوان محور السلسلة */
  seriesLabelAr: string;
  /** وحدة العرض: sar | count | pct | index */
  unit: "sar" | "count" | "pct" | "index";
}

export interface MonthlyStory {
  month: Period;
  monthLabelAr: string;
  cards: MonthlyCard[];
  lead: { headline: string; intro: string };
  /** مؤشرات دائمة تتراكم شهرًا بعد شهر */
  trackers: Array<{ key: string; titleAr: string; unit: MonthlyCard["unit"]; series: SeriesPoint[] }>;
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export function monthLabelAr(p: Period): string {
  const [y, m] = p.split("-");
  return `${MONTHS_AR[Number(m) - 1] ?? m} ${y}`;
}

function trim(n: number, d: number): string {
  return Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
}
export function fmtSarR(riyals: number, d = 1): string {
  if (Math.abs(riyals) >= 1e12) return `${trim(riyals / 1e12, 2)} تريليون`;
  if (Math.abs(riyals) >= 1e9) return `${trim(riyals / 1e9, d)} مليار`;
  if (Math.abs(riyals) >= 1e6) return `${trim(riyals / 1e6, d)} مليون`;
  return Math.round(riyals).toLocaleString("en-US");
}
function fmtN(n: number): string {
  if (n >= 1e6) return `${trim(n / 1e6, 1)} مليون`;
  if (n >= 1e4) return `${trim(n / 1e3, 0)} ألف`;
  return Math.round(n).toLocaleString("en-US");
}

function at(s: SeriesPoint[], period: Period): number | null {
  return s.find((p) => p.period === period)?.value ?? null;
}
function shiftMonths(p: Period, n: number): Period {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function pctChange(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return ((a - b) / b) * 100;
}
function last13(s: SeriesPoint[], month: Period): SeriesPoint[] {
  const from = shiftMonths(month, -12);
  return s.filter((p) => p.period >= from && p.period <= month);
}
const arrow = (v: number | null) => (v === null ? "" : v >= 0 ? "▲" : "▼");
const upDown = (v: number | null, up = "ارتفاع", down = "تراجع") => (v === null ? "" : v >= 0 ? up : down);

export function buildMonthlyStory(b: MonthlyBulletin): MonthlyStory {
  const M = b.latestMonth;
  const prevM = shiftMonths(M, -1);
  const yoyM = shiftMonths(M, -12);
  const g = (k: MonthlyMetricKey) => at(b.monthly[k], M);
  const gPrev = (k: MonthlyMetricKey) => at(b.monthly[k], prevM);
  const gYoy = (k: MonthlyMetricKey) => at(b.monthly[k], yoyM);
  const cards: MonthlyCard[] = [];

  // 1) الجوال ضد البطاقة (NFC)
  const mob = g("pos.nfcMobileSales"), card = g("pos.nfcCardSales"), pos = g("pos.sales");
  if (mob !== null && card !== null && pos) {
    const mobShare = (mob / pos) * 100;
    const yoy = pctChange(mob, gYoy("pos.nfcMobileSales"));
    cards.push({
      key: "mobileVsCard",
      cardTitle: "كيف يدفع السعوديون؟",
      headline: mob > card
        ? `السعوديون يدفعون بالجوال أكثر من البطاقة: ${fmtSarR(mob)} مقابل ${fmtSarR(card)} ريال في ${monthLabelAr(M).split(" ")[0]}`
        : `البطاقة ما زالت تتقدم على الجوال: ${fmtSarR(card)} مقابل ${fmtSarR(mob)} ريال`,
      figure: `${trim(mobShare, 0)}%`,
      detailAr: `من إنفاق نقاط البيع تم بالجوال${yoy !== null ? ` · ${arrow(yoy)} ${fmtPct(yoy)} عن العام الماضي` : ""}`,
      tone: "up",
      weight: 90,
      facts: { mobile: mob, card, share: mobShare },
      series: last13(b.monthly["pos.nfcMobileSales"], M),
      seriesLabelAr: "مدفوعات الجوال الشهرية (ريال)",
      unit: "sar",
    });
  }

  // 2) الكاش يتراجع
  const atms = g("atm.count"), cash = g("atm.cashWithdrawals");
  if (atms !== null && cash !== null) {
    const atmYoy = at(b.monthly["atm.count"], yoyM);
    const cashYoy = pctChange(cash, gYoy("atm.cashWithdrawals"));
    const atmSeries = b.monthly["atm.count"];
    const peak = atmSeries.reduce((m, p) => (p.value > m.value ? p : m), atmSeries[0]);
    cards.push({
      key: "cash",
      cardTitle: "الكاش يتراجع",
      headline: `${Math.round(atms).toLocaleString("en-US")} صراف آلي فقط… ${peak && peak.value > atms ? `${fmtN(peak.value - atms)} جهازًا اختفى منذ ذروة ${monthLabelAr(peak.period)}` : "والسحب النقدي يتراجع"}`,
      figure: `${fmtSarR(cash)} ريال`,
      detailAr: `سُحبت نقدًا من الصرافات في الشهر${cashYoy !== null ? ` · ${arrow(cashYoy)} ${fmtPct(cashYoy)} عن العام الماضي` : ""}${atmYoy !== null ? ` · الصرافات ${atms - atmYoy >= 0 ? "+" : ""}${fmtN(Math.abs(atms - atmYoy))} في عام` : ""}`,
      tone: cashYoy !== null && cashYoy < 0 ? "down" : "neutral",
      weight: 80,
      facts: { atms, cash, cashYoyPct: cashYoy ?? 0 },
      series: last13(b.monthly["atm.cashWithdrawals"], M),
      seriesLabelAr: "السحب النقدي الشهري (ريال)",
      unit: "sar",
    });
  }

  // 3) القرض العقاري
  const contracts = g("mortgage.contracts"), mortTotal = g("mortgage.total"), houses = g("mortgage.houses"), apts = g("mortgage.apartments");
  if (contracts !== null && mortTotal !== null) {
    const mom = pctChange(contracts, gPrev("mortgage.contracts"));
    const yoy = pctChange(contracts, gYoy("mortgage.contracts"));
    cards.push({
      key: "mortgages",
      cardTitle: "كم سعودي اشترى بيتًا بالتمويل؟",
      headline: `${fmtN(contracts)} قرض عقاري سكني جديد في ${monthLabelAr(M).split(" ")[0]} بقيمة ${fmtSarR(mortTotal)} ريال${yoy !== null ? ` — ${upDown(yoy)} ${fmtPct(yoy)} عن العام الماضي` : ""}`,
      figure: fmtN(contracts),
      detailAr: `عقدًا · ${fmtSarR(mortTotal)} ريال${houses !== null && apts !== null ? ` · الفلل ${fmtSarR(houses)} والشقق ${fmtSarR(apts)}` : ""}${mom !== null ? ` · ${arrow(mom)} ${fmtPct(mom)} عن الشهر السابق` : ""}`,
      tone: yoy === null ? "neutral" : yoy >= 0 ? "up" : "down",
      weight: 85,
      facts: { contracts, total: mortTotal, houses: houses ?? 0, apartments: apts ?? 0, yoyPct: yoy ?? 0 },
      series: last13(b.monthly["mortgage.contracts"], M),
      seriesLabelAr: "عقود التمويل السكني الجديدة شهريًا",
      unit: "count",
    });
  }

  // 4) الادخار
  const ts = g("deposits.timeSavings"), dep = g("deposits.total");
  if (ts !== null && dep) {
    const share = (ts / dep) * 100;
    const shareSeries = b.monthly["deposits.timeSavings"].map((p) => ({ period: p.period, value: (p.value / (at(b.monthly["deposits.total"], p.period) ?? 1)) * 100 })).filter((p) => p.value > 0 && p.value < 100);
    const isRecord = shareSeries.every((p) => p.period === M || p.value <= share);
    const yoy = pctChange(ts, gYoy("deposits.timeSavings"));
    cards.push({
      key: "savings",
      cardTitle: "السعوديون يدّخرون",
      headline: isRecord
        ? `الودائع الادخارية ${trim(share, 1)}% من ودائع المصارف — أعلى نسبة في تاريخها`
        : `${fmtSarR(ts, 2)} ريال ودائع ادخارية وزمنية — ${trim(share, 1)}% من ودائع المصارف`,
      figure: `${trim(share, 1)}%`,
      detailAr: `${fmtSarR(ts, 2)} ريال ودائع زمنية وادخارية${yoy !== null ? ` · ${arrow(yoy)} ${fmtPct(yoy)} في عام` : ""}`,
      tone: "up",
      weight: isRecord ? 88 : 60,
      facts: { timeSavings: ts, total: dep, share, record: isRecord ? 1 : 0 },
      series: last13(shareSeries, M),
      seriesLabelAr: "حصة الودائع الادخارية من إجمالي الودائع (%)",
      unit: "pct",
    });
  }

  // 5) التضخم من الداخل (CPI سنوي)
  const cpi = g("cpi.general"), cpiY = gYoy("cpi.general");
  if (cpi !== null && cpiY !== null) {
    const inflation = pctChange(cpi, cpiY)!;
    const comps: Array<[MonthlyMetricKey, string]> = [
      ["cpi.housing", "السكن والإيجار"], ["cpi.food", "الأغذية"], ["cpi.clothing", "الملابس"], ["cpi.transport", "النقل"],
      ["cpi.restaurants", "المطاعم والفنادق"], ["cpi.education", "التعليم"], ["cpi.health", "الصحة"], ["cpi.communication", "الاتصالات"],
    ];
    const rates = comps.map(([k, ar]) => ({ k, ar, yoy: pctChange(g(k), gYoy(k)) })).filter((x): x is { k: MonthlyMetricKey; ar: string; yoy: number } => x.yoy !== null);
    const top = [...rates].sort((a, b) => b.yoy - a.yoy)[0];
    const bottom = [...rates].sort((a, b) => a.yoy - b.yoy)[0];
    const infSeries = b.monthly["cpi.general"].map((p) => ({ period: p.period, value: pctChange(p.value, at(b.monthly["cpi.general"], shiftMonths(p.period, -12))) ?? NaN })).filter((p) => Number.isFinite(p.value));
    cards.push({
      key: "inflation",
      cardTitle: "غلاء المعيشة",
      headline: top && bottom
        ? `التضخم ${fmtPct(inflation)}… ${top.ar} ${top.yoy >= 0 ? "يرتفع" : "يتراجع"} ${fmtPct(top.yoy)} و${bottom.ar} ${bottom.yoy < 0 ? "تتراجع" : "ترتفع"} ${fmtPct(bottom.yoy)}`
        : `التضخم السنوي ${fmtPct(inflation)} في ${monthLabelAr(M)}`,
      figure: fmtPct(inflation),
      detailAr: `الرقم القياسي ${trim(cpi, 1)} (2023 = 100)${top ? ` · الأعلى: ${top.ar} ${arrow(top.yoy)} ${fmtPct(top.yoy)}` : ""}`,
      tone: inflation > 2.5 ? "down" : "neutral",
      weight: 75,
      facts: { inflationPct: inflation, index: cpi, ...Object.fromEntries(rates.map((r) => [r.k, r.yoy])) },
      series: last13(infSeries, M),
      seriesLabelAr: "التضخم السنوي (%)",
      unit: "pct",
    });
  }

  // 6) التجارة الإلكترونية بمدى
  const ecom = g("ecom.sales"), ecomN = g("ecom.count");
  if (ecom !== null && ecomN !== null) {
    const yoy = pctChange(ecom, gYoy("ecom.sales"));
    cards.push({
      key: "ecommerce",
      cardTitle: "الشراء أونلاين",
      headline: `${fmtSarR(ecom)} ريال مشتريات إلكترونية بمدى في شهر${yoy !== null ? ` — ${upDown(yoy, "قفزة", "تراجع")} ${fmtPct(yoy)} عن العام الماضي` : ""}`,
      figure: `${fmtSarR(ecom)} ريال`,
      detailAr: `${fmtN(ecomN)} عملية شراء إلكتروني${yoy !== null ? ` · ${arrow(yoy)} ${fmtPct(yoy)} سنويًا` : ""}`,
      tone: yoy === null ? "neutral" : yoy >= 0 ? "up" : "down",
      weight: 70,
      facts: { sales: ecom, count: ecomN, yoyPct: yoy ?? 0 },
      series: last13(b.monthly["ecom.sales"], M),
      seriesLabelAr: "التجارة الإلكترونية بمدى شهريًا (ريال)",
      unit: "sar",
    });
  }

  // 7) الشيك يختفي
  const chq = g("cheques.count");
  if (chq !== null) {
    const yoy = pctChange(chq, gYoy("cheques.count"));
    cards.push({
      key: "cheques",
      cardTitle: "نهاية الشيك",
      headline: `${fmtN(chq)} شيك فقط في ${monthLabelAr(M).split(" ")[0]}${yoy !== null ? ` — الشيكات ${upDown(yoy, "ترتفع", "تتراجع")} ${fmtPct(yoy)} في عام` : ""}`,
      figure: fmtN(chq),
      detailAr: `شيكًا مقاصًا في الشهر${yoy !== null ? ` · ${arrow(yoy)} ${fmtPct(yoy)} سنويًا` : ""}`,
      tone: "down",
      weight: 50,
      facts: { cheques: chq, yoyPct: yoy ?? 0 },
      series: last13(b.monthly["cheques.count"], M),
      seriesLabelAr: "عدد الشيكات شهريًا",
      unit: "count",
    });
  }

  // 8) سداد + الفوري
  const sadadN = g("sadad.count"), sadadV = g("sadad.value"), instN = g("instant.count");
  if (sadadN !== null && sadadV !== null) {
    cards.push({
      key: "bills",
      cardTitle: "الفواتير والتحويلات",
      headline: `${fmtN(sadadN)} فاتورة سُددت عبر سداد في شهر بقيمة ${fmtSarR(sadadV)} ريال${instN !== null ? `… و${fmtN(instN)} تحويل فوري` : ""}`,
      figure: fmtN(sadadN),
      detailAr: `فاتورة · ${fmtSarR(sadadV)} ريال${instN !== null ? ` · ${fmtN(instN)} تحويل فوري` : ""}`,
      tone: "neutral",
      weight: 40,
      facts: { sadadCount: sadadN, sadadValue: sadadV, instantCount: instN ?? 0 },
      series: last13(b.monthly["instant.count"], M),
      seriesLabelAr: "التحويلات الفورية شهريًا",
      unit: "count",
    });
  }

  // ربعي: بطاقات الائتمان وقروض التعليم
  const qCards = b.quarterly["consumer.creditCards"].at(-1), qEdu = b.quarterly["consumer.education"].at(-1), qTot = b.quarterly["consumer.total"].at(-1);
  if (qCards && qTot) {
    const prevY = b.quarterly["consumer.creditCards"].find((p) => p.period === `${Number(qCards.period.slice(0, 4)) - 1}${qCards.period.slice(4)}`);
    const yoy = pctChange(qCards.value, prevY?.value ?? null);
    cards.push({
      key: "creditCards",
      cardTitle: "ديون البطاقات",
      headline: `${fmtSarR(qCards.value)} ريال ديون بطاقات ائتمان على السعوديين${yoy !== null ? ` — ${upDown(yoy)} ${fmtPct(yoy)} في عام` : ""}`,
      figure: `${fmtSarR(qCards.value)} ريال`,
      detailAr: `القروض الاستهلاكية ${fmtSarR(qTot.value, 0)} ريال${qEdu ? ` · قروض التعليم ${fmtSarR(qEdu.value)}` : ""} · ${qCards.period.replace("-Q", " الربع ")}`,
      tone: "neutral",
      weight: 55,
      facts: { creditCards: qCards.value, consumer: qTot.value, education: qEdu?.value ?? 0, period: qCards.period },
      series: b.quarterly["consumer.creditCards"].slice(-8),
      seriesLabelAr: "قروض بطاقات الائتمان (ريال، ربعي)",
      unit: "sar",
    });
  }

  // ربعي: تحويلات العاملين
  const rem = b.quarterly["bop.workersRemittances"];
  const remLast = rem.at(-1);
  if (remLast) {
    const prevY = rem.find((p) => p.period === `${Number(remLast.period.slice(0, 4)) - 1}${remLast.period.slice(4)}`);
    const yoy = pctChange(remLast.value, prevY?.value ?? null);
    cards.push({
      key: "remittances",
      cardTitle: "تحويلات المقيمين",
      headline: `${fmtSarR(remLast.value)} ريال حوّلها المقيمون للخارج في ربع واحد${yoy !== null ? ` — ${upDown(yoy, "قفزة", "تراجع")} ${fmtPct(yoy)} عن الربع نفسه من العام الماضي` : ""}`,
      figure: `${fmtSarR(remLast.value)} ريال`,
      detailAr: `${remLast.period.replace("-Q", " الربع ")}${yoy !== null ? ` · ${arrow(yoy)} ${fmtPct(yoy)} سنويًا` : ""}`,
      tone: "neutral",
      weight: 65,
      facts: { remittances: remLast.value, period: remLast.period, yoyPct: yoy ?? 0 },
      series: rem.slice(-8),
      seriesLabelAr: "تحويلات العاملين للخارج (ريال، ربعي)",
      unit: "sar",
    });
  }

  cards.sort((a, b) => b.weight - a.weight);
  const label = monthLabelAr(M);
  const lead = {
    headline: cards[0]?.headline ?? `السعوديون في ${label} بالأرقام`,
    intro: `أصدر البنك المركزي السعودي نشرته الإحصائية لشهر ${label}. ` + cards.slice(0, 3).map((c) => c.headline).join("، و") + ".",
  };
  const trackers: MonthlyStory["trackers"] = [
    { key: "cash", titleAr: "مؤشر الكاش: السحب النقدي الشهري", unit: "sar", series: last13(b.monthly["atm.cashWithdrawals"], M) },
    { key: "mortgages", titleAr: "مؤشر القرض العقاري: العقود الجديدة", unit: "count", series: last13(b.monthly["mortgage.contracts"], M) },
    { key: "savings", titleAr: "مؤشر الادخار: الودائع الزمنية والادخارية", unit: "sar", series: last13(b.monthly["deposits.timeSavings"], M) },
    { key: "inflation", titleAr: "التضخم السنوي", unit: "pct", series: cards.find((c) => c.key === "inflation")?.series ?? [] },
  ];
  return { month: M, monthLabelAr: label, cards, lead, trackers };
}
