/**
 * مزادات إنفاذ العقارية — الثوابت والتحقق والحسابات الصافية المشتركة بين الخادم والصفحة واللوحة.
 * النطاق: المزادات العقارية فقط (لا تركات ولا منقولات).
 * الأسبوع يبدأ الأحد وينتهي السبت. كل الأوقات بتوقيت الرياض (+03:00، بلا توقيت صيفي).
 */
import { z } from "zod";

export const INFATH_REGIONS = [
  { id: "riyadh", ar: "الرياض" },
  { id: "makkah", ar: "مكة المكرمة" },
  { id: "eastern", ar: "الشرقية" },
  { id: "madinah", ar: "المدينة المنورة" },
  { id: "qassim", ar: "القصيم" },
  { id: "asir", ar: "عسير" },
  { id: "tabuk", ar: "تبوك" },
  { id: "hail", ar: "حائل" },
  { id: "northern_borders", ar: "الحدود الشمالية" },
  { id: "jazan", ar: "جازان" },
  { id: "najran", ar: "نجران" },
  { id: "baha", ar: "الباحة" },
  { id: "jouf", ar: "الجوف" },
] as const;
export type InfathRegion = (typeof INFATH_REGIONS)[number]["id"];
const REGION_IDS = INFATH_REGIONS.map((item) => item.id) as [InfathRegion, ...InfathRegion[]];

export const INFATH_CATEGORIES = [
  { id: "residential", ar: "سكني" },
  { id: "commercial", ar: "تجاري" },
  { id: "agricultural", ar: "زراعي" },
  { id: "other", ar: "أخرى" },
] as const;
export type InfathCategory = (typeof INFATH_CATEGORIES)[number]["id"];
const CATEGORY_IDS = INFATH_CATEGORIES.map((item) => item.id) as [InfathCategory, ...InfathCategory[]];

export const INFATH_FORMATS = [
  { id: "online", ar: "إلكتروني" },
  { id: "in_person", ar: "حضوري" },
  { id: "hybrid", ar: "حضوري وإلكتروني" },
] as const;
export type InfathFormat = (typeof INFATH_FORMATS)[number]["id"];
const FORMAT_IDS = INFATH_FORMATS.map((item) => item.id) as [InfathFormat, ...InfathFormat[]];

export const INFATH_RESULT_STATUSES = [
  { id: "scheduled", ar: "مجدول" },
  { id: "held", ar: "أقيم" },
  { id: "cancelled", ar: "أُلغي" },
] as const;
export type InfathResultStatus = (typeof INFATH_RESULT_STATUSES)[number]["id"];
const RESULT_IDS = INFATH_RESULT_STATUSES.map((item) => item.id) as [InfathResultStatus, ...InfathResultStatus[]];

export const INFATH_WEEK_STATUSES = [
  { id: "draft", ar: "مسودة" },
  { id: "pending", ar: "بانتظار الاعتماد" },
  { id: "returned", ar: "أُعيد للتعديل" },
  { id: "approved", ar: "معتمد ومنشور" },
] as const;
export type InfathWeekStatus = (typeof INFATH_WEEK_STATUSES)[number]["id"];

export const INFATH_MAX_AUCTIONS = 300;
export const INFATH_LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
export const INFATH_STALE_MESSAGE = "عدّل شخص آخر هذا الأسبوع بعد فتحك له. حدّث الصفحة ثم أعد التعديل.";
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const INFATH_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const INFATH_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"] as const;

export function regionLabel(id: string): string {
  return INFATH_REGIONS.find((item) => item.id === id)?.ar ?? id;
}
export function categoryLabel(id: string): string {
  return INFATH_CATEGORIES.find((item) => item.id === id)?.ar ?? id;
}
export function formatLabel(id: string): string {
  return INFATH_FORMATS.find((item) => item.id === id)?.ar ?? id;
}
export function weekStatusLabel(id: string): string {
  return INFATH_WEEK_STATUSES.find((item) => item.id === id)?.ar ?? id;
}

// ---------- التواريخ ----------

export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = الأحد. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function riyadhToday(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** أحد الأسبوع الذي يقع فيه التاريخ. */
export function weekStartOf(isoDate: string): string {
  return addDays(isoDate, -weekdayOf(isoDate));
}

export function weekEndOf(weekStart: string): string {
  return addDays(weekStart, 6);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** لحظة بدء المزاد (ms) من تاريخ ووقت الرياض. */
export function auctionStartMs(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00+03:00`);
}

/** «25 إلى 31 أكتوبر 2026» أو «27 سبتمبر إلى 3 أكتوبر 2026». */
export function formatWeekRange(weekStart: string, withYear = true): string {
  const end = weekEndOf(weekStart);
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const year = withYear ? ` ${ey}` : "";
  if (sm === em) return `${sd} إلى ${ed} ${INFATH_MONTHS[em - 1]}${year}`;
  const startYear = withYear && sy !== ey ? ` ${sy}` : "";
  return `${sd} ${INFATH_MONTHS[sm - 1]}${startYear} إلى ${ed} ${INFATH_MONTHS[em - 1]}${year}`;
}

/** «25/10/2026» */
export function formatDateNumeric(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

/** «4:00 م» من «16:00». */
export function formatTime12(time: string): string {
  const [h, m] = time.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "ص" : "م"}`;
}

// ---------- الأرقام ----------

/** القيمة بالريال إلى نص مختصر: { value: "1.14", unit: "مليار" }. */
export function formatSarParts(sar: number): { value: string; unit: string } {
  const abs = Math.abs(sar);
  const trim = (n: number, digits: number) => {
    const fixed = n.toFixed(digits);
    return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  };
  if (abs >= 1e9) return { value: trim(sar / 1e9, 2), unit: "مليار" };
  if (abs >= 1e6) return { value: trim(sar / 1e6, abs >= 1e8 ? 0 : 1), unit: "مليون" };
  if (abs >= 1e3) return { value: trim(sar / 1e3, 0), unit: "ألف" };
  return { value: trim(sar, 0), unit: "" };
}

export function formatSar(sar: number, withCurrency = true): string {
  const parts = formatSarParts(sar);
  const unit = [parts.unit, withCurrency ? "ريال" : ""].filter(Boolean).join(" ");
  return unit ? `${parts.value} ${unit}` : parts.value;
}

/** عدد مع تمييز عربي صحيح: 1 مزاد واحد، 2 مزادان، 3–10 مزادات، 11+ مزادًا. */
export function arCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}
export const AUCTION_FORMS = { one: "مزاد واحد", two: "مزادان", few: "مزادات", many: "مزادًا" };
export const ASSET_FORMS = { one: "أصل واحد", two: "أصلان", few: "أصول", many: "أصلًا" };

// ---------- التحقق ----------

const optionalCount = z.union([z.number().int().min(0).max(100000), z.null()]).optional();
const optionalMoney = z.union([z.number().min(0).max(1e13), z.null()]).optional();

export const infathAuctionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD").refine(isRealIsoDate, "التاريخ غير موجود في التقويم"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "الوقت بصيغة 24 ساعة مثل 16:00"),
  city: z.string().trim().min(2, "المدينة مطلوبة").max(80),
  region: z.enum(REGION_IDS, { message: "اختر المنطقة من القائمة" }),
  assetType: z.string().trim().min(2, "نوع الأصل مطلوب").max(120),
  category: z.enum(CATEGORY_IDS, { message: "اختر الفئة من القائمة" }),
  assetsCount: z.number().int().min(1, "عدد الأصول 1 على الأقل").max(100000),
  format: z.enum(FORMAT_IDS, { message: "اختر صيغة المزاد" }),
  url: z.union([
    z.string().trim().max(2000).url("رابط المزاد غير صالح").refine((v) => /^https:\/\//i.test(v), "رابط المزاد يبدأ بـ https"),
    z.literal(""),
    z.null(),
  ]).optional(),
  resultStatus: z.enum(RESULT_IDS).default("scheduled"),
  assetsSold: optionalCount,
  soldValue: optionalMoney,
});

export type InfathAuctionInput = z.input<typeof infathAuctionSchema>;

export type InfathAuction = {
  id: string;
  date: string;
  time: string;
  city: string;
  region: InfathRegion;
  assetType: string;
  category: InfathCategory;
  assetsCount: number;
  format: InfathFormat;
  url: string | null;
  resultStatus: InfathResultStatus;
  assetsSold: number | null;
  soldValue: number | null;
};

export const INFATH_FIELD_LABELS: Record<string, string> = {
  auctions: "المزادات",
  date: "التاريخ",
  time: "الوقت",
  city: "المدينة",
  region: "المنطقة",
  assetType: "نوع الأصل",
  category: "الفئة",
  assetsCount: "عدد الأصول",
  format: "الصيغة",
  url: "الرابط",
  resultStatus: "الحالة",
  assetsSold: "الأصول المبيعة",
  soldValue: "قيمة المبيعات",
  weekStart: "بداية الأسبوع",
  note: "الملاحظة",
  expectedUpdatedAt: "النسخة",
};

const stamp = z.union([z.string().datetime({ offset: true }), z.null()]).optional();

export function auctionsWriteSchema(weekStart: string) {
  const end = weekEndOf(weekStart);
  return z.object({
    auctions: z.array(infathAuctionSchema).max(INFATH_MAX_AUCTIONS, `الحد ${INFATH_MAX_AUCTIONS} مزادًا في الأسبوع`),
    expectedUpdatedAt: stamp,
  }).superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.auctions.forEach((auction, index) => {
      const row = `الصف ${index + 1}: `;
      if (ids.has(auction.id)) ctx.addIssue({ code: "custom", path: ["auctions", index, "id"], message: `${row}معرّف مكرر` });
      ids.add(auction.id);
      if (auction.date < weekStart || auction.date > end) {
        ctx.addIssue({ code: "custom", path: ["auctions", index, "date"], message: `${row}التاريخ خارج الأسبوع (${weekStart} إلى ${end})` });
      }
      const held = auction.resultStatus === "held";
      if (!held && (auction.assetsSold != null || auction.soldValue != null)) {
        ctx.addIssue({ code: "custom", path: ["auctions", index, "resultStatus"], message: `${row}النتائج تُدخل فقط للمزاد الذي أقيم` });
      }
      if (held && (auction.assetsSold == null || auction.soldValue == null)) {
        ctx.addIssue({ code: "custom", path: ["auctions", index, "assetsSold"], message: `${row}أدخل الأصول المبيعة وقيمة المبيعات للمزاد الذي أقيم` });
      }
      if (auction.assetsSold != null && auction.assetsSold > auction.assetsCount) {
        ctx.addIssue({ code: "custom", path: ["auctions", index, "assetsSold"], message: `${row}الأصول المبيعة أكثر من المعروضة` });
      }
    });
  });
}

export const createWeekSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealIsoDate, "التاريخ غير موجود في التقويم")
    .refine((v) => weekdayOf(v) === 0, "الأسبوع يبدأ يوم الأحد"),
});

export const reviewActionSchema = z.object({
  expectedUpdatedAt: stamp,
  note: z.union([z.string().trim().max(1000), z.null()]).optional(),
});

export const returnWeekSchema = z.object({
  expectedUpdatedAt: stamp,
  note: z.string().trim().min(3, "اكتب سبب الإعادة").max(1000),
});

export function normalizeAuctions(input: z.output<typeof infathAuctionSchema>[]): InfathAuction[] {
  return input
    .map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      city: a.city,
      region: a.region,
      assetType: a.assetType,
      category: a.category,
      assetsCount: a.assetsCount,
      format: a.format,
      url: a.url ? a.url : null,
      resultStatus: a.resultStatus,
      assetsSold: a.resultStatus === "held" ? a.assetsSold ?? null : null,
      soldValue: a.resultStatus === "held" ? a.soldValue ?? null : null,
    }))
    .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
}

// ---------- الملخصات ----------

export type InfathWeekSummary = {
  auctions: number;
  assets: number;
  regions: number;
  held: number;
  cancelled: number;
  assetsOfferedHeld: number;
  assetsSold: number;
  soldValue: number;
  /** نسبة الأصول المبيعة من المعروضة في المزادات التي أقيمت، أو null قبل أي نتيجة. */
  sellThrough: number | null;
  byRegion: { region: InfathRegion; soldValue: number; auctions: number }[];
  byDay: { date: string; auctions: number; held: number; soldValue: number }[];
  top: { city: string; assetType: string; region: InfathRegion; soldValue: number } | null;
};

export function summarizeWeek(weekStart: string, auctions: InfathAuction[]): InfathWeekSummary {
  const live = auctions.filter((a) => a.resultStatus !== "cancelled");
  const held = auctions.filter((a) => a.resultStatus === "held");
  const regions = new Map<InfathRegion, { soldValue: number; auctions: number }>();
  for (const a of live) {
    const entry = regions.get(a.region) ?? { soldValue: 0, auctions: 0 };
    entry.auctions += 1;
    entry.soldValue += a.soldValue ?? 0;
    regions.set(a.region, entry);
  }
  const assetsOfferedHeld = held.reduce((sum, a) => sum + a.assetsCount, 0);
  const assetsSold = held.reduce((sum, a) => sum + (a.assetsSold ?? 0), 0);
  const soldValue = held.reduce((sum, a) => sum + (a.soldValue ?? 0), 0);
  let top: InfathWeekSummary["top"] = null;
  for (const a of held) {
    if ((a.soldValue ?? 0) > (top?.soldValue ?? 0)) {
      top = { city: a.city, assetType: a.assetType, region: a.region, soldValue: a.soldValue ?? 0 };
    }
  }
  return {
    auctions: live.length,
    assets: live.reduce((sum, a) => sum + a.assetsCount, 0),
    regions: regions.size,
    held: held.length,
    cancelled: auctions.length - live.length,
    assetsOfferedHeld,
    assetsSold,
    soldValue,
    sellThrough: assetsOfferedHeld > 0 ? Math.round((assetsSold / assetsOfferedHeld) * 100) : null,
    byRegion: Array.from(regions.entries())
      .map(([region, entry]) => ({ region, ...entry }))
      .sort((x, y) => y.soldValue - x.soldValue || y.auctions - x.auctions),
    byDay: weekDates(weekStart).map((date) => {
      const day = live.filter((a) => a.date === date);
      return {
        date,
        auctions: day.length,
        held: day.filter((a) => a.resultStatus === "held").length,
        soldValue: day.reduce((sum, a) => sum + (a.soldValue ?? 0), 0),
      };
    }),
    top,
  };
}

export type InfathAuctionPhase = "upcoming" | "live" | "past" | "cancelled";

/** حالة المزاد للقارئ: النتيجة المسجلة تنهيه، وإلا فالوقت يحدد. */
export function auctionPhase(auction: Pick<InfathAuction, "date" | "time" | "resultStatus">, nowMs: number): InfathAuctionPhase {
  if (auction.resultStatus === "cancelled") return "cancelled";
  if (auction.resultStatus === "held") return "past";
  const start = auctionStartMs(auction.date, auction.time);
  if (nowMs < start) return "upcoming";
  if (nowMs < start + INFATH_LIVE_WINDOW_MS) return "live";
  return "past";
}

// ---------- العرض العام ----------

export type InfathWeekBrief = {
  weekStart: string;
  weekEnd: string;
  auctions: number;
  assets: number;
  assetsSold: number;
  soldValue: number;
  sellThrough: number | null;
};

export type InfathPublicView = {
  week: {
    weekStart: string;
    weekEnd: string;
    updatedAt: string;
    auctions: InfathAuction[];
  };
  previous: (InfathWeekBrief & { byRegion: InfathWeekSummary["byRegion"]; changePct: number | null }) | null;
  history: { weekStart: string; soldValue: number }[];
  archive: InfathWeekBrief[];
  nav: { prev: string | null; next: string | null };
  preview?: boolean;
};

export function briefOf(weekStart: string, summary: InfathWeekSummary): InfathWeekBrief {
  return {
    weekStart,
    weekEnd: weekEndOf(weekStart),
    auctions: summary.auctions,
    assets: summary.assets,
    assetsSold: summary.assetsSold,
    soldValue: summary.soldValue,
    sellThrough: summary.sellThrough,
  };
}

/** صف من فهرس الأسابيع المعتمدة، الأحدث أولًا. */
export type InfathPublishedIndexRow = { id: string; weekStart: string; summary: InfathWeekSummary | null; publishedAt: Date | null };

/** الأسبوع المعروض افتراضيًا: الأسبوع الجاري إن اعتُمد، وإلا أحدث أسبوع مضى، وإلا أقرب أسبوع قادم. */
export function pickCurrentWeek(weekStartsDesc: string[], today: string): string | null {
  const thisWeek = weekStartOf(today);
  const pastOrNow = weekStartsDesc.find((w) => w <= thisWeek);
  if (pastOrNow) return pastOrNow;
  return weekStartsDesc.length ? weekStartsDesc[weekStartsDesc.length - 1] : null;
}

export function buildPublicView(
  index: InfathPublishedIndexRow[],
  chosen: { weekStart: string; auctions: InfathAuction[]; updatedAt: string },
): InfathPublicView {
  const position = index.findIndex((row) => row.weekStart === chosen.weekStart);
  const older = index.slice(position + 1).filter((row) => row.summary);
  const prevRow = older[0];
  const beforePrev = older[1];
  const prevSummary = prevRow?.summary ?? null;
  const changePct = prevSummary && beforePrev?.summary && beforePrev.summary.soldValue > 0
    ? Math.round(((prevSummary.soldValue - beforePrev.summary.soldValue) / beforePrev.summary.soldValue) * 100)
    : null;
  return {
    week: {
      weekStart: chosen.weekStart,
      weekEnd: weekEndOf(chosen.weekStart),
      updatedAt: chosen.updatedAt,
      auctions: chosen.auctions,
    },
    previous: prevRow && prevSummary
      ? { ...briefOf(prevRow.weekStart, prevSummary), byRegion: prevSummary.byRegion, changePct }
      : null,
    history: older.slice(0, 8).reverse().map((row) => ({ weekStart: row.weekStart, soldValue: row.summary?.soldValue ?? 0 })),
    archive: older.slice(0, 12).map((row) => briefOf(row.weekStart, row.summary as InfathWeekSummary)),
    nav: {
      prev: position >= 0 && index[position + 1] ? index[position + 1].weekStart : null,
      next: position > 0 ? index[position - 1].weekStart : null,
    },
  };
}

// ---------- اللصق من Excel ----------

export const INFATH_PASTE_COLUMNS = ["التاريخ", "الوقت", "المدينة", "المنطقة", "نوع الأصل", "الفئة", "عدد الأصول", "الصيغة", "الرابط"] as const;

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function latinDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

function normalizeArabic(value: string): string {
  return value.trim().replace(/[أإآ]/g, "ا").replace(/ة$/g, "ه").replace(/^منطقة\s+/, "").replace(/\s+/g, " ");
}

function matchLabel<T extends string>(list: readonly { id: T; ar: string }[], value: string, aliases: Record<string, T> = {}): T | null {
  const key = normalizeArabic(value);
  if (!key) return null;
  const direct = list.find((item) => item.id === value.trim() || normalizeArabic(item.ar) === key);
  if (direct) return direct.id;
  const alias = Object.entries(aliases).find(([label]) => normalizeArabic(label) === key);
  return alias ? alias[1] : null;
}

const REGION_ALIASES: Record<string, InfathRegion> = {
  "مكه": "makkah", "المنطقة الشرقية": "eastern", "الشرقيه": "eastern", "المدينه": "madinah", "المدينة": "madinah",
  "الحدود الشماليه": "northern_borders", "جيزان": "jazan",
};
const FORMAT_ALIASES: Record<string, InfathFormat> = {
  "الكتروني": "online", "إلكتروني": "online", "عن بعد": "online", "هجين": "hybrid", "حضوري والكتروني": "hybrid", "حضوري + إلكتروني": "hybrid",
};
const CATEGORY_ALIASES: Record<string, InfathCategory> = { "اخرى": "other", "اخري": "other", "سكنية": "residential", "تجارية": "commercial", "زراعية": "agricultural" };

/** يقبل 2026-10-25 أو 25/10/2026 أو 25-10-2026. */
function parsePasteDate(value: string): string | null {
  const v = latinDigits(value.trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return isRealIsoDate(v) ? v : null;
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isRealIsoDate(iso) ? iso : null;
}

/** يقبل 16:00 أو 4:00 م أو 4 م. */
function parsePasteTime(value: string): string | null {
  const v = latinDigits(value.trim()).replace(/\s+/g, " ");
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(ص|م|AM|PM|am|pm)?$/.exec(v);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ?? "00";
  const suffix = m[3]?.toLowerCase();
  if (suffix === "م" || suffix === "pm") hour = hour % 12 + 12;
  if (suffix === "ص" || suffix === "am") hour = hour % 12;
  if (hour > 23 || Number(minute) > 59) return null;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export type PasteResult = { rows: InfathAuctionInput[]; errors: string[] };

/**
 * يحوّل نصًا منسوخًا من Excel (أعمدة مفصولة بـ Tab بترتيب INFATH_PASTE_COLUMNS) إلى صفوف.
 * يتخطى صف العناوين. لا يُسقط صفًا بصمت: كل صف لا يُفهم يظهر في errors برقمه.
 */
export function parseInfathPaste(text: string, makeId: () => string): PasteResult {
  const rows: InfathAuctionInput[] = [];
  const errors: string[] = [];
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  lines.forEach((line, index) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/\s*[,،;]\s*/)).map((c) => c.trim());
    if (index === 0 && normalizeArabic(cells[0] || "") === normalizeArabic("التاريخ")) return;
    const label = `السطر ${index + 1}`;
    const [dateRaw, timeRaw, city, regionRaw, assetType, categoryRaw, countRaw, formatRaw, url] = cells;
    const date = parsePasteDate(dateRaw || "");
    const time = parsePasteTime(timeRaw || "");
    const region = matchLabel(INFATH_REGIONS, regionRaw || "", REGION_ALIASES);
    const category = matchLabel(INFATH_CATEGORIES, categoryRaw || "", CATEGORY_ALIASES);
    const format = matchLabel(INFATH_FORMATS, formatRaw || "", FORMAT_ALIASES);
    // نزيل فواصل الآلاف فقط؛ «10.0» أو «-5» لا تتحول إلى أعداد أخرى بل تُرفض.
    const countText = latinDigits(countRaw || "").replace(/[,٬\s]/g, "");
    const count = /^\d+$/.test(countText) ? Number(countText) : 0;
    const problems: string[] = [];
    if (!date) problems.push("التاريخ");
    if (!time) problems.push("الوقت");
    if (!city) problems.push("المدينة");
    if (!region) problems.push("المنطقة");
    if (!assetType) problems.push("نوع الأصل");
    if (!category) problems.push("الفئة");
    if (!count) problems.push("عدد الأصول");
    if (!format) problems.push("الصيغة");
    if (problems.length) {
      errors.push(`${label}: لم نفهم ${problems.join("، ")}`);
      return;
    }
    rows.push({
      id: makeId(),
      date: date!,
      time: time!,
      city: city!,
      region: region!,
      assetType: assetType!,
      category: category!,
      assetsCount: count,
      format: format!,
      url: url && /^https:\/\//i.test(url) ? url : null,
      resultStatus: "scheduled",
      assetsSold: null,
      soldValue: null,
    });
  });
  return { rows, errors };
}
