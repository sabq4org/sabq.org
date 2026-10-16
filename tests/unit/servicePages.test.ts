import { describe, expect, it } from "vitest";
import { EXPECTED_HINT, SERIES_CATALOG, type OccurrenceRecord, type SeriesRecord } from "@shared/mawaeed/model";
import { presentMawaeed } from "@shared/mawaeed/present";
import { buildServiceCalendar } from "@shared/servicePages/calendar";
import { HIDDEN_SERVICE_ROBOTS, serviceLinkForSeries, servicePageIdFromPath, servicePageSitemapEntries } from "@shared/servicePages/catalog";
import { presentServicePage } from "@shared/servicePages/present";
import { relatedArticlesFromKeyword, relatedArticlesFromSearch } from "@shared/servicePages/related";
import {
  relatedArticlesFromKeyword as nextRelatedFromKeyword,
  relatedArticlesFromSearch as nextRelatedFromSearch,
} from "../../web-next/lib/servicePage";
import { renderServiceSemanticHtml } from "@shared/servicePages/semanticHtml";

const NOW = new Date("2026-10-15T12:00:00+03:00");

function catalogSummary(slug: string): string {
  return SERIES_CATALOG.find((item) => item.slug === slug)?.summaryAr ?? "";
}

function series(partial: Partial<SeriesRecord> & Pick<SeriesRecord, "id" | "slug" | "kind">): SeriesRecord {
  return {
    titleAr: partial.slug,
    summaryAr: catalogSummary(partial.slug),
    sortOrder: 1,
    published: true,
    contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
    ...partial,
  };
}

function row(partial: Partial<OccurrenceRecord> & Pick<OccurrenceRecord, "id" | "seriesId" | "startsOn" | "titleAr">): OccurrenceRecord {
  return {
    endsOn: null,
    sourceUrl: "https://www.mof.gov.sa/financial_reports",
    sourceTitle: "وزارة المالية",
    certainty: "confirmed",
    status: "scheduled",
    published: true,
    regionGroup: "all",
    hijriLabel: null,
    publicNote: null,
    ruleNote: null,
    ...partial,
  };
}

function page(id: string, seriesRow: SeriesRecord, occurrences: OccurrenceRecord[]) {
  const presented = presentMawaeed({
    pageSlug: seriesRow.slug,
    now: NOW,
    series: [seriesRow],
    occurrences,
  });
  if (presented.notFound) throw new Error("expected mawaeed view");
  const model = presentServicePage(id, presented.view);
  if (!model) throw new Error("expected service page");
  return { view: presented.view, model };
}

describe("service page paths", () => {
  it("accepts one clean segment under /services", () => {
    expect(servicePageIdFromPath("/services/citizen-account-date")).toBe("citizen-account-date");
    expect(servicePageIdFromPath("/services/government-salaries-date")).toBe("government-salaries-date");
    expect(servicePageIdFromPath("/services/school-calendar-date")).toBe("school-calendar-date");
    expect(servicePageIdFromPath("/services/social-security-date")).toBe("social-security-date");
    expect(servicePageIdFromPath("/services/pensions-date")).toBe("pensions-date");
    expect(servicePageIdFromPath("/services")).toBeNull();
    expect(servicePageIdFromPath("/services/citizen-account-date/extra")).toBeNull();
    expect(servicePageIdFromPath("/mawaeed/salaries")).toBeNull();
  });
});

describe("salary service page", () => {
  const salary = series({ id: "s-salary", slug: "salaries", kind: "salary", titleAr: "رواتب موظفي الدولة" });
  const occurrences: OccurrenceRecord[] = [
    row({ id: "past", seriesId: "s-salary", titleAr: "رواتب سبتمبر", startsOn: "2026-09-27", certainty: "confirmed" }),
    row({ id: "next", seriesId: "s-salary", titleAr: "رواتب أكتوبر", startsOn: "2026-10-27", certainty: "confirmed" }),
    row({ id: "later", seriesId: "s-salary", titleAr: "رواتب نوفمبر", startsOn: "2026-11-26", certainty: "expected" }),
    row({
      id: "hidden",
      seriesId: "s-salary",
      titleAr: "مسودة لا تظهر",
      startsOn: "2026-12-27",
      certainty: "unverified",
      published: false,
    }),
  ];

  it("answers with the stored date, countdown, confirmed label, and the existing weekend rule", () => {
    const { view, model } = page("government-salaries-date", salary, occurrences);
    const next = view.series[0].next;
    expect(next?.startsOn).toBe("2026-10-27");
    expect(model.h1).toBe("موعد صرف رواتب موظفي الدولة");
    expect(model.canonical).toBe("https://sabq.org/services/government-salaries-date");
    expect(model.dateModified).toBe(view.dateModified);
    expect(model.next?.hijriLabel).toBe(next?.hijriLabel);
    expect(model.next?.countdownText).toBe(next?.countdownText);
    expect(model.next?.certainty).toBe("confirmed");
    expect(model.shiftRule).toContain("الخميس الذي قبله");
    expect(model.shiftRule).toContain("الأحد الذي بعده");
    expect(model.explanation.join(" ")).toContain("يوم 27 من كل شهر ميلادي");
    expect(model.description).not.toContain(EXPECTED_HINT);
    expect(model.rows.filter((item) => !item.isPast).map((item) => item.startsOn)).toEqual(["2026-10-27", "2026-11-26"]);
    expect(model.rows.find((item) => item.isPast)?.pastLabel).toBe("صُرفت");
    expect(model.rows.find((item) => item.startsOn === "2026-11-26")?.certaintyLabel).toBe("متوقع");
    expect(model.calendarHref).toBe("/api/service-pages/government-salaries-date/calendar.ics");
    expect(model.faq.length).toBeGreaterThanOrEqual(5);
    expect(model.faq.length).toBeLessThanOrEqual(8);
    expect(model.links.map((item) => item.href)).toContain("/mawaeed");
    expect(model.links.map((item) => item.href)).toContain("/services/citizen-account-date");
    expect(model.links.map((item) => item.href)).not.toContain("/mawaeed/salaries");
    expect(model.links.map((item) => item.href)).not.toContain("/services/government-salaries-date");
  });

  it("prints only stored dates and FAQPage plus WebPage plus breadcrumbs", () => {
    const { model } = page("government-salaries-date", salary, occurrences);
    const html = renderServiceSemanticHtml(model);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("موعد صرف رواتب موظفي الدولة");
    expect(model.canonical).toBe("https://sabq.org/services/government-salaries-date");
    expect(html).toContain("data-countdown");
    expect(html).not.toContain("الحالة:");
    expect(html).toContain("مؤكد");
    expect(html).toContain("صُرفت");
    expect(html).toContain("/calendar.ics");
    expect(model.ogImage).toContain("/og.png");
    expect(html).not.toContain("#e2b340");
    expect(html).not.toContain("#071422");
    expect(html).not.toContain(EXPECTED_HINT);
    expect(html).not.toContain("مسودة لا تظهر");
    const dates = [...html.matchAll(/datetime="(\d{4}-\d{2}-\d{2})"/g)].map((match) => match[1]);
    const stored = new Set(["2026-09-27", "2026-10-27", "2026-11-26"]);
    for (const date of dates) {
      if (date.length === 10) expect(stored.has(date) || date === model.dateModified.slice(0, 10)).toBe(true);
    }
    expect(html).not.toContain("foundingDate");

    const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] ?? "{}");
    const types = json["@graph"].map((node: { "@type": string }) => node["@type"]);
    expect(types).toEqual(expect.arrayContaining(["WebPage", "BreadcrumbList", "FAQPage"]));
    const webPage = json["@graph"].find((node: { "@type": string }) => node["@type"] === "WebPage");
    expect(webPage.dateModified).toBe(model.dateModified);
    const crumbs = json["@graph"].find((node: { "@type": string }) => node["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement).toHaveLength(3);
    expect(crumbs.itemListElement[2].item).toBe(model.canonical);
    const faq = json["@graph"].find((node: { "@type": string }) => node["@type"] === "FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    expect(faq.mainEntity.every((item: { acceptedAnswer: { text: string } }) => item.acceptedAnswer.text.length > 0)).toBe(true);
  });
});

describe("citizen account service page", () => {
  const citizen = series({
    id: "s-citizen",
    slug: "citizen-account",
    kind: "citizen_account",
    titleAr: "حساب المواطن",
    sortOrder: 2,
  });

  it("labels a computed date متوقع and reuses the existing weekend note", () => {
    const { view, model } = page("citizen-account-date", citizen, [
      row({
        id: "batch",
        seriesId: "s-citizen",
        titleAr: "دفعة نوفمبر",
        startsOn: "2026-11-10",
        certainty: "expected",
        sourceUrl: "https://www.ca.gov.sa",
        sourceTitle: "حساب المواطن",
      }),
    ]);
    expect(model.h1).toBe("موعد صرف حساب المواطن");
    expect(model.next?.certaintyLabel).toBe("متوقع");
    expect(model.next?.expectedHint).toBe(EXPECTED_HINT);
    expect(model.shiftRule).toContain("الجدول المعتاد");
    expect(model.shiftRule).toContain("الخميس 9");
    expect(model.shiftRule).toContain("الأحد 11");
    expect(model.shiftRule).not.toContain("لم نجد قاعدة");
    expect(view.faq.some((item) => item.answer.includes("لم نجد قاعدة"))).toBe(true);
    expect(model.faq.some((item) => item.answer.includes("لم نجد قاعدة"))).toBe(false);
    const html = renderServiceSemanticHtml(model, [
      { title: "خبر عن الدفعة", href: "/article/citizen-deposit" },
    ]);
    expect(html).toContain("متوقع");
    expect(html).toContain("محسوب من الجدول المعتاد للجهة إلى أن يصدر الإعلان الرسمي.");
    expect(html).not.toContain("الحالة:");
    expect(html).toContain("خبر عن الدفعة");
    expect(html).toContain("/services/government-salaries-date");
    expect(html).not.toContain("/mawaeed/citizen-account");
    expect(html).toContain('datetime="2026-11-10"');
    expect(model.faq.filter((item) => item.question.trim()).length).toBeGreaterThanOrEqual(5);
  });

  it("does not invent a date when the series has none upcoming", () => {
    const { model } = page("citizen-account-date", citizen, [
      row({ id: "old", seriesId: "s-citizen", titleAr: "دفعة قديمة", startsOn: "2026-09-10", certainty: "confirmed" }),
    ]);
    expect(model.next).toBeNull();
    expect(model.calendarHref).toBeNull();
    expect(model.rows.map((item) => item.startsOn)).toEqual(["2026-09-10"]);
    expect(model.rows[0].pastLabel).toBe("صُرفت");
    expect(model.leadPrefix).toContain("لا يوجد موعد قادم");
    const html = renderServiceSemanticHtml(model);
    expect(html).toContain("2026-09-10");
    expect(html).toContain("صُرفت");
    expect(html).not.toContain("calendar.ics");
  });
});

describe("other mawaeed service pages", () => {
  it("builds school calendar, social security, and pensions service pages", () => {
    const school = series({
      id: "s-school",
      slug: "school-calendar-1448",
      kind: "school_holiday",
      titleAr: "التقويم الدراسي 1448",
      sortOrder: 1,
    });
    const { model: schoolModel } = page("school-calendar-date", school, [
      row({ id: "hol-past", seriesId: "s-school", titleAr: "إجازة سابقة", startsOn: "2026-09-10", certainty: "confirmed" }),
      row({ id: "hol-next", seriesId: "s-school", titleAr: "إجازة الخريف", startsOn: "2026-11-20", certainty: "confirmed" }),
    ]);
    expect(schoolModel.tone).toBe("school");
    expect(schoolModel.leadPrefix).toContain("موعد الإجازة المدرسية القادمة هو");
    expect(schoolModel.rows.find((item) => item.isPast)?.pastLabel).toBe("انتهت");
    expect(renderServiceSemanticHtml(schoolModel)).toContain("انتهت");
  });
});

describe("service page extras", () => {
  it("keeps related article links on the public article path", () => {
    const search = {
      results: [
        { title: "خبر", englishSlug: "real-slug", slug: "arabic" },
        { title: "خبر", slug: "duplicate-title" },
        { title: "سيئ", slug: "../secret" },
        { title: "", slug: "missing-title" },
      ],
    };
    const keyword = { articles: search.results };
    expect(relatedArticlesFromSearch(search)).toEqual([{ title: "خبر", href: "/article/real-slug" }]);
    expect(nextRelatedFromSearch(search)).toEqual(relatedArticlesFromSearch(search));
    expect(nextRelatedFromKeyword(keyword)).toEqual(relatedArticlesFromKeyword(keyword));
  });

  it("builds an all-day calendar from upcoming rows only", () => {
    const salary = series({ id: "s-salary", slug: "salaries", kind: "salary", titleAr: "رواتب موظفي الدولة" });
    const { model } = page("government-salaries-date", salary, [
      row({ id: "past", seriesId: "s-salary", titleAr: "رواتب سبتمبر", startsOn: "2026-09-27" }),
      row({ id: "next", seriesId: "s-salary", titleAr: "رواتب أكتوبر", startsOn: "2026-10-27", certainty: "expected" }),
    ]);
    const ics = buildServiceCalendar(model);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261027");
    expect(ics).not.toContain("DTSTART;VALUE=DATE:20260927");
    expect(ics).toContain("متوقع");
    expect(ics).not.toContain("مسودة");
  });

  it("links Mawaeed series to their new service pages while keeping hidden pages out of the sitemap", () => {
    expect(servicePageSitemapEntries([
      { slug: "salaries", contentUpdatedAt: "2026-10-01T00:00:00.000Z" },
      { slug: "citizen-account", contentUpdatedAt: "2026-10-01T00:00:00.000Z" },
      { slug: "school-calendar-1448", contentUpdatedAt: "2026-10-01T00:00:00.000Z" },
    ])).toEqual([]);
    expect(serviceLinkForSeries("salaries")?.path).toBe("/services/government-salaries-date");
    expect(serviceLinkForSeries("citizen-account")?.path).toBe("/services/citizen-account-date");
    expect(serviceLinkForSeries("school-calendar-1448")?.path).toBe("/services/school-calendar-date");
    expect(serviceLinkForSeries("social-security")?.path).toBe("/services/social-security-date");
    expect(serviceLinkForSeries("pensions")?.path).toBe("/services/pensions-date");
    expect(HIDDEN_SERVICE_ROBOTS).toBe("noindex, nofollow");
  });
});
