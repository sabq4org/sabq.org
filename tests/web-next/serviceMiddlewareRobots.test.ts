import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: class {
    headers: Headers;
    status: number;

    constructor(_body: unknown = null, init: ResponseInit = {}) {
      this.headers = new Headers(init.headers);
      this.status = init.status ?? 200;
    }

    static next() {
      return new this();
    }
  },
}));

import { middleware } from "../../web-next/middleware";

const SERVICE_PATHS = [
  "/services/school-calendar-date",
  "/services/citizen-account-date",
  "/services/government-salaries-date",
  "/services/social-security-date",
  "/services/pensions-date",
];

function request(pathname: string, authorization?: string) {
  return {
    nextUrl: { pathname },
    headers: new Headers(authorization ? { authorization } : undefined),
  } as never;
}

afterEach(() => vi.unstubAllEnvs());

describe("web-next service crawl headers", () => {
  beforeEach(() => {
    vi.stubEnv("STAGING_ACCESS_TOKEN", "");
  });

  it("keeps the five public service routes indexable in production", () => {
    for (const pathname of SERVICE_PATHS) {
      const response = middleware(request(pathname));
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBeNull();
    }
  });

  it("hides service routes only for an authorized staging request", () => {
    vi.stubEnv("STAGING_ACCESS_TOKEN", "token");
    const authorization = `Basic ${btoa("sabq:token")}`;

    for (const pathname of SERVICE_PATHS) {
      const response = middleware(request(pathname, authorization));
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("keeps unauthorized staging requests private and blocked", () => {
    vi.stubEnv("STAGING_ACCESS_TOKEN", "token");
    const response = middleware(request(SERVICE_PATHS[0]));
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("leaves health available without crawl headers", () => {
    vi.stubEnv("STAGING_ACCESS_TOKEN", "token");
    const response = middleware(request("/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});

describe("web-next route headers", () => {
  it("keeps service routes public in production and hidden in staging", async () => {
    vi.stubEnv("STAGING_NO_INDEX", "false");
    vi.resetModules();
    const production = (await import("../../web-next/next.config.mjs")).default;
    const productionHeaders = await production.headers();
    expect(productionHeaders).not.toContainEqual(expect.objectContaining({ source: "/services/:id" }));
    expect(productionHeaders[0].headers).not.toContainEqual(expect.objectContaining({ key: "X-Robots-Tag" }));

    vi.stubEnv("STAGING_NO_INDEX", "true");
    vi.resetModules();
    const staging = (await import("../../web-next/next.config.mjs")).default;
    const stagingHeaders = await staging.headers();
    expect(stagingHeaders[0].headers).toContainEqual(expect.objectContaining({ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }));
    expect(stagingHeaders[0].headers).toContainEqual(expect.objectContaining({ key: "Cache-Control", value: "private, no-store" }));
  });
});
