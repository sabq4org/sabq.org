import { verifiedProxyIp } from "./trustedProxyIp";

// req.ip is resolved using Express's configured trusted proxy hop. Custom
// visitor-IP headers are accepted only with a fresh, path-bound HMAC.
export function getRealIp(req: any): string {
  return verifiedProxyIp(req) || req.ip || req.socket?.remoteAddress || "unknown";
}

export const cfKeyGenerator = (req: any) => getRealIp(req);

export const cfValidate = {
  xForwardedForHeader: false,
  ip: false,
  keyGeneratorIpFallback: false,
};
