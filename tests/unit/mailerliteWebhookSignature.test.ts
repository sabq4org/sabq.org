import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  readMailerLiteSignature,
  verifyMailerLiteSignature,
} from "../../server/services/mailerliteWebhookSignature";

describe("MailerLite webhook signature verification", () => {
  const body = Buffer.from('{"events":[{"type":"subscriber.created"}]}');
  const secret = "test-mailerlite-secret";

  it("accepts the official Signature header and exact raw bytes", () => {
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

    expect(readMailerLiteSignature({ Signature: signature })).toBe(signature);
    expect(verifyMailerLiteSignature(body, signature, secret)).toBe(true);
    expect(verifyMailerLiteSignature(Buffer.from(body.toString() + " "), signature, secret)).toBe(false);
  });

  it("rejects missing, malformed, and wrong signatures while retaining legacy header support", () => {
    const signature = crypto.createHmac("sha256", secret).update(body).digest("base64");

    expect(readMailerLiteSignature({ "x-mailerlite-signature": signature })).toBe(signature);
    expect(verifyMailerLiteSignature(body, signature, secret)).toBe(true);
    expect(verifyMailerLiteSignature(body, "not-a-signature", secret)).toBe(false);
    expect(verifyMailerLiteSignature(body, signature, "wrong-secret")).toBe(false);
    expect(verifyMailerLiteSignature(body, "", secret)).toBe(false);
  });
});
