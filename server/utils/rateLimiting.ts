// Shared rate-limiter building blocks — moved out of server/routes.ts during
// the 2026-06-10 Milestone-2 extraction so split route modules can define
// their own limiters without importing from the monolith (circular import).
//
// getRealIp prefers cf-connecting-ip because production sits behind
// Cloudflare; the Pages proxy sets X-Sabq-Client-IP upstream of this (see
// the rate-limiting gotcha in CLAUDE.md). cfValidate disables
// express-rate-limit's built-in IP validation because our key generator
// owns that logic.

export function getRealIp(req: any): string {
  return (
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
