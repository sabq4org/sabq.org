import { test, expect, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

let vite: ViteDevServer;
let base: string;
const errors = new Map<Page, string[]>();
const article = (id: string, status = "published") => ({
  id, title: `مقال اختبار ${id}`, slug: id, status, articleType: "news", newsType: "regular",
  isFeatured: false, views: 50, excerpt: null, publishedAt: "2026-09-05T12:00:00Z",
  createdAt: "2026-09-05T12:00:00Z", updatedAt: "2026-09-05T12:00:00Z",
  category: { id: "sports", nameAr: "رياضة", nameEn: "Sports" },
});
const results = (page = 1, prefix = "page", status = "published") => ({
  articles: [article(`${prefix}-${page}-a`, status), article(`${prefix}-${page}-b`, status)],
  page, total: 60, limit: 30, totalPages: 2,
});

test.beforeAll(async ({}, workerInfo) => {
  vite = await createServer({
    configFile: false, root: process.cwd(), plugins: [react()],
    cacheDir: path.resolve(`node_modules/.cache/vite-articles-${workerInfo.workerIndex}`),
    resolve: { alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") } },
    server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  });
  await vite.listen();
  base = vite.resolvedUrls!.local[0];
});
test.afterAll(async () => { await vite?.close(); });
test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
  errors.delete(page);
});

async function setup(page: Page) {
  errors.set(page, []);
  page.on("pageerror", error => errors.get(page)!.push(error.message));
  const requests: URL[] = [];
  const writes: string[] = [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (route.request().resourceType() === "eventsource") return route.fulfill({ status: 204, contentType: "text/event-stream", body: "" });
    if (route.request().method() !== "GET") {
      writes.push(url.pathname);
      return route.fulfill({ json: {} });
    }
    if (url.pathname === "/api/auth/user") return route.fulfill({ json: { id: "first-user", role: "admin", permissions: ["*"] } });
    if (url.pathname === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "local-test-token" } });
    if (url.pathname === "/api/admin/articles/metrics") return route.fulfill({ json: { published: 60, scheduled: 0, draft: 10, archived: 5 } });
    if (url.pathname === "/api/admin/articles") {
      requests.push(url);
      return route.fulfill({ json: results(Number(url.searchParams.get("page")), url.searchParams.get("search") || "page", url.searchParams.get("status")!) });
    }
    if (url.pathname === "/api/categories") return route.fulfill({ json: [{ id: "sports", nameAr: "رياضة", nameEn: "Sports" }] });
    if (url.pathname === "/api/accessibility/preferences") return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}e2e/fixtures/articles-management.html`);
  await expect(page.getByText("مقال اختبار page-1-a", { exact: true })).toBeVisible();
  return { requests, writes };
}

test("typing on page two sends one debounced search on page one", async ({ page }) => {
  const { requests } = await setup(page);
  await page.getByTestId("button-pagination-next").click();
  await expect(page.getByText("مقال اختبار page-2-a", { exact: true })).toBeVisible();
  await page.getByTestId("input-search-articles").pressSequentially("الرياض", { delay: 40 });
  await expect(page.getByText("مقال اختبار الرياض-1-a", { exact: true })).toBeVisible();
  expect(requests.filter(url => url.searchParams.has("search")).map(url => Object.fromEntries(url.searchParams)))
    .toEqual([{ search: "الرياض", status: "published", page: "1", limit: "30" }]);
});

for (const mobile of [false, true]) {
  test(`slow pagination retains rows, locks actions and clears selection (${mobile ? "mobile" : "desktop"})`, async ({ page }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const { writes } = await setup(page);
    const checkbox = page.getByTestId(mobile ? "checkbox-article-mobile-page-1-a" : "checkbox-article-page-1-a");
    // Mobile deliberately delegates pointer selection to its larger touch wrapper.
    await checkbox.focus();
    await checkbox.press("Space");
    await expect(checkbox).toBeChecked();
    await page.route("**/api/admin/articles?**", async route => {
      if (new URL(route.request().url()).searchParams.get("page") !== "2") return route.fallback();
      await new Promise(resolve => setTimeout(resolve, 1_200));
      return route.fulfill({ json: results(2) });
    });
    // The existing fixed mobile bulk bar can cover pagination; exercise its keyboard path.
    if (mobile) await page.getByTestId("button-pagination-next").press("Enter");
    else await page.getByTestId("button-pagination-next").click();
    const region = page.getByTestId(`articles-${mobile ? "mobile" : "desktop"}-results`);
    await expect(page.getByTestId("articles-updating")).toBeVisible();
    await expect(region).toHaveAttribute("inert", "");
    await expect(page.getByText("مقال اختبار page-1-a", { exact: true })).toBeVisible();
    await expect(page.getByTestId("text-pagination-info")).toContainText("الصفحة 1");
    await expect(page.getByTestId("button-pagination-next")).toBeDisabled();
    await expect(page.getByTestId(mobile ? "button-bulk-archive-mobile" : "button-bulk-archive")).toHaveCount(0);
    // Native inert must reject programmatic focus as well as pointer/keyboard access.
    expect(await region.locator("button").first().evaluate(element => { element.focus(); return document.activeElement === element; })).toBe(false);
    await page.screenshot({ path: info.outputPath(`updating-${mobile ? "mobile" : "desktop"}.png`), fullPage: true });
    await expect(page.getByText("مقال اختبار page-2-a", { exact: true })).toBeVisible();
    await expect(region).not.toHaveAttribute("inert");
    await expect(page.getByTestId(mobile ? "checkbox-article-mobile-page-2-a" : "checkbox-article-page-2-a")).not.toBeChecked();
    expect(writes).toEqual([]);
  });
}

test("a superseded request is aborted and cannot replace newer results", async ({ page }) => {
  await setup(page);
  const aborted: string[] = [];
  page.on("requestfailed", request => aborted.push(request.url()));
  let slowStarted = false;
  await page.route("**/api/admin/articles?**", route => {
    if (new URL(route.request().url()).searchParams.get("search") !== "بطيء") return route.fallback();
    slowStarted = true; // Intentionally pending until the browser aborts it.
  });
  await page.getByTestId("input-search-articles").fill("بطيء");
  await expect.poll(() => slowStarted).toBe(true);
  await page.getByTestId("input-search-articles").fill("أحدث");
  await expect(page.getByText("مقال اختبار أحدث-1-a", { exact: true })).toBeVisible();
  await expect.poll(() => aborted.some(url => new URL(url).searchParams.get("search") === "بطيء")).toBe(true);
  await expect(page.getByText("مقال اختبار بطيء-1-a", { exact: true })).toHaveCount(0);
});

test("filters reset pagination atomically and clear cancels pending typing", async ({ page }) => {
  const { requests } = await setup(page);
  await page.getByTestId("button-pagination-next").click();
  await expect(page.getByText("مقال اختبار page-2-a", { exact: true })).toBeVisible();
  await page.getByTestId("card-stat-draft").click();
  await expect(page.getByTestId("text-pagination-info")).toContainText("الصفحة 1");
  await expect(page.getByTestId("articles-updating")).toHaveCount(0);
  expect(requests.filter(url => url.searchParams.get("status") === "draft").map(url => url.searchParams.get("page"))).toEqual(["1"]);
  await page.getByTestId("input-search-articles").fill("إلغاء");
  await page.getByTestId("button-clear-filters").click();
  await page.waitForTimeout(400); // Let the canceled debounce deadline elapse.
  expect(requests.some(url => url.searchParams.has("search"))).toBe(false);
  await expect(page.getByTestId("input-search-articles")).toHaveValue("");
});

test("failed navigation shows an error and manual retry restores the table", async ({ page }) => {
  await setup(page);
  let failing = true;
  let calls = 0;
  await page.route("**/api/admin/articles?**", route => {
    if (new URL(route.request().url()).searchParams.get("page") !== "2") return route.fallback();
    calls++;
    return failing ? route.fulfill({ status: 403, json: { message: "test failure" } }) : route.fulfill({ json: results(2) });
  });
  await page.getByTestId("button-pagination-next").click();
  const error = page.getByRole("alert").filter({ hasText: "تعذّر تحديث قائمة المقالات" });
  await expect(error).toBeVisible();
  expect(calls).toBe(1); // An HTTP 403 is not a transient network failure.
  await expect(page.getByText("لا توجد مقالات", { exact: true })).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await expect(page.getByText("مقال اختبار page-2-a", { exact: true })).toBeVisible();
  await expect(error).toHaveCount(0);
  expect(calls).toBe(2);
});

test("previous rows are never shown while another account loads", async ({ page }) => {
  await setup(page);
  await page.route("**/api/admin/articles?**", async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    return route.fulfill({ json: results(1, "second-user") });
  });
  await page.getByRole("button", { name: "تبديل حساب الاختبار" }).click();
  await expect(page.getByText("مقال اختبار page-1-a", { exact: true })).toHaveCount(0);
  await expect(page.getByText("مقال اختبار second-user-1-a", { exact: true })).toBeVisible();
});

test("background refresh retains rows but blocks actions until completion", async ({ page }) => {
  await setup(page);
  await page.route("**/api/admin/articles?**", async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    return route.fulfill({ json: results(1, "refreshed") });
  });
  await page.getByRole("button", { name: "تحديث قائمة الاختبار" }).click();
  await expect(page.getByTestId("articles-desktop-results")).toHaveAttribute("inert", "");
  await expect(page.getByText("مقال اختبار page-1-a", { exact: true })).toBeVisible();
  await expect(page.getByText("مقال اختبار refreshed-1-a", { exact: true })).toBeVisible();
  await expect(page.getByTestId("articles-updating")).toHaveCount(0);
});

for (const fails of [false, true]) {
  test(`drag reordering uses the active list cache and ${fails ? "rolls back failure" : "persists success"}`, async ({ page }) => {
    const publishedAt = "2026-09-09T06:30:00Z";
    await page.clock.setFixedTime(new Date(publishedAt));
    await setup(page);
    let saved = { ...results(), articles: results().articles.map(row => ({ ...row, publishedAt })) };
    let writes = 0;
    let completed = 0;
    await page.route("**/api/admin/articles?**", route => route.fulfill({ json: saved }));
    await page.getByRole("button", { name: "تحديث قائمة الاختبار" }).click();
    await expect(page.getByTestId("articles-updating")).toHaveCount(0);
    await page.route("**/api/admin/articles/update-order", async route => {
      writes++;
      const orders = route.request().postDataJSON().articleOrders;
      expect(orders.every((entry: { displayOrder: number }) => entry.displayOrder > new Date(publishedAt).getTime() / 1000)).toBe(true);
      const ids = orders.map((entry: { id: string }) => entry.id);
      expect(ids).toEqual(["page-1-b", "page-1-a"]);
      await new Promise(resolve => setTimeout(resolve, 500));
      completed++;
      if (fails) return route.fulfill({ status: 400, json: { message: "local reorder failure" } });
      saved = { ...saved, articles: [...saved.articles].reverse() };
      return route.fulfill({ json: { success: true } });
    });
    const handle = page.getByTestId("row-article-page-1-a").locator("td").first();
    const target = page.getByTestId("row-article-page-1-b").locator("td").first();
    await target.scrollIntoViewIfNeeded();
    const start = (await handle.boundingBox())!;
    const end = (await target.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 12, { steps: 4 });
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 20 });
    await expect(page.getByRole("status").filter({ hasText: "page-1-b" })).toBeAttached();
    await page.mouse.up();
    await expect.poll(() => writes).toBeGreaterThan(0);
    await expect(page.locator("tbody tr").first()).toHaveAttribute("data-testid", "row-article-page-1-b");
    await expect.poll(() => writes).toBe(fails ? 3 : 1);
    await expect.poll(() => completed).toBe(fails ? 3 : 1);
    await expect(page.locator("tbody tr").first()).toHaveAttribute("data-testid", `row-article-page-1-${fails ? "a" : "b"}`);
    await expect(page.locator("tbody tr").first()).not.toHaveClass(/opacity-70/);
    await expect(page.getByTestId("text-pagination-info")).toContainText("الصفحة 1 من 2");
  });
}

test("mobile breaking toggle preserves pagination and rolls back a failed write", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  let completed = false;
  await page.route("**/api/admin/articles/page-1-a/toggle-breaking", async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    completed = true;
    return route.fulfill({ status: 400, json: { message: "local toggle failure" } });
  });
  const toggle = page.getByTestId("button-breaking-mobile-page-1-a");
  await toggle.click();
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveText("إلغاء العاجل");
  await expect(page.getByText("مقال اختبار page-1-a", { exact: true })).toBeVisible();
  await expect(page.getByTestId("text-pagination-info")).toContainText("الصفحة 1 من 2");
  await expect.poll(() => completed).toBe(true);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveText("عاجل");
  await expect(page.getByText("مقال اختبار page-1-a", { exact: true })).toBeVisible();
});

test("published and scheduled lists refresh automatically after scheduled publication", async ({ page }, info) => {
  await page.clock.install();
  await setup(page);
  let published = false;
  const pending = { ...article("scheduled-opinion", "scheduled"), articleType: "opinion", publishedAt: null, scheduledAt: "2026-09-09T07:15:00Z" };
  const futureNews = { ...article("future-news", "scheduled"), scheduledAt: "2026-09-10T07:15:00Z", publishedAt: null };
  await page.route("**/api/admin/articles/metrics", route => route.fulfill({ json: { published: published ? 61 : 60, scheduled: published ? 1 : 2, draft: 10, archived: 5 } }));
  await page.route("**/api/admin/articles?**", route => {
    const scheduled = new URL(route.request().url()).searchParams.get("status") === "scheduled";
    const rows = scheduled ? (published ? [futureNews] : [pending, futureNews]) : (published ? [{ ...pending, status: "published", publishedAt: "2026-09-09T07:15:00Z" }, ...results().articles] : results().articles);
    return route.fulfill({ json: { articles: rows, page: 1, limit: 30, total: rows.length, totalPages: 1 } });
  });
  await page.getByTestId("card-stat-scheduled").click();
  await expect(page.getByTestId("row-article-scheduled-opinion")).toBeVisible();
  await expect(page.getByTestId("row-article-future-news")).toBeVisible();
  await expect(page.getByTestId("drag-handle-scheduled-opinion")).toHaveCount(0);
  await page.getByTestId("fixture-controls").evaluate(element => { element.style.display = "none"; });
  await page.screenshot({ path: info.outputPath("scheduled-list.png"), animations: "disabled", fullPage: true });
  published = true;
  await page.clock.fastForward(60_001);
  await expect(page.getByTestId("row-article-scheduled-opinion")).toHaveCount(0);
  await expect(page.getByTestId("card-stat-scheduled")).toContainText("1");
  await page.getByTestId("card-stat-published").click();
  await expect(page.getByTestId("row-article-scheduled-opinion")).toBeVisible();
  await expect(page.getByTestId("card-stat-published")).toContainText("61");
  await page.screenshot({ path: info.outputPath("published-list.png"), animations: "disabled", fullPage: true });
});

test("polling removes invisible scheduled selections and closes their bulk action", async ({ page }) => {
  await page.clock.install();
  const { writes } = await setup(page);
  await page.getByTestId("card-stat-scheduled").click();
  const checkbox = page.getByTestId("checkbox-article-page-1-a");
  await checkbox.check();
  await page.getByTestId("button-bulk-archive").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.route("**/api/admin/articles?**", route => route.fulfill({ json: { ...results(1,"remaining","scheduled"), total: 2, totalPages: 1 } }));
  await page.clock.fastForward(60_001);
  await expect(page.getByText("مقال اختبار remaining-1-a", { exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByTestId("button-bulk-archive")).toHaveCount(0);
  expect(writes).toEqual([]);
});
