import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifiedProxyIp } from "../../server/utils/trustedProxyIp";
import { getRealIp } from "../../server/utils/rateLimiting";
const secret = "synthetic-test-key", now = 1788570000000;
function request() {
  const headers = { "x-sabq-client-ip": "198.51.100.7", "x-sabq-proxy-timestamp": String(now), "x-sabq-proxy-signature": "" };
  headers["x-sabq-proxy-signature"] = createHmac("sha256", secret).update(`${now}\nPOST\n/api/login\n198.51.100.7`).digest("hex");
  return { method: "POST", originalUrl: "/api/login", headers };
}
describe("trusted forwarding boundary", () => {
  it("accepts a fresh signature bound to path, method and IP", () => { expect(verifiedProxyIp(request(), secret, now)).toBe("198.51.100.7"); });
  it("rejects altered IP/path/method and expired signatures", () => {
    const req = request(); req.headers["x-sabq-client-ip"] = "198.51.100.8";
    expect(verifiedProxyIp(req, secret, now)).toBeUndefined();
    expect(verifiedProxyIp({ ...request(), originalUrl: "/api/other" }, secret, now)).toBeUndefined();
    expect(verifiedProxyIp({ ...request(), method: "GET" }, secret, now)).toBeUndefined();
    expect(verifiedProxyIp(request(), secret, now + 60001)).toBeUndefined();
  });
  it("ignores unsigned attacker-controlled forwarding headers", () => {
    expect(getRealIp({ ip: "192.0.2.10", headers: { "x-sabq-client-ip": "1.2.3.4", "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "1.2.3.4" } })).toBe("192.0.2.10");
  });
});
