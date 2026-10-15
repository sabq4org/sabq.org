import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Pages middleware has no TypeScript declaration.
import { onRequest } from "../../functions/_middleware.js";
import { SERIES_CATALOG, type OccurrenceRecord, type SeriesRecord } from "@shared/mawaeed/model";
import { presentMawaeed } from "@shared/mawaeed/present";
import { presentServicePage } from "@shared/servicePages/present";

class PassThroughRewriter {
  on() { return this; }
  transform(res: Response) { return res; }
}

const put = vi.fn();
const fetcher = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue(undefined);
  vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("HTMLRewriter", PassThroughRewriter);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const salary: SeriesRecord = {
  id: "s1",
  slug: "salaries",
  kind: "salary",
  titleAr: "رواتب موظفي الدولة",
  summaryAr: SERIES_CATALOG.find((item) => item.slug === "salaries")?.summaryAr ?? "",
  sortOrder: 3,
  published: true,
  contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
};

const occurrence: OccurrenceRecord = {
  id: "oct",
  seriesId: "s1",
  titleAr: "رواتب أكتوبر 2026",
  startsOn: "2026-10-27",
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
};

function model() {
  const presented = presentMawaeed({
    pageSlug: "salaries",
    now: new Date("2026-10-15T12:00:00+03:00"),
    series: [salary],
    occurrences: [occurrence],
  });
  if (presented.notFound) throw new Error("expected view");
  const page = presentServicePage("government-salaries-date", presented.view);
  if (!page) throw new Error("expected service page");
  return page;
}

describe("service page edge branch", () => {
  it("renders the answer page from the API and does not fall through to the SPA", async () => {
    fetcher.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/search")) {
        return Response.json({ results: [{ title: "رواتب أكتوبر", englishSlug: "october-salaries" }] });
      }
      return Response.json(model());
    });
    const next = vi.fn(async () => new Response("spa-shell", { headers: { "Content-Type": "text/html" } }));
    const response = await onRequest({
      request: new Request("https://sabq.org/services/government-salaries-date", { headers: { "User-Agent": "Mozilla/5.0" } }),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("27 أكتوبر 2026");
    expect(html).toContain("موعد صرف رواتب موظفي الدولة");
    expect(html).toContain("/article/october-salaries");
    expect(html).toContain("FAQPage");
    expect(next).not.toHaveBeenCalled();
    expect(response.headers.get("X-Robots-Tag")).toContain("index");
  });

  it("returns noindex on a preview host and 404 for an unknown service id", async () => {
    fetcher.mockResolvedValue(Response.json({ message: "الصفحة غير موجودة" }, { status: 404 }));
    const next = vi.fn(async () => new Response("spa-shell"));
    const missing = await onRequest({
      request: new Request("https://staging.sabq.org/services/not-a-service"),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn(),
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(next).not.toHaveBeenCalled();
  });
});
