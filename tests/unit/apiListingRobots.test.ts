import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { apiListingNoindex, apiListingRobotsRules } from "../../server/utils/apiListingRobots";

describe("API listing deindexing", () => {
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const app = express();
    app.use(apiListingNoindex);
    app.get("/api/auth/user", (_req, res) => res.status(401).json({ message: "Unauthorized" }));
    app.use((_req, res) => res.json({ items: ["unchanged"] }));
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  it.each(["/api/articles", "/api/articles?page=1&limit=10", "/api/articles/", "/api/v2/articles"])("adds a readable noindex header to %s without changing JSON", async path => {
    const response = await fetch(origin + path);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.json()).toEqual({ items: ["unchanged"] });
  });

  it("does not affect media, child endpoints or authentication", async () => {
    for (const path of ["/api/media/proxy/image", "/api/articles/a", "/api/articles-extra", "/article/a", "/api/auth/user"]) {
      const response = await fetch(origin + path);
      expect(response.headers.get("x-robots-tag")).toBeNull();
      if (path === "/api/auth/user") expect(response.status).toBe(401);
    }
  });

  it("opens only exact listing paths and their query strings under /api/", () => {
    // Google's path rules: only * and a terminal $ have special meaning; ? is literal.
    const allows = apiListingRobotsRules.split("\n").map(line => line.slice(7));
    const matches = (path: string) => allows.some(rule => {
      const end = rule.endsWith("$");
      const literal = end ? rule.slice(0, -1) : rule;
      return end ? path === literal : path.startsWith(literal);
    });
    for (const path of ["/api/articles", "/api/articles?x=y", "/api/articles/", "/api/articles/?x=y", "/api/v2/articles?page=1"]) expect(matches(path)).toBe(true);
    for (const path of ["/api/articles/a", "/api/articles-extra", "/api/auth/user", "/api/v2/articles/a", "/api/media/proxy/a"]) expect(matches(path)).toBe(false);
  });
});
