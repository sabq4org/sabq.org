import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Pages middleware has no TypeScript declaration.
import { onRequest } from "../../functions/_middleware.js";
import { presentMawaeed } from "@shared/mawaeed/present";
import type { OccurrenceRecord, SeriesRecord } from "@shared/mawaeed/model";

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

const series: SeriesRecord = {
  id: "citizen",
  slug: "citizen-account",
  kind: "citizen_account",
  titleAr: "حساب المواطن",
  summaryAr: "ملخص الإيداع.",
  sortOrder: 2,
  published: true,
  contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
};

const occurrence: OccurrenceRecord = {
  id: "nov",
  seriesId: "citizen",
  titleAr: "حساب المواطن — الدفعة 108",
  startsOn: "2026-11-10",
  endsOn: null,
  sourceUrl: "https://x.com/citizenaccount/status/2097792187396157787",
  sourceTitle: "برنامج حساب المواطن",
  certainty: "expected",
  status: "scheduled",
  published: true,
  regionGroup: "all",
  hijriLabel: null,
  publicNote: null,
  ruleNote: "محسوب",
};

function view() {
  const presented = presentMawaeed({
    pageSlug: "citizen-account",
    now: new Date("2026-10-15T12:00:00+03:00"),
    series: [series],
    occurrences: [occurrence],
  });
  if (presented.notFound) throw new Error("expected view");
  return presented.view;
}

function request(url = "https://sabq.org/services/citizen-account-date") {
  return new Request(url, { headers: { "User-Agent": "Mozilla/5.0" } });
}

describe("citizen account date edge", () => {
  it("renders the answer from mawaeed JSON and does not fall through to the SPA", async () => {
    fetcher.mockImplementation(async (input: Request | string) => {
      const url = String(input);
      if (url.includes("/api/keyword/")) {
        return Response.json({
          articles: [{ title: "خبر الإيداع", englishSlug: "0n60sln", publishedAt: "2026-10-01T00:00:00.000Z" }],
          muqtarabTopics: [],
        });
      }
      return Response.json(view());
    });
    const next = vi.fn(async () => new Response("spa-shell", { headers: { "Content-Type": "text/html" } }));
    const response = await onRequest({
      request: request(),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("موعد صرف حساب المواطن");
    expect(html).toContain("متوقع");
    expect(html).toContain('href="/article/0n60sln"');
    expect(html).toContain("application/ld+json");
    expect(next).not.toHaveBeenCalled();
    expect(html).not.toContain("spa-shell");
    expect(response.headers.get("CDN-Cache-Control")).toBe("public, max-age=60");
  });

  it("still renders the date when the keyword query fails", async () => {
    fetcher.mockImplementation(async (input: Request | string) => {
      const url = String(input);
      if (url.includes("/api/keyword/")) throw new Error("keyword down");
      return Response.json(view());
    });
    const response = await onRequest({
      request: request(),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next: vi.fn(),
      waitUntil: vi.fn(),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("متوقع");
    expect(html).not.toContain("آخر أخبار حساب المواطن");
  });

  it("returns 503 noindex when the dates API fails", async () => {
    fetcher.mockRejectedValue(new Error("origin down"));
    const next = vi.fn(async () => new Response("spa-shell"));
    const response = await onRequest({
      request: request(),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn(),
    });
    const html = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(html).toContain("تعذر تحميل موعد الصرف");
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses a production API origin on staging", async () => {
    const token = "staging-token";
    const response = await onRequest({
      request: new Request("https://staging.sabq.org/services/citizen-account-date", {
        headers: { authorization: `Basic ${btoa(`sabq:${token}`)}` },
      }),
      env: {
        STAGING_NO_INDEX: "true",
        STAGING_ACCESS_TOKEN: token,
        API_ORIGIN: "https://api.sabq.org",
      },
      next: vi.fn(),
      waitUntil: vi.fn(),
    });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Staging API origin is not configured.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
