import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { redirectTargetWithSearch } from "../../server/middleware/slugRedirect";

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
});
