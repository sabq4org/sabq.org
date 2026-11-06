import { describe, expect, it } from "vitest";
import { articleAcceptsEditRequests, EDIT_REQUEST_PUBLISHED_WINDOW_MS } from "../../shared/articleEditRequests";

const now = Date.parse("2026-11-06T18:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("edit request window", () => {
  it("is open for three hours after publishing, then closes", () => {
    expect(articleAcceptsEditRequests({ status: "published", publishedAt: ago(10 * 60_000) }, now)).toBe(true);
    expect(articleAcceptsEditRequests({ status: "published", publishedAt: ago(EDIT_REQUEST_PUBLISHED_WINDOW_MS - 1) }, now)).toBe(true);
    expect(articleAcceptsEditRequests({ status: "published", publishedAt: ago(EDIT_REQUEST_PUBLISHED_WINDOW_MS) }, now)).toBe(false);
    expect(articleAcceptsEditRequests({ status: "published", publishedAt: ago(30 * 86_400_000) }, now)).toBe(false);
  });

  it("treats a published article without a valid or with a future date as closed", () => {
    expect(articleAcceptsEditRequests({ status: "published", publishedAt: null }, now)).toBe(false);
    expect(articleAcceptsEditRequests({ status: "published", publishedAt: new Date(now + 86_400_000) }, now)).toBe(false);
  });

  it("keeps drafts and scheduled open and archived closed", () => {
    expect(articleAcceptsEditRequests({ status: "draft" }, now)).toBe(true);
    expect(articleAcceptsEditRequests({ status: "scheduled", publishedAt: null }, now)).toBe(true);
    expect(articleAcceptsEditRequests({ status: "archived", publishedAt: ago(1000) }, now)).toBe(false);
  });
});
