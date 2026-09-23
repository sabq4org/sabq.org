import { describe, expect, it, afterEach } from "vitest";
import {
  isAnalyticsAllowed,
  sanitizeAnalyticsParams,
  sanitizeAnalyticsUrl,
} from "../../client/src/lib/analytics-privacy";

const originalWindow = (globalThis as { window?: unknown }).window;

function setLocation(href: string) {
  const url = new URL(href);
  (globalThis as { window?: unknown }).window = { location: url };
}

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
});

describe("analytics privacy boundary", () => {
  it("retains UTM parameters but removes encoded PII and credentials", () => {
    const result = sanitizeAnalyticsUrl(
      "https://sabq.org/article/x?utm_source=newsletter&utm_campaign=ramadan&email=user%40example.com&phone=%2B966501234567&reset_token=abc&q=hello",
    );
    expect(result).toBe(
      "https://sabq.org/article/x?utm_source=newsletter&utm_campaign=ramadan&q=hello",
    );
  });

  it("removes sensitive values even when a key looks harmless", () => {
    expect(sanitizeAnalyticsUrl("https://sabq.org/search?q=+966 50 123 4567&utm_source=ok&x=bad")).toBe(
      "https://sabq.org/search?utm_source=ok",
    );
  });

  it("removes embedded and double-encoded contact values but keeps author", () => {
    expect(sanitizeAnalyticsUrl("https://sabq.org/a?title=contact%20user%2540example.com&author=كاتب")).toBe(
      "https://sabq.org/a",
    );
    expect(sanitizeAnalyticsParams({ author: "كاتب", article_title: "خبر اليوم" })).toEqual({
      author: "كاتب",
      article_title: "خبر اليوم",
    });
  });

  it("removes contacts embedded in free text while preserving content identifiers", () => {
    expect(sanitizeAnalyticsParams({
      search_term: "اتصل على +966 50 123 4567 الآن",
      event_label: "هاتف ٠٥٠١٢٣٤٥٦٧ للتواصل",
      article_id: "1234567890",
      userId: "1234567890",
      page_title: "اتصل user@example.com",
    })).toEqual({ article_id: "1234567890", page_title: "[redacted]" });
    expect(sanitizeAnalyticsUrl("https://sabq.org/search?q=اتصل+0501234567+الآن")).toBe("https://sabq.org/search");
    expect(sanitizeAnalyticsUrl("")).toBe("");
  });

  it("gates local, preview, admin, and auth routes", () => {
    for (const href of [
      "http://localhost:5173/",
      "https://preview.pages.dev/",
      "https://sabq.org/admin/users",
      "https://sabq.org/reset-password?token=abc",
      "https://sabq.org/set-password?token=abc",
      "https://sabq.org/2fa-verify",
      "https://sabq.org/advertise/dashboard",
      "https://sabq.org/advertise/payment/callback",
      "https://sabq.org/notifications",
    ]) {
      setLocation(href);
      expect(isAnalyticsAllowed()).toBe(false);
    }
    for (const url of ["https://sabq.org/article/x", "https://sabq.org/ifox", "https://sabq.org/advertise"]) {
      setLocation(url);
      expect(isAnalyticsAllowed()).toBe(true);
    }
  });

  it("filters nested event payloads without exposing contact data", () => {
    expect(
      sanitizeAnalyticsParams({
        article_id: "x",
        nested: { email: "user@example.com", ok: "value" },
        search_term: "user@example.com",
        utm_source: "newsletter",
      }),
    ).toEqual({ article_id: "x", nested: { ok: "value" }, utm_source: "newsletter" });
  });

  it("initializes once and reevaluates the SPA route", async () => {
    const scripts: Array<{ src?: string }> = [];
    const fakeDocument = {
      referrer: "https://google.example/search?q=user%40example.com",
      createElement: () => ({ dataset: {}, setAttribute: () => undefined } as { src?: string }),
      head: { appendChild: (node: { src?: string }) => { scripts.push(node); } },
    };
    setLocation("https://sabq.org/article/x?token=secret");
    (globalThis.window as { dispatchEvent?: () => boolean }).dispatchEvent = () => true;
    (globalThis as { document?: unknown }).document = fakeDocument;
    const { ensureAnalyticsReady } = await import("../../client/src/lib/analytics-privacy");
    expect(ensureAnalyticsReady()).toBe(true);
    expect(scripts).toHaveLength(1);
    const initialQueue = (globalThis.window as { dataLayer: unknown[] }).dataLayer;
    expect(Object.prototype.toString.call(initialQueue[0])).toBe("[object Arguments]");
    expect((initialQueue[1] as unknown[])[2]).toMatchObject({ send_page_view: false });
    const firstGtag = (globalThis.window as { gtag?: unknown }).gtag;
    expect(ensureAnalyticsReady()).toBe(true);
    expect((globalThis.window as { gtag?: unknown }).gtag).toBe(firstGtag);
    (globalThis.window as { location: URL }).location = new URL("https://sabq.org/admin/users");
    expect(ensureAnalyticsReady()).toBe(false);
    const dataLayer = (globalThis.window as { dataLayer: unknown[] }).dataLayer;
    const before = dataLayer.length;
    (globalThis.window as { gtag: (...args: unknown[]) => void }).gtag("event", "page_view", {
      page_location: "https://sabq.org/admin/users?token=secret",
    });
    expect(dataLayer).toHaveLength(before);
    (globalThis.window as { location: URL }).location = new URL("https://sabq.org/");
    expect(ensureAnalyticsReady()).toBe(true);
    (globalThis.window as { gtag: (...args: unknown[]) => void }).gtag("event", "page_view", {
      page_location: "https://sabq.org/?email=user%40example.com&utm_source=x",
    });
    const last = dataLayer[dataLayer.length - 1] as unknown[];
    expect(last[2]).toMatchObject({ page_location: "https://sabq.org/?utm_source=x", page_referrer: "https://google.example/search" });
    const gtag = (globalThis.window as { gtag: (...args: unknown[]) => void }).gtag;
    gtag("set", { page_location: "https://sabq.org/article/previous", page_referrer: "", page_title: "العنوان" });
    gtag("event", "reading_time", { page_location: "https://sabq.org/article/previous?token=secret", page_referrer: "", reading_time_seconds: 12 });
    expect((dataLayer[dataLayer.length - 1] as unknown[])[2]).toMatchObject({
      page_location: "https://sabq.org/article/previous", page_referrer: "", reading_time_seconds: 12,
    });
    delete (globalThis as { document?: unknown }).document;
  });

  it("preserves explicit page context while sanitizing config/set and nested URLs", async () => {
    const { sanitizeAnalyticsParams } = await import("../../client/src/lib/analytics-privacy");
    expect(sanitizeAnalyticsParams({
      page_location: "https://sabq.org/article/x?token=secret&utm_source=x",
      page_referrer: "https://google.example/?email=user%40example.com",
      article_id: "87a8b5ce-7b91-47ba-8e11-034e69525c29",
    })).toEqual({
      page_location: "https://sabq.org/article/x?utm_source=x",
      page_referrer: "https://google.example/",
      article_id: "87a8b5ce-7b91-47ba-8e11-034e69525c29",
    });
  });
});
