import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emailTokenMatches, requireInboundWebhookSecret } from "../../server/services/emailAgentAuth";

describe("emailTokenMatches", () => {
  const stored = "a".repeat(64);
  it("matches case-insensitively and rejects missing or different tokens", () => {
    expect(emailTokenMatches("A".repeat(64), stored)).toBe(true);
    expect(emailTokenMatches("b".repeat(64), stored)).toBe(false);
    expect(emailTokenMatches("a".repeat(63), stored)).toBe(false);
    expect(emailTokenMatches(null, stored)).toBe(false);
    expect(emailTokenMatches(stored, null)).toBe(false);
  });
});

describe("requireInboundWebhookSecret", () => {
  let server: Server;
  let origin: string;
  const bodyParser = vi.fn((_req, _res, next: () => void) => next());

  beforeAll(async () => {
    process.env.SENDGRID_INBOUND_SECRET = "s3cret-value";
    const app = express();
    // bodyParser يمثّل multer: يجب ألا يُستدعى لطلب بلا السر الصحيح.
    app.post("/webhook", requireInboundWebhookSecret, bodyParser, (_req, res) => res.json({ ok: true }));
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    delete process.env.SENDGRID_INBOUND_SECRET;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("rejects before the multipart body is parsed when the secret is wrong or missing", async () => {
    for (const url of ["/webhook", "/webhook?token=wrong-value!"]) {
      const res = await fetch(origin + url, {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=x" },
        body: "--x\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\n" + "z".repeat(1000) + "\r\n--x--\r\n",
      });
      expect(res.status).toBe(401);
    }
    expect(bodyParser).not.toHaveBeenCalled();
  });

  it("lets an authenticated webhook through", async () => {
    const res = await fetch(`${origin}/webhook`, { method: "POST", headers: { "x-webhook-token": "s3cret-value" } });
    expect(res.status).toBe(200);
    expect(bodyParser).toHaveBeenCalledTimes(1);
  });
});
