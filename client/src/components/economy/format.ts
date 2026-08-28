/** تنسيق أرقام قسم الاقتصاد — أرقام غربية كما هو معمول به في سبق. */
export function fmtSar(riyals: number, digits = 2): string {
  if (Math.abs(riyals) >= 1e9) return `${trimNum(riyals / 1e9, digits)} مليار`;
  if (Math.abs(riyals) >= 1e6) return `${trimNum(riyals / 1e6, 1)} مليون`;
  return Math.round(riyals).toLocaleString("en-US");
}

export function fmtCount(n: number): string {
  if (n >= 1e6) return `${trimNum(n / 1e6, 1)} مليون`;
  if (n >= 1e3) return `${trimNum(n / 1e3, 0)} ألف`;
  return Math.round(n).toLocaleString("en-US");
}

export function trimNum(n: number, d: number): string {
  return Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
}

export function fmtPct(p: number | null | undefined, d = 1): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  return `${trimNum(Math.abs(p), d)}%`;
}

export function fmtRate(r: number): string {
  if (r >= 100) return trimNum(r, 2);
  if (r >= 1) return trimNum(r, 4);
  return trimNum(r, 5);
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "2026-08-28" → "28 أغسطس 2026" */
export function fmtDateAr(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const month = MONTHS_AR[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month}${withYear ? ` ${m[1]}` : ""}`;
}

/** "2026-08-28" → "أغسطس 2026" */
export function fmtMonthAr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return iso;
  return `${MONTHS_AR[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export function relativeAr(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const h = Math.round(min / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.round(h / 24);
  return `قبل ${d} ي`;
}
