/**
 * فهارس ملفات ساما الدورية (PDF/Excel). صفحات الفهرس تُصيّر قائمة SharePoint داخل
 * `var WPQ1ListData = {"Row":[...]}` مع `FileRef` و`SAMAFilePublishDate` — نقرأها بدل
 * تخمين اسم الملف (اللاحقة الترتيبية غير منتظمة: 22nd / 15 / 25th-Jul).
 *
 * تغيير ساما في سبتمبر 2026: النشرة الشهرية صارت ملفًا واحدًا ثابت الاسم
 * («Monthly Bulletin.xlsx» بمسافة) يُستبدل كل شهر، والأصول الاحتياطية صارت
 * «International_Reserves_Aug2026.xlsx». لذلك الأنماط تقبل الاسمين، والملف بلا سنة في
 * اسمه يُميَّز بتاريخ نشره (انظر `reportKey`).
 */
import { parseSamaDate, samaGetText, SAMA_ORIGIN } from "./samaClient";

export const REPORT_KINDS = ["pos_weekly", "money_supply_weekly", "reserve_assets_monthly", "monthly_bulletin"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_INDEX: Record<ReportKind, { indexPath: string; filePattern: RegExp; titleAr: string }> = {
  pos_weekly: {
    indexPath: "/ar-sa/Statistics/Indices/Pages/POS.aspx",
    filePattern: /Weekly_Points_of_Sale.*\.pdf$/i,
    titleAr: "عمليات نقاط البيع الأسبوعية",
  },
  money_supply_weekly: {
    indexPath: "/en-US/Statistics/Indices/Pages/WeeklyMoneySupply.aspx",
    filePattern: /Weekly_Money_Supply.*\.pdf$/i,
    titleAr: "عرض النقود الأسبوعي",
  },
  reserve_assets_monthly: {
    indexPath: "/en-US/Statistics/Indices/Pages/reserve_assets.aspx",
    filePattern: /(Reserve_Assets|International_Reserves).*\.xlsx$/i,
    titleAr: "الأصول الاحتياطية",
  },
  monthly_bulletin: {
    indexPath: "/ar-sa/Statistics/Pages/MonthlyStatistics.aspx",
    filePattern: /Monthly[_ ]Bulletin.*\.xlsx$/i,
    titleAr: "النشرة الإحصائية الشهرية",
  },
};

export interface ReportFile {
  kind: ReportKind;
  /** مفتاح التخزين الفريد (economy_reports.file_name) — اسم الملف، ومعه تاريخ النشر إن خلا الاسم من سنة */
  fileName: string;
  url: string;
  /** ISO — تاريخ نشر ساما للملف */
  publishedAt: string | null;
}

function decodeSp(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * اسم ملف ثابت يُستبدل كل شهر («Monthly Bulletin.xlsx») لا يصلح وحده مفتاحًا لمنع
 * التكرار؛ نضيف إليه تاريخ النشر. الأسماء التي تحمل سنة تبقى كما هي حتى لا تتغيّر
 * مفاتيح الصفوف المخزّنة سابقًا.
 */
export function reportKey(fileName: string, publishedAt: string | null): string {
  if (/\d{4}/.test(fileName) || !publishedAt) return fileName;
  return `${fileName}#${publishedAt}`;
}

function encodePath(fileRef: string): string {
  try {
    return encodeURI(decodeURI(fileRef));
  } catch {
    return encodeURI(fileRef);
  }
}

/** يستخرج صفوف القائمة من HTML الفهرس — مُصدَّر للاختبار. */
export function parseReportIndexHtml(html: string, kind: ReportKind): ReportFile[] {
  const def = REPORT_INDEX[kind];
  const start = html.indexOf("WPQ1ListData");
  const scope = start >= 0 ? html.slice(start) : html;
  const files: ReportFile[] = [];
  // كل صف يبدأ بـ "ID": "..." ويحوي FileRef و SAMAFilePublishDate
  const rowRe = /"FileRef":\s*"([^"]+)"[\s\S]*?"SAMAFilePublishDate":\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(scope))) {
    const fileRef = decodeSp(m[1]);
    const fileName = fileRef.split("/").pop() ?? fileRef;
    if (!def.filePattern.test(fileName)) continue;
    const publishedAt = parseSamaDate(decodeSp(m[2]));
    files.push({
      kind,
      fileName: reportKey(fileName, publishedAt),
      url: SAMA_ORIGIN + encodePath(fileRef),
      publishedAt,
    });
  }
  return files;
}

/** قائمة الملفات كما يعرضها الفهرس (الأحدث أولًا كما ترتّبها ساما). */
export async function listReportFiles(kind: ReportKind): Promise<ReportFile[]> {
  const html = await samaGetText(REPORT_INDEX[kind].indexPath);
  const files = parseReportIndexHtml(html, kind);
  if (files.length === 0) throw new Error(`SAMA index ${kind}: no files parsed — layout changed?`);
  return files;
}
