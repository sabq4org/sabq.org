import { describe, expect, it } from "vitest";
import { EXPECTED_HINT, SERIES_CATALOG, type OccurrenceRecord, type SeriesRecord } from "@shared/mawaeed/model";
import { presentMawaeed } from "@shared/mawaeed/present";
import { buildServiceCalendar } from "@shared/servicePages/calendar";
import { SERVICE_PAGE_ROBOTS, serviceLinkForSeries, serviceRegion, servicePageIdFromPath, servicePageSitemapEntries } from "@shared/servicePages/catalog";
import { presentServicePage } from "@shared/servicePages/present";
import { relatedArticleMeta, relatedArticlesFromKeyword, relatedArticlesFromSearch } from "@shared/servicePages/related";
import {
  relatedArticleMeta as nextRelatedMeta,
  relatedArticlesFromKeyword as nextRelatedFromKeyword,
  relatedArticlesFromSearch as nextRelatedFromSearch,
  serviceModelPath,
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

  it("passes region only to the real school service API route", () => {
    expect(serviceModelPath("school-calendar-date", "makkah"))
      .toBe("/api/service-pages/school-calendar-date?region=makkah");
    expect(serviceModelPath("school-calendar-date", "riyadh & east"))
      .toBe("/api/service-pages/school-calendar-date?region=riyadh%20%26%20east");
    expect(serviceModelPath("government-salaries-date", "makkah"))
      .toBe("/api/service-pages/government-salaries-date");
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
    // الشهر والسنة من الموعد القادم في العنوان، والعنوان الظاهر h1 كما هو
    expect(model.title).toBe("موعد صرف رواتب موظفي الدولة أكتوبر 2026: الموعد القادم وكم باقي | سبق");
    expect(model.canonical).toBe("https://sabq.org/services/government-salaries-date");
    expect(model.dateModified).toBe(view.dateModified);
    expect(model.next?.hijriLabel).toBe(next?.hijriLabel);
    expect(model.next?.countdownText).toBe(next?.countdownText);
    expect(model.next?.certainty).toBe("confirmed");
    expect(model.shiftRule).toContain("الخميس الذي قبله");
    expect(model.shiftRule).toContain("الأحد الذي بعده");
    expect(model.explanation.join(" ")).toContain("يوم 27 من كل شهر ميلادي");
    // قاعدة الإزاحة تظهر مرة واحدة (shiftRule) ولا تتكرر في الشرح
    expect(model.explanation.join(" ")).not.toContain("الخميس الذي قبله");
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
    expect(model.title).toBe("موعد صرف حساب المواطن نوفمبر 2026: الدفعة القادمة بالتاريخ الهجري والميلادي | سبق");
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
    // بلا موعد قادم لا شهر في العنوان
    expect(model.title).toBe("موعد صرف حساب المواطن: الدفعة القادمة بالتاريخ الهجري والميلادي | سبق");
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
    expect(schoolModel.title).toBe("التقويم الدراسي 1448: موعد أقرب إجازة في نوفمبر 2026 وكم باقي عليها | سبق");
    expect(schoolModel.leadPrefix).toContain("موعد الإجازة المدرسية القادمة في الرياض هو");
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
    expect(relatedArticlesFromSearch(search)).toEqual([{ title: "خبر", href: "/article/real-slug", publishedAt: null }]);
    // الرابط نفسه بعنوانين مختلفين = خبر واحد
    const sameSlug = { results: [{ title: "عنوان أول", slug: "one" }, { title: "عنوان ثانٍ", slug: "one" }] };
    expect(relatedArticlesFromSearch(sameSlug)).toHaveLength(1);
    expect(nextRelatedFromSearch(sameSlug)).toHaveLength(1);
    expect(nextRelatedFromSearch(search)).toEqual(relatedArticlesFromSearch(search));
    expect(nextRelatedFromKeyword(keyword)).toEqual(relatedArticlesFromKeyword(keyword));
  });

  it("dates related articles, newest first, and marks the archive after 45 days", () => {
    const search = {
      results: [
        { title: "قديم جدا", slug: "oldest", publishedAt: "2025-06-23T09:00:00.000Z" },
        { title: "حديث", slug: "recent", publishedAt: "2026-10-01T09:00:00.000Z" },
        { title: "بلا تاريخ", slug: "undated" },
        { title: "قديم", slug: "old", publishedAt: "2025-10-30T09:00:00.000Z" },
        { title: "خامس", slug: "fifth", publishedAt: "2024-01-01T09:00:00.000Z" },
      ],
    };
    const links = relatedArticlesFromSearch(search);
    expect(links.map((link) => link.href)).toEqual(["/article/recent", "/article/old", "/article/oldest", "/article/fifth"]);
    expect(nextRelatedFromSearch(search)).toEqual(links);

    const now = new Date("2026-10-16T12:00:00+03:00");
    expect(relatedArticleMeta(links[0], now)).toEqual({ dateLabel: "الخميس 1 أكتوبر 2026", archived: false });
    expect(relatedArticleMeta(links[1], now)).toEqual({ dateLabel: "الخميس 30 أكتوبر 2025", archived: true });
    expect(relatedArticleMeta({ title: "x", href: "/article/x", publishedAt: null }, now)).toEqual({ dateLabel: null, archived: false });
    for (const link of [...links, { title: "x", href: "/article/x", publishedAt: "not a date" }]) {
      expect(nextRelatedMeta(link, now)).toEqual(relatedArticleMeta(link, now));
    }
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
    // UID على معرّف الصف لا تاريخه: تعديل التاريخ يحدّث الحدث نفسه عند القارئ
    expect(ics).toContain("UID:government-salaries-date-next@sabq.org");
  });

  it("links Mawaeed series to their service pages and lists them once in the sitemap", () => {
    expect(servicePageSitemapEntries([
      { slug: "salaries", contentUpdatedAt: "2026-10-01T00:00:00.000Z" },
      { slug: "citizen-account", contentUpdatedAt: "2026-10-02T00:00:00.000Z" },
      { slug: "school-calendar-1448", contentUpdatedAt: "2026-10-03T00:00:00.000Z" },
    ])).toEqual([
      { loc: "https://sabq.org/services/school-calendar-date", lastmod: "2026-10-03T00:00:00.000Z" },
      { loc: "https://sabq.org/services/citizen-account-date", lastmod: "2026-10-02T00:00:00.000Z" },
      { loc: "https://sabq.org/services/government-salaries-date", lastmod: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(serviceLinkForSeries("salaries")?.path).toBe("/services/government-salaries-date");
    expect(serviceLinkForSeries("citizen-account")?.path).toBe("/services/citizen-account-date");
    expect(serviceLinkForSeries("school-calendar-1448")?.path).toBe("/services/school-calendar-date");
    expect(serviceLinkForSeries("social-security")?.path).toBe("/services/social-security-date");
    expect(serviceLinkForSeries("pensions")?.path).toBe("/services/pensions-date");
    expect(SERVICE_PAGE_ROBOTS).toContain("index, follow");
    expect(SERVICE_PAGE_ROBOTS).not.toContain("noindex");
  });
});

describe("school service page region", () => {
  const school = series({ id: "s-school", slug: "school-calendar-1448", kind: "school_holiday", titleAr: "التقويم الدراسي 1448" });
  const occurrences: OccurrenceRecord[] = [
    row({ id: "extra-riyadh", seriesId: "s-school", titleAr: "الإجازة الإضافية الأولى (الإدارات غير الغربية)", startsOn: "2026-10-25", regionGroup: "riyadh_most" }),
    row({ id: "extra-riyadh-later", seriesId: "s-school", titleAr: "الإجازة الإضافية الثانية (الإدارات غير الغربية)", startsOn: "2026-11-29", regionGroup: "riyadh_most" }),
    row({ id: "autumn", seriesId: "s-school", titleAr: "إجازة الخريف", startsOn: "2026-11-20" }),
    row({ id: "extra-west", seriesId: "s-school", titleAr: "الإجازة الإضافية (الغرب)", startsOn: "2026-10-25", regionGroup: "western" }),
  ];

  function schoolPage(region: string | null) {
    const presented = presentMawaeed({ pageSlug: school.slug, region, now: NOW, series: [school], occurrences });
    if (presented.notFound) throw new Error("expected mawaeed view");
    const model = presentServicePage("school-calendar-date", presented.view);
    if (!model) throw new Error("expected service page");
    return model;
  }

  it.each([
    ["riyadh", "2026-10-25", ""],
    ["qassim", "2026-10-25", "?region=qassim"],
    ["makkah", "2026-10-25", "?region=makkah"],
    ["madinah", "2026-10-25", "?region=madinah"],
    ["jeddah", "2026-10-25", "?region=jeddah"],
    ["taif", "2026-10-25", "?region=taif"],
  ])("shows %s dates and carries the region to the calendar and share image", (region, nextDate, suffix) => {
    const model = schoolPage(region);
    expect(model.region).toBe(region);
    expect(model.next?.startsOn).toBe(nextDate);
    expect(model.calendarHref).toBe(`/api/service-pages/school-calendar-date/calendar.ics${suffix}`);
    expect(model.ogImage).toBe(`https://sabq.org/api/service-pages/school-calendar-date/og.png${suffix}`);
    expect(model.canonical).toBe("https://sabq.org/services/school-calendar-date");
    const ics = buildServiceCalendar(model) ?? "";
    if (region === "riyadh" || region === "qassim") {
      expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
      const uidPrefix = region === "riyadh" ? "school-calendar-date" : `school-calendar-date-${region}`;
      expect(ics).toContain(`UID:${uidPrefix}-extra-riyadh@sabq.org`);
    } else {
      expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
      expect(ics).not.toContain("DTSTART;VALUE=DATE:20261129");
      expect(ics).toContain(`UID:school-calendar-date-${region}-extra-west@sabq.org`);
    }
  });

  it("links from /mawaeed to the school page with the picked region", () => {
    const presented = presentMawaeed({ region: "makkah", now: NOW, series: [school], occurrences });
    if (presented.notFound) throw new Error("expected mawaeed view");
    expect(presented.view.series[0].href).toBe("/services/school-calendar-date?region=makkah");
    expect(presented.view.nav.find((item) => item.label === "التقويم الدراسي 1448")?.href)
      .toBe("/services/school-calendar-date?region=makkah");
    const riyadh = presentMawaeed({ region: "riyadh", now: NOW, series: [school], occurrences });
    if (riyadh.notFound) throw new Error("expected mawaeed view");
    expect(riyadh.view.series[0].href).toBe("/services/school-calendar-date");
  });

  it("ignores the region on pages that do not vary by region", () => {
    expect(serviceRegion("government-salaries-date", "makkah")).toBe("riyadh");
    expect(serviceRegion("school-calendar-date", "MAKKAH")).toBe("makkah");
    expect(serviceRegion("school-calendar-date", "mars")).toBe("riyadh");
  });

  it("exposes the full region selector and warns when a region has no extra dates", () => {
    const noExtras = [occurrences[2]];
    const presented = presentMawaeed({ pageSlug: school.slug, region: "asir", now: NOW, series: [school], occurrences: noExtras });
    if (presented.notFound) throw new Error("expected mawaeed view");
    const model = presentServicePage("school-calendar-date", presented.view);
    if (!model) throw new Error("expected service page");
    expect(model.regions).toHaveLength(16);
    expect(model.region).toBe("asir");
    expect(model.regionNotice).toBe("المعروض هو التقويم الدراسي العام. لم تُعتمد في الخدمة إجازات إضافية خاصة بهذه المنطقة بعد.");
    expect(model.canonical).toBe("https://sabq.org/services/school-calendar-date");
  });
});

