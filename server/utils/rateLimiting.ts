// Shared rate-limiter building blocks — moved out of server/routes.ts during
// the 2026-06-10 Milestone-2 extraction so split route modules can define
// their own limiters without importing from the monolith (circular import).
//
// getRealIp MUST mirror rateLimitKey() in server/index.ts. When traffic is
// proxied through our Cloudflare Worker (frontend-edge-worker.js), Cloudflare
// REWRITES `cf-connecting-ip` on the origin subrequest to the worker's single
// egress IP, collapsing every visitor into ONE bucket — which silently locked
// out sitewide login/register/forgot-password on the auth limiters that use
// this helper. The worker forwards the genuine client IP in a trusted header
// (`x-sabq-client-ip`; `true-client-ip` honored for Cloudflare-Enterprise
// parity), so prefer that, then `cf-connecting-ip` (correct for DIRECT origin
// pulls like api.sabq.org), then the leftmost X-Forwarded-For, then req.ip.
// cfValidate disables express-rate-limit's built-in IP validation because this
// key generator owns that logic.

export function getRealIp(req: any): string {
  const forwardedReal = (req.headers["x-sabq-client-ip"] ||
    req.headers["true-client-ip"]) as string | undefined;
  return (
    forwardedReal?.split(",")[0]?.trim() ||
    (req.headers["cf-connecting-ip"] as string) ||
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown"
  );
}

export const cfKeyGenerator = (req: any) => getRealIp(req);

export const cfValidate = {
  xForwardedForHeader: false,
  ip: false,
  keyGeneratorIpFallback: false,
};
