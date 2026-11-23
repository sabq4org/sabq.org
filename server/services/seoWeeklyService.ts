// تقرير البحث الأسبوعي: يقرأ Search Console بحساب الخدمة نفسه المستخدم لـ Indexing API
// (GOOGLE_INDEXING_CLIENT_EMAIL / GOOGLE_INDEXING_PRIVATE_KEY) بنطاق قراءة فقط، ويحفظ تقريرًا لكل أسبوع.
// التكلفة: Search Console API مجاني، والترتيب بقواعد ثابتة في shared/seoWeekly.ts (بلا ذكاء اصطناعي).
// لا ينفّذ أي تعديل على الموقع ولا يطلب فهرسة: الفرص تنتظر قرار المسؤول.

import { desc, eq, inArray, lt, or } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "../db";
import { articles, categories, enArticles, enCategories, seoWeeklyReports, type SeoWeeklyReportRow } from "@shared/schema";
import {
  EMPTY_METRICS,
  LANE_LABELS,
  buildOpportunities,
  buildReview,
  fmtChange,
  fmtInt,
  fmtPct,
  fmtPos,
  pageKind,
  pathOf,
  pickLesson,
  pickWinners,
  reportPeriod,
  staticTitle,
  type ExperimentVerdict,
  type GscMetrics,
  type GscPageRow,
  type OpportunityStatus,
  type SeoExperimentReview,
  type SeoOpportunity,
  type SeoWeeklyPayload,
} from "@shared/seoWeekly";
import { normalizePrivateKey } from "./googleIndexingService";
import { sendEmailNotification } from "./email";

export class SeoWeeklyError extends Error {
  constructor(message: string, public status = 400, public code = "bad_request") {
    super(message);
  }
}

const SITE = process.env.GSC_SITE_URL || "sc-domain:sabq.org";
const SITE_ORIGIN = "https://sabq.org";
const DASHBOARD_URL = `${(process.env.DASHBOARD_PUBLIC_URL || SITE_ORIGIN).replace(/\/+$/, "")}/dashboard/seo-weekly`;
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

let jwt: InstanceType<typeof google.auth.JWT> | null = null;

function credentials() {
  const email = process.env.GSC_CLIENT_EMAIL || process.env.GOOGLE_INDEXING_CLIENT_EMAIL || "";
  const key = process.env.GSC_PRIVATE_KEY || process.env.GOOGLE_INDEXING_PRIVATE_KEY || "";
  return { email, key };
}

export function maskedServiceAccount(): string | null {
  const { email } = credentials();
  return email ? email.replace(/^(.{2}).*?(@.*)$/, "$1***$2") : null;
}

async function accessToken(): Promise<string> {
  const { email, key } = credentials();
  if (!email || !key) throw new SeoWeeklyError("حساب خدمة Google غير مضبوط على الخادم", 503, "not_configured");
  if (!jwt) jwt = new google.auth.JWT({ email, key: normalizePrivateKey(key), scopes: [SCOPE] });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new SeoWeeklyError("تعذر الحصول على رمز دخول Google", 502, "auth_failed");
  return token;
}

type GscQuery = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; operator: string; expression: string }> }>;
};

async function gscQuery(body: GscQuery): Promise<Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }>> {
  const token = await accessToken();
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "web", ...body }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = data.error?.message || `HTTP ${res.status}`;
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
      throw new SeoWeeklyError("واجهة Google Search Console API غير مفعّلة في مشروع Google Cloud لحساب الخدمة", 503, "api_disabled");
    }
    if (res.status === 403) {
      throw new SeoWeeklyError("حساب الخدمة ليس ضمن مستخدمي الموقع في Search Console", 503, "no_access");
    }
    throw new SeoWeeklyError(`Search Console: ${msg}`, 502, "gsc_error");
  }
  const data = (await res.json()) as { rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
  return data.rows ?? [];
}

function toMetrics(row?: { clicks: number; impressions: number; ctr: number; position: number }): GscMetrics {
  return row ? { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position } : { ...EMPTY_METRICS };
}

async function totals(startDate: string, endDate: string, contains?: string): Promise<GscMetrics> {
  const rows = await gscQuery({
    startDate,
    endDate,
    ...(contains ? { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: contains }] }] } : {}),
  });
  return toMetrics(rows[0]);
}

async function pages(startDate: string, endDate: string): Promise<GscPageRow[]> {
  const rows = await gscQuery({ startDate, endDate, dimensions: ["page"], rowLimit: 5000 });
  return rows.map((r) => ({ page: r.keys?.[0] ?? "", ...toMetrics(r) })).filter((r) => r.page);
}

async function pageMetrics(url: string, startDate: string, endDate: string): Promise<GscMetrics | null> {
  const rows = await gscQuery({
    startDate,
    endDate,
    dimensions: ["page"],
    dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: url }] }],
  });
  return rows[0] ? toMetrics(rows[0]) : null;
}

/** فحص الربط: استعلام صغير جدًا. */
export async function checkSeoWeeklyAccess(): Promise<{ ok: boolean; site: string; serviceAccount: string | null; code?: string; error?: string }> {
  const base = { site: SITE, serviceAccount: maskedServiceAccount() };
  try {
    const p = reportPeriod();
    await gscQuery({ startDate: p.start, endDate: p.end, rowLimit: 1 });
    return { ok: true, ...base };
  } catch (error) {
    const e = error instanceof SeoWeeklyError ? error : new SeoWeeklyError((error as Error).message, 502, "gsc_error");
    return { ok: false, ...base, code: e.code, error: e.message };
  }
}

/** عناوين الصفحات من قاعدة البيانات (أخبار وأقسام عربية وإنجليزية). */
async function resolveTitles(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const slugs = (prefix: string) =>
    paths.filter((p) => p.startsWith(prefix)).map((p) => decodeURIComponent(p.slice(prefix.length).split("/")[0] ?? "")).filter(Boolean);

  for (const p of paths) {
    const t = staticTitle(p);
    if (t) out.set(p, t);
  }
  const ar = slugs("/article/");
  if (ar.length) {
    const rows = await db
      .select({ slug: articles.slug, englishSlug: articles.englishSlug, title: articles.title })
      .from(articles)
      .where(or(inArray(articles.englishSlug, ar), inArray(articles.slug, ar)));
    for (const r of rows) {
      if (r.englishSlug) out.set(`/article/${r.englishSlug}`, r.title);
      out.set(`/article/${r.slug}`, r.title);
    }
  }
  const cat = slugs("/category/");
  if (cat.length) {
    const rows = await db
      .select({ slug: categories.slug, englishSlug: categories.englishSlug, name: categories.nameAr })
      .from(categories)
      .where(or(inArray(categories.englishSlug, cat), inArray(categories.slug, cat)));
    for (const r of rows) {
      if (r.englishSlug) out.set(`/category/${r.englishSlug}`, `قسم «${r.name}»`);
      out.set(`/category/${r.slug}`, `قسم «${r.name}»`);
    }
  }
  const enA = slugs("/en/article/");
  if (enA.length) {
    const rows = await db.select({ slug: enArticles.slug, title: enArticles.title }).from(enArticles).where(inArray(enArticles.slug, enA));
    for (const r of rows) out.set(`/en/article/${r.slug}`, r.title);
  }
  const enC = slugs("/en/category/");
  if (enC.length) {
    const rows = await db.select({ slug: enCategories.slug, name: enCategories.name }).from(enCategories).where(inArray(enCategories.slug, enC));
    for (const r of rows) out.set(`/en/category/${r.slug}`, `Section «${r.name}»`);
  }
  return out;
}

function extendedAsOpportunity(r: SeoExperimentReview): SeoOpportunity {
  return {
    key: r.key,
    lane: r.lane,
    url: r.url,
    path: r.path,
    title: r.title,
    metrics: r.baseline,
    previous: null,
    why: "",
    test: r.test,
    targetCtr: null,
    expectedGain: 0,
    status: "approved",
  };
}

export function reportPayload(row: SeoWeeklyReportRow): SeoWeeklyPayload {
  return row.payload as SeoWeeklyPayload;
}

export async function listSeoWeeklyReports() {
  const rows = await db.select().from(seoWeeklyReports).orderBy(desc(seoWeeklyReports.periodEnd)).limit(26);
  return {
    reports: rows.map((r) => ({ id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd, createdAt: r.createdAt })),
    latest: rows[0] ?? null,
  };
}

export async function getSeoWeeklyReport(id: string) {
  const [row] = await db.select().from(seoWeeklyReports).where(eq(seoWeeklyReports.id, id)).limit(1);
  if (!row) throw new SeoWeeklyError("التقرير غير موجود", 404, "not_found");
  return row;
}

/**
 * يبني تقرير الأسبوع المكتمل الأخير. إن وُجد تقرير للفترة نفسها يُعاد كما هو،
 * إلا مع force فتُحدّث الأرقام وتبقى القرارات المتخذة على الفرص نفسها.
 */
export async function generateSeoWeeklyReport(opts: { force?: boolean; actorId?: string | null; now?: Date } = {}): Promise<SeoWeeklyReportRow> {
  const p = reportPeriod(opts.now);
  const [existing] = await db.select().from(seoWeeklyReports).where(eq(seoWeeklyReports.periodEnd, p.end)).limit(1);
  if (existing && !opts.force) return existing;

  const [currentTotals, previousTotals, enCurrent, enPrevious, currentPages, previousPages] = await Promise.all([
    totals(p.start, p.end),
    totals(p.prevStart, p.prevEnd),
    totals(p.start, p.end, "sabq.org/en/"),
    totals(p.prevStart, p.prevEnd, "sabq.org/en/"),
    pages(p.start, p.end),
    pages(p.prevStart, p.prevEnd),
  ]);

  // تجارب الأسبوع السابق المعتمدة: تُقاس الآن ولا تُقترح ثانية
  const [prevReport] = await db
    .select()
    .from(seoWeeklyReports)
    .where(lt(seoWeeklyReports.periodEnd, p.end))
    .orderBy(desc(seoWeeklyReports.periodEnd))
    .limit(1);
  // المعتمدة في التقرير السابق، والممدّدة («نمدّد أسبوعًا») تُقاس ثانية على خط أساسها الأصلي
  const prevPayload = prevReport ? reportPayload(prevReport) : null;
  const approved: SeoOpportunity[] = [
    ...(prevPayload?.opportunities.filter((o) => o.status === "approved") ?? []),
    ...(prevPayload?.reviews.filter((r) => r.verdict === "extend").map(extendedAsOpportunity) ?? []),
  ];
  const reviews = [];
  for (const opp of approved) {
    reviews.push(buildReview(prevReport!.id, opp, await pageMetrics(opp.url, p.start, p.end)));
  }

  const opportunities = buildOpportunities(currentPages, previousPages, { exclude: new Set(approved.map((o) => o.url)) });
  const winners = pickWinners(currentPages);
  const lesson = pickLesson(currentPages);
  const home = currentPages.find((r) => pageKind(pathOf(r.page)) === "home") ?? null;

  const titles = await resolveTitles([...opportunities.map((o) => o.path), ...winners.map((w) => w.path), ...(lesson ? [lesson.path] : [])]);
  const payload: SeoWeeklyPayload = {
    totals: { current: currentTotals, previous: previousTotals },
    english: { current: enCurrent, previous: enPrevious },
    home: home ? toMetrics(home) : null,
    opportunities: opportunities.map((o) => {
      const kept = existing ? reportPayload(existing).opportunities.find((x) => x.key === o.key) : undefined;
      return { ...o, title: titles.get(o.path) ?? null, ...(kept ? { status: kept.status, test: kept.test, decidedAt: kept.decidedAt, decidedBy: kept.decidedBy } : {}) };
    }),
    winners: winners.map((w) => ({ ...w, title: titles.get(w.path) ?? null })),
    lesson: lesson ? { ...lesson, title: titles.get(lesson.path) ?? null } : null,
    reviews: reviews.map((r) => {
      const kept = existing ? reportPayload(existing).reviews.find((x) => x.key === r.key) : undefined;
      return kept?.verdict ? { ...r, verdict: kept.verdict, decidedAt: kept.decidedAt, decidedBy: kept.decidedBy } : r;
    }),
  };

  if (existing) {
    const [row] = await db
      .update(seoWeeklyReports)
      .set({ payload, updatedAt: new Date() })
      .where(eq(seoWeeklyReports.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(seoWeeklyReports)
    .values({ periodStart: p.start, periodEnd: p.end, payload, createdBy: opts.actorId ?? null })
    .returning();
  return row;
}

async function savePayload(row: SeoWeeklyReportRow, payload: SeoWeeklyPayload) {
  const [updated] = await db
    .update(seoWeeklyReports)
    .set({ payload, updatedAt: new Date() })
    .where(eq(seoWeeklyReports.id, row.id))
    .returning();
  return updated;
}

const STATUSES: OpportunityStatus[] = ["proposed", "approved", "ignored"];
const VERDICTS: ExperimentVerdict[] = ["continue", "extend", "stop"];

export async function updateSeoOpportunity(
  reportId: string,
  key: string,
  input: { status?: unknown; test?: unknown },
  actorId: string | null,
) {
  const row = await getSeoWeeklyReport(reportId);
  const payload = reportPayload(row);
  const opp = payload.opportunities.find((o) => o.key === key);
  if (!opp) throw new SeoWeeklyError("الفرصة غير موجودة", 404, "not_found");
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status as OpportunityStatus)) throw new SeoWeeklyError("قرار غير معروف");
    opp.status = input.status as OpportunityStatus;
    opp.decidedAt = opp.status === "proposed" ? null : new Date().toISOString();
    opp.decidedBy = opp.status === "proposed" ? null : actorId;
  }
  if (input.test !== undefined) {
    const test = String(input.test ?? "").trim();
    if (test.length < 5 || test.length > 500) throw new SeoWeeklyError("نص التجربة بين 5 و500 حرف");
    opp.test = test;
  }
  return savePayload(row, payload);
}

export async function setSeoExperimentVerdict(reportId: string, key: string, verdict: unknown, actorId: string | null) {
  const row = await getSeoWeeklyReport(reportId);
  const payload = reportPayload(row);
  const review = payload.reviews.find((r) => r.key === key);
  if (!review) throw new SeoWeeklyError("التجربة غير موجودة", 404, "not_found");
  if (verdict !== null && !VERDICTS.includes(verdict as ExperimentVerdict)) throw new SeoWeeklyError("حكم غير معروف");
  review.verdict = (verdict as ExperimentVerdict | null) ?? null;
  review.decidedAt = review.verdict ? new Date().toISOString() : null;
  review.decidedBy = review.verdict ? actorId : null;
  return savePayload(row, payload);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildSeoWeeklyEmail(row: Pick<SeoWeeklyReportRow, "periodStart" | "periodEnd" | "payload">) {
  const p = row.payload as SeoWeeklyPayload;
  const c = p.totals.current;
  const prev = p.totals.previous;
  const count = p.opportunities.length;
  const subject = `تقرير البحث الأسبوعي: ${fmtInt(c.clicks)} نقرة (${fmtChange(c.clicks, prev.clicks)})${count ? ` و${count} فرص تنتظر قرارك` : ""}`;
  const period = `${row.periodStart} → ${row.periodEnd}`;
  const oppLines = p.opportunities.map(
    (o, i) => `${i + 1}. ${o.title ?? o.path} — ${LANE_LABELS[o.lane]}: الموضع ${fmtPos(o.metrics.position)}، النقر ${fmtPct(o.metrics.ctr)}، الظهور ${fmtInt(o.metrics.impressions)}`,
  );
  const reviewLines = p.reviews.map(
    (r) => `تجربة «${r.title ?? r.path}»: النقر ${fmtPct(r.baseline.ctr)} ← ${r.current ? fmtPct(r.current.ctr) : "بلا بيانات"}`,
  );
  const text = [
    `تقرير البحث الأسبوعي (${period})`,
    `النقرات ${fmtInt(c.clicks)} (${fmtChange(c.clicks, prev.clicks)})، الظهور ${fmtInt(c.impressions)} (${fmtChange(c.impressions, prev.impressions)})، نسبة النقر ${fmtPct(c.ctr)}، الموضع ${fmtPos(c.position)}`,
    ...reviewLines,
    ...oppLines,
    `افتح التقرير واعتمد: ${DASHBOARD_URL}`,
    "صحيفة سبق",
  ].join("\n");
  const row2 = (label: string, value: string) =>
    `<tr><td style="padding:7px 0;border-top:1px solid #EEF2F6;color:#55667A">${label}</td><td style="padding:7px 0;border-top:1px solid #EEF2F6;text-align:left;font-weight:bold" dir="ltr">${value}</td></tr>`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F4F7FB;padding:24px;color:#1B2B3A">
  <div style="max-width:520px;margin:0 auto">
    <p style="margin:0 0 6px;color:#55667A;font-size:13px">تقرير البحث الأسبوعي · <span dir="ltr">${escapeHtml(period)}</span></p>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.5">النقرات <span dir="ltr">${fmtInt(c.clicks)}</span> (<span dir="ltr">${fmtChange(c.clicks, prev.clicks)}</span>)${count ? ` و${count} فرص تنتظر قرارك` : ""}</h1>
    <div style="background:#fff;border-radius:16px;padding:8px 16px;margin-bottom:10px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row2("الظهور", `${fmtInt(c.impressions)} · ${fmtChange(c.impressions, prev.impressions)}`)}
        ${row2("نسبة النقر", fmtPct(c.ctr))}
        ${row2("متوسط الموضع", fmtPos(c.position))}
        ${row2("النسخة الإنجليزية", `${fmtInt(p.english.current.clicks)} · ${fmtChange(p.english.current.clicks, p.english.previous.clicks)}`)}
      </table>
    </div>
    ${reviewLines.map((l) => `<div style="background:#fff;border-radius:16px;padding:12px 16px;margin-bottom:8px;font-size:14px">${escapeHtml(l)}</div>`).join("")}
    ${oppLines.map((l) => `<div style="background:#fff;border-radius:16px;padding:12px 16px;margin-bottom:8px;font-size:14px">${escapeHtml(l)}</div>`).join("")}
    <a href="${escapeHtml(DASHBOARD_URL)}" style="display:block;text-align:center;background:#1E9BE6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;margin-top:14px">افتح التقرير واعتمد</a>
    <p style="margin:18px 0 0;color:#8A99A8;font-size:12px">لا يُنفّذ شيء قبل اعتمادك. صحيفة سبق</p>
  </div>
</div>`;
  return { subject, text, html };
}

function recipients(): string[] {
  return (process.env.SEO_WEEKLY_REPORT_EMAILS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/** المهمة الأسبوعية: تبني التقرير مرة واحدة للفترة، وترسل البريد مرة واحدة. لا ترمي. */
export async function runSeoWeeklyJob(now: Date = new Date()): Promise<void> {
  try {
    const row = await generateSeoWeeklyReport({ now });
    if (row.emailedAt) return;
    const to = recipients();
    if (!to.length) {
      console.log("[SeoWeekly] report ready; SEO_WEEKLY_REPORT_EMAILS not set, no email sent");
      return;
    }
    const mail = buildSeoWeeklyEmail(row);
    let sent = 0;
    for (const address of to) {
      const r = await sendEmailNotification({ to: address, ...mail });
      if (r.success) sent++;
    }
    if (sent) await db.update(seoWeeklyReports).set({ emailedAt: new Date() }).where(eq(seoWeeklyReports.id, row.id));
    console.log(`[SeoWeekly] report ${row.periodEnd} ready; emailed ${sent}/${to.length}`);
  } catch (error) {
    const e = error as SeoWeeklyError;
    console.warn(`[SeoWeekly] skipped: ${e.code ?? "error"} ${e.message}`);
  }
}
