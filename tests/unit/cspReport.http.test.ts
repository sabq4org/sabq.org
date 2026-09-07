import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import cspReportRouter, { sanitizeCspLogValue } from "../../server/routes/cspReport";

const servers: Server[] = [];

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cspReportRouter);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

afterEach(() => {
  while (servers.length) servers.pop()?.close();
});

describe("CSP report endpoint", () => {
  it("accepts a report and strips query data from logged URLs", async () => {
    const warn = console.warn;
    const calls: unknown[][] = [];
    console.warn = (...args: unknown[]) => calls.push(args);
    try {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/security/csp-report?source=test`, {
          method: "POST",
          headers: { "content-type": "application/csp-report" },
          body: JSON.stringify({ "csp-report": {
            "violated-directive": "script-src",
            "blocked-uri": "https://cdn.example.invalid/script.js?token=secret",
            "document-uri": "https://sabq.org/article?id=secret",
          } }),
        });
        expect(response.status).toBe(204);
      });
    } finally {
      console.warn = warn;
    }
    expect(calls.flat().join(" ")).not.toContain("token=secret");
    expect(calls.flat().join(" ")).not.toContain("id=secret");
  });

  it("rejects payloads above the 16KB report budget", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/security/csp-report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report: "x".repeat(17_000) }),
      });
      expect(response.status).toBe(413);
    });
  });

  it("rate-limits repeated reports", async () => {
    await withServer(async (baseUrl) => {
      const requests = Array.from({ length: 61 }, () => fetch(`${baseUrl}/api/security/csp-report`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.10",
        },
        body: "{}",
      }));
      const responses = await Promise.all(requests);
      expect(responses.slice(0, 60).every((response) => response.status === 204)).toBe(true);
      expect(responses[60].status).toBe(429);
    });
  });

  it("sanitizes non-URL control characters and truncates values", () => {
    expect(sanitizeCspLogValue("inline\nsecret")).toBe("inline secret");
    expect(sanitizeCspLogValue("https://sabq.org/a?secret=1")).toBe("https://sabq.org/a");
  });
});
