import { describe, expect, it } from "vitest";

import {
  applyHtmlSecurityHeaders,
  htmlSecurityHeadersForHost,
  isHstsHost,
  shouldApplyHtmlSecurityHeaders,
} from "../../functions/_middleware.js";

describe("Pages HTML security headers", () => {
  it("adds report-only CSP, nosniff, and strict referrer policy to HTML while preserving the stream", async () => {
    const body = "<!doctype html><html><body>مرحبا</body></html>";
    const response = applyHtmlSecurityHeaders(
      new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }),
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
    const response = applyHtmlSecurityHeaders(
      new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } }),
      "sabq.org",
    );

    expect(await response.text()).toBe('{"ok":true}');
    expect(response.headers.get("X-Content-Type-Options")).toBeNull();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("preserves 304 status and cache validators while adding only security headers", () => {
    const response = applyHtmlSecurityHeaders(
      new Response(null, {
        status: 304,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=60",
          ETag: '"shell-v1"',
          Pragma: "no-cache",
          Expires: "0",
        },
      }),
      "sabq.org",
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("ETag")).toBe('"shell-v1"');
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=86400");
  });

  it("adds security headers to a HEAD HTML response without creating a body", () => {
    const response = applyHtmlSecurityHeaders(
      new Response(null, { status: 200, headers: { "Content-Type": "text/html", "Cache-Control": "private, no-store" } }),
      "www.sabq.org",
    );

    expect(response.body).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("does not apply the HTML wrapper to API proxy paths", () => {
    const html = new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
    expect(shouldApplyHtmlSecurityHeaders("/article/example", html)).toBe(true);
    expect(shouldApplyHtmlSecurityHeaders("/api/error", html)).toBe(false);
  });
});
