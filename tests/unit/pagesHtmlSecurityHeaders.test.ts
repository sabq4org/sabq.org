import { describe, expect, it } from "vitest";

import {
  applyHtmlHeaders,
  htmlSecurityHeadersForHost,
  isHstsHost,
} from "../../functions/_middleware.js";

describe("Pages HTML security headers", () => {
  it("adds report-only CSP, nosniff, and strict referrer policy to HTML while preserving the stream", async () => {
    const body = "<!doctype html><html><body>مرحبا</body></html>";
    const response = applyHtmlHeaders(
      new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }),
      { "Cache-Control": "private, no-store" },
      "sabq.org",
    );

    expect(await response.text()).toBe(body);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=86400");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("report-uri /api/security/csp-report");
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("frame-ancestors 'self'");
  });

  it("scopes HSTS to sabq.org and www.sabq.org, excluding preview and duplicate hosts", () => {
    expect(isHstsHost("sabq.org")).toBe(true);
    expect(isHstsHost("www.sabq.org")).toBe(true);
    expect(isHstsHost("sabq.pages.dev")).toBe(false);
    expect(isHstsHost("sabq.news")).toBe(false);
    expect(htmlSecurityHeadersForHost("www.sabq.org")["Strict-Transport-Security"]).toBe("max-age=86400");
    expect(htmlSecurityHeadersForHost("sabq.pages.dev")["Strict-Transport-Security"]).toBeUndefined();
  });

  it("leaves non-HTML responses unchanged", async () => {
    const response = applyHtmlHeaders(
      new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }),
      { "Cache-Control": "public, max-age=60" },
      "sabq.org",
    );

    expect(await response.text()).toBe('{"ok":true}');
    expect(response.headers.get("X-Content-Type-Options")).toBeNull();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBeNull();
  });
});
