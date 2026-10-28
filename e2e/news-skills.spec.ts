import { test, expect } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { createNewsSkillsPreview } from "./news-skills-server";

let server: ViteDevServer;
let baseURL: string;
const url = "/news?data=worst";
test.beforeAll(async () => {
  server = await createNewsSkillsPreview();
  baseURL = server.resolvedUrls!.local[0];
});
test.afterAll(async () => { await server?.close(); });

async function openFixture(page: import("@playwright/test").Page, path: string) {
  await page.goto(new URL(path, baseURL).href);
  await expect(page.getByTestId("news-fixture-toolbar")).toBeVisible();
}
test.use({ launchOptions: process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {} });

test.describe("local NewsPage stress fixture", () => {
  for (const width of [320, 390, 1440]) {
    test(`worst-case RTL page has no document overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openFixture(page, url);
      await expect(page.getByTestId("heading-news")).toBeVisible();
      await expect(page.locator("[data-testid^=\"card-article-grid-\"]").first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }

  test("view controls remain reachable and provide 44px touch targets", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openFixture(page, url);
    for (const id of ["button-view-grid", "button-view-list", "button-view-compact"]) {
      const control = page.getByTestId(id);
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `${id} should have a visible box`).not.toBeNull();
      expect(box!.width, `${id} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${id} height`).toBeGreaterThanOrEqual(44);
      await control.click();
    }
  });

  test("grid, list, compact, dark RTL and enlarged text remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page, url);
    for (const [id, mode] of [["button-view-grid", "grid"], ["button-view-list", "list"], ["button-view-compact", "compact"]] as const) {
      await page.getByTestId(id).click();
      await expect(page.locator(`[data-testid^="card-article-${mode}-"]`).first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    }
    await page.getByTestId("news-fixture-toolbar").getByRole("button", { name: "Dark" }).click();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect(page.locator("[data-testid^=\"card-article-\"]").first()).toBeVisible();
    for (const id of ["button-view-grid", "button-view-list", "button-view-compact"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    test.fail(true, "Known baseline at 200%: global header and fixed scroll-to-top button extend beyond viewport.");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await expect(page.locator(".news-listing-page")).toHaveAttribute("dir", "rtl");
  });

  test("reduced-motion preference is respected by page transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFixture(page, url);
    await expect(page.locator("[data-testid^=\"card-article-grid-\"]").first()).toBeVisible();
    const durations = await page.locator(".news-filter-controls button, .news-filter-select, .news-view-controls button").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).transitionDuration));
    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every(duration => duration.split(",").every(part => Number.parseFloat(part) < 0.001))).toBe(true);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  });

  test("search no-match recovery clears the query", async ({ page }) => {
    await openFixture(page, url);
    await page.getByTestId("input-search-news").fill("مصطلح لا يظهر في أي خبر");
    await expect(page.getByText("لا توجد أخبار تطابق الفلاتر المحددة")).toBeVisible();
    await page.getByRole("button", { name: "عرض جميع الأخبار" }).click();
    test.fail(true, "Known baseline: empty-state recovery currently leaves searchQuery populated.");
    await expect(page.getByTestId("input-search-news")).toHaveValue("");
  });

  test("empty data never reports page 1 of 0", async ({ page }) => {
    await openFixture(page, "/news?data=empty");
    await expect(page.getByText("لا توجد أخبار تطابق الفلاتر المحددة")).toBeVisible();
    test.fail(true, "Known baseline: pagination summary currently renders page 1 of 0 for empty data.");
    await expect(page.getByText("الصفحة 1 من 0")).toHaveCount(0);
  });

  test("API error has a distinct error state rather than the empty state", async ({ page }) => {
    await openFixture(page, "/news?data=error");
    await expect(page.getByText("لا توجد أخبار تطابق الفلاتر المحددة")).toBeVisible();
    test.fail(true, "Known baseline: the page currently renders the empty state when the articles request fails.");
    await expect(page.getByText("لا توجد أخبار تطابق الفلاتر المحددة")).toHaveCount(0);
    await expect(page.getByTestId("news-api-error")).toBeVisible();
  });
});
