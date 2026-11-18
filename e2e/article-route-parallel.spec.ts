import { test, expect, type Page, type Route } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";

let vite: ViteDevServer;
let base: string;
test.beforeAll(async () => {
  vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen();
  base = vite.resolvedUrls!.local[0];
});
test.afterAll(async () => { await vite.close(); });

const article = (slug: string, title: string) => ({
  id: "local-test", slug, title, content: "<p>نص تجريبي</p>", status: "published", articleType: "news",
  publishedAt: "2026-09-05T12:00:00Z", views: 100, aiSummary: "موجز تجريبي",
  category: { id: "sport", nameAr: "رياضة", slug: "sports" }, author: { id: "author", name: "صحيفة سبق" }, tags: [],
});

async function mockApi(page: Page, articleResponse: (route: Route, pathname: string) => Promise<boolean>) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (await articleResponse(route, pathname)) return;
    if (pathname === "/api/auth/user") return route.fulfill({ status: 401, json: { message: "guest" } });
    if (pathname.startsWith("/api/ads/slot/")) return route.fulfill({ status: 204 });
    if (pathname === "/api/ads/slots/active") return route.fulfill({ json: { slotIds: [], generatedAt: new Date().toISOString() } });
    return route.fulfill({ json: [] });
  });
}

for (const status of [200, 404]) {
  test(`article request starts before lazy page finishes (${status})`, async ({ page }) => {
    let releaseChunk!: () => void;
    const chunkGate = new Promise<void>((resolve) => { releaseChunk = resolve; });
    let articleRequests = 0;
    let chunkBlocked = false;
    await page.route("**/src/pages/ArticleDetail.tsx*", async (route) => {
      chunkBlocked = true;
      await chunkGate;
      await route.continue();
    });
    await mockApi(page, async (route, pathname) => {
      if (pathname !== "/api/articles/parallel-test") return false;
      articleRequests++;
      await route.fulfill({ status, json: status === 200 ? article("parallel-test", "عنوان تجريبي") : { message: "not found" } });
      return true;
    });
    try {
      await page.goto(`${base}article/parallel-test`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => chunkBlocked).toBe(true);
      await expect.poll(() => articleRequests).toBe(1);
    } finally {
      releaseChunk();
    }
    if (status === 200) await expect(page.getByTestId("text-article-title")).toHaveText("عنوان تجريبي");
    else await expect(page.getByText("المقال غير موجود")).toBeVisible();
    expect(articleRequests).toBe(1);
  });
}

test("focus refreshes the title and navigation to a missing article does not retain it", async ({ page }) => {
  let title = "العنوان الأول";
  let firstRequests = 0;
  let releaseMissing!: () => void;
  const missingGate = new Promise<void>((resolve) => { releaseMissing = resolve; });
  await mockApi(page, async (route, pathname) => {
    if (pathname === "/api/articles/first-test") {
      firstRequests++;
      await route.fulfill({ json: article("first-test", title) });
      return true;
    }
    if (pathname === "/api/articles/missing-test") {
      await missingGate;
      await route.fulfill({ status: 404, json: { message: "not found" } });
      return true;
    }
    return false;
  });
  await page.goto(`${base}article/first-test`);
  await expect(page.getByTestId("text-article-title")).toHaveText(title);
  title = "عنوان مصحح";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    window.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("text-article-title")).toHaveText(title);
  expect(firstRequests).toBe(2);
  try {
    await page.evaluate(() => { history.pushState({}, "", "/article/missing-test"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await expect(page.getByTestId("text-article-title")).toHaveCount(0);
  } finally {
    releaseMissing();
  }
  await expect(page.getByText("المقال غير موجود")).toBeVisible();
  await expect(page.getByText("عنوان مصحح")).toHaveCount(0);
});
