import crypto from "crypto";

type HeaderValue = string | string[] | undefined;

/**
 * MailerLite sends the HMAC in the `Signature` header. The legacy
 * X-MailerLite-Signature spelling remains accepted for existing installations.
 */
export function readMailerLiteSignature(headers: Record<string, HeaderValue>): string {
  const headerEntries = Object.entries(headers);
  const value = headerEntries.find(([name]) => name.toLowerCase() === "signature")?.[1]
    ?? headerEntries.find(([name]) => name.toLowerCase() === "x-mailerlite-signature")?.[1];
  return Array.isArray(value) ? "" : value ?? "";
}

/** Verify an HMAC-SHA256 signature against the exact request bytes. */
export function verifyMailerLiteSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret = process.env.MAILERLITE_WEBHOOK_SECRET,
): boolean {
  if (!secret || !signatureHeader) return false;

  const rawHeader = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  let received: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(rawHeader)) {
    received = Buffer.from(rawHeader, "hex");
  } else if (/^[A-Za-z0-9+/]{43}={0,2}$/.test(rawHeader)) {
    received = Buffer.from(rawHeader, "base64");
  } else if (/^[A-Za-z0-9_-]{43}$/.test(rawHeader)) {
    received = Buffer.from(rawHeader, "base64url");
  } else {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}
