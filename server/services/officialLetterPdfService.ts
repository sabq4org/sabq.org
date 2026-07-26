// ----------------------------------------------------------------------------
// توليد PDF للخطابات الرسمية (شهادة تعريف / تسهيل مهمة).
//
// التقنية: HTML بـ dir="rtl" ثم طباعة عبر Puppeteer/Chromium — نفس مسار
// تقرير PR المعتمد. لا تستخدم pdfmake/pdfkit للنص العربي (يقلب الحروف).
// راجع: .cursor/rules/pr-client-report-design.mdc
//
// الحقول الناقصة تُحذف صفوفها بالكامل ولا تُطبع فارغة.
// ----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import {
  OFFICIAL_LETTER_BRAND_AR,
  OFFICIAL_LETTER_SIGNATORY_AR,
  OFFICIAL_LETTER_TYPE_META,
  buildAffiliationSentenceAr,
  type OfficialLetterType,
} from "@shared/officialLetters";
import type { LetterSubject } from "./officialLetterService";

const BRAND = {
  cyan: "#1BADF8",
  text: "#1F2937",
  muted: "#6B7280",
  divider: "#E5E7EB",
  headerBg: "#F8FBFD",
};

export type BuildOfficialLetterInput = {
  referenceCode: string;
  letterType: OfficialLetterType;
  recipientEntity: string | null;
  purposeNote: string | null;
  subject: LetterSubject;
  issuedAt: Date;
};

// ────────────────────────────────────────────────────────────────────
// الأصول: الشعار، الختم، التوقيع، الخطوط
// ────────────────────────────────────────────────────────────────────

function fileToDataUrl(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    if (!buf.length) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".svg"
            ? "image/svg+xml"
            : ext === ".ttf"
              ? "font/ttf"
              : "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const data = fileToDataUrl(candidate);
    if (data) return data;
  }
  return null;
}

function brandAsset(...names: string[]): string | null {
  const roots = [
    path.join(process.cwd(), "public/branding"),
    path.join(process.cwd(), "dist/public/branding"),
  ];
  const candidates: string[] = [];
  for (const root of roots) {
    for (const name of names) candidates.push(path.join(root, name));
  }
  return firstExisting(candidates);
}

function resolveFonts(): { regular: string | null; bold: string | null } {
  const dir = path.join(process.cwd(), "server/fonts");
  const regular = firstExisting([
    path.join(dir, "IBMPlexSansArabic-Regular.ttf"),
    path.join(dir, "NotoSansArabic-Regular.ttf"),
  ]);
  const bold = firstExisting([
    path.join(dir, "IBMPlexSansArabic-Bold.ttf"),
    path.join(dir, "IBMPlexSansArabic-SemiBold.ttf"),
    path.join(dir, "NotoSansArabic-Bold.ttf"),
  ]);
  return { regular, bold: bold ?? regular };
}

// ────────────────────────────────────────────────────────────────────
// التواريخ — ميلادي + هجري بتقويم أم القرى
// ────────────────────────────────────────────────────────────────────

function formatGregorian(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

/** يُرجع التاريخ الهجري متضمناً لاحقة «هـ» — المنسّق يضيفها بنفسه. */
function formatHijri(date: Date): string {
  try {
    const formatted = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Riyadh",
    }).format(date);
    return formatted.includes("هـ") ? formatted : `${formatted} هـ`;
  } catch {
    return "";
  }
}

function formatShortDate(date: Date | null): string | null {
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Riyadh",
    }).format(date);
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ────────────────────────────────────────────────────────────────────
// بناء HTML
// ────────────────────────────────────────────────────────────────────

type DetailRow = { label: string; value: string };

function buildDetailRows(subject: LetterSubject): DetailRow[] {
  const rows: DetailRow[] = [
    { label: "الاسم", value: subject.fullNameAr },
  ];

  // الحقول الاختيارية: يُحذف السطر كاملاً إن لم تتوفر قيمته
  // لا تُطبع البطاقة الصحفية ولا الترخيص الإعلامي على شهادة التعريف (قرار المالك).
  if (subject.nationalId) rows.push({ label: "رقم الهوية", value: subject.nationalId });
  rows.push({ label: "الصفة", value: subject.roleTitleAr });
  if (subject.departmentAr) rows.push({ label: "القسم", value: subject.departmentAr });

  const joined = formatShortDate(subject.joinedAt);
  if (joined) rows.push({ label: "تاريخ الالتحاق", value: joined });

  return rows;
}

function buildHtml(input: BuildOfficialLetterInput, verifyUrl: string, qrDataUrl: string | null): string {
  const meta = OFFICIAL_LETTER_TYPE_META[input.letterType];
  const fonts = resolveFonts();
  // الشعار الرسمي (خلفية شفافة من هوية Illustrator) ثم احتياطي الموقع/التقارير
  const logo = brandAsset(
    "sabq-logo-official.png",
    "sabq-logo.png",
    "sabq-logo-report.png",
  );
  const stamp = brandAsset("sabq-stamp.png", "sabq-seal.png");
  const signature = brandAsset("sabq-signature.png", "editor-signature.png");

  const rows = buildDetailRows(input.subject);
  const affiliation = buildAffiliationSentenceAr(input.subject.roleTitleAr);

  const fontFaces = fonts.regular
    ? `
    @font-face {
      font-family: 'SabqArabic';
      src: url('${fonts.regular}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'SabqArabic';
      src: url('${fonts.bold ?? fonts.regular}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }`
    : "";

  const detailRowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td class="label">${escapeHtml(row.label)}</td>
          <td class="value">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.referenceCode)}</title>
<style>
  ${fontFaces}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'SabqArabic', 'IBM Plex Sans Arabic', Tahoma, sans-serif;
    color: ${BRAND.text};
    -webkit-font-smoothing: antialiased;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 16mm 18mm 14mm;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* الترويسة */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: ${BRAND.headerBg};
    border: 1px solid ${BRAND.divider};
    border-radius: 8px;
    padding: 10px 14px;
  }
  .header .brand { display: flex; align-items: center; gap: 10px; }
  /* القفل الكامل للشعار الرسمي عريض نسبياً — نكبّره قليلاً في الترويسة */
  .header img.logo { height: 52px; width: auto; max-width: 150px; object-fit: contain; }
  .header .brand-text .name { font-size: 12.5px; font-weight: 700; }
  .header .brand-text .sub { font-size: 8.5px; color: ${BRAND.muted}; margin-top: 2px; }
  .header .doc-type {
    font-size: 9px;
    color: ${BRAND.cyan};
    font-weight: 700;
    border: 1px solid ${BRAND.cyan}33;
    border-radius: 999px;
    padding: 4px 10px;
    white-space: nowrap;
  }

  /* سطر المرجع والتاريخ */
  .meta {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    font-size: 9px;
    color: ${BRAND.muted};
  }
  .meta b { color: ${BRAND.text}; font-weight: 700; }

  /* العنوان */
  h1.title {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    margin: 16px 0 4px;
    letter-spacing: 0.5px;
  }
  .title-rule {
    width: 54px;
    height: 2px;
    background: ${BRAND.cyan};
    margin: 0 auto 14px;
    border-radius: 2px;
  }

  /* المخاطَب — أُزيل بقرار المالك؛ الشهادة تبدأ مباشرة بـ «تشهد…» */
  .salutation { font-size: 10.5px; margin: 10px 0 12px; }

  /* جدول البيانات */
  .lead { font-size: 10.5px; margin: 14px 0 8px; }
  table.details {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid ${BRAND.divider};
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 12px;
  }
  table.details td { padding: 6px 10px; font-size: 10.5px; border-bottom: 1px solid ${BRAND.divider}; }
  table.details tr:last-child td { border-bottom: none; }
  table.details td.label {
    width: 34%;
    color: ${BRAND.muted};
    font-size: 9px;
    background: ${BRAND.headerBg};
    white-space: nowrap;
  }
  table.details td.value { font-weight: 700; }

  /* الفقرات */
  p.body { font-size: 10.5px; line-height: 2; margin: 0 0 10px; text-align: justify; }
  p.note { font-size: 10.5px; line-height: 2; margin: 0 0 10px; }

  /* التوقيع */
  .signoff { margin-top: 18px; font-size: 10.5px; }
  .sign-block {
    margin-top: 10px;
    display: flex;
    justify-content: flex-start;
    gap: 18px;
    align-items: flex-end;
  }
  .sign-col { text-align: center; min-width: 180px; }
  .sign-col .org { font-size: 11px; font-weight: 700; }
  .sign-col .role { font-size: 9px; color: ${BRAND.muted}; margin-top: 2px; }
  .sign-col img.signature { height: 42px; margin-top: 6px; }
  .stamp img { height: 84px; opacity: 0.92; }
  .sign-placeholder {
    margin-top: 8px;
    border-top: 1px dashed ${BRAND.divider};
    width: 150px;
    margin-inline: auto;
  }

  /* التذييل */
  .footer {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid ${BRAND.divider};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 8px;
    color: ${BRAND.muted};
    line-height: 1.7;
  }
  .footer .verify-text { max-width: 78%; }
  .footer .verify-text b { color: ${BRAND.text}; }
  .footer img.qr { width: 54px; height: 54px; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        ${logo ? `<img class="logo" src="${logo}" alt="" />` : ""}
        ${
          // الشعار الرسمي يحمل الاسم كاملاً — نكتفي بسطر الموقع إن وُجد
          logo
            ? `<div class="brand-text"><div class="sub">الرياض — المملكة العربية السعودية</div></div>`
            : `<div class="brand-text">
          <div class="name">${OFFICIAL_LETTER_BRAND_AR}</div>
          <div class="sub">الرياض — المملكة العربية السعودية · sabq.org</div>
        </div>`
        }
      </div>
      <div class="doc-type">${escapeHtml(meta.labelAr)}</div>
    </div>

    <div class="meta">
      <div>الرقم المرجعي: <b>${escapeHtml(input.referenceCode)}</b></div>
      <div>
        التاريخ: <b>${escapeHtml(formatGregorian(input.issuedAt))}م</b>
        ${formatHijri(input.issuedAt) ? ` &nbsp;·&nbsp; الموافق ${escapeHtml(formatHijri(input.issuedAt))}` : ""}
      </div>
    </div>

    <h1 class="title">${escapeHtml(meta.documentTitleAr)}</h1>
    <div class="title-rule"></div>

    <p class="lead">تشهد ${OFFICIAL_LETTER_BRAND_AR} بأن:</p>

    <table class="details">
      ${detailRowsHtml}
    </table>

    <p class="body">${escapeHtml(affiliation)}</p>

    <p class="body">${escapeHtml(meta.purposeAr)}</p>

    ${input.purposeNote ? `<p class="note">${escapeHtml(input.purposeNote)}</p>` : ""}

    <div class="signoff">
      <div>وتفضلوا بقبول فائق التحية والتقدير،</div>
      <div class="sign-block">
        <div class="sign-col">
          <div class="org">${OFFICIAL_LETTER_BRAND_AR}</div>
          <div class="role">${OFFICIAL_LETTER_SIGNATORY_AR}</div>
          ${
            signature
              ? `<img class="signature" src="${signature}" alt="" />`
              : `<div class="sign-placeholder"></div>`
          }
        </div>
        ${stamp ? `<div class="stamp"><img src="${stamp}" alt="" /></div>` : ""}
      </div>
    </div>

    <div class="footer">
      <div class="verify-text">
        هذه الشهادة صادرة إلكترونياً من ${OFFICIAL_LETTER_BRAND_AR} ولا تحتاج توقيعاً يدوياً.
        للتحقق من صحتها امسح الرمز أو زر: <b>${escapeHtml(verifyUrl)}</b>
      </div>
      ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="" />` : ""}
    </div>
  </div>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────
// Chromium
// ────────────────────────────────────────────────────────────────────

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

function verifyUrlFor(referenceCode: string): string {
  const base = (process.env.FRONTEND_URL || "https://sabq.org").replace(/\/+$/, "");
  return `${base}/verify/${referenceCode}`;
}

/** يبني ملف الخطاب الرسمي (A4، عربي RTL). */
export async function buildOfficialLetterPdf(
  input: BuildOfficialLetterInput,
): Promise<Buffer> {
  const verifyUrl = verifyUrlFor(input.referenceCode);

  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 0,
      width: 220,
      color: { dark: "#1F2937", light: "#FFFFFF" },
    });
  } catch (error) {
    console.error("[officialLetters] QR generation failed:", error);
  }

  const html = buildHtml(input, verifyUrl, qrDataUrl);
  return renderHtmlToPdf(html);
}

/** معاينة HTML فقط (بدون Chromium) — تُستخدم للمعاينة داخل اللوحة. */
export function buildOfficialLetterPreviewHtml(input: BuildOfficialLetterInput): string {
  return buildHtml(input, verifyUrlFor(input.referenceCode), null);
}
