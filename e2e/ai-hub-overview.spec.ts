import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const overview = {
  today: { requests: 42, costUsd: 12, inputTokens: 1000, outputTokens: 500 },
  yesterdaySameWindow: { requests: 20, costUsd: 6 },
  last24h: { total: 50, success: 45, fallback: 4, failed: 1, successRate: 98, p50LatencyMs: 100, p95LatencyMs: 800 },
  month: { costUsd: 120, projectedCostUsd: 450, budgetUsd: 500 },
  providers: { openai: { status: "healthy", failCount: 0, cooldownUntil: null, lastErrorCode: null, p95LatencyMs: 800, requests24h: 50 } },
};

async function openOverview(page: Page) {
  const dependencies = `/@fs${path.resolve("node_modules/.vite/deps")}`;
  // Use Vite's transformed import: optimized packages can have different hashes.
  const transformed = await (await page.request.get("/src/lib/queryClient.ts")).text();
  const queryImport = transformed.match(/from "([^"\n]*@tanstack_react-query\.js[^"\n]*)"/)?.[1];
  if (!queryImport) throw new Error("Vite React Query import was not found");
  await page.route("**/__ai-hub-test", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<html dir="rtl"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('${dependencies}/react.js');
      const {default: ReactDOM} = await import('${dependencies}/react-dom_client.js');
      const {QueryClientProvider} = await import('${queryImport}');
      const {queryClient} = await import('/src/lib/queryClient.ts');
      queryClient.setDefaultOptions({queries: {...queryClient.getDefaultOptions().queries, retry: false}});
      window.refreshOverview = () => queryClient.invalidateQueries({queryKey: ['/api/admin/ai-hub/overview']});
      const {default: Overview} = await import('/src/pages/dashboard/AiHub/OverviewTab.tsx');
      await import('/src/index.css');
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(QueryClientProvider, {client: queryClient}, React.createElement(Overview)));
    </script></body></html>`,
  }));
  await page.goto("/__ai-hub-test", { waitUntil: "commit" });
}

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local Vite only");
  await page.route("**/api/**", route => route.fulfill({ json: [] }));
});

test("a failed overview leaves loading, then retry displays the content", async ({ page }, testInfo) => {
  let fail = true;
  await page.route("**/api/admin/ai-hub/overview", route => fail
    ? route.fulfill({ status: 500, json: { message: "تعذر تحميل النظرة العامة" } })
    : route.fulfill({ json: overview }));
  await openOverview(page);
  await expect(page.getByRole("alert")).toContainText("تعذر تحميل بيانات مركز الذكاء الاصطناعي");
  await expect(page.getByTestId("ai-hub-overview-loading")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("overview-error.png") });
  fail = false;
  await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await expect(page.getByText("طلبات اليوم", { exact: true })).toBeVisible();
  await expect(page.getByText("42", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("overview-loaded.png") });
});

test("a null response does not become a permanent loading skeleton", async ({ page }) => {
  await page.route("**/api/admin/ai-hub/overview", route => route.fulfill({ json: null }));
  await openOverview(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("ai-hub-overview-loading")).toHaveCount(0);
});

test("a failed background refresh retains the last content and labels it", async ({ page }) => {
  let fail = false;
  await page.route("**/api/admin/ai-hub/overview", route => fail
    ? route.fulfill({ status: 500, json: { message: "Unavailable" } })
    : route.fulfill({ json: overview }));
  await openOverview(page);
  await expect(page.getByText("طلبات اليوم", { exact: true })).toBeVisible();
  fail = true;
  await page.evaluate(() => (window as unknown as { refreshOverview: () => Promise<void> }).refreshOverview());
  await expect(page.getByRole("alert")).toContainText("آخر بيانات تم تحميلها");
  await expect(page.getByText("42", { exact: true })).toBeVisible();
});
