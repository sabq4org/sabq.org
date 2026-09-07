import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

type HeaderRequest = {
  headers: Record<string, unknown>;
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
};

const SIGNATURE_WINDOW_MS = 60_000;

/** Resolve a client address without trusting visitor-controlled forwarding headers. */
export function verifiedProxyIp(
  req: HeaderRequest,
  secret = process.env.EDGE_PROXY_SHARED_SECRET,
  now = Date.now(),
  enabled = process.env.EDGE_PROXY_IP_ACCEPT === "on",
): string | undefined {
  if (!enabled || !secret) return undefined;
  const ip = req.headers["x-sabq-client-ip"];
  const timestamp = req.headers["x-sabq-proxy-timestamp"];
  const signature = req.headers["x-sabq-proxy-signature"];
  if (
    typeof ip !== "string" || !isIP(ip) ||
    typeof timestamp !== "string" || !/^\d{13}$/.test(timestamp) ||
    typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature) ||
    Math.abs(now - Number(timestamp)) > SIGNATURE_WINDOW_MS
  ) return undefined;
  const pathAndQuery = req.originalUrl ?? req.url ?? "/";
  const payload = `${timestamp}\n${req.method ?? "GET"}\n${pathAndQuery}\n${ip}`;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "hex");
  return timingSafeEqual(expected, received) ? ip : undefined;
}

/**
 * Missing secret is fail-safe: unsigned custom headers are ignored and the
 * configured Express/socket address is used while edge rollout is staged.
 */
export function getRealIp(req: HeaderRequest): string {
  return verifiedProxyIp(req) || req.ip || req.socket?.remoteAddress || "unknown";
}

export function hasVerifiedProxyIp(req: HeaderRequest): boolean {
  return Boolean(verifiedProxyIp(req, process.env.EDGE_PROXY_SHARED_SECRET, Date.now(), true));
}

export function originGate(req: HeaderRequest, res: { status: (code: number) => { json: (body: unknown) => unknown } }, next: () => unknown): unknown {
  const rawPath = String(req.url || "/").split("?", 1)[0];
  // Gate every API-like raw path, including case and encoded/ambiguous forms.
  // Express routing is case-insensitive; fail closed before a malformed path
  // can be interpreted differently by a downstream handler or proxy.
  const apiLike = rawPath.toLowerCase().startsWith("/api");
  if (process.env.EDGE_PROXY_GATE_REQUIRED !== "on" || !apiLike) return next();
  if (process.env.EDGE_PROXY_IP_ACCEPT !== "on" || !process.env.EDGE_PROXY_SHARED_SECRET) {
    return res.status(503).json({ message: "بوابة الأصل غير مهيأة" });
  }
  if (!hasVerifiedProxyIp(req)) return res.status(403).json({ message: "يتطلب هذا الأصل طلبًا موثقًا" });
  return next();
}
