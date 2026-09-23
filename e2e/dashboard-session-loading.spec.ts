import { test, expect, type Page, type Route } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

let vite: ViteDevServer;
let base: string;
const user = { id: "session-test-admin", role: "admin", permissions: ["*"] };
const protectedText = "محتوى لوحة محمي للاختبار";

test.beforeAll(async ({}, workerInfo) => {
  vite = await createServer({
    configFile: false, root: process.cwd(), plugins: [react()],
    cacheDir: path.resolve(`node_modules/.cache/vite-session-${workerInfo.workerIndex}`),
    resolve: { alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") } },
    server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  });
  await vite.listen();
  base = vite.resolvedUrls!.local[0];
});
test.afterAll(async () => { await vite?.close(); });

async function setup(page: Page, auth: (route: Route) => Promise<unknown> | void) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === "/login") return route.fulfill({ contentType: "text/html", body: "<p>تسجيل الدخول للاختبار</p>" });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/user") return auth(route);
    if (route.request().resourceType() === "eventsource") return route.fulfill({ status: 204, contentType: "text/event-stream", body: "" });
    if (url.pathname === "/api/accessibility/preferences") return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}e2e/fixtures/dashboard-session.html`);
  return errors;
}

test("a stalled initial session offers recovery and a late success opens the protected dashboard", async ({ page }, info) => {
  let pending: Route | undefined;
  let calls = 0;
  const errors = await setup(page, route => { pending = route; calls++; });
  await expect(page.getByText("جاري التحميل...", { exact: true })).toBeVisible();
  await expect(page.getByText(protectedText)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "إعادة تحميل اللوحة" })).toBeVisible({ timeout: 15_000 });
  expect(calls).toBe(1); // No automatic reload, cancellation or extra auth requests.
  await expect(page.getByText(protectedText)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("slow-session.png"), fullPage: true });
  await pending!.fulfill({ json: user });
  await expect(page.getByText(protectedText)).toBeVisible();
  await expect(page.getByRole("button", { name: "إعادة تحميل اللوحة" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the explicit reload restarts a stalled session request", async ({ page }) => {
  let calls = 0;
  await setup(page, route => { if (++calls > 1) return route.fulfill({ json: user }); });
  await page.getByRole("button", { name: "إعادة تحميل اللوحة" }).click({ timeout: 15_000 });
  await expect(page.getByText(protectedText)).toBeVisible();
  expect(calls).toBe(2);
});

test("a terminal auth failure stays gated and manual retry recovers", async ({ page }, info) => {
  let failing = true;
  const errors = await setup(page, route => route.fulfill(failing ? { status: 503, json: { message: "Local simulated outage" } } : { json: user }));
  await expect(page.getByRole("heading", { name: "تعذر الاتصال بلوحة التحكم" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(protectedText)).toHaveCount(0);
  expect(page.url()).not.toContain("/login");
  await page.screenshot({ path: info.outputPath("unavailable-session.png"), fullPage: true });
  failing = false;
  await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await expect(page.getByText(protectedText)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a cached authenticated session remains visible during a failed refresh", async ({ page }) => {
  let failing = false;
  let calls = 0;
  const errors = await setup(page, route => { calls++; return route.fulfill(failing ? { status: 403, json: {} } : { json: user }); });
  await expect(page.getByText(protectedText)).toBeVisible();
  failing = true;
  await page.getByRole("button", { name: "تحديث الجلسة للاختبار" }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByText(protectedText)).toBeVisible();
  await expect(page.getByRole("heading", { name: "تعذر الاتصال بلوحة التحكم" })).toHaveCount(0);
  expect(page.url()).not.toContain("/login");
  expect(errors).toEqual([]);
});

test("a confirmed anonymous session still redirects to login without rendering protected content", async ({ page }) => {
  await setup(page, route => route.fulfill({ status: 401, json: {} }));
  await expect(page).toHaveURL(`${base}login`);
  await expect(page.getByText(protectedText)).toHaveCount(0);
});
