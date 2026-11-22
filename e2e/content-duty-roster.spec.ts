import { test, expect, type Page, type Route, type TestInfo } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Local-only contract fixture for the content-duty roster.
 *
 * The names and hours mirror the approved design fixture, while the response
 * shape is the public API contract. No production endpoint is contacted.
 */
type RosterResponse = {
  managers: Array<{
    key: string;
    name: string;
    online: boolean | null;
    shifts: Array<{ days: number[]; startHour: number; endHour: number }>;
  }>;
};

const ROSTER: RosterResponse = {
  managers: [
    { key: "a", name: "مناوب ألف", online: true, shifts: [{ days: [0, 1, 2, 3, 4], startHour: 8, endHour: 14 }] },
    { key: "b", name: "مناوب باء", online: false, shifts: [{ days: [0, 1, 2, 3, 4], startHour: 14, endHour: 20 }, { days: [6], startHour: 10, endHour: 16 }] },
    { key: "c", name: "مناوب جيم", online: true, shifts: [{ days: [0, 1, 2, 3, 4, 5], startHour: 20, endHour: 2 }] },
    { key: "d", name: "مناوب دال", online: null, shifts: [{ days: [4, 5], startHour: 20, endHour: 2 }] },
  ],
};

const ADMIN = {
  id: "local-duty-admin",
  firstName: "مدير",
  lastName: "اختبار",
  email: "duty@example.test",
  role: "admin",
  roles: ["admin"],
  permissions: ["*"],
  isProfileComplete: true,
};

type FixtureOptions = {
  roster?: RosterResponse;
  rosterStatus?: number;
};

let vite: ViteDevServer;
let base: string;

test.beforeAll(async ({}, workerInfo) => {
  vite = await createServer({
    configFile: false,
    root: path.resolve("client"),
    plugins: [react()],
    define: { __SABQ_BUILD_ID__: JSON.stringify("e2e-content-duty") },
    cacheDir: path.resolve(`node_modules/.cache/vite-content-duty-${workerInfo.workerIndex}`),
    resolve: {
      alias: {
        "@": path.resolve("client/src"),
        "@shared": path.resolve("shared"),
        "@assets": path.resolve("attached_assets"),
      },
    },
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  await vite.listen();
  base = vite.resolvedUrls!.local[0];
});

test.afterAll(async () => {
  await vite?.close();
});

async function mockDashboardApi(page: Page, options: FixtureOptions = {}) {
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/auth/user") return json(ADMIN);
    if (url.pathname === "/api/admin/dashboard/content-duty") {
      return json(options.roster ?? ROSTER, options.rosterStatus ?? 200);
    }

    // Keep the real dashboard shell deterministic without touching its other
    // read-only widgets. These are intentionally local synthetic responses.
    if (url.pathname === "/api/admin/dashboard/stats") {
      return json({
        articles: { total: 10, published: 8, draft: 1, archived: 0, scheduled: 1, totalViews: 1000, viewsToday: 20 },
        users: { total: 1, emailVerified: 1, active24h: 1, newThisWeek: 0, activeToday: 1, activeYesterday: 1 },
        comments: { total: 0, pending: 0, approved: 0, rejected: 0 },
        categories: { total: 1 },
        abTests: { total: 0, running: 0 },
        reactions: { total: 0, todayCount: 0 },
        engagement: { averageTimeOnSite: 0, totalReads: 0, readsToday: 0 },
        mediaLibrary: { totalFiles: 0, totalSize: 0 },
        aiImages: { total: 0, thisWeek: 0 },
        smartBlocks: { total: 0 },
        recentArticles: [],
        recentComments: [],
        topArticles: [],
      });
    }
    if (url.pathname === "/api/admin/dashboard/pulse") {
      return json({
        articles: { publishedToday: 0, publishedYesterday: 0, pendingReview: 0, needsChanges: 0, viewsYesterday: 0 },
        comments: { receivedToday: 0, moderatedToday: 0, pendingOlderThanTwoHours: 0 },
        reactions: { yesterdayCount: 0 },
        engagement: { readsYesterday: 0 },
        trendingArticles: [],
        upcomingSchedule: [],
        hourlyViews: [],
        generatedAt: new Date().toISOString(),
      });
    }
    if (url.pathname === "/api/csrf-token") return json({ csrfToken: "local-duty-csrf" });

    return json([]);
  });
}

function screenshotPath(testInfo: TestInfo, name: string): string {
  return testInfo.outputPath(name);
}

test.describe("content-duty roster", () => {
  test("integrates the dashboard card, weekly page, and browser Back", async ({ page }, testInfo) => {
    await mockDashboardApi(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}dashboard`);

    const card = page.getByTestId("content-duty-card");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText("مديرو المحتوى المناوبون الآن")).toBeVisible();
    await expect(card.locator("bdi[dir='ltr']").first()).toBeVisible();
    await page.screenshot({ path: screenshotPath(testInfo, "implemented-dashboard-card-desktop.png"), fullPage: true });

    await card.getByRole("link", { name: /الجدول الأسبوعي/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/content-duty$/);
    await expect(page.getByRole("heading", { name: "جدول المناوبات" })).toBeVisible({ timeout: 20_000 });
    const chart = page.locator("section[aria-labelledby='content-duty-plot-title']");
    const rows = page.locator("section[aria-labelledby='content-duty-handover-title']");
    await expect(chart).toBeVisible();
    await expect(rows).toBeVisible();
    await expect(page.getByRole("button", { name: "الأحد" })).toBeVisible();
    await expect(page.getByRole("button", { name: "السبت" })).toBeVisible();

    await page.getByRole("button", { name: "الخميس" }).click();
    await expect(rows).toContainText("20:00");
    await expect(rows).toContainText("02:00");
    await expect(rows).toContainText("مناوب جيم");
    await expect(rows).toContainText("مناوب دال");
    await page.screenshot({ path: screenshotPath(testInfo, "implemented-content-duty-desktop.png"), fullPage: true });

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("content-duty-card")).toBeVisible({ timeout: 20_000 });
  });

  test("renders the Thursday overnight pair on Friday and keeps hours LTR on mobile", async ({ page }, testInfo) => {
    await mockDashboardApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}dashboard/content-duty`);
    await expect(page.getByRole("heading", { name: "جدول المناوبات" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "الجمعة" }).click();

    const rows = page.locator("section[aria-labelledby='content-duty-handover-title']");
    await expect(rows).toContainText("تتمة من الخميس");
    await expect(rows).toContainText("مناوب جيم");
    await expect(rows).toContainText("مناوب دال");
    await expect(rows.locator("bdi[dir='ltr']").first()).toHaveText("00:00");
    await expect(rows.locator("bdi[dir='ltr']").nth(1)).toHaveText("02:00");

    // Check the rendered geometry, not only the dir attribute: a 00:00–02:00
    // carry-over bar must sit at the visual right edge of the RTL timeline.
    const chart = page.locator("section[aria-labelledby='content-duty-plot-title']");
    for (const name of ["مناوب جيم", "مناوب دال"]) {
      const chartRow = chart.locator("div.grid").filter({ hasText: name }).last();
      const lane = chartRow.locator("div.relative.h-9");
      const bar = lane.locator("span.absolute.inset-y-1").first();
      const laneBox = await lane.boundingBox();
      const barBox = await bar.boundingBox();
      expect(laneBox, `${name} lane should be rendered`).not.toBeNull();
      expect(barBox, `${name} carry-over bar should be rendered`).not.toBeNull();
      expect(barBox!.x + barBox!.width / 2).toBeGreaterThan(laneBox!.x + laneBox!.width * 0.85);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, "mobile roster must not overflow horizontally").toBe(false);
    await page.screenshot({ path: screenshotPath(testInfo, "implemented-content-duty-mobile.png"), fullPage: true });
  });

  test("shows an explicit empty assignment state", async ({ page }) => {
    await mockDashboardApi(page, { roster: { managers: [] } });
    await page.goto(`${base}dashboard/content-duty`);
    await expect(page.getByRole("heading", { name: "جدول المناوبات" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("section[aria-labelledby='content-duty-handover-title']").getByText("لا توجد مناوبات مسجّلة لهذا اليوم.")).toBeVisible();
    await expect(page.locator("section[aria-labelledby='content-duty-plot-title']")).toBeVisible();
  });

  test("shows a retryable lookup failure", async ({ page }) => {
    await mockDashboardApi(page, { rosterStatus: 503 });
    await page.goto(`${base}dashboard/content-duty`);
    await expect(page.locator("section[role='alert']")).toContainText("تعذر تحميل جدول المناوبات", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "إعادة المحاولة" })).toBeVisible();
  });

  test("renders simultaneous managers with online, offline, and unknown states", async ({ page }) => {
    const statuses: RosterResponse = {
      managers: [
        { key: "a", name: "مناوب ألف", online: true, shifts: [{ days: [0], startHour: 0, endHour: 24 }] },
        { key: "b", name: "مناوب باء", online: false, shifts: [{ days: [0], startHour: 0, endHour: 24 }] },
        { key: "c", name: "مناوب جيم", online: null, shifts: [{ days: [0], startHour: 0, endHour: 24 }] },
      ],
    };
    await page.clock.setFixedTime(new Date("2026-11-22T09:00:00Z"));
    await mockDashboardApi(page, { roster: statuses });
    await page.goto(`${base}dashboard`);
    const card = page.getByTestId("content-duty-card");
    await expect(card).toBeVisible({ timeout: 20_000 });
    for (const [name, status] of [
      ["مناوب ألف", "متصل باللوحة"],
      ["مناوب باء", "غير متصل باللوحة"],
      ["مناوب جيم", "الحالة غير متاحة"],
    ]) {
      const member = card.getByText(name, { exact: true }).first();
      await expect(member.locator("xpath=../..").getByText(status, { exact: true })).toBeVisible();
    }
  });
});
