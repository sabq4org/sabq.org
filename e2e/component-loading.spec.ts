import { test, expect, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
let vite: ViteDevServer;
let base: string;
const baselineDir = process.env.COMPONENT_LOADING_BASELINE_DIR;
const runtimeErrors = new Map<Page, string[]>();
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page) ?? []).toEqual([]); runtimeErrors.delete(page); });
const article = { id: "local-test", slug: "loading-test", title: "خبر اختبار تحميل المكونات", content: "<p>نص تجريبي لقياس تحميل المكونات بالتوازي.</p>", status: "published", articleType: "news", publishedAt: "2026-09-05T12:00:00Z", views: 100, aiSummary: "موجز الاختبار المحلي.", category: { id: "sport", nameAr: "رياضة", slug: "sports" }, author: { id: "author", name: "صحيفة سبق" }, tags: [] };
const insights = { avgReadTime: 60, totalReads: 100, totalReactions: 7, totalComments: 2, totalViews: 100, engagementRate: 30, completionRate: 70, totalInteractions: 9 };
const recommendations = [{ id: "rec", title: "توصية اختبار متاحة", slug: "recommendation", aiMetadata: { reason: "خبر مرتبط", icon: "Brain", aiLabel: "مقترح", relevanceScore: 90 } }];
const fixture = { id: 1, date: "2026-09-05T12:00:00Z", timestamp: 1788609600, round: "دور الستة عشر", status: { code: "1H", label: "مباشر", elapsed: 30, live: true, finished: false }, home: { id: 1, name: "الهلال", logo: "" }, away: { id: 2, name: "النصر", logo: "" }, goals: { home: 2, away: 1 }, competitionSlug: "kings-cup" };

test.beforeAll(async ({}, workerInfo) => {
  vite = await createServer({ configFile: false, root: process.cwd(), plugins: [react()],
    cacheDir: path.resolve(`node_modules/.cache/vite-component-${baselineDir ? "baseline" : "current"}-${workerInfo.project.name}`),
    resolve: { alias: {
      ...(baselineDir ? {
        "@/pages/ArticleDetail": path.join(baselineDir, "ArticleDetail.tsx"),
        "@/components/AiArticleStats": path.join(baselineDir, "AiArticleStats.tsx"),
        "@/components/AIRecommendationsBlock": path.join(baselineDir, "AIRecommendationsBlock.tsx"),
      } : {}),
      "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets"),
    } },
    server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen(); base = vite.resolvedUrls!.local[0];
});
test.afterAll(async () => { await vite?.close(); });
async function mockPage(page: Page, signedIn = false) {
  runtimeErrors.set(page, []);
  page.on("pageerror", error => runtimeErrors.get(page)!.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/user") return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { id: "first-user", name: "اختبار" } : { message: "guest" } });
    if (/\/api\/articles\/[^/]+$/.test(url.pathname)) return route.fulfill({ json: { ...article, slug: url.pathname.split("/").pop() } });
    if (url.pathname.endsWith("/ai-insights")) return route.fulfill({ json: insights });
    if (url.pathname.endsWith("/ai-recommendations")) return route.fulfill({ json: recommendations });
    if (url.pathname === "/api/sports/competitions") return route.fulfill({ json: { competitions: [{ slug: "kings-cup", name: "كأس الملك", category: "saudi" }] } });
    if (url.pathname.startsWith("/api/opinion/related/")) return route.fulfill({ json: { articles: [] } });
    if (url.pathname === "/api/ads/slots/active") return route.fulfill({ json: { slotIds: [], generatedAt: new Date().toISOString() } });
    if (url.pathname.startsWith("/api/ads/slot/")) return route.fulfill({ status: 204 });
    if (url.pathname === "/api/accessibility/preferences") return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
}

    for (const signedIn of [false, true]) {
      test(`sidebar starts before a slow article (${signedIn ? "member" : "guest"})`, async ({ page }, info) => {
        await mockPage(page, signedIn);
        let articleFinished = false;
        const early: string[] = [];
        let articleStart = 0;
        const timings: { component: string; startOffsetMs: number }[] = [];
        page.on("request", req => {
          if (req.url().endsWith("/api/articles/loading-test")) articleStart = Date.now();
          if (/ai-(insights|recommendations)/.test(req.url())) {
            if (!articleFinished) early.push(req.url());
            timings.push({ component: req.url().split("/").pop()!, startOffsetMs: Date.now() - articleStart });
          }
        });
        await page.route("**/api/articles/loading-test", async route => {
          await new Promise(r => setTimeout(r, 1_500)); articleFinished = true; await route.fulfill({ json: article });
        });
        await page.goto(`${base}e2e/fixtures/component-loading.html`);
        await expect(page.getByTestId("card-ai-recommendations")).toBeVisible();
        await expect(page.getByText("خبر اختبار تحميل المكونات", { exact: true }).first()).toBeVisible();
        expect(early.filter(url => url.includes("ai-insights"))).toHaveLength(baselineDir ? 0 : 1);
        expect(early.filter(url => url.includes("ai-recommendations"))).toHaveLength(baselineDir ? 0 : 1);
        await expect(page.getByTestId("ai-stats-loading")).toHaveCount(0);
        await expect(page.getByTestId("ai-stats-panel")).toBeVisible();
        const result = { baseline: !!baselineDir, browser: info.project.name, signedIn, articleDelayMs: 1500, sidebarRequestsBeforeArticle: early.length, timings };
        process.stdout.write(`COMPONENT_TIMING ${JSON.stringify(result)}\n`);
        await info.attach("parallel-requests", { body: JSON.stringify(result), contentType: "application/json" });
      });
    }

    test("slow API stops skeletons at the deadline and manual retry recovers", async ({ page }) => {
      await mockPage(page); let hanging = true; let requests = 0;
      await page.route(/\/api\/articles\/[^/]+\/ai-(insights|recommendations)/, async route => {
        requests++;
        if (hanging) return; // Intentionally leave response pending until client aborts.
        await route.fulfill({ json: route.request().url().endsWith("ai-insights") ? insights : recommendations });
      });
      await page.goto(`${base}e2e/fixtures/component-loading.html`);
      await expect(page.getByText("تعذّر تحميل التوصيات الآن.")).toBeVisible({ timeout: 9_000 });
      await expect(page.getByText("تعذّر تحميل إحصائيات الخبر الآن.")).toBeVisible();
      await expect(page.getByTestId("ai-stats-loading")).toHaveCount(0);
      expect(requests).toBe(2); hanging = false;
      await page.getByRole("status").filter({ hasText: "تعذّر تحميل إحصائيات الخبر الآن." }).getByRole("button", { name: "إعادة المحاولة" }).click();
      await page.getByRole("status").filter({ hasText: "تعذّر تحميل التوصيات الآن." }).getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(page.getByTestId("card-ai-recommendations")).toBeVisible();
      await expect(page.getByText("تعذّر تحميل إحصائيات الخبر الآن.")).toHaveCount(0);
      expect(requests).toBe(4);
    });

    test("personal recommendations are isolated when switching accounts", async ({ page }) => {
      await mockPage(page, true); let calls = 0;
      await page.route("**/ai-recommendations", route => { calls++; return route.fulfill({ json: [{ ...recommendations[0], title: calls === 1 ? "توصية الحساب الأول" : "توصية الحساب الثاني" }] }); });
      await page.goto(`${base}e2e/fixtures/component-loading.html`);
      await expect(page.getByText("توصية الحساب الأول", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "تبديل حساب الاختبار" }).click();
      await expect(page.getByText("توصية الحساب الثاني", { exact: true })).toBeVisible();
      await expect(page.getByText("توصية الحساب الأول", { exact: true })).toHaveCount(0); expect(calls).toBe(2);
    });

    test("sports fallback shows timestamp, suppresses live status and honors hiding", async ({ page }, info) => {
      await mockPage(page); let hidden = false;
      const freshness = { state: "stale", updatedAt: new Date().toISOString(), retryAfterSeconds: 30 };
      await page.route("**/api/kings-cup/overview?**", route => route.fulfill({ json: { nextMatch: fixture, live: [fixture], started: true, freshness, blockHidden: hidden } }));
      await page.route("**/api/sports/today?**", route => route.fulfill({ json: { today: [fixture], freshness } }));
      await page.goto(`${base}e2e/fixtures/component-loading.html#sports`);
      await expect(page.getByText(/آخر بيانات متاحة .*بتوقيت الرياض/)).toHaveCount(2);
      await expect(page.getByText("مباشر", { exact: true })).toHaveCount(0);
      await expect(page.getByText("آخر نتيجة متاحة", { exact: true }).last()).toBeVisible();
      await page.screenshot({ path: info.outputPath("sports-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath("sports-mobile.png"), fullPage: true });
      hidden = true; await page.getByRole("button", { name: "تحديث الرياضة للاختبار" }).click();
      await expect(page.getByRole("region", { name: "تغطية كأس خادم الحرمين الشريفين" })).toHaveCount(0);
    });

test("a stalled session has a bounded recovery state and never fetches as a guest", async ({ page }) => {
  await mockPage(page);
  let sidebarRequests = 0;
  page.on("request", req => { if (/ai-(insights|recommendations)/.test(req.url())) sidebarRequests++; });
  await page.route("**/api/auth/user", () => {});
  await page.goto(`${base}e2e/fixtures/component-loading.html`);
  await expect(page.getByText("تعذّر تحميل التوصيات الآن.")).toBeVisible({ timeout: 9_000 });
  await expect(page.getByTestId("ai-stats-loading")).toHaveCount(0);
  expect(sidebarRequests).toBe(0);
  await page.getByRole("status").filter({ hasText: "تعذّر تحميل التوصيات الآن." }).getByRole("button", { name: "إعادة المحاولة" }).click();
  expect(sidebarRequests).toBe(0);
});

test("old sports data expires during failure and the portal link remains usable", async ({ page }) => {
  await mockPage(page); await page.clock.install();
  let failed = false;
  const freshness = { state: "stale", updatedAt: new Date(Date.now() - 9 * 60_000).toISOString(), retryAfterSeconds: 30 };
  await page.route("**/api/kings-cup/overview?**", route => route.fulfill(failed
    ? { status: 503, json: { message: "unavailable" } }
    : { json: { nextMatch: fixture, live: [fixture], freshness } }));
  await page.route("**/api/sports/today?**", route => route.fulfill(failed
    ? { status: 503, json: { message: "unavailable" } }
    : { json: { today: [fixture], freshness } }));
  await page.goto(`${base}e2e/fixtures/component-loading.html#sports`);
  await expect(page.getByText(/آخر بيانات متاحة .*بتوقيت الرياض/)).toHaveCount(2);
  failed = true;
  await page.clock.fastForward(75_000);
  await expect(page.getByText("تعذّر تحديث بيانات كأس الملك مؤقتًا.")).toBeVisible();
  await expect(page.getByText("تعذّر تحديث مباريات اليوم مؤقتًا.")).toBeVisible();
  await expect(page.getByRole("region", { name: "تغطية كأس خادم الحرمين الشريفين" })).toHaveCount(0);
  await expect(page.getByTestId("link-sports-portal")).toHaveAttribute("href", "/sports");
});

test("disabled or previously hidden tournaments stay hidden during recovery", async ({ page }) => {
  await mockPage(page); let configured = false;
  await page.route("**/api/kings-cup/overview?**", route => route.fulfill({ json: configured
    ? { nextMatch: fixture, blockHidden: true, freshness: { state: "stale", updatedAt: new Date(Date.now() - 11 * 60_000).toISOString(), retryAfterSeconds: 30 } }
    : { configured: false } }));
  await page.route("**/api/sports/today?**", route => route.fulfill({ json: { configured: false, today: [] } }));
  await page.goto(`${base}e2e/fixtures/component-loading.html#sports`);
  await expect(page.getByTestId("link-sports-portal")).toBeVisible();
  await expect(page.getByText("تعذّر تحديث بيانات كأس الملك مؤقتًا.")).toHaveCount(0);
  configured = true; await page.getByRole("button", { name: "تحديث الرياضة للاختبار" }).click();
  await expect(page.getByRole("region", { name: "تغطية كأس خادم الحرمين الشريفين" })).toHaveCount(0);
  await expect(page.getByText("تعذّر تحديث بيانات كأس الملك مؤقتًا.")).toHaveCount(0);
});

test("previous backend without freshness still labels cached data after an error", async ({ page }) => {
  await mockPage(page); let failed = false;
  await page.route("**/api/kings-cup/overview?**", route => route.fulfill(failed
    ? { status: 503, json: { message: "unavailable" } }
    : { json: { nextMatch: fixture, live: [fixture] } }));
  await page.route("**/api/sports/today?**", route => route.fulfill({ json: { configured: false, today: [] } }));
  await page.goto(`${base}e2e/fixtures/component-loading.html#sports`);
  await expect(page.getByRole("region", { name: "تغطية كأس خادم الحرمين الشريفين" })).toBeVisible();
  failed = true; await page.getByRole("button", { name: "تحديث الرياضة للاختبار" }).click();
  await expect(page.getByText(/آخر بيانات متاحة .*بتوقيت الرياض/)).toBeVisible();
  await expect(page.getByText("مباشر", { exact: true })).toHaveCount(0);
});
