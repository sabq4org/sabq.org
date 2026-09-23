/**
 * محلّل «النشرة الإحصائية الشهرية» (Excel، ~100 ورقة، تاريخ شهري كامل).
 *
 * كل ورقة جدول واحد: صفوف ترويسة ثم صفوف بيانات؛ عمود الفترة (A) إما سنة (رقم) أو
 * تاريخ نهاية الشهر (Date) أو "Q1" مع السنة في العمود B. نقرأ أعمدة محددة من أوراق
 * محددة إلى سلاسل شهرية/ربعية موحّدة، ولا نلمس الجداول الفنية.
 */
import ExcelJS from "exceljs";

export type Period = string; // "2026-06" | "2026-Q2" | "2026"

export interface SeriesPoint {
  period: Period;
  value: number;
}

export type MonthlyMetricKey =
  | "pos.sales" | "pos.count" | "pos.terminals" | "pos.nfcMobileSales" | "pos.nfcCardSales" | "pos.nfcMobileCount" | "pos.nfcCardCount"
  | "ecom.sales" | "ecom.count"
  | "atm.count" | "atm.cards" | "atm.cashWithdrawals"
  | "mortgage.contracts" | "mortgage.houses" | "mortgage.apartments" | "mortgage.land" | "mortgage.total"
  | "deposits.demand" | "deposits.timeSavings" | "deposits.total"
  | "money.m3" | "money.currencyOutside"
  | "cpi.general" | "cpi.food" | "cpi.tobacco" | "cpi.clothing" | "cpi.housing" | "cpi.furnishings" | "cpi.health" | "cpi.transport" | "cpi.communication" | "cpi.recreation" | "cpi.education" | "cpi.restaurants" | "cpi.insurance" | "cpi.personalCare"
  | "sadad.count" | "sadad.value"
  | "instant.value" | "instant.count"
  | "remittanceCenters" | "cheques.count" | "cheques.value";

export type QuarterlyMetricKey =
  | "consumer.total" | "consumer.creditCards" | "consumer.education" | "consumer.vehicles" | "consumer.furniture" | "consumer.travel"
  | "bop.workersRemittances" | "bop.travelNet" | "bop.currentAccount";

interface ColDef { sheet: string; col: number; scale: number }

/** القيم تُحوَّل إلى الوحدة الطبيعية: ريال / عدد. */
const SAR_THOUSAND = 1_000;
const SAR_MILLION = 1_000_000;

export const MONTHLY_COLUMNS: Record<MonthlyMetricKey, ColDef> = {
  "pos.sales": { sheet: "30c", col: 2, scale: SAR_THOUSAND },
  "pos.count": { sheet: "30c", col: 3, scale: 1 },
  "pos.terminals": { sheet: "30c", col: 4, scale: 1 },
  "pos.nfcMobileCount": { sheet: "30c", col: 5, scale: 1 },
  "pos.nfcCardCount": { sheet: "30c", col: 6, scale: 1 },
  "pos.nfcMobileSales": { sheet: "30c", col: 7, scale: SAR_THOUSAND },
  "pos.nfcCardSales": { sheet: "30c", col: 8, scale: SAR_THOUSAND },
  "ecom.sales": { sheet: "30c", col: 9, scale: SAR_THOUSAND },
  "ecom.count": { sheet: "30c", col: 10, scale: 1 },
  "atm.count": { sheet: "30a", col: 2, scale: 1 },
  "atm.cards": { sheet: "30a", col: 3, scale: 1 },
  "atm.cashWithdrawals": { sheet: "30a", col: 13, scale: SAR_MILLION },
  "mortgage.contracts": { sheet: "12f", col: 2, scale: 1 },
  "mortgage.houses": { sheet: "12f", col: 3, scale: SAR_MILLION },
  "mortgage.apartments": { sheet: "12f", col: 4, scale: SAR_MILLION },
  "mortgage.land": { sheet: "12f", col: 5, scale: SAR_MILLION },
  "mortgage.total": { sheet: "12f", col: 6, scale: SAR_MILLION },
  "deposits.demand": { sheet: "11", col: 2, scale: SAR_MILLION },
  "deposits.timeSavings": { sheet: "11", col: 5, scale: SAR_MILLION },
  "deposits.total": { sheet: "11", col: 15, scale: SAR_MILLION },
  "money.m3": { sheet: "3", col: 8, scale: SAR_MILLION },
  "money.currencyOutside": { sheet: "3", col: 2, scale: SAR_MILLION },
  "cpi.general": { sheet: "8-1", col: 2, scale: 1 },
  "cpi.food": { sheet: "8-1", col: 3, scale: 1 },
  "cpi.tobacco": { sheet: "8-1", col: 4, scale: 1 },
  "cpi.clothing": { sheet: "8-1", col: 5, scale: 1 },
  "cpi.housing": { sheet: "8-1", col: 6, scale: 1 },
  "cpi.furnishings": { sheet: "8-1", col: 7, scale: 1 },
  "cpi.health": { sheet: "8-1", col: 8, scale: 1 },
  "cpi.transport": { sheet: "8-1", col: 9, scale: 1 },
  "cpi.communication": { sheet: "8-1", col: 10, scale: 1 },
  "cpi.recreation": { sheet: "8-1", col: 11, scale: 1 },
  "cpi.education": { sheet: "8-1", col: 12, scale: 1 },
  "cpi.restaurants": { sheet: "8-1", col: 13, scale: 1 },
  "cpi.insurance": { sheet: "8-1", col: 14, scale: 1 },
  "cpi.personalCare": { sheet: "8-1", col: 15, scale: 1 },
  "sadad.count": { sheet: "28a", col: 4, scale: 1 },
  "sadad.value": { sheet: "28b", col: 4, scale: SAR_THOUSAND },
  "instant.value": { sheet: "27a", col: 10, scale: SAR_MILLION },
  "instant.count": { sheet: "27b", col: 10, scale: 1 },
  remittanceCenters: { sheet: "29c", col: 10, scale: 1 },
  "cheques.count": { sheet: "26a", col: 2, scale: 1_000 },
  "cheques.value": { sheet: "26a", col: 3, scale: SAR_MILLION },
};

export const QUARTERLY_COLUMNS: Record<Exclude<QuarterlyMetricKey, `bop.${string}`>, ColDef> = {
  "consumer.total": { sheet: "13a", col: 9, scale: SAR_MILLION },
  "consumer.creditCards": { sheet: "13a", col: 10, scale: SAR_MILLION },
  "consumer.education": { sheet: "13a", col: 5, scale: SAR_MILLION },
  "consumer.vehicles": { sheet: "13a", col: 3, scale: SAR_MILLION },
  "consumer.furniture": { sheet: "13a", col: 4, scale: SAR_MILLION },
  "consumer.travel": { sheet: "13a", col: 7, scale: SAR_MILLION },
};

/** صفوف ميزان المدفوعات (الورقة 7-1) بعناوينها كما تطبعها ساما. */
const BOP_ROWS: Record<Extract<QuarterlyMetricKey, `bop.${string}`>, RegExp> = {
  "bop.workersRemittances": /Workers.? remittances/i,
  "bop.travelNet": /^1\.A\.b\.2 Travel/i,
  "bop.currentAccount": /^1\. Current account/i,
};

export interface MonthlyBulletin {
  /** آخر شهر في البيانات — "2026-06" */
  latestMonth: Period;
  monthly: Record<MonthlyMetricKey, SeriesPoint[]>;
  quarterly: Record<QuarterlyMetricKey, SeriesPoint[]>;
}

type Row = unknown[];

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) && v.trim() !== "" && !/^-+$/.test(v.trim()) ? n : null;
  }
  return null;
}

/** تاريخ نهاية الشهر يأتي بصيغة 2026-06-29T20:59:08Z (= 30 يونيو بتوقيت الرياض). */
function monthOfDate(d: Date): Period {
  const t = new Date(d.getTime() + 3 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodOf(row: Row): { kind: "month" | "quarter" | "year"; period: Period } | null {
  const a = row[0];
  if (a instanceof Date && !Number.isNaN(a.getTime())) return { kind: "month", period: monthOfDate(a) };
  if (typeof a === "number" && a >= 1950 && a <= 2100 && Number.isInteger(a)) return { kind: "year", period: String(a) };
  if (typeof a === "string") {
    const q = a.trim().match(/^Q([1-4])$/i);
    const y = num(row[1]);
    if (q && y) return { kind: "quarter", period: `${y}-Q${q[1]}` };
    const qy = a.trim().match(/^Q([1-4])\s+(\d{4})$/i);
    if (qy) return { kind: "quarter", period: `${qy[2]}-Q${qy[1]}` };
  }
  return null;
}

/** يحوّل قيمة خلية exceljs إلى قيمة بدائية (تاريخ/رقم/نص) أو null. */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return typeof v.text === "string" ? v.text : cellValue(v.text as ExcelJS.CellValue);
    if ("error" in v) return null;
  }
  return null;
}

function sheetRows(wb: ExcelJS.Workbook, name: string): Row[] {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Monthly bulletin: sheet "${name}" missing — layout changed?`);
  const rows: Row[] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = row.values as ExcelJS.CellValue[]; // exceljs: الفهرس 1 = العمود A
    const out: unknown[] = [];
    for (let c = 1; c < values.length; c++) out[c - 1] = cellValue(values[c]);
    rows[rowNumber - 1] = out;
  });
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

function columnSeries(rows: Row[], col: number, scale: number, kind: "month" | "quarter"): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const row of rows) {
    const p = periodOf(row);
    if (!p || p.kind !== kind) continue;
    const v = num(row[col]);
    if (v === null) continue;
    out.push({ period: p.period, value: v * scale });
  }
  // ساما تكرر الفترة أحيانًا (ربع + شهر بنفس التاريخ) — نحتفظ بآخر قيمة لكل فترة
  const dedup = new Map<Period, number>();
  for (const pt of out) dedup.set(pt.period, pt.value);
  return Array.from(dedup, ([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period));
}

/** ميزان المدفوعات: الأعمدة فترات (ترويسة تواريخ/أرباع) والصفوف بنود. */
function bopSeries(rows: Row[], labelRe: RegExp): SeriesPoint[] {
  const out = new Map<Period, number>();
  let headerPeriods: (Period | null)[] = [];
  for (const row of rows) {
    const cells = row.map((c) => {
      if (c instanceof Date) return { kind: "year", period: String(new Date(c.getTime() + 3 * 3600_000).getUTCFullYear()) };
      if (typeof c === "string") {
        const m = c.trim().match(/^Q([1-4])\s+(\d{4})$/i);
        if (m) return { kind: "quarter", period: `${m[2]}-Q${m[1]}` };
      }
      return null;
    });
    if (cells.filter(Boolean).length >= 3) {
      headerPeriods = cells.map((c) => (c && c.kind === "quarter" ? c.period : null));
      continue;
    }
    const label = typeof row[0] === "string" ? row[0].trim() : "";
    if (!label || !labelRe.test(label)) continue;
    headerPeriods.forEach((period, i) => {
      if (!period) return;
      const v = num(row[i]);
      if (v !== null) out.set(period, v * SAR_MILLION);
    });
  }
  return Array.from(out, ([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period));
}

export async function parseMonthlyBulletin(buffer: Buffer | Uint8Array): Promise<MonthlyBulletin> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const cache = new Map<string, Row[]>();
  const rowsOf = (name: string) => {
    if (!cache.has(name)) cache.set(name, sheetRows(wb, name));
    return cache.get(name)!;
  };

  const monthly = {} as Record<MonthlyMetricKey, SeriesPoint[]>;
  for (const [key, def] of Object.entries(MONTHLY_COLUMNS) as [MonthlyMetricKey, ColDef][]) {
    monthly[key] = columnSeries(rowsOf(def.sheet), def.col, def.scale, "month");
  }
  const quarterly = {} as Record<QuarterlyMetricKey, SeriesPoint[]>;
  for (const [key, def] of Object.entries(QUARTERLY_COLUMNS) as [QuarterlyMetricKey, ColDef][]) {
    quarterly[key] = columnSeries(rowsOf(def.sheet), def.col, def.scale, "quarter");
  }
  const bopRows = rowsOf("7-1");
  for (const [key, re] of Object.entries(BOP_ROWS) as [QuarterlyMetricKey, RegExp][]) {
    quarterly[key] = bopSeries(bopRows, re);
  }

  const latest = monthly["pos.sales"].at(-1)?.period;
  if (!latest) throw new Error("Monthly bulletin: no monthly POS rows parsed");
  // فحوص اتساق أساسية
  const must: MonthlyMetricKey[] = ["atm.count", "mortgage.contracts", "deposits.total", "cpi.general", "sadad.count"];
  for (const k of must) {
    if (!monthly[k].some((p) => p.period === latest)) throw new Error(`Monthly bulletin: ${k} has no value for ${latest}`);
  }
  return { latestMonth: latest, monthly, quarterly };
}
