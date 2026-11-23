// تقرير البحث الأسبوعي (Search Console): منطق نقي مشترك بين الخادم والواجهة.
// يرتّب ثلاث فرص بقواعد ثابتة (بلا ذكاء اصطناعي)، ويقيس تجربة الأسبوع السابق.
// لا شيء هنا ينفّذ تعديلًا على الموقع: كل فرصة تنتظر قرار المسؤول.

export type GscMetrics = { clicks: number; impressions: number; ctr: number; position: number };
export type GscPageRow = GscMetrics & { page: string };

export type OpportunityLane = "low_ctr" | "section_drop" | "english";
export type OpportunityStatus = "proposed" | "approved" | "ignored";
export type ExperimentVerdict = "continue" | "extend" | "stop";

export type SeoOpportunity = {
  key: string;
  lane: OpportunityLane;
  url: string;
  path: string;
  title: string | null;
  metrics: GscMetrics;
  previous: GscMetrics | null;
  why: string;
  test: string;
  targetCtr: number | null;
  expectedGain: number;
  status: OpportunityStatus;
  decidedAt?: string | null;
  decidedBy?: string | null;
};

export type SeoExperimentReview = {
  key: string;
  fromReportId: string;
  lane: OpportunityLane;
  url: string;
  path: string;
  title: string | null;
  test: string;
  baseline: GscMetrics;
  current: GscMetrics | null;
  clicksDelta: number | null;
  ctrDelta: number | null;
  suggestion: ExperimentVerdict;
  verdict: ExperimentVerdict | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
};

export type SeoTitleRow = GscMetrics & { url: string; path: string; title: string | null };

export type SeoWeeklyPayload = {
  totals: { current: GscMetrics; previous: GscMetrics };
  english: { current: GscMetrics; previous: GscMetrics };
  home: GscMetrics | null;
  opportunities: SeoOpportunity[];
  winners: SeoTitleRow[];
  lesson: SeoTitleRow | null;
  reviews: SeoExperimentReview[];
};

export const LANE_LABELS: Record<OpportunityLane, string> = {
  low_ctr: "ظهور عالٍ ونقرات ضعيفة",
  section_drop: "قسم يتراجع",
  english: "النسخة الإنجليزية",
};

export const VERDICT_LABELS: Record<ExperimentVerdict, string> = {
  continue: "نكمل ونعمّمها",
  extend: "نمدّد أسبوعًا",
  stop: "نوقف ونرجع",
};

export const EMPTY_METRICS: GscMetrics = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * فترة التقرير مثبتة على أحد التقرير الأسبوعي (آخر أحد بتوقيت الرياض حتى اليوم): سبعة أيام
 * تنتهي قبل الأحد بثلاثة أيام (بيانات Search Console تتأخر يومين إلى ثلاثة)، والسبعة التي قبلها
 * للمقارنة. التحديث اليدوي في أي يوم من الأسبوع يعيد الفترة نفسها، فلا تتداخل التقارير.
 */
export function reportPeriod(now: Date = new Date()) {
  const riyadh = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const today = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate());
  const sunday = today - riyadh.getUTCDay() * DAY_MS;
  const end = new Date(sunday - 3 * DAY_MS);
  const start = new Date(end.getTime() - 6 * DAY_MS);
  const prevEnd = new Date(start.getTime() - DAY_MS);
  const prevStart = new Date(prevEnd.getTime() - 6 * DAY_MS);
  return { start: isoDay(start), end: isoDay(end), prevStart: isoDay(prevStart), prevEnd: isoDay(prevEnd) };
}

export type PageKind = "home" | "article" | "category" | "en_home" | "en_article" | "en_category" | "en_other" | "other";

export function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p.length > 1 ? p.replace(/\/+$/, "") : "/";
  } catch {
    return url;
  }
}

export function pageKind(path: string): PageKind {
  if (path === "/") return "home";
  if (path === "/en") return "en_home";
  if (path.startsWith("/en/article/")) return "en_article";
  if (path.startsWith("/en/category/")) return "en_category";
  if (path.startsWith("/en/")) return "en_other";
  if (path.startsWith("/article/")) return "article";
  if (path.startsWith("/category/")) return "category";
  return "other";
}

/** نسبة النقر المتوقعة تقريبًا لكل موضع (تقدير محافظ لموقع إخباري). */
export function expectedCtr(position: number): number {
  if (position <= 1.5) return 0.2;
  if (position <= 2.5) return 0.12;
  if (position <= 3.5) return 0.08;
  if (position <= 5) return 0.05;
  if (position <= 10) return 0.025;
  return 0.01;
}

/** هدف التجربة: مضاعفة النسبة الحالية (نقطة مئوية واحدة على الأقل) دون تجاوز المتوقع للموضع. */
export function targetCtrFor(ctr: number, position: number): number {
  return Math.min(expectedCtr(position), Math.max(ctr * 2, ctr + 0.01));
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtPct = (ctr: number) => `${(ctr * 100).toFixed(1)}%`;
export const fmtPos = (p: number) => p.toFixed(1);
export function fmtChange(current: number, previous: number): string {
  if (!previous) return current ? "جديد" : "0%";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
}

export type OpportunityOptions = {
  /** حد أدنى للظهور لفرص «ظهور عالٍ ونقرات ضعيفة» */
  minImpressions?: number;
  /** روابط تحت تجربة قائمة لا تُقترح ثانية */
  exclude?: Set<string>;
  limit?: number;
};

type Candidate = Omit<SeoOpportunity, "status" | "title" | "key"> & { title?: string | null };

export function buildOpportunities(
  current: GscPageRow[],
  previous: GscPageRow[],
  opts: OpportunityOptions = {},
): SeoOpportunity[] {
  const minImpressions = opts.minImpressions ?? 20000;
  const exclude = opts.exclude ?? new Set<string>();
  const limit = opts.limit ?? 3;
  const prevByUrl = new Map(previous.map((r) => [r.page, r]));
  const candidates: Candidate[] = [];

  for (const row of current) {
    if (exclude.has(row.page)) continue;
    const path = pathOf(row.page);
    const kind = pageKind(path);
    const prev = prevByUrl.get(row.page) ?? null;
    const metrics: GscMetrics = { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
    const previousMetrics = prev ? { clicks: prev.clicks, impressions: prev.impressions, ctr: prev.ctr, position: prev.position } : null;

    // 1) صفحات ثابتة (لا أخبار ولا رئيسية) في أعلى النتائج ونسبة نقرها أقل من نصف المتوقع
    if ((kind === "category" || kind === "other") && row.impressions >= minImpressions && row.position <= 5) {
      const exp = expectedCtr(row.position);
      if (row.ctr < exp * 0.5) {
        const target = targetCtrFor(row.ctr, row.position);
        candidates.push({
          lane: "low_ctr",
          url: row.page,
          path,
          metrics,
          previous: previousMetrics,
          targetCtr: target,
          expectedGain: Math.round(row.impressions * (target - row.ctr)),
          why: `تظهر في الموضع ${fmtPos(row.position)} ونسبة النقر ${fmtPct(row.ctr)}، والمتوقع لهذا الموضع نحو ${fmtPct(exp)}. الأرجح أن عنوانها ووصفها في نتيجة البحث لا يوضحان ما يجده القارئ فيها.`,
          test: "عنوان ووصف بحث جديدان للصفحة يوضحان ما فيها الآن (أحدث ما نُشر ووقت التحديث).",
        });
        continue;
      }
    }

    // 2) قسم عربي نزلت نقراته 10% أو أكثر عن الأسبوع السابق
    if (kind === "category" && prev && prev.clicks >= 200 && row.clicks <= prev.clicks * 0.9) {
      candidates.push({
        lane: "section_drop",
        url: row.page,
        path,
        metrics,
        previous: previousMetrics,
        targetCtr: null,
        expectedGain: Math.round(prev.clicks - row.clicks),
        why: `النقرات نزلت من ${fmtInt(prev.clicks)} إلى ${fmtInt(row.clicks)} (${fmtChange(row.clicks, prev.clicks)})، والظهور ${fmtChange(row.impressions, prev.impressions)}.`,
        test: "وصف بحث للقسم يذكر موضوعاته بأسمائها، ومراجعة روابطه الداخلية من الرئيسية والأخبار.",
      });
      continue;
    }

    // 3) صفحات إنجليزية في الصفحة الثانية من Google بظهور جيد: الأقرب للصعود
    if (kind.startsWith("en_") && row.position >= 8 && row.position <= 20 && row.impressions >= 500) {
      const target = expectedCtr(5);
      const gain = Math.round(row.impressions * Math.max(0, target - row.ctr));
      if (gain > 0) {
        candidates.push({
          lane: "english",
          url: row.page,
          path,
          metrics,
          previous: previousMetrics,
          targetCtr: target,
          expectedGain: gain,
          why: `في الموضع ${fmtPos(row.position)} بظهور ${fmtInt(row.impressions)}: قريبة من الصفحة الأولى.`,
          test: "روابط داخلية إليها من صفحات /en الأقوى، ومراجعة عنوانها ووصفها الإنجليزيين.",
        });
      }
    }
  }

  candidates.sort((a, b) => b.expectedGain - a.expectedGain);
  const picked: Candidate[] = [];
  // الأفضل من كل مسار أولًا، ثم الأعلى أثرًا لملء الباقي
  for (const lane of ["low_ctr", "section_drop", "english"] as OpportunityLane[]) {
    const best = candidates.find((c) => c.lane === lane && !picked.includes(c));
    if (best) picked.push(best);
  }
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked
    .slice(0, limit)
    .sort((a, b) => b.expectedGain - a.expectedGain)
    .map((c) => ({ ...c, key: keyFor(c.lane, c.path), title: c.title ?? null, status: "proposed" as const }));
}

export function keyFor(lane: OpportunityLane, path: string): string {
  let h = 0;
  const s = `${lane}:${path}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${lane}-${(h >>> 0).toString(36)}`;
}

/** عناوين نجحت: أخبار عربية بنقرات جيدة ونسبة نقر 10% فأكثر. */
export function pickWinners(current: GscPageRow[], limit = 3): Omit<SeoTitleRow, "title">[] {
  return current
    .filter((r) => pageKind(pathOf(r.page)) === "article" && r.clicks >= 500 && r.ctr >= 0.1)
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, limit)
    .map((r) => ({ url: r.page, path: pathOf(r.page), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}

/** درس تحريري: خبر بظهور كبير خارج أول ثلاث نتائج ونسبة نقر ضعيفة. */
export function pickLesson(current: GscPageRow[]): Omit<SeoTitleRow, "title"> | null {
  const r = current
    .filter((x) => pageKind(pathOf(x.page)) === "article" && x.impressions >= 30000 && x.position > 3 && x.ctr < 0.05)
    .sort((a, b) => b.impressions - a.impressions)[0];
  return r ? { url: r.page, path: pathOf(r.page), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position } : null;
}

/** اقتراح الحكم على تجربة: ارتفاع نسبة النقر 0.3 نقطة فأكثر دون هبوط النقرات أكثر من 10% = نكمل. */
export function suggestVerdict(baseline: GscMetrics, current: GscMetrics | null): ExperimentVerdict {
  if (!current) return "extend";
  const ctrDelta = current.ctr - baseline.ctr;
  if (ctrDelta >= 0.003 && current.clicks >= baseline.clicks * 0.9) return "continue";
  if (ctrDelta <= -0.003) return "stop";
  return "extend";
}

export function buildReview(fromReportId: string, opp: SeoOpportunity, current: GscMetrics | null): SeoExperimentReview {
  return {
    key: opp.key,
    fromReportId,
    lane: opp.lane,
    url: opp.url,
    path: opp.path,
    title: opp.title,
    test: opp.test,
    baseline: opp.metrics,
    current,
    clicksDelta: current ? current.clicks - opp.metrics.clicks : null,
    ctrDelta: current ? current.ctr - opp.metrics.ctr : null,
    suggestion: suggestVerdict(opp.metrics, current),
    verdict: null,
  };
}

const STATIC_TITLES: Record<string, string> = {
  "/": "الصفحة الرئيسية",
  "/moment-by-moment": "لحظة بلحظة",
  "/en": "الرئيسية الإنجليزية",
  "/en/moment-by-moment": "Moment by moment",
};

export function staticTitle(path: string): string | null {
  return STATIC_TITLES[path] ?? null;
}
