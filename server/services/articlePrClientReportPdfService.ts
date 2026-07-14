import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { articles } from "@shared/schema";

const BRAND = {
  cyan: "#1BADF8",
  ink: "#1A1A1A",
  muted: "#5B6470",
  line: "#E5E7EB",
  paper: "#FFFFFF",
  headerBg: "#F7FBFD",
  soft: "#F0F7FA",
};

export interface ArticlePrClientReportInput {
  articleId: string;
}

export interface ArticlePrClientReportResult {
  buffer: Buffer;
  filename: string;
  title: string;
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
  const regular =
    regularCandidates.map(fileToDataUrl).find(Boolean) ?? null;
  const bold = boldCandidates.map(fileToDataUrl).find(Boolean) ?? regular;
  return { regular, bold };
}

function buildReportHtml(input: {
  title: string;
  viewsLabel: string;
  publishedLabel: string;
  generatedLabel: string;
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

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
${fontFaces}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:${BRAND.paper};color:${BRAND.ink};
  font-family:'SabqArabic','Segoe UI',Tahoma,Arial,sans-serif;direction:rtl}
.page{padding:28px 36px 36px}
.header{background:${BRAND.headerBg};border-radius:14px;border:1px solid ${BRAND.line};
  text-align:center;padding:18px 16px 14px;margin-bottom:18px}
.logo{height:52px;width:auto;margin:0 auto 8px;display:block}
.logo-text{font-size:28px;font-weight:700;color:${BRAND.cyan};margin-bottom:6px}
.brand{font-size:14px;font-weight:700;margin:0 0 4px}
.sub{font-size:12px;color:${BRAND.muted};margin:0}
.accent{height:3px;background:${BRAND.cyan};border-radius:2px;margin:16px 0 18px}
h1{font-size:20px;line-height:1.5;margin:0 0 16px;font-weight:700;text-align:right}
.hero{display:block;width:100%;max-height:280px;object-fit:cover;border-radius:12px;margin:0 0 16px}
.meta{display:grid;grid-template-columns:1fr 1fr;background:${BRAND.soft};border-radius:12px;
  overflow:hidden;margin:0 0 20px;border:1px solid ${BRAND.line}}
.meta>div{padding:14px 12px;text-align:center}
.meta>div+div{border-right:1px solid ${BRAND.line}}
.meta .label{font-size:12px;color:${BRAND.muted};margin-bottom:6px}
.meta .value{font-size:14px;font-weight:700}
.meta .views{font-size:26px;font-weight:700;color:${BRAND.cyan};letter-spacing:0.02em}
h2{font-size:15px;font-weight:700;margin:0 0 12px;display:inline-block;
  padding-bottom:6px;border-bottom:2.5px solid ${BRAND.cyan}}
.body p{font-size:13px;line-height:1.8;margin:0 0 12px;text-align:justify}
.body .empty{color:${BRAND.muted}}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid ${BRAND.line};
  text-align:center;font-size:11px;color:${BRAND.muted};line-height:1.6}
</style>
</head>
<body>
  <div class="page">
    <header class="header">
      ${logoHtml}
      <p class="brand">${escapeHtml("صحيفة سبق الإلكترونية")}</p>
      <p class="sub">${escapeHtml("تقرير أداء خبر · للإعلام والعلاقات العامة")}</p>
    </header>
    <div class="accent"></div>
    <h1>${escapeHtml(input.title)}</h1>
    ${heroHtml}
    <section class="meta">
      <div>
        <div class="label">${escapeHtml("عدد المشاهدات")}</div>
        <div class="views">${escapeHtml(input.viewsLabel)}</div>
      </div>
      <div>
        <div class="label">${escapeHtml("تاريخ ووقت النشر")}</div>
        <div class="value">${escapeHtml(input.publishedLabel)}</div>
      </div>
    </section>
    <h2>${escapeHtml("نص الخبر")}</h2>
    <div class="body">${bodyHtml}</div>
    <footer class="footer">
      ${escapeHtml(`صحيفة سبق الإلكترونية · sabq.org · أُنشئ في ${input.generatedLabel}`)}<br/>
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
 * Client-facing PR article report PDF (logo, title, image, body, views, publish time).
 * Rendered via Chromium HTML so Arabic RTL shaping/order are correct.
 */
export async function buildArticlePrClientReportPdf(
  input: ArticlePrClientReportInput,
): Promise<ArticlePrClientReportResult> {
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
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
  const generatedLabel = formatArabicDateTime(new Date());
  const title = article.title || "بدون عنوان";

  const buildHtml = (hero: string | null) =>
    buildReportHtml({
      title,
      viewsLabel,
      publishedLabel,
      generatedLabel,
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
  };
}
