import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { articles } from "@shared/schema";

const BRAND = {
  cyan: "#1BADF8",
  ink: "#141413",
  muted: "#6B7280",
  line: "#E5E7EB",
  paper: "#FFFFFF",
  headerBg: "#0B0B0B",
  soft: "#F4F7F8",
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
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fetchImageAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/*,*/*" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ctype = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim();
    if (!ctype.startsWith("image/")) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 8_000_000) return null;
    return `data:${ctype};base64,${Buffer.from(ab).toString("base64")}`;
  } catch {
    return null;
  }
}

function resolveLogoDataUrl(): string | null {
  const candidates = [
    path.join(process.cwd(), "public/branding/sabq-logo-report.png"),
    path.join(process.cwd(), "public/branding/sabq-logo.png"),
    path.join(process.cwd(), "dist/public/branding/sabq-logo-report.png"),
    path.join(process.cwd(), "dist/public/branding/sabq-logo.png"),
  ];
  for (const candidate of candidates) {
    const data = fileToDataUrl(candidate);
    if (data) return data;
  }
  return null;
}

function resolveFonts() {
  const fontsDir = path.join(process.cwd(), "server/fonts");
  const regular = path.join(fontsDir, "IBMPlexSansArabic-Regular.ttf");
  const bold = path.join(fontsDir, "IBMPlexSansArabic-Bold.ttf");
  const fallbackRegular = path.join(fontsDir, "NotoSansArabic-Regular.ttf");
  const fallbackBold = path.join(fontsDir, "NotoSansArabic-Bold.ttf");
  return {
    SabqArabic: {
      normal: fs.existsSync(regular) ? regular : fallbackRegular,
      bold: fs.existsSync(bold) ? bold : fallbackBold,
      italics: fs.existsSync(regular) ? regular : fallbackRegular,
      bolditalics: fs.existsSync(bold) ? bold : fallbackBold,
    },
  };
}

/**
 * Client-facing PR article report PDF (logo, title, image, body, views, publish time).
 * Isolated from the heavier internal analytics export.
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
  const bodyParagraphs =
    paragraphs.length > 0
      ? paragraphs
      : [(article.excerpt || "").trim()].filter(Boolean);

  const logoDataUrl = resolveLogoDataUrl();
  const heroDataUrl = await fetchImageAsDataUrl(article.imageUrl);
  const viewsLabel = Number(article.views || 0).toLocaleString("ar-SA");
  const publishedLabel = formatArabicDateTime(article.publishedAt);
  const generatedLabel = formatArabicDateTime(new Date());

  const { default: PdfPrinter } = await import("pdfmake");
  const printer = new PdfPrinter(resolveFonts());

  const content: any[] = [];

  // Dark brand header
  content.push({
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              logoDataUrl
                ? {
                    image: logoDataUrl,
                    width: 96,
                    alignment: "center" as const,
                    margin: [0, 8, 0, 6] as [number, number, number, number],
                  }
                : {
                    text: "سبق",
                    fontSize: 28,
                    bold: true,
                    color: BRAND.cyan,
                    alignment: "center" as const,
                    margin: [0, 16, 0, 8] as [number, number, number, number],
                  },
              {
                text: "تقرير أداء خبر · للإعلام والعلاقات العامة",
                fontSize: 9,
                color: "#A3A3A3",
                alignment: "center" as const,
                margin: [0, 0, 0, 10] as [number, number, number, number],
              },
            ],
            fillColor: BRAND.headerBg,
            border: [false, false, false, false],
          },
        ],
      ],
    },
    layout: "noBorders",
    margin: [0, 0, 0, 0],
  });

  // Cyan accent
  content.push({
    canvas: [
      {
        type: "rect",
        x: 0,
        y: 0,
        w: 515,
        h: 3,
        color: BRAND.cyan,
      },
    ],
    margin: [0, 0, 0, 22],
  });

  // Title
  content.push({
    text: article.title || "بدون عنوان",
    fontSize: 18,
    bold: true,
    color: BRAND.ink,
    alignment: "right" as const,
    lineHeight: 1.35,
    margin: [0, 0, 0, 16],
  });

  // Hero image
  if (heroDataUrl) {
    content.push({
      image: heroDataUrl,
      width: 515,
      alignment: "center" as const,
      margin: [0, 0, 0, 14],
    });
  }

  // Meta strip: views + publish time
  content.push({
    table: {
      widths: ["*", "*"],
      body: [
        [
          {
            stack: [
              {
                text: "تاريخ ووقت النشر",
                fontSize: 8,
                color: BRAND.muted,
                alignment: "center" as const,
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              {
                text: publishedLabel,
                fontSize: 11,
                bold: true,
                color: BRAND.ink,
                alignment: "center" as const,
              },
            ],
            fillColor: BRAND.soft,
            border: [false, false, false, false],
            margin: [8, 10, 8, 10] as [number, number, number, number],
          },
          {
            stack: [
              {
                text: "عدد المشاهدات",
                fontSize: 8,
                color: BRAND.muted,
                alignment: "center" as const,
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              {
                text: viewsLabel,
                fontSize: 20,
                bold: true,
                color: BRAND.cyan,
                alignment: "center" as const,
              },
            ],
            fillColor: BRAND.soft,
            border: [false, false, false, false],
            margin: [8, 10, 8, 10] as [number, number, number, number],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 1 ? 1 : 0),
      vLineColor: () => BRAND.line,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 20],
  });

  // Body
  content.push({
    text: "نص الخبر",
    fontSize: 11,
    bold: true,
    color: BRAND.ink,
    alignment: "right" as const,
    margin: [0, 0, 0, 6],
  });
  content.push({
    canvas: [
      {
        type: "rect",
        x: 435,
        y: 0,
        w: 80,
        h: 2.5,
        color: BRAND.cyan,
      },
    ],
    margin: [0, 0, 0, 12],
  });

  if (bodyParagraphs.length === 0) {
    content.push({
      text: "لا يتوفر نص للعرض.",
      fontSize: 10,
      color: BRAND.muted,
      alignment: "right" as const,
    });
  } else {
    for (const paragraph of bodyParagraphs) {
      content.push({
        text: paragraph,
        fontSize: 10.5,
        color: BRAND.ink,
        alignment: "right" as const,
        lineHeight: 1.55,
        margin: [0, 0, 0, 10],
      });
    }
  }

  // Footer note
  content.push({
    canvas: [
      {
        type: "line",
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth: 0.75,
        lineColor: BRAND.line,
      },
    ],
    margin: [0, 18, 0, 10],
  });
  content.push({
    text: `صحيفة سبق الإلكترونية · sabq.org · أُنشئ في ${generatedLabel}`,
    fontSize: 8,
    color: BRAND.muted,
    alignment: "center" as const,
  });
  content.push({
    text: "تقرير موجّه لعملاء العلاقات العامة — للاستخدام الداخلي مع العميل.",
    fontSize: 7.5,
    color: "#9CA3AF",
    alignment: "center" as const,
    margin: [0, 4, 0, 0],
  });

  const docDefinition = {
    pageSize: "A4" as const,
    pageMargins: [40, 36, 40, 40] as [number, number, number, number],
    defaultStyle: {
      font: "SabqArabic",
      alignment: "right" as const,
    },
    content,
    info: {
      title: `تقرير سبق — ${article.title || article.id}`,
      author: "Sabq",
      subject: "تقرير أداء خبر للعملاء",
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const chunks: Buffer[] = [];
  const buffer: Buffer = await new Promise((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });

  const safeSlug = (article.slug || article.id).replace(/[^a-zA-Z0-9-_]/g, "_");
  return {
    buffer,
    filename: `sabq-pr-report-${safeSlug}.pdf`,
    title: article.title || "تقرير خبر",
  };
}
