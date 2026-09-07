import { describe, expect, it } from "vitest";
import { shouldApplyMailerLiteStatusTransition } from "../../server/services/mailerlite";

describe("MailerLite subscription webhook idempotency", () => {
  it("does not rewrite terminal unsubscribe or bounce events", () => {
    expect(shouldApplyMailerLiteStatusTransition("unsubscribed")).toBe(false);
    expect(shouldApplyMailerLiteStatusTransition("bounced")).toBe(false);
    expect(shouldApplyMailerLiteStatusTransition("active")).toBe(true);
    expect(shouldApplyMailerLiteStatusTransition("unconfirmed")).toBe(true);
  });
});
