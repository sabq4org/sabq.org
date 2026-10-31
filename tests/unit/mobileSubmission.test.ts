import { describe, expect, it } from "vitest";
import {
  canSubmitFromMobile,
  classifyMobileSubmitter,
  isTrustedSubmissionImageUrl,
  shouldNotifyNewsDraft,
} from "../../shared/mobileSubmission";

describe("classifyMobileSubmitter", () => {
  it("detects reporter, writer and editor roles case-insensitively", () => {
    expect(classifyMobileSubmitter(["Reporter"])).toEqual({ isWriter: false, isReporter: true, isAdminLike: false });
    expect(classifyMobileSubmitter(["opinion_author", null])).toEqual({ isWriter: true, isReporter: false, isAdminLike: false });
    expect(classifyMobileSubmitter(["editor", ""])).toEqual({ isWriter: false, isReporter: false, isAdminLike: true });
  });

  it("refuses readers", () => {
    expect(canSubmitFromMobile(classifyMobileSubmitter(["reader", undefined]))).toBe(false);
    expect(canSubmitFromMobile(classifyMobileSubmitter(["correspondent"]))).toBe(true);
  });
});

describe("isTrustedSubmissionImageUrl", () => {
  const opts = { r2Origins: ["https://media.sabq.org"], cloudflareAccountHash: "abc123" };

  it("accepts Sabq R2 and Cloudflare Images of the Sabq account", () => {
    expect(isTrustedSubmissionImageUrl("https://media.sabq.org/news/2026/10/x.webp", opts)).toBe(true);
    expect(isTrustedSubmissionImageUrl("https://imagedelivery.net/abc123/img-id/public", opts)).toBe(true);
  });

  it("rejects other hosts, other Cloudflare accounts, http and tricks", () => {
    expect(isTrustedSubmissionImageUrl("https://evil.example/x.jpg", opts)).toBe(false);
    expect(isTrustedSubmissionImageUrl("https://imagedelivery.net/other/img/public", opts)).toBe(false);
    expect(isTrustedSubmissionImageUrl("http://media.sabq.org/news/x.webp", opts)).toBe(false);
    expect(isTrustedSubmissionImageUrl("https://media.sabq.org.evil.example/x.webp", opts)).toBe(false);
    expect(isTrustedSubmissionImageUrl("https://user:pw@media.sabq.org/x.webp", opts)).toBe(false);
    expect(isTrustedSubmissionImageUrl("https://media.sabq.org/", opts)).toBe(false);
    expect(isTrustedSubmissionImageUrl(42, opts)).toBe(false);
  });

  it("ignores Cloudflare Images when no account hash is configured", () => {
    expect(isTrustedSubmissionImageUrl("https://imagedelivery.net/abc123/x/public", { r2Origins: [] })).toBe(false);
  });
});

describe("shouldNotifyNewsDraft", () => {
  const news = { articleType: "news", reviewStatus: "pending_review", reporterId: "rep-1" };

  it("notifies on a new or resubmitted reporter draft", () => {
    expect(shouldNotifyNewsDraft(null, news)).toBe(true);
    expect(shouldNotifyNewsDraft("needs_changes", news)).toBe(true);
  });

  it("stays quiet for opinion, already-pending, or no reporter", () => {
    expect(shouldNotifyNewsDraft(null, { ...news, articleType: "opinion" })).toBe(false);
    expect(shouldNotifyNewsDraft("pending_review", news)).toBe(false);
    expect(shouldNotifyNewsDraft(null, { ...news, reporterId: null })).toBe(false);
    expect(shouldNotifyNewsDraft(null, { ...news, reviewStatus: "approved" })).toBe(false);
  });
});
