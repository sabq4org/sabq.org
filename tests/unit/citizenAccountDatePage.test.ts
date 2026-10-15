import { describe, expect, it } from "vitest";
// @ts-expect-error Pages function has no TypeScript declaration.
import {
  isCitizenAccountDatePath,
  leadText,
  relatedArticlesFromPayload,
  renderCitizenAccountDateHtml,
} from "../../functions/citizenAccountDatePage.js";
// @ts-expect-error Pages function has no TypeScript declaration.
import { renderMawaeedHtml } from "../../functions/mawaeedPage.js";
import { mawaeedSitemapEntries } from "@shared/mawaeed/model";
import { presentMawaeed } from "@shared/mawaeed/present";
import type { OccurrenceRecord, SeriesRecord } from "@shared/mawaeed/model";

const series: SeriesRecord = {
  id: "citizen",
  slug: "citizen-account",
  kind: "citizen_account",
  titleAr: "حساب المواطن",
  summaryAr: "موعد إيداع دعم حساب المواطن. اليوم المعتاد هو 10 من الشهر الميلادي.",
  sortOrder: 2,
  published: true,
  contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
};

function row(partial: Partial<OccurrenceRecord> & Pick<OccurrenceRecord, "id" | "titleAr" | "startsOn" | "certainty" | "published">): OccurrenceRecord {
  return {
    seriesId: "citizen",
    endsOn: null,
    sourceUrl: "https://x.com/citizenaccount/status/2097792187396157787",
    sourceTitle: "برنامج حساب المواطن",
    status: "scheduled",
    regionGroup: "all",
    hijriLabel: null,
    publicNote: null,
    ruleNote: partial.certainty === "expected" ? "محسوب من الجدول المعتاد" : null,
    ...partial,
  };
}

const rows: OccurrenceRecord[] = [
  row({
    id: "past",
    titleAr: "حساب المواطن — الدفعة 106",
    startsOn: "2026-09-10",
    certainty: "confirmed",
    published: true,
  }),
  row({
    id: "hidden",
    titleAr: "دفعة لا تُعرض",
    startsOn: "2026-10-10",
    certainty: "unverified",
    published: false,
  }),
  row({
    id: "next",
    titleAr: "حساب المواطن — الدفعة 108",
    startsOn: "2026-11-10",
    certainty: "expected",
    published: true,
  }),
  row({
    id: "later",
    titleAr: "حساب المواطن — الدفعة 109",
    startsOn: "2026-12-10",
    certainty: "confirmed",
    published: true,
  }),
];

function view() {
  const presented = presentMawaeed({
    pageSlug: "citizen-account",
    now: new Date("2026-10-15T12:00:00+03:00"),
    series: [series],
    occurrences: rows,
  });
  if (presented.notFound) throw new Error("expected citizen view");
  return presented.view;
}

function jsonLd(html: string) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("missing json-ld");
  return JSON.parse(match[1]);
}

describe("citizen account date page", () => {
  it("matches only the answer path", () => {
    expect(isCitizenAccountDatePath("/services/citizen-account-date")).toBe(true);
    expect(isCitizenAccountDatePath("/services/citizen-account-date/extra")).toBe(false);
    expect(isCitizenAccountDatePath("/mawaeed/citizen-account")).toBe(false);
  });

  it("answers with the next mawaeed date, hijri, countdown, and expected label", () => {
    const data = view();
    const html = renderCitizenAccountDateHtml(data, { indexable: true });
    const next = data.series[0].next;
    if (!next) throw new Error("expected a next payment");
    const firstParagraph = html.slice(html.indexOf("<p"), html.indexOf("</p>"));
    expect(firstParagraph).toContain(next.gregorianLabel);
    expect(firstParagraph).toContain(next.hijriLabel);
    expect(firstParagraph).toContain(next.countdownText);
    expect(firstParagraph).toContain("متوقع");
    expect(firstParagraph).toContain("موعد صرف حساب المواطن");
    expect(html.indexOf("<p")).toBeLessThan(html.indexOf("<table"));
    expect(html).toContain('rel="canonical" href="https://sabq.org/services/citizen-account-date"');
    expect(html).toContain(`datetime="${data.dateModified}"`);
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain("دفعة لا تُعرض");
    expect(html).toContain("حساب المواطن — الدفعة 109");
    expect(html).toContain("مؤكد");
    expect(html).toContain("صُرفت");
    expect(html).toContain("كيف يُصرف الدعم ومن يحدد الأهلية؟");
    const questions = html.match(/<h3>/g) || [];
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.length).toBeLessThanOrEqual(8);
  });

  it("puts FAQ, webpage, article, and breadcrumb in JSON-LD from the same stamp", () => {
    const data = view();
    const graph = jsonLd(renderCitizenAccountDateHtml(data))["@graph"] as { "@type": string; dateModified?: string; mainEntity?: unknown[]; itemListElement?: { name: string }[] }[];
    const types = graph.map((node) => node["@type"]);
    expect(types).toEqual(expect.arrayContaining(["WebPage", "Article", "FAQPage", "BreadcrumbList"]));
    for (const node of graph) {
      if (node.dateModified) expect(node.dateModified).toBe(data.dateModified);
    }
    const faq = graph.find((node) => node["@type"] === "FAQPage");
    expect(faq?.mainEntity?.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(faq)).not.toContain("يُستكمل");
    const crumbs = graph.find((node) => node["@type"] === "BreadcrumbList");
    expect(crumbs?.itemListElement?.map((item) => item.name)).toEqual(["سبق", "مواعيدك", "موعد صرف حساب المواطن"]);
    expect(leadText(data)).toContain(data.series[0].next?.gregorianLabel);
  });

  it("links only safe article slugs from the keyword payload", () => {
    const articles = relatedArticlesFromPayload({
      articles: [
        { title: "خبر حساب المواطن", englishSlug: "0n60sln", publishedAt: "2026-10-01T00:00:00.000Z" },
        { title: "مسار سيئ", englishSlug: "../secret" },
        { title: "", englishSlug: "empty-title" },
      ],
    });
    expect(articles).toEqual([
      { title: "خبر حساب المواطن", href: "/article/0n60sln", publishedAt: "2026-10-01T00:00:00.000Z" },
    ]);
    const html = renderCitizenAccountDateHtml(view(), { articles });
    expect(html).toContain('href="/article/0n60sln"');
    expect(html).not.toContain("../secret");
  });

  it("links the answer page from mawaeed home and the citizen series", () => {
    const presented = presentMawaeed({
      now: new Date("2026-10-15T12:00:00+03:00"),
      series: [series],
      occurrences: rows,
    });
    if (presented.notFound) throw new Error("expected home");
    const home = renderMawaeedHtml(presented.view);
    expect(home).toContain('href="/services/citizen-account-date"');
    const detail = renderCitizenAccountDateHtml(view());
    expect(detail).toContain('href="/mawaeed/citizen-account"');
    const seriesPage = presentMawaeed({
      pageSlug: "citizen-account",
      now: new Date("2026-10-15T12:00:00+03:00"),
      series: [series],
      occurrences: rows,
    });
    if (seriesPage.notFound) throw new Error("expected series");
    expect(renderMawaeedHtml(seriesPage.view)).toContain('href="/services/citizen-account-date"');
  });

  it("adds the answer page to the sitemap only while the series is published", () => {
    const entries = mawaeedSitemapEntries([series, { ...series, slug: "salaries", published: true }]);
    expect(entries.map((entry) => entry.loc)).toContain("https://sabq.org/services/citizen-account-date");
    const hidden = mawaeedSitemapEntries([{ ...series, published: false }]);
    expect(hidden).toEqual([]);
    const others = mawaeedSitemapEntries([{ ...series, slug: "salaries" }]);
    expect(others.map((entry) => entry.loc)).not.toContain("https://sabq.org/services/citizen-account-date");
  });
});
