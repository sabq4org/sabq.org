import { getRealIp } from "./trustedProxyIp";
export { getRealIp } from "./trustedProxyIp";

// Shared rate-limiter building blocks — moved out of server/routes.ts during
// the 2026-06-10 Milestone-2 extraction so split route modules can define
// their own limiters without importing from the monolith (circular import).
//
// getRealIp is the single source for rate-limit identity. Edge-provided client
// addresses are accepted only when verified by the HMAC helper; unsigned
// forwarding headers are intentionally ignored.

export const cfKeyGenerator = (req: any) => getRealIp(req);

export const cfValidate = {
  xForwardedForHeader: false,
  ip: false,
  keyGeneratorIpFallback: false,
};
