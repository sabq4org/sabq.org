/**
 * محلّل «عرض النقود الأسبوعي» (PDF صفحة واحدة): ن1/ن2/ن3 بالتغير الأسبوعي ومنذ بداية
 * العام، ومخطط ن3 بالمليار ريال (نقاط بتواريخها).
 */
import { extractPdfPages } from "../pdfText";

export interface MoneySupplyReport {
  /** ISO — «كما في» */
  asOf: string;
  aggregates: { key: "M1" | "M2" | "M3"; weeklyChangePct: number; periodChangePct: number }[];
  /** آخر قيمة لن3 بالمليار ريال */
  m3Billion: number | null;
  /** نقاط المخطط بترتيب زمني */
  m3Series: { label: string; value: number }[];
}

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

export async function parseMoneySupplyReport(pdf: Buffer | Uint8Array): Promise<MoneySupplyReport> {
  const [page] = await extractPdfPages(pdf);
  if (!page) throw new Error("Money supply report: empty PDF");
  const lines = page.lines;

  const asOfLine = lines.find((l) => /As of\s+\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3}\s+\d{4}/.test(l.text));
  const asOfM = asOfLine?.text.match(/As of\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!asOfM) throw new Error("Money supply report: 'As of' date not found");
  const asOf = `${asOfM[3]}-${String(MONTHS[asOfM[2]]).padStart(2, "0")}-${asOfM[1].padStart(2, "0")}`;

  const aggregates: MoneySupplyReport["aggregates"] = [];
  for (const key of ["M1", "M2", "M3"] as const) {
    const l = lines.find((x) => new RegExp(`^${key}\\s+-?\\d`).test(x.text));
    const m = l?.text.match(/^M\d\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/);
    if (!m) throw new Error(`Money supply report: ${key} row not found`);
    aggregates.push({ key, weeklyChangePct: Number(m[1]), periodChangePct: Number(m[2]) });
  }

  // نقاط المخطط: أرقام بصيغة 3,398 وأعلى من محور y (المحور قيم مستديرة مثل 3,400)
  const items = lines.flatMap((l) => l.items);
  const dateItems = items
    .filter((i) => /^\d{1,2}(st|nd|rd|th)\s+[A-Za-z]{3}\s+\d{4}$/.test(i.str))
    .sort((a, b) => a.x - b.x);
  // إسقاط قيم المحور (مضاعفات 50) ثم مطابقة كل قيمة بأقرب تاريخ أفقيًا
  const chartValues = items
    .filter((i) => /^\d,\d{3}$/.test(i.str) && Number(i.str.replace(",", "")) % 50 !== 0)
    .sort((a, b) => a.x - b.x);
  const m3Series = chartValues.map((v) => {
    let best = dateItems[0];
    for (const d of dateItems) if (best === undefined || Math.abs(d.x - v.x) < Math.abs(best.x - v.x)) best = d;
    return { label: best?.str ?? "", value: Number(v.str.replace(",", "")) };
  });
  const m3Billion = m3Series.length ? m3Series[m3Series.length - 1].value : null;

  return { asOf, aggregates, m3Billion, m3Series };
}
