import crypto from "node:crypto";
import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMailerLiteWebhookHandler } from "../../server/routes/mailerliteWebhookHandler";

const secret = "handler-test-secret";
const servers: Server[] = [];

function fakeDependencies(initialStatus = "active") {
  let status = initialStatus;
  let updatedAt: Date | undefined;
  const updates: Array<{ values: Record<string, unknown>; predicate: string }> = [];
  const db = {
    update: () => ({
      set(values: Record<string, unknown>) {
        return {
          where: async (condition: unknown) => {
            const query = new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
            updates.push({ values, predicate: query.sql });
            if (!status.match(/^(unsubscribed|bounced)$/)) {
              status = String(values.status);
              updatedAt = values.updatedAt as Date;
            }
          },
        };
      },
    }),
  } as any;
  return {
    db,
    withStatementTimeout: async (_timeoutMs: number, run: (tx: any) => Promise<unknown>) => run(db),
    get status() { return status; },
    get updatedAt() { return updatedAt; },
    updates,
  };
}

async function withWebhookServer(
  deps: ReturnType<typeof fakeDependencies>,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.post("/api/webhooks/mailerlite", createMailerLiteWebhookHandler(deps));
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

function signedRequest(body: string, signature = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers.Signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return { method: "POST", headers, body };
}

afterEach(() => {
  while (servers.length) servers.pop()?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv("MAILERLITE_WEBHOOK_SECRET", secret);
});

describe("MailerLite webhook handler", () => {
  it("accepts a valid raw-body signature and applies unsubscribe once", async () => {
    const deps = fakeDependencies();
    const body = JSON.stringify({ event: "subscriber.unsubscribed", email: "reader@example.invalid" });
    await withWebhookServer(deps, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/webhooks/mailerlite`, signedRequest(body));
      expect(first.status).toBe(200);
      const firstUpdatedAt = deps.updatedAt;
      const second = await fetch(`${baseUrl}/api/webhooks/mailerlite`, signedRequest(body));
      expect(second.status).toBe(200);
      expect(deps.status).toBe("unsubscribed");
      expect(deps.updatedAt).toBe(firstUpdatedAt);
      expect(deps.updates[0].predicate).toContain('"newsletter_subscriptions"."status" not in');
    });
  });

  it("rejects an altered body/signature and never writes", async () => {
    const deps = fakeDependencies();
    const body = JSON.stringify({ event: "subscriber.bounced", email: "bounced@example.invalid" });
    await withWebhookServer(deps, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/webhooks/mailerlite`, {
        ...signedRequest(body),
        body: `${body} `,
      });
      expect(response.status).toBe(401);
      expect(deps.updates).toHaveLength(0);
    });
  });

  it("keeps unsubscribe terminal when a later bounce arrives", async () => {
    const deps = fakeDependencies("unsubscribed");
    const body = JSON.stringify({ event: "subscriber.bounced", email: "reader@example.invalid" });
    await withWebhookServer(deps, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/webhooks/mailerlite`, signedRequest(body));
      expect(response.status).toBe(200);
      expect(deps.status).toBe("unsubscribed");
      expect(deps.updatedAt).toBeUndefined();
    });
  });

  it("returns non-2xx when the bounded database operation fails", async () => {
    const deps = fakeDependencies();
    deps.withStatementTimeout = async () => { throw Object.assign(new Error("database details must stay private"), { code: "57014" }); };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = JSON.stringify({ event: "subscriber.bounced", email: "bounced@example.invalid" });
    await withWebhookServer(deps, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/webhooks/mailerlite`, signedRequest(body));
      expect(response.status).toBe(500);
    });
    expect(errorSpy.mock.calls[0]?.[1]).toEqual({ name: "Error", code: "57014" });
    expect(errorSpy.mock.calls[0]?.[1]).not.toHaveProperty("message");
  });
});
