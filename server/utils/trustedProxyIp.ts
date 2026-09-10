import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/** Authenticated Pages forwarding only; arbitrary visitor headers are never IP authority. */
export function verifiedProxyIp(req: { headers: Record<string, unknown>; method?: string; originalUrl?: string; url?: string },
  secret = process.env.EDGE_PROXY_SHARED_SECRET, now = Date.now()): string | undefined {
  if (!secret) return undefined;
  const ip = req.headers["x-sabq-client-ip"];
  const timestamp = req.headers["x-sabq-proxy-timestamp"];
  const signature = req.headers["x-sabq-proxy-signature"];
  if (typeof ip !== "string" || !isIP(ip) || typeof timestamp !== "string" || !/^\d{13}$/.test(timestamp) ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(now - Number(timestamp)) > 60000) return undefined;
  const payload = `${timestamp}\n${req.method}\n${req.originalUrl ?? req.url}\n${ip}`;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex")) ? ip : undefined;
}
