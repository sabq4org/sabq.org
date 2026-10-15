import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  getPublic: vi.fn(),
  getConfig: vi.fn(),
  proxy: vi.fn(),
}));

vi.mock("../../server/services/sahraaTvBlockService", () => ({
  saveSahraaTvBlockConfig: mocks.save,
  getPublicSahraaTvBlock: mocks.getPublic,
  getSahraaTvBlockConfig: mocks.getConfig,
}));
vi.mock("../../server/services/sahraaTvMediaProxy", () => ({
  proxySahraaTvMedia: mocks.proxy,
}));
vi.mock("../../server/rbac", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import router from "../../server/routes/sahraaTvBlock";

describe("Sahraa TV block admin route", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/sahraa-tv-block", router);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not start");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("returns HTTP 409 with an Arabic reload instruction on a stale save", async () => {
    mocks.save.mockRejectedValueOnce({ code: "SAHRAA_TV_BLOCK_WRITE_CONFLICT" });

    const response = await fetch(`${origin}/api/sahraa-tv-block/admin`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining("أعد تحميل الصفحة"),
    });
  });
});
