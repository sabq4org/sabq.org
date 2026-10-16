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
  id: "s1",
  slug: "salaries",
  kind: "salary",
  titleAr: "رواتب موظفي الدولة",
  summaryAr: "ملخص",
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

function view() {
  const presented = presentMawaeed({
    now: new Date("2026-09-27T12:00:00+03:00"),
    series: [series],
    occurrences: [occurrence],
  });
  if (presented.notFound) throw new Error("expected view");
  return presented.view;
}

describe("mawaeed edge branch", () => {
  it("renders the public page from the API JSON and does not call the SPA", async () => {
    fetcher.mockResolvedValue(Response.json(view()));
    const next = vi.fn(async () => new Response("spa-shell", { headers: { "Content-Type": "text/html" } }));
    const response = await onRequest({
      request: new Request("https://sabq.org/mawaeed", { headers: { "User-Agent": "Mozilla/5.0" } }),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("27 أكتوبر 2026");
    expect(html).toContain("data-countdown");
    expect(next).not.toHaveBeenCalled();
    expect(response.headers.get("CDN-Cache-Control")).toBe("public, max-age=60");
  });

  it("keys the edge cache by Riyadh day so a midnight reload never gets yesterday's page", async () => {
    vi.useFakeTimers();
    try {
      const keys: string[] = [];
      for (const now of ["2026-10-16T20:59:30Z", "2026-10-16T21:00:30Z"]) {
        vi.setSystemTime(new Date(now));
        put.mockClear();
        fetcher.mockResolvedValue(Response.json(view()));
        const waits: Promise<unknown>[] = [];
        await onRequest({
          request: new Request("https://sabq.org/mawaeed", { headers: { "User-Agent": "Mozilla/5.0" } }),
          env: { CF_PAGES_COMMIT_SHA: "abc" },
          next: vi.fn(),
          waitUntil: vi.fn((promise: Promise<unknown>) => { waits.push(promise); return promise; }),
        });
        await Promise.all(waits);
        keys.push((put.mock.calls[0]?.[0] as Request).url);
      }
      expect(keys[0]).toContain("__d=2026-10-16");
      expect(keys[1]).toContain("__d=2026-10-17");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 503 noindex when the API fails, without the SPA shell", async () => {
    fetcher.mockRejectedValue(new Error("origin down"));
    const next = vi.fn(async () => new Response("spa-shell"));
    const response = await onRequest({
      request: new Request("https://sabq.org/mawaeed"),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn(),
    });
    const html = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(html).toContain("تعذر تحميل المواعيد");
    expect(html).not.toContain("spa-shell");
    expect(next).not.toHaveBeenCalled();
  });

  it("redirects legacy /mawaeed/:slug URLs to their new /services/* pages", async () => {
    const next = vi.fn(async () => new Response("spa-shell"));
    const response = await onRequest({
      request: new Request("https://sabq.org/mawaeed/salaries"),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn(),
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://sabq.org/services/government-salaries-date");
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps the picked region when a legacy school link redirects", async () => {
    const redirect = async (path: string) => onRequest({
      request: new Request(`https://sabq.org${path}`),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next: vi.fn(async () => new Response("spa-shell")),
      waitUntil: vi.fn(),
    });
    const makkah = await redirect("/mawaeed/school-calendar-1448?region=makkah");
    expect(makkah.status).toBe(301);
    expect(makkah.headers.get("Location")).toBe("https://sabq.org/services/school-calendar-date?region=makkah");
    const riyadh = await redirect("/mawaeed/school-calendar-1448?region=riyadh");
    expect(riyadh.headers.get("Location")).toBe("https://sabq.org/services/school-calendar-date");
    const junk = await redirect("/mawaeed/school-calendar-1448?region=mars");
    expect(junk.headers.get("Location")).toBe("https://sabq.org/services/school-calendar-date");
    const salaries = await redirect("/mawaeed/salaries?region=makkah");
    expect(salaries.headers.get("Location")).toBe("https://sabq.org/services/government-salaries-date");
  });

  it("leaves article requests on the existing path", async () => {
    fetcher.mockResolvedValue(Response.json(view()));
    const next = vi.fn(async () => new Response("<html><body>article-shell</body></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }));
    const response = await onRequest({
      request: new Request("https://sabq.org/article/hello", { headers: { "User-Agent": "Mozilla/5.0" } }),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn(),
    });
    const html = await response.text();
    expect(next).toHaveBeenCalled();
    expect(html).toContain("article-shell");
    expect(html).not.toContain("data-countdown");
  });
});
