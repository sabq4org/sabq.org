import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  getPublicPage: vi.fn(),
  getAdminBundle: vi.fn(),
  createOccurrence: vi.fn(),
  updateOccurrence: vi.fn(),
  confirmOccurrence: vi.fn(),
  listSitemapEntries: vi.fn(),
  purgeContentSurfaces: vi.fn(),
}));

vi.mock("../../server/services/mawaeedService", () => ({
  MawaeedError: class MawaeedError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  getPublicPage: mocks.getPublicPage,
  getAdminBundle: mocks.getAdminBundle,
  createOccurrence: mocks.createOccurrence,
  updateOccurrence: mocks.updateOccurrence,
  confirmOccurrence: mocks.confirmOccurrence,
  listSitemapEntries: mocks.listSitemapEntries,
}));

vi.mock("../../server/services/cloudflarePurge", () => ({
  purgeContentSurfaces: mocks.purgeContentSurfaces,
}));

vi.mock("../../server/rbac", () => ({
  requirePermission: (permission: string) => (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const user = req.headers["x-test-user"];
    if (!user) return res.sendStatus(401);
    if (req.headers["x-test-permission"] !== permission) return res.sendStatus(403);
    req.user = { id: String(user) } as Express.User;
    next();
  },
}));

import router from "../../server/routes/mawaeed";

const app = express();
app.use(express.json());
app.use(router);
const server = createServer(app);
let base = "";

const editor = {
  "x-test-user": "user-1",
  "x-test-permission": "mawaeed.edit",
  "Content-Type": "application/json",
};

const writeBody = {
  seriesId: "series-1",
  titleAr: "رواتب أكتوبر",
  startsOn: "2026-10-27",
  sourceUrl: "https://www.mof.gov.sa/financial_reports",
  sourceTitle: "وزارة المالية",
  certainty: "confirmed",
  published: true,
  regionGroup: "all",
};

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("mawaeed API", () => {
  it("serves the public page with a short shared cache", async () => {
    mocks.getPublicPage.mockResolvedValue({ page: { slug: "" }, dateModified: "2026-09-26T21:00:00.000Z" });
    const response = await fetch(`${base}/api/mawaeed?region=makkah`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=30, s-maxage=60");
    expect(mocks.getPublicPage).toHaveBeenCalledWith(null, "makkah");
  });

  it("returns 404 for an unknown section", async () => {
    mocks.getPublicPage.mockResolvedValue(null);
    const response = await fetch(`${base}/api/mawaeed/missing`);
    expect(response.status).toBe(404);
  });

  it("keeps the editor bundle private and permission-gated", async () => {
    expect((await fetch(`${base}/api/mawaeed/admin`)).status).toBe(401);
    expect((await fetch(`${base}/api/mawaeed/admin`, { headers: { "x-test-user": "reader" } })).status).toBe(403);
    mocks.getAdminBundle.mockResolvedValue({ series: [], occurrences: [], changes: [] });
    const response = await fetch(`${base}/api/mawaeed/admin`, { headers: editor });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getPublicPage).not.toHaveBeenCalledWith("admin", null);
  });

  it("creates a dated row and purges the public surfaces", async () => {
    mocks.createOccurrence.mockResolvedValue({ id: "occ-1" });
    mocks.purgeContentSurfaces.mockResolvedValue(undefined);
    const denied = await fetch(`${base}/api/mawaeed/admin/occurrences`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "reader" },
      body: JSON.stringify(writeBody),
    });
    expect(denied.status).toBe(403);
    const created = await fetch(`${base}/api/mawaeed/admin/occurrences`, {
      method: "POST",
      headers: editor,
      body: JSON.stringify(writeBody),
    });
    expect(created.status).toBe(201);
    expect(mocks.createOccurrence).toHaveBeenCalledWith("user-1", expect.objectContaining({ startsOn: "2026-10-27" }));
    expect(mocks.purgeContentSurfaces).toHaveBeenCalled();
    const paths = mocks.purgeContentSurfaces.mock.calls.at(-1)?.[0] as string[];
    expect(paths).toContain("/mawaeed");
    expect(paths).toContain("/mawaeed/salaries?region=makkah");
    expect(paths).toContain("/sitemap-mawaeed.xml");
  });

  it("rejects a published row that is still unverified", async () => {
    const response = await fetch(`${base}/api/mawaeed/admin/occurrences`, {
      method: "POST",
      headers: editor,
      body: JSON.stringify({ ...writeBody, certainty: "unverified", published: true }),
    });
    expect(response.status).toBe(400);
  });

  it("lists sitemap lastmod from the service", async () => {
    mocks.listSitemapEntries.mockResolvedValue([
      { loc: "https://sabq.org/mawaeed", lastmod: "2026-09-26T21:00:00.000Z" },
    ]);
    const response = await fetch(`${base}/sitemap-mawaeed.xml`);
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(xml).toContain("https://sabq.org/mawaeed");
    expect(xml).toContain("2026-09-26T21:00:00.000Z");
  });
});
