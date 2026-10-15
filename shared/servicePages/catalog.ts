/**
 * كتالوج صفحات الخدمة الدائمة.
 * الصفحة لا تخزّن تواريخ: مصدر «mawaeed» يقرأ سلسلة مواعيدك المنشورة.
 * لإضافة صفحة لاحقًا (إجازة، أسعار وقود) أضف مدخلًا هنا ومصدرًا يملأ ServicePageModel.
 */

export type MawaeedServiceSource = {
  type: "mawaeed";
  seriesSlug: string;
};

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
  tone: "citizen" | "salary";
};

export const SERVICE_PAGES: ServicePageSpec[] = [
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
];

export function servicePageById(id: string): ServicePageSpec | undefined {
  return SERVICE_PAGES.find((page) => page.id === id);
}

export function serviceLinkForSeries(seriesSlug: string): Pick<ServicePageSpec, "path" | "navLabel"> | null {
  const page = SERVICE_PAGES.find((item) => item.source.type === "mawaeed" && item.source.seriesSlug === seriesSlug);
  return page ? { path: page.path, navLabel: page.navLabel } : null;
}

export function servicePageSitemapEntries(
  series: { slug: string; contentUpdatedAt: string }[],
): { loc: string; lastmod: string }[] {
  return series.flatMap((item) =>
    SERVICE_PAGES.filter((page) => page.source.type === "mawaeed" && page.source.seriesSlug === item.slug).map((page) => ({
      loc: `https://sabq.org${page.path}`,
      lastmod: item.contentUpdatedAt,
    })),
  );
}
