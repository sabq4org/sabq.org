import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { redirectTargetWithSearch, slugRedirectMiddleware } from "../../server/middleware/slugRedirect";

describe("slug redirect keeps measurement tags", () => {
  it("appends the inbound query onto the canonical path", () => {
    const target = redirectTargetWithSearch(
      "/article/english-slug",
      "/article/خبر?utm_source=x&utm_medium=social&utm_campaign=sabqorg&utm_content=post-1",
    );
    const url = new URL(`https://sabq.org${target}`);
    expect(url.pathname).toBe("/article/english-slug");
    expect(url.searchParams.get("utm_source")).toBe("x");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("sabqorg");
    expect(url.searchParams.get("utm_content")).toBe("post-1");
  });

  it("leaves a path without a query unchanged", () => {
    expect(redirectTargetWithSearch("/category/saudi", "/category/سعودي")).toBe("/category/saudi");
  });

  it("strips _cb from 301 redirect targets while keeping meaningful query params", () => {
    expect(redirectTargetWithSearch("/category/saudia", "/category/saudia?_cb=123456")).toBe("/category/saudia");
    expect(redirectTargetWithSearch("/category/saudia", "/category/saudia?_cb=123456&page=2")).toBe("/category/saudia?page=2");
  });

  it("301 redirects HTML GET requests carrying _cb to the clean URL", async () => {
    const redirect = vi.fn();
    const next = vi.fn();
    await slugRedirectMiddleware(
      {
        method: "GET",
        path: "/category/saudia",
        originalUrl: "/category/saudia?_cb=1",
        url: "/category/saudia?_cb=1",
      } as any,
      { redirect } as any,
      next,
    );
    expect(redirect).toHaveBeenCalledWith(301, "/category/saudia");
    expect(next).not.toHaveBeenCalled();
  });
});
