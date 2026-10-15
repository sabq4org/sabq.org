import { test, expect, type Page, type Route } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

let vite: ViteDevServer;
let base: string;
let publicBase: string;
let publicOrigin: string;

test.beforeAll(async ({}, workerInfo) => {
  vite = await createServer({
    configFile: false, root: process.cwd(), plugins: [react()],
    cacheDir: path.resolve(`node_modules/.cache/vite-analytics-${workerInfo.workerIndex}`),
    resolve: { alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") } },
    server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  });
  await vite.listen();
  base = vite.resolvedUrls!.local[0];
  publicBase = new URL(base).origin;
  publicOrigin = `http://sabq.org:${new URL(base).port}`;
});

test.afterAll(async () => { await vite?.close(); });

async function setup(page: Page, search: (route: Route) => Promise<unknown> | void = route => route.fulfill({ json: { results: [], query: new URL(route.request().url()).searchParams.get("q") ?? "", titleMatches: 0, contentMatches: 0 } }), fixture = "analytics-components") {
  await page.addInitScript(() => {
    Object.defineProperty(window, "dataLayer", { value: [], configurable: true, writable: true });
    Object.defineProperty(window, "open", { value: () => ({ closed: false }), configurable: true });
  });
  await page.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    // The fixture is loaded on sabq.org so the real privacy boundary is active;
    // every resource is served from the local Vite server.
    if (requestUrl.origin !== publicBase && requestUrl.hostname !== "sabq.org") return route.abort();
    if (requestUrl.origin === publicBase) return route.continue();
    if (requestUrl.pathname.startsWith("/api/search")) return search(route);
    if (requestUrl.pathname === "/api/auth/user") return route.fulfill({ json: { id: "auth-test", email: "test@example.test", isProfileComplete: true } });
    if (requestUrl.pathname.startsWith("/api/")) return route.fulfill({ status: 204, body: "" });
    if (/^\/e2e\/fixtures\/analytics-(?:components|pageviews)\.html$/.test(requestUrl.pathname)) {
      return route.fulfill({ contentType: "text/html", body: readFileSync(requestUrl.pathname.slice(1), "utf8") });
    }
    const localResponse = await route.fetch({ url: `${publicBase}${requestUrl.pathname}${requestUrl.search}` });
    return route.fulfill({ response: localResponse });
  });
  await page.goto(`${publicOrigin}/e2e/fixtures/${fixture}.html`);
}

function events(page: Page) {
  return page.evaluate(() => ((window as Window & { dataLayer: unknown[] }).dataLayer || []).map(item => {
    if (Array.isArray(item)) return item;
    if (item && typeof item === "object" && Symbol.iterator in item) return Array.from(item as Iterable<unknown>);
    return [item];
  }));
}

test("real SocialShareBar records choosing an external share destination", async ({ page }) => {
  await setup(page);
  await page.getByTestId("button-share-whatsapp").click();
  await expect.poll(async () => (await events(page)).filter(e => e[0] === "event" && e[1] === "share").length).toBe(1);
  const share = (await events(page)).find(e => e[1] === "share") as unknown[];
  expect(share[2]).toMatchObject({ article_id: "article-test-1", method: "whatsapp" });
});

test("real SocialShareBar records intent when noopener returns null", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.open = () => null; });
  await page.getByTestId("button-share-whatsapp").click();
  await page.waitForTimeout(100);
  // The current contract measures the user's platform intent even when the
  // browser blocks the popup; only native cancellation is silent.
  expect((await events(page)).filter(e => e[1] === "share")).toHaveLength(1);
});

test("real SearchDialog emits once after the matching successful response", async ({ page }) => {
  let requests = 0;
  await setup(page, async route => {
    requests++;
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    await route.fulfill({ json: { results: [], query, titleMatches: 0, contentMatches: 0 } });
  });
  await page.getByTestId("button-search").click();
  await page.getByTestId("input-search").fill("رياضة");
  await expect.poll(() => requests).toBe(1);
  await expect.poll(async () => (await events(page)).filter(e => e[1] === "search").length).toBe(1);
  await page.getByTestId("input-search").fill("رياضة");
  await page.waitForTimeout(500);
  expect((await events(page)).filter(e => e[1] === "search")).toHaveLength(1);
});

test("real SearchDialog does not emit a failed request", async ({ page }) => {
  await setup(page, route => route.fulfill({ status: 503, json: { message: "local failure" } }));
  await page.getByTestId("button-search").click();
  await page.getByTestId("input-search").fill("فشل");
  await page.waitForTimeout(700);
  expect((await events(page)).filter(e => e[1] === "search")).toHaveLength(0);
});

test("AuthAnalyticsMarker consumes a valid server marker once after confirmed auth", async ({ page }) => {
  await setup(page);
  await page.goto(`${publicOrigin}/e2e/fixtures/analytics-components.html?sabq_auth_event=login&method=google&nonce=01234567-89ab-cdef-0123-456789abcdef`);
  await expect.poll(() => page.evaluate(() => location.search)).toBe("");
  await expect.poll(async () => (await events(page)).filter(e => e[1] === "login").length).toBe(1);
  expect((await events(page)).find(e => e[1] === "login")?.[2]).toMatchObject({ method: "google" });
  await page.reload();
  await page.waitForTimeout(200);
  expect((await events(page)).filter(e => e[1] === "login")).toHaveLength(0);
});

test("AuthAnalyticsMarker rejects an invalid marker", async ({ page }) => {
  await setup(page);
  await page.goto(`${publicOrigin}/e2e/fixtures/analytics-components.html?sabq_auth_event=login&method=google&nonce=short`);
  await page.waitForTimeout(200);
  expect((await events(page)).filter(e => e[1] === "login" || e[1] === "sign_up")).toHaveLength(0);
});

test("real pageview hooks emit one view after delayed metadata and do not repeat same title", async ({ page }) => {
  await setup(page, undefined, "analytics-pageviews");
  await expect.poll(async () => (await events(page)).filter(e => e[1] === "page_view").length).toBe(1);
  await page.getByRole("link", { name: "article" }).click();
  await page.waitForTimeout(100);
  expect((await events(page)).filter(e => e[1] === "page_view")).toHaveLength(1);
  await page.getByRole("button", { name: "ready" }).click();
  await expect.poll(async () => (await events(page)).filter(e => e[1] === "page_view").length).toBe(2);
  await page.getByRole("button", { name: "ready" }).click();
  await page.waitForTimeout(100);
  expect((await events(page)).filter(e => e[1] === "page_view")).toHaveLength(2);
});


test("native share cancellation is silent and clipboard success is measured", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByTestId("button-native-share").click();
  await page.waitForTimeout(100);
  expect((await events(page)).filter(e => e[1] === "share")).toHaveLength(0);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } }));
  await page.getByTestId("button-copy-link").click();
  await expect.poll(async () => (await events(page)).filter(e => e[1] === "share").length).toBe(1);
  expect((await events(page)).find(e => e[1] === "share")?.[2]).toMatchObject({ method: "copy_link" });
});

test("real pageview hooks preserve same-title visits, Back, Forward and query pagination", async ({ page }) => {
  await setup(page, undefined, "analytics-pageviews");
  const views = async () => (await events(page)).filter(e => e[1] === "page_view");
  await expect.poll(async () => (await views()).length).toBe(1);
  expect((await views())[0][2]).toMatchObject({ page_title: "الرئيسية | سبق", page_referrer: "" });
  await page.getByRole("link", { name: "article", exact: true }).click();
  await page.getByRole("button", { name: "ready", exact: true }).click();
  await expect.poll(async () => (await views()).length).toBe(2);
  await page.getByRole("link", { name: "category", exact: true }).click();
  await page.getByRole("button", { name: "ready", exact: true }).click();
  await expect.poll(async () => (await views()).length).toBe(3);
  await page.goBack();
  await expect.poll(async () => (await views()).length).toBe(4);
  expect((await views())[3][2]).toMatchObject({ page_location: `${publicOrigin}/article/same`, page_referrer: `${publicOrigin}/category/news`, page_title: "عنوان نهائي | سبق" });
  await page.goForward();
  await expect.poll(async () => (await views()).length).toBe(5);
  await page.getByRole("link", { name: "page two", exact: true }).click();
  await expect.poll(async () => (await views()).length).toBe(6);
  expect((await views())[5][2]).toMatchObject({ page_location: `${publicOrigin}/category/news?page=2`, page_referrer: `${publicOrigin}/category/news` });
});


test("popstate never lets an outgoing page claim the next page's title", async ({ page }) => {
  await setup(page, undefined, "analytics-pageviews");
  const views = async () => (await events(page)).filter(e => e[1] === "page_view");
  await expect.poll(async () => (await views()).length).toBe(1);
  await page.getByRole("link", { name: "article", exact: true }).click();
  await page.getByRole("button", { name: "ready", exact: true }).click();
  await expect.poll(async () => (await views()).length).toBe(2);
  await page.goBack();
  await expect.poll(async () => (await views()).length).toBe(3);
  expect((await views())[2][2]).toMatchObject({ page_title: "الرئيسية | سبق" });
  await page.goForward();
  await expect.poll(async () => (await views()).length).toBe(4);
  expect((await views())[3][2]).toMatchObject({ page_title: "عنوان نهائي | سبق" });
});
