/**
 * فهارس ملفات ساما الدورية (PDF/Excel). صفحات الفهرس تُصيّر قائمة SharePoint داخل
 * `var WPQ1ListData = {"Row":[...]}` مع `FileRef` و`SAMAFilePublishDate` — نقرأها بدل
 * تخمين اسم الملف (اللاحقة الترتيبية غير منتظمة: 22nd / 15 / 25th-Jul).
 */
import { parseSamaDate, samaGetText, SAMA_ORIGIN } from "./samaClient";

export const REPORT_KINDS = ["pos_weekly", "money_supply_weekly", "reserve_assets_monthly"] as const;
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
    filePattern: /Reserve_Assets.*\.xlsx$/i,
    titleAr: "الأصول الاحتياطية",
  },
};

export interface ReportFile {
  kind: ReportKind;
  fileName: string;
  url: string;
  /** ISO — تاريخ نشر ساما للملف */
  publishedAt: string | null;
}

function decodeSp(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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
    files.push({
      kind,
      fileName,
      url: SAMA_ORIGIN + fileRef,
      publishedAt: parseSamaDate(decodeSp(m[2])),
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
