/**
 * كتالوج صفحات الخدمة الدائمة.
 * الصفحة لا تخزّن تواريخ: مصدر «mawaeed» يقرأ سلسلة مواعيدك المنشورة.
 * لإضافة صفحة لاحقًا (إجازة، أسعار وقود) أضف مدخلًا هنا ومصدرًا يملأ ServicePageModel.
 */

import { normalizeRegion, type RegionId } from "../mawaeed/model";

export type MawaeedServiceSource = {
  type: "mawaeed";
  seriesSlug: string;
};

export type ServicePageTone = "citizen" | "salary" | "school" | "social" | "pension";

export type ServicePageSpec = {
  id: string;
  path: string;
  h1: string;
  title: string;
  fallbackDescription: string;
  source: MawaeedServiceSource;
  navLabel: string;
  /** نص رابط العودة إلى السجل الذي يغذّي الصفحة. */
  sourceLabel: string;
  /** استعلام قائم. keyword لمطابقة الوسم، وsearch حين يكون الوسم غير دقيق. */
  relatedQuery: string | null;
  relatedSource: "keyword" | "search";
  tone: ServicePageTone;
};

export const SERVICE_PAGES: ServicePageSpec[] = [
  {
    id: "school-calendar-date",
    path: "/services/school-calendar-date",
    h1: "التقويم الدراسي 1448: موعد الإجازة القادمة",
    title: "التقويم الدراسي 1448: موعد أقرب إجازة وكم باقي عليها | سبق",
    fallbackDescription:
      "مواعيد إجازات العام الدراسي 1448-1449هـ حسب وزارة التعليم من السجل المنشور في مواعيدك، بالتاريخين الهجري والميلادي.",
    source: { type: "mawaeed", seriesSlug: "school-calendar-1448" },
    navLabel: "التقويم الدراسي 1448",
    sourceLabel: "التقويم الدراسي 1448 في مواعيدك",
    relatedQuery: "التقويم الدراسي",
    relatedSource: "search",
    tone: "school",
  },
  {
    id: "citizen-account-date",
    path: "/services/citizen-account-date",
    h1: "موعد صرف حساب المواطن",
    title: "موعد صرف حساب المواطن: الدفعة القادمة بالتاريخ الهجري والميلادي | سبق",
    fallbackDescription:
      "موعد إيداع دعم حساب المواطن القادم بالتاريخين الهجري والميلادي، وجدول الدفعات المنشورة في مواعيدك. المحسوب يُعرض «متوقع».",
    source: { type: "mawaeed", seriesSlug: "citizen-account" },
    navLabel: "موعد صرف حساب المواطن",
    sourceLabel: "حساب المواطن في مواعيدك",
    relatedQuery: "حساب المواطن",
    relatedSource: "keyword",
    tone: "citizen",
  },
  {
    id: "government-salaries-date",
    path: "/services/government-salaries-date",
    h1: "موعد صرف رواتب موظفي الدولة",
    title: "موعد صرف رواتب موظفي الدولة: الموعد القادم وكم باقي | سبق",
    fallbackDescription:
      "موعد صرف رواتب موظفي الدولة المدنيين والعسكريين حسب السجل المنشور في مواعيدك، بالتاريخين الهجري والميلادي. المحسوب يُعرض «متوقع».",
    source: { type: "mawaeed", seriesSlug: "salaries" },
    navLabel: "موعد صرف رواتب موظفي الدولة",
    sourceLabel: "رواتب موظفي الدولة في مواعيدك",
    relatedQuery: "رواتب موظفي الدولة",
    relatedSource: "search",
    tone: "salary",
  },
  {
    id: "social-security-date",
    path: "/services/social-security-date",
    h1: "موعد صرف الضمان الاجتماعي المطوّر",
    title: "موعد صرف الضمان الاجتماعي المطوّر: الدفعة القادمة وكم باقي | سبق",
    fallbackDescription:
      "موعد صرف معاش الضمان الاجتماعي المطوّر وإعلان الأهلية حسب وزارة الموارد البشرية بالتاريخين الهجري والميلادي.",
    source: { type: "mawaeed", seriesSlug: "social-security" },
    navLabel: "موعد صرف الضمان الاجتماعي المطوّر",
    sourceLabel: "الضمان الاجتماعي المطوّر في مواعيدك",
    relatedQuery: "الضمان الاجتماعي",
    relatedSource: "search",
    tone: "social",
  },
  {
    id: "pensions-date",
    path: "/services/pensions-date",
    h1: "موعد صرف معاشات التقاعد والتأمينات",
    title: "موعد صرف رواتب المتقاعدين (التأمينات الاجتماعية) وكم باقي | سبق",
    fallbackDescription:
      "مواعيد صرف معاشات التقاعد المدني والعسكري والتأمينات الاجتماعية حسب المؤسسة العامة للتأمينات الاجتماعية بالتاريخين الهجري والميلادي.",
    source: { type: "mawaeed", seriesSlug: "pensions" },
    navLabel: "موعد صرف معاشات التقاعد",
    sourceLabel: "معاشات التقاعد في مواعيدك",
    relatedQuery: "التأمينات الاجتماعية",
    relatedSource: "search",
    tone: "pension",
  },
];

export function servicePageIdFromPath(path: string): string | null {
  const match = /^\/services\/([a-z0-9-]+)$/.exec(path);
  return match ? match[1] : null;
}

export function servicePageById(id: string): ServicePageSpec | undefined {
  return SERVICE_PAGES.find((page) => page.id === id);
}

/** الإطلاق مخفي عن الفهرسة حتى إشعار آخر: بلا فهرسة ولا متابعة روابط من محركات البحث. */
export const HIDDEN_SERVICE_ROBOTS = "noindex, nofollow";

/**
 * يعيد رابط صفحة الخدمة المقابلة لسلسلة مواعيدك لتوجيه الروابط إليها مباشرة.
 */
export function serviceLinkForSeries(seriesSlug: string): Pick<ServicePageSpec, "path" | "navLabel"> | null {
  const page = SERVICE_PAGES.find((item) => item.source.type === "mawaeed" && item.source.seriesSlug === seriesSlug);
  return page ? { path: page.path, navLabel: page.navLabel } : null;
}

/** الصفحات التي تختلف مواعيدها حسب المنطقة التعليمية. */
export function servicePageUsesRegion(id: string): boolean {
  return servicePageById(id)?.tone === "school";
}

/** منطقة الطلب لصفحة الخدمة. الصفحات غير المناطقية تبقى على الافتراضي. */
export function serviceRegion(id: string, raw: string | null | undefined): RegionId {
  return servicePageUsesRegion(id) ? normalizeRegion(raw) : "riyadh";
}

/** لاحقة الاستعلام: الرياض افتراضية فلا تُكتب، حتى يبقى الرابط الأساسي واحداً. */
export function regionSuffix(region: RegionId): string {
  return region === "riyadh" ? "" : `?region=${region}`;
}

/** لا تُدرج الصفحات المخفية في أي خريطة موقع. */
export function servicePageSitemapEntries(
  _series: { slug: string; contentUpdatedAt: string }[],
): { loc: string; lastmod: string }[] {
  return [];
}

