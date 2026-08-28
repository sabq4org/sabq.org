/**
 * المؤشرات الخمسة التي تعرضها صفحة ساما الرئيسية + سلاسلها التاريخية.
 * المصدر: PortalHandler.ashx (op=getMultiListItems / op=LoadItems&viewName=Chart).
 *
 * الحقول الرقمية في السلاسل تختلف باسم القائمة (SAMAOfficialRepoRate،
 * SAMAInflationRate…) والعناوين غير موحّدة تاريخيًا — لذلك نعتمد الحقول لا العناوين.
 */
import { parseSamaDate, parseSamaNumber, portalHandlerUrl, samaGetJson } from "./samaClient";

export const ECONOMY_INDICATOR_KEYS = ["repo", "reverseRepo", "inflation", "gdp", "m3Growth"] as const;
export type EconomyIndicatorKey = (typeof ECONOMY_INDICATOR_KEYS)[number];

interface IndicatorDef {
  key: EconomyIndicatorKey;
  listUrl: string;
  /** اسم الحقل الرقمي في استجابة viewName=Chart */
  valueField: string;
  /** اسم حقل التاريخ في السلسلة */
  dateField: string;
  titleAr: string;
  shortAr: string;
  unit: "%";
  cadence: "decision" | "monthly" | "quarterly";
}

export const INDICATOR_DEFS: Record<EconomyIndicatorKey, IndicatorDef> = {
  repo: {
    key: "repo",
    listUrl: "/ar-sa/MonetaryPolicy/Lists/OfficialRepoRate",
    valueField: "SAMAOfficialRepoRate",
    dateField: "SAMAPublishDate",
    titleAr: "معدل اتفاقية إعادة الشراء (الريبو)",
    shortAr: "الريبو",
    unit: "%",
    cadence: "decision",
  },
  reverseRepo: {
    key: "reverseRepo",
    listUrl: "/ar-sa/MonetaryPolicy/Lists/ReverseRepoRate",
    valueField: "SAMAReverseRepoRate",
    dateField: "SAMAPublishDate",
    titleAr: "معدل اتفاقية إعادة الشراء المعاكس",
    shortAr: "الريبو العكسي",
    unit: "%",
    cadence: "decision",
  },
  inflation: {
    key: "inflation",
    listUrl: "/ar-sa/Statistics/Indices/Lists/InflationRate",
    valueField: "SAMAInflationRate",
    dateField: "SAMALastUpdatedDate",
    titleAr: "معدل التضخم السنوي",
    shortAr: "التضخم",
    unit: "%",
    cadence: "monthly",
  },
  gdp: {
    key: "gdp",
    listUrl: "/ar-sa/Statistics/Indices/Lists/GrossDomesticIncome",
    valueField: "SAMAGDPRate",
    dateField: "SAMALastUpdatedDate",
    titleAr: "نمو الناتج المحلي الإجمالي (سنوي)",
    shortAr: "نمو الناتج",
    unit: "%",
    cadence: "quarterly",
  },
  m3Growth: {
    key: "m3Growth",
    listUrl: "/ar-sa/Statistics/Indices/Lists/MoneySupply",
    valueField: "SAMAMoneySupplyRate",
    dateField: "SAMALastUpdatedDate",
    titleAr: "نمو عرض النقود (ن3) السنوي",
    shortAr: "عرض النقود",
    unit: "%",
    cadence: "monthly",
  },
};

export interface IndicatorSnapshot {
  key: EconomyIndicatorKey;
  titleAr: string;
  shortAr: string;
  unit: "%";
  cadence: IndicatorDef["cadence"];
  value: number;
  /** النص كما تنشره ساما ("4.25%") */
  valueText: string;
  /** عنوان ساما للبيان — مفيد للخبر ("معدل التضخم لشهر يوليو 2026م") */
  samaTitle: string;
  /** ISO yyyy-mm-dd */
  asOf: string | null;
  quarter: string | null;
  year: string | null;
  sourceId: number | null;
}

export interface IndicatorPoint {
  date: string; // ISO
  value: number;
  label?: string;
}

interface RawMultiItem {
  Id?: number;
  ListUrl?: string;
  Title?: string;
  Rate?: string;
  Quarter?: string;
  Year?: string;
  LastUpdate?: string;
  LastUpdateDate?: string;
}

const LIST_TO_KEY: Record<string, EconomyIndicatorKey> = Object.fromEntries(
  ECONOMY_INDICATOR_KEYS.map((k) => [INDICATOR_DEFS[k].listUrl.toLowerCase(), k]),
) as Record<string, EconomyIndicatorKey>;

/** القيم الحالية للمؤشرات الخمسة دفعة واحدة. يرمي خطأً إن اختلّ شكل الاستجابة. */
export async function fetchIndicatorSnapshots(): Promise<IndicatorSnapshot[]> {
  const url = portalHandlerUrl({
    op: "getMultiListItems",
    listsUrl: ECONOMY_INDICATOR_KEYS.map((k) => INDICATOR_DEFS[k].listUrl).join(","),
    viewName: "Home",
    lang: "ar",
  });
  const raw = await samaGetJson<unknown>(url);
  if (!Array.isArray(raw)) throw new Error("SAMA indicators: response is not an array");

  const out: IndicatorSnapshot[] = [];
  for (const item of raw as RawMultiItem[]) {
    const key = LIST_TO_KEY[String(item.ListUrl || "").toLowerCase()];
    if (!key) continue;
    const value = parseSamaNumber(item.Rate);
    if (value === null) continue;
    const def = INDICATOR_DEFS[key];
    out.push({
      key,
      titleAr: def.titleAr,
      shortAr: def.shortAr,
      unit: def.unit,
      cadence: def.cadence,
      value,
      valueText: String(item.Rate ?? "").trim(),
      samaTitle: String(item.Title ?? "").trim(),
      asOf: parseSamaDate(item.LastUpdateDate),
      quarter: item.Quarter?.trim() || null,
      year: item.Year?.trim() || null,
      sourceId: typeof item.Id === "number" ? item.Id : null,
    });
  }
  if (out.length < ECONOMY_INDICATOR_KEYS.length) {
    const missing = ECONOMY_INDICATOR_KEYS.filter((k) => !out.some((o) => o.key === k));
    throw new Error(`SAMA indicators: missing ${missing.join(",")}`);
  }
  return out;
}

/** السلسلة التاريخية الكاملة لمؤشر — تصاعديًا بالتاريخ. */
export async function fetchIndicatorSeries(key: EconomyIndicatorKey): Promise<IndicatorPoint[]> {
  const def = INDICATOR_DEFS[key];
  const url = portalHandlerUrl({ op: "LoadItems", listUrl: def.listUrl, viewName: "Chart" });
  const raw = await samaGetJson<unknown>(url);
  if (!Array.isArray(raw)) throw new Error(`SAMA series ${key}: response is not an array`);
  const points: IndicatorPoint[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    const value = parseSamaNumber(row[def.valueField]);
    const date = parseSamaDate(String(row[def.dateField] ?? ""));
    if (value === null || !date) continue;
    points.push({ date, value, label: typeof row.Title === "string" ? row.Title : undefined });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  // أزل التكرار على نفس التاريخ (ساما تكرر أحيانًا صف الربع)
  return points.filter((p, i) => i === 0 || p.date !== points[i - 1].date);
}
