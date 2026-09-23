import { createHmac } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import cspReportRouter from "../../server/routes/cspReport";
import { originGate } from "../../server/utils/trustedProxyIp";

const secret = "csp-test-edge-secret";

function signedHeaders(ip: string): Record<string, string> {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}\nPOST\n/api/security/csp-report\n${ip}`)
    .digest("hex");
  return {
    "content-type": "application/json",
    "X-Sabq-Client-IP": ip,
    "X-Sabq-Proxy-Timestamp": timestamp,
    "X-Sabq-Proxy-Signature": signature,
  };
}

describe("CSP report limiter identity", () => {
  afterEach(() => {
    delete process.env.EDGE_PROXY_IP_ACCEPT;
    delete process.env.EDGE_PROXY_GATE_REQUIRED;
    delete process.env.EDGE_PROXY_SHARED_SECRET;
  });

  it("keeps signed IPv4 clients in separate 60/minute buckets", async () => {
    process.env.EDGE_PROXY_IP_ACCEPT = "on";
    process.env.EDGE_PROXY_GATE_REQUIRED = "on";
    process.env.EDGE_PROXY_SHARED_SECRET = secret;
    const app = express();
    app.use(originGate);
    app.use(cspReportRouter);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const base = `http://127.0.0.1:${address.port}/api/security/csp-report`;
    try {
      const send = (ip: string) => fetch(base, { method: "POST", headers: signedHeaders(ip), body: "{}" });
      for (let i = 0; i < 60; i += 1) expect((await send("198.51.100.10")).status).toBe(204);
      expect((await send("198.51.100.10")).status).toBe(429);
      expect((await send("198.51.100.11")).status).toBe(204);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
