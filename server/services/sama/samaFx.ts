/**
 * أسعار الصرف الرسمية من ساما (ريال لكل وحدة عملة) — يومية أيام العمل.
 * المصدر: PortalHandler.ashx (op=exchangeRates / op=exchangeHistoryByCode).
 */
import { parseSamaNumber, portalHandlerUrl, samaGetJson } from "./samaClient";

export interface FxRate {
  /** رمز ISO بلا "=" (USD, EUR…) */
  code: string;
  nameAr: string;
  /** ريال سعودي لكل وحدة */
  rate: number;
  prevRate: number | null;
  /** ISO yyyy-mm-dd */
  date: string;
  prevDate: string | null;
  /** تغير يومي % */
  changePct: number | null;
  isGcc: boolean;
}

export interface FxPoint {
  date: string;
  rate: number;
}

interface RawFx {
  CurrencyCode?: string;
  Title?: string;
  CurrencyRate?: number;
  PrevRate?: number;
  PrevDate?: string | null;
  IsGCC?: boolean;
  CurrencyDate?: string;
}

/** العملات التي تظهر في الشريط (بالترتيب) — البقية في صفحة العملات. */
export const FX_HEADLINE_CODES = ["USD", "EUR", "GBP", "AED", "KWD", "EGP", "INR", "PKR", "JPY", "CNY"] as const;

function isoDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normalize(items: RawFx[]): FxRate[] {
  const out: FxRate[] = [];
  for (const it of items) {
    const code = String(it.CurrencyCode ?? "").replace(/=+$/, "").trim().toUpperCase();
    const rate = parseSamaNumber(it.CurrencyRate);
    const date = isoDay(it.CurrencyDate);
    if (!code || rate === null || rate <= 0 || !date || date.startsWith("0001")) continue;
    const prevRate = parseSamaNumber(it.PrevRate);
    const prev = prevRate && prevRate > 0 ? prevRate : null;
    out.push({
      code,
      nameAr: String(it.Title ?? "").trim(),
      rate,
      prevRate: prev,
      date,
      prevDate: isoDay(it.PrevDate),
      changePct: prev ? ((rate - prev) / prev) * 100 : null,
      isGcc: Boolean(it.IsGCC),
    });
  }
  return out;
}

/** كل العملات بسعر اليوم (ساما تعطي ~30 عملة؛ limt كبير يجلبها كلها). */
export async function fetchFxToday(): Promise<FxRate[]> {
  const url = portalHandlerUrl({ op: "exchangeRates", isArabic: true, limt: 100 });
  const raw = await samaGetJson<unknown>(url);
  if (!Array.isArray(raw)) throw new Error("SAMA fx: response is not an array");
  const seen = new Set<string>();
  const rates = normalize(raw as RawFx[]).filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
  if (!rates.some((r) => r.code === "USD")) throw new Error("SAMA fx: USD missing — shape changed?");
  return rates;
}

/** تاريخ عملة يوميًا — تصاعديًا، آخر `days` يومًا. */
export async function fetchFxHistory(code: string, days = 90): Promise<FxPoint[]> {
  const clean = code.replace(/[^A-Za-z]/g, "").toUpperCase();
  const url = portalHandlerUrl({ op: "exchangeHistoryByCode", curr: `${clean}=` });
  const raw = await samaGetJson<unknown>(url);
  if (!Array.isArray(raw)) throw new Error(`SAMA fx history ${clean}: not an array`);
  const pts: FxPoint[] = [];
  for (const r of raw as { CurrencyRate?: number; CurrencyDate?: string }[]) {
    const rate = parseSamaNumber(r.CurrencyRate);
    const date = isoDay(r.CurrencyDate);
    if (rate === null || !date) continue;
    pts.push({ date, rate });
  }
  pts.sort((a, b) => a.date.localeCompare(b.date));
  return pts.slice(-Math.max(1, days));
}
