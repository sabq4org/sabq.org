import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, readingHistory } from "@shared/schema";
import {
  getArticleReadingOverrides,
  resolveReadingMetrics,
} from "./adminToolsService";

const BRAND = {
  cyan: "#1BADF8",
  ink: "#1F2937",
  muted: "#6B7280",
  line: "#E5E7EB",
  paper: "#FFFFFF",
  headerBg: "#F8FBFD",
  soft: "#F3F7F9",
};

export interface ArticlePrClientReportInput {
  articleId: string;
  /** Campaign / client name entered at export time */
  clientName?: string | null;
}

export interface ArticlePrClientReportResult {
  buffer: Buffer;
  filename: string;
  title: string;
  reportRef: string;
}

function htmlToPlainParagraphs(html: string): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n\n")
    .replace(/<(p|div|h[1-6]|li|blockquote)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\u00a0/g, " ");
  return decoded
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatArabicDateTime(date: Date | string | null): string {
  if (!date) return "غير متوفر";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "غير متوفر";
  const months = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`;
}

function formatArabicDate(date: Date | string | null): string {
  if (!date) return "غير متوفر";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "غير متوفر";
  const months = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function buildReportRef(articleId: string, generatedAt: Date): string {
  const y = generatedAt.getFullYear();
  const m = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const d = String(generatedAt.getDate()).padStart(2, "0");
  const short = createHash("sha1")
    .update(articleId)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `SABQ-PR-${y}${m}${d}-${short}`;
}

function sanitizeClientName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || null;
}

function fileToDataUrl(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "") || "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "ttf"
          ? "font/ttf"
          : `image/${ext}`;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fetchImageAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const candidates = jpegFriendlyCandidates(url);
  for (const candidate of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(candidate, {
        signal: controller.signal,
        headers: { Accept: "image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5" },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 24 || ab.byteLength > 8_000_000) continue;
      const buf = Buffer.from(ab);
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      if (!isJpeg && !isPng) continue;
      const mime = isJpeg ? "image/jpeg" : "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** Prefer JPEG/PNG variants for CDNs that default to WebP. */
function jpegFriendlyCandidates(url: string): string[] {
  const out = [url];
  try {
    const u = new URL(url);
    if (u.hostname.includes("imagedelivery.net")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const base = parts.slice(0, -1).join("/");
        out.unshift(`${u.origin}/${base}/w=1200,format=jpeg`);
        out.unshift(`${u.origin}/${base}/public`);
      }
    }
    if (!u.searchParams.has("format")) {
      const withFmt = new URL(url);
      withFmt.searchParams.set("format", "jpeg");
      out.unshift(withFmt.toString());
    }
  } catch {
    /* keep original */
  }
  return [...new Set(out)];
}

function resolveLogoDataUrl(): string | null {
  const candidates = [
    path.join(process.cwd(), "public/branding/sabq-logo.png"),
    path.join(process.cwd(), "dist/public/branding/sabq-logo.png"),
  ];
  for (const candidate of candidates) {
    const data = fileToDataUrl(candidate);
    if (data) return data;
  }
  return null;
}

function resolveFontDataUrls(): { regular: string | null; bold: string | null } {
  const fontsDir = path.join(process.cwd(), "server/fonts");
  const regularCandidates = [
    path.join(fontsDir, "IBMPlexSansArabic-Regular.ttf"),
    path.join(fontsDir, "NotoSansArabic-Regular.ttf"),
  ];
  const boldCandidates = [
    path.join(fontsDir, "IBMPlexSansArabic-Bold.ttf"),
    path.join(fontsDir, "NotoSansArabic-Bold.ttf"),
  ];
  const regular = regularCandidates.map(fileToDataUrl).find(Boolean) ?? null;
  const bold = boldCandidates.map(fileToDataUrl).find(Boolean) ?? regular;
  return { regular, bold };
}

type PerformanceSnapshot = {
  avgReadingMinutes: number | null;
  avgCompletionRate: number | null;
  sessions: number;
};

function buildReportHtml(input: {
  title: string;
  clientName: string | null;
  reportRef: string;
  viewsLabel: string;
  publishedLabel: string;
  generatedLabel: string;
  measurementPeriod: string;
  articleUrl: string;
  performance: PerformanceSnapshot;
  paragraphs: string[];
  logoDataUrl: string | null;
  heroDataUrl: string | null;
  fontRegular: string | null;
  fontBold: string | null;
}): string {
  const fontFaces = [
    input.fontRegular
      ? `@font-face{font-family:'SabqArabic';src:url('${input.fontRegular}') format('truetype');font-weight:400;font-style:normal;}`
      : "",
    input.fontBold
      ? `@font-face{font-family:'SabqArabic';src:url('${input.fontBold}') format('truetype');font-weight:700;font-style:normal;}`
      : "",
  ].join("");

  const bodyHtml =
    input.paragraphs.length > 0
      ? input.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")
      : `<p class="empty">${escapeHtml("لا يتوفر نص للعرض.")}</p>`;

  const logoHtml = input.logoDataUrl
    ? `<img class="logo" src="${input.logoDataUrl}" alt="سبق" />`
    : `<div class="logo-text">${escapeHtml("سبق")}</div>`;

  const heroHtml = input.heroDataUrl
    ? `<img class="hero" src="${input.heroDataUrl}" alt="" />`
    : "";

  const clientRow = input.clientName
    ? `<div class="client-row"><span class="k">${escapeHtml("للعميل / الحملة")}</span><span class="v">${escapeHtml(input.clientName)}</span></div>`
    : "";

  const perfCells: string[] = [];
  if (input.performance.avgReadingMinutes != null) {
    perfCells.push(`
      <div class="cell">
        <div class="label">${escapeHtml("متوسط وقت القراءة")}</div>
        <div class="value">${escapeHtml(`${input.performance.avgReadingMinutes.toFixed(1)} دقيقة`)}</div>
      </div>`);
  }
  if (input.performance.avgCompletionRate != null) {
    perfCells.push(`
      <div class="cell">
        <div class="label">${escapeHtml("نسبة الإكمال")}</div>
        <div class="value">${escapeHtml(`${Math.round(input.performance.avgCompletionRate)}%`)}</div>
      </div>`);
  }
  const performanceBlock =
    perfCells.length > 0
      ? `<section class="grid grid-2">${perfCells.join("")}</section>`
      : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
${fontFaces}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:${BRAND.paper};color:${BRAND.ink};
  font-family:'SabqArabic','Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;
  font-size:11px;line-height:1.55}
.page{padding:22px 28px 26px}
.header{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 12px;background:${BRAND.headerBg};border:1px solid ${BRAND.line};border-radius:10px}
.header-right{display:flex;align-items:center;gap:10px;min-width:0}
.logo{height:34px;width:auto;display:block}
.logo-text{font-size:16px;font-weight:700;color:${BRAND.cyan}}
.brand-block{min-width:0}
.brand{font-size:11px;font-weight:700;margin:0 0 2px}
.sub{font-size:9px;color:${BRAND.muted};margin:0}
.meta-ref{text-align:left;font-size:9px;color:${BRAND.muted};line-height:1.45;white-space:nowrap}
.meta-ref strong{color:${BRAND.ink};font-weight:700}
.accent{height:2px;background:${BRAND.cyan};border-radius:2px;margin:12px 0 12px}
.client-row{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding:7px 10px;
  background:${BRAND.soft};border:1px solid ${BRAND.line};border-radius:8px;font-size:10.5px}
.client-row .k{color:${BRAND.muted}}
.client-row .v{font-weight:700;color:${BRAND.ink}}
h1{font-size:14px;line-height:1.45;margin:0 0 10px;font-weight:700;text-align:right}
.hero{display:block;width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin:0 0 12px}
.grid{display:grid;gap:0;border:1px solid ${BRAND.line};border-radius:8px;overflow:hidden;
  background:${BRAND.soft};margin:0 0 10px}
.grid-3{grid-template-columns:1fr 1fr 1fr}
.grid-2{grid-template-columns:1fr 1fr}
.cell{padding:8px 10px;text-align:center}
.cell+.cell{border-right:1px solid ${BRAND.line}}
.label{font-size:8.5px;color:${BRAND.muted};margin-bottom:3px}
.value{font-size:11px;font-weight:700;color:${BRAND.ink}}
.value.views{font-size:15px;color:${BRAND.cyan}}
.value.sm{font-size:10px;font-weight:600;word-break:break-word}
.note{font-size:8.5px;color:${BRAND.muted};margin:0 0 12px;line-height:1.5;
  padding:7px 9px;border-right:2.5px solid ${BRAND.cyan};background:#FAFCFE}
.link-box{border:1px solid ${BRAND.line};border-radius:8px;margin:0 0 12px;padding:7px 10px;
  text-align:right;background:#fff}
.link-box .value{color:${BRAND.cyan};font-size:10px;font-weight:600;word-break:break-all}
h2{font-size:11px;font-weight:700;margin:0 0 8px;display:inline-block;
  padding-bottom:3px;border-bottom:2px solid ${BRAND.cyan}}
.body p{font-size:10.5px;line-height:1.7;margin:0 0 8px;text-align:justify}
.body .empty{color:${BRAND.muted}}
.footer{margin-top:14px;padding-top:8px;border-top:1px solid ${BRAND.line};
  text-align:center;font-size:8px;color:${BRAND.muted};line-height:1.55}
</style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="header-right">
        ${logoHtml}
        <div class="brand-block">
          <p class="brand">${escapeHtml("صحيفة سبق الإلكترونية")}</p>
          <p class="sub">${escapeHtml("تقرير أداء خبر · للإعلام والعلاقات العامة")}</p>
        </div>
      </div>
      <div class="meta-ref">
        <div><strong>${escapeHtml("المرجع:")}</strong> ${escapeHtml(input.reportRef)}</div>
        <div><strong>${escapeHtml("تاريخ الإنشاء:")}</strong> ${escapeHtml(input.generatedLabel)}</div>
      </div>
    </header>
    <div class="accent"></div>
    ${clientRow}
    <h1>${escapeHtml(input.title)}</h1>
    ${heroHtml}
    <section class="grid grid-3">
      <div class="cell">
        <div class="label">${escapeHtml("عدد المشاهدات")}</div>
        <div class="value views">${escapeHtml(input.viewsLabel)}</div>
      </div>
      <div class="cell">
        <div class="label">${escapeHtml("تاريخ ووقت النشر")}</div>
        <div class="value">${escapeHtml(input.publishedLabel)}</div>
      </div>
      <div class="cell">
        <div class="label">${escapeHtml("فترة القياس")}</div>
        <div class="value sm">${escapeHtml(input.measurementPeriod)}</div>
      </div>
    </section>
    ${performanceBlock}
    <p class="note">${escapeHtml("المصدر: منصة سبق الإلكترونية (sabq.org). الأرقام أعلاه من العدّاد الرسمي للمنصة خلال فترة القياس المحددة.")}</p>
    <div class="link-box">
      <div class="label">${escapeHtml("رابط الخبر")}</div>
      <div class="value">${escapeHtml(input.articleUrl)}</div>
    </div>
    <h2>${escapeHtml("نص الخبر")}</h2>
    <div class="body">${bodyHtml}</div>
    <footer class="footer">
      ${escapeHtml(`${input.reportRef} · sabq.org · أُنشئ في ${input.generatedLabel}`)}<br/>
      ${escapeHtml("تقرير موجّه لعملاء العلاقات العامة — للاستخدام الداخلي مع العميل.")}
    </footer>
  </div>
</body>
</html>`;
}

function resolveChromeExecutable(): string {
  const fromEnv = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
  ].filter(Boolean) as string[];

  const candidates = [
    ...fromEnv,
    "/usr/bin/sabq-chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ];

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* continue */
    }
  }

  throw new Error(
    "CHROME_NOT_FOUND: No Chromium/Chrome binary available for PDF rendering. " +
      "Set PUPPETEER_EXECUTABLE_PATH or install chromium in the runtime image.",
  );
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer");
  const executablePath = resolveChromeExecutable();

  const browser = await puppeteer.default.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
  } as any);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 45_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Client-facing PR article report PDF.
 * Compact layout: client name, report ref, measurement period, optional reading snapshot.
 */
export async function buildArticlePrClientReportPdf(
  input: ArticlePrClientReportInput,
): Promise<ArticlePrClientReportResult> {
  const clientName = sanitizeClientName(input.clientName);
  const generatedAt = new Date();

  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      content: articles.content,
      excerpt: articles.excerpt,
      imageUrl: articles.imageUrl,
      views: articles.views,
      publishedAt: articles.publishedAt,
      status: articles.status,
    })
    .from(articles)
    .where(eq(articles.id, input.articleId))
    .limit(1);

  if (!article) {
    throw Object.assign(new Error("ARTICLE_NOT_FOUND"), { code: "ARTICLE_NOT_FOUND" });
  }

  const [readingStats] = await db
    .select({
      avgReadingTime: sql<number>`COALESCE(AVG(${readingHistory.readDuration}) / 60.0, 0)::real`,
      totalReadSessions: sql<number>`COUNT(*)::int`,
      avgCompletionRate: sql<number>`COALESCE(AVG(${readingHistory.completionRate}), 0)::real`,
    })
    .from(readingHistory)
    .where(eq(readingHistory.articleId, input.articleId));

  const sessions = Number(readingStats?.totalReadSessions || 0);
  const avgReading = Number(readingStats?.avgReadingTime || 0);
  const avgCompletion = Number(readingStats?.avgCompletionRate || 0);
  const overrides = await getArticleReadingOverrides(input.articleId, "ar");
  const resolved = resolveReadingMetrics({
    avgReadingMinutes: avgReading,
    avgCompletionRate: avgCompletion,
    overrides,
  });
  // Prefer admin overrides; otherwise only surface metrics with a real sample.
  const performance: PerformanceSnapshot = {
    sessions,
    avgReadingMinutes:
      overrides?.avgReadTimeOverride != null
        ? resolved.avgReadingMinutes
        : sessions >= 3 && avgReading >= 0.2
          ? Math.round(avgReading * 10) / 10
          : null,
    avgCompletionRate:
      overrides?.completionRateOverride != null
        ? Math.round(resolved.avgCompletionRate)
        : sessions >= 3 && avgCompletion >= 5
          ? Math.round(avgCompletion)
          : null,
  };

  const paragraphs = htmlToPlainParagraphs(article.content || "");
  const bodyParagraphs = (
    paragraphs.length > 0
      ? paragraphs
      : [(article.excerpt || "").trim()].filter(Boolean)
  ).slice(0, 80);

  const logoDataUrl = resolveLogoDataUrl();
  const fonts = resolveFontDataUrls();
  let heroDataUrl = await fetchImageAsDataUrl(article.imageUrl);
  const viewsLabel = Number(article.views || 0).toLocaleString("en-US");
  const publishedLabel = formatArabicDateTime(article.publishedAt);
  const generatedLabel = formatArabicDateTime(generatedAt);
  const measurementPeriod = `من ${formatArabicDate(article.publishedAt)} حتى ${formatArabicDate(generatedAt)}`;
  const reportRef = buildReportRef(article.id, generatedAt);
  const slugPath = article.englishSlug || article.slug || article.id;
  const articleUrl = `https://sabq.org/article/${slugPath}`;
  const title = article.title || "بدون عنوان";

  const buildHtml = (hero: string | null) =>
    buildReportHtml({
      title,
      clientName,
      reportRef,
      viewsLabel,
      publishedLabel,
      generatedLabel,
      measurementPeriod,
      articleUrl,
      performance,
      paragraphs: bodyParagraphs,
      logoDataUrl,
      heroDataUrl: hero,
      fontRegular: fonts.regular,
      fontBold: fonts.bold,
    });

  let buffer: Buffer;
  try {
    buffer = await renderHtmlToPdf(buildHtml(heroDataUrl));
  } catch (err) {
    console.warn("[PrClientReportPdf] Render with hero failed, retrying without image:", err);
    heroDataUrl = null;
    buffer = await renderHtmlToPdf(buildHtml(null));
  }

  const safeSlug = (article.slug || article.id).replace(/[^a-zA-Z0-9-_]/g, "_");
  return {
    buffer,
    filename: `sabq-pr-report-${safeSlug}.pdf`,
    title: article.title || "تقرير خبر",
    reportRef,
  };
}
