import { test, expect, Page } from "@playwright/test";

/**
 * Smoke tests — the safety net for refactoring.
 *
 * All tests here are READ-ONLY (no writes, no logins, no mutations), so they
 * are safe to run against production:
 *   PW_BASE_URL=https://sabq.org npx playwright test e2e/smoke.spec.ts
 *
 * Locally: `npm run dev` first, then `npm run test:smoke`.
 *
 * Convention: assert on data-testid where one exists; otherwise on stable
 * URL/content invariants. Keep these FAST and FEW — they answer one question:
 * "did the critical path break?"
 */

// The SPA shows a Suspense spinner first; wait for real content instead of networkidle
// (analytics/ads beacons keep the network busy forever on production).
//
// NOTE: `visible=true` matters — seoInjector injects HIDDEN /article/ links into
// the HTML shell for crawlers, and a plain `.first()` would match one of those
// and wait forever for it to become visible.
function visibleArticleLinks(page: Page) {
  return page.locator('a[href^="/article/"]').locator("visible=true");
}

async function waitForArticleLinks(page: Page) {
  await expect(visibleArticleLinks(page).first()).toBeVisible({ timeout: 20_000 });
}

test.describe("smoke: public critical paths", () => {
  test("health endpoint returns a JSON 2xx response", async ({ request }) => {
    const response = await request.get("/health", { timeout: 15_000 });
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
    expect(response.headers()["content-type"] || "").toContain("application/json");
    const body = await response.json();
    expect(body).toMatchObject({ status: expect.any(String) });
  });
  test("homepage renders with article links", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    await waitForArticleLinks(page);
    // RTL document for the Arabic home
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // More than a handful of articles actually rendered. Polled, not a
    // one-shot count: sections below the hero stream in after the first
    // card becomes visible.
    await expect
      .poll(() => visibleArticleLinks(page).count(), { timeout: 15_000 })
      .toBeGreaterThan(5);
  });

  test("article page opens from homepage and shows a title", async ({ page }) => {
    await page.goto("/");
    await waitForArticleLinks(page);

    const firstArticle = visibleArticleLinks(page).first();
    const href = await firstArticle.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    // An h1 with real text is the invariant for the article page
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible({ timeout: 20_000 });
    expect(((await h1.textContent()) || "").trim().length).toBeGreaterThan(10);
  });

  test("category page renders articles", async ({ page }) => {
    await page.goto("/");
    await waitForArticleLinks(page);

    const categoryLink = page
      .locator('a[href^="/category/"]')
      .locator("visible=true")
      .first();
    const href = await categoryLink.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    await waitForArticleLinks(page);
  });

  test("login page renders the form", async ({ page }) => {
    await page.goto("/login");
    // Default tab is phone OTP; switch to email to assert the classic form.
    await expect(page.getByTestId("tab-email")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("tab-email").click();
    await expect(page.getByTestId("input-email")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("input-password")).toBeVisible();
    await expect(page.getByTestId("button-login")).toBeVisible();
  });

  test("unknown route shows the 404 page (not a white screen)", async ({ page }) => {
    await page.goto("/this-route-should-never-exist-xyz");
    await expect(page.getByTestId("text-404-title")).toBeVisible({ timeout: 20_000 });
  });

  test("dashboard redirects unauthenticated visitors away", async ({ page }) => {
    await page.goto("/dashboard");
    // Either redirected to login/home or shown the login form — never the dashboard shell
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  });
});

/**
 * Authenticated flow — opt-in only, NEVER against production.
 * Run locally with:
 *   E2E_USER=... E2E_PASS=... npx playwright test e2e/smoke.spec.ts -g "authenticated"
 */
test.describe("smoke: authenticated editor flow", () => {
  test.skip(
    !process.env.E2E_USER ||
      !process.env.E2E_PASS ||
      /sabq\.org/.test(process.env.PW_BASE_URL || ""),
    "Set E2E_USER/E2E_PASS (and never run against production)",
  );

  test("staff can log in and open the article editor", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("input-email").fill(process.env.E2E_USER!);
    await page.getByTestId("input-password").fill(process.env.E2E_PASS!);
    await page.getByTestId("button-login").click();

    // Login succeeded if we navigate away from /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    await page.goto("/dashboard/articles/new");
    // Editor shell rendered (no white screen, no edit-lock fatal error page)
    await expect(page.locator("body")).not.toContainText("حدث خطأ غير متوقع");
  });
});
