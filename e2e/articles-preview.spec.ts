import { test, expect, type Page } from "@playwright/test";

const ADMIN = {
  id: "admin-sabq",
  username: "admin",
  firstName: "علي",
  lastName: "الحزمي",
  email: "admin@sabq.org",
  role: "admin",
  roles: ["admin"],
  permissions: ["*"],
  profileImageUrl: null,
};

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/auth/user")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ADMIN),
      });
      return;
    }
    if (url.includes("/api/admin/articles/metrics")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ published: 12, scheduled: 3, draft: 4, archived: 2 }),
      });
      return;
    }
    if (url.includes("/api/admin/articles")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ articles: [], total: 0, page: 1, limit: 30, totalPages: 1 }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("articles management preview", () => {
  test("desktop: attention, search, filters, actions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await mockApi(page);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/dashboard/articles-preview");

    await expect(page.getByTestId("preview-heading-title")).toBeVisible({ timeout: 20000 });
    // لوحة الانتباه تعرض المهام المعلّقة افتراضياً
    await expect(page.getByTestId("preview-attention-pending")).toBeVisible();
    await expect(page.getByTestId("preview-row-a-3002")).toBeVisible();

    await page.screenshot({ path: "test-results/preview-desktop.png", fullPage: true });

    // البحث عبر كل المقالات
    await page.getByTestId("preview-view-all").click();
    await expect(page.getByTestId("preview-row-a-1001")).toBeVisible();
    await page.getByTestId("preview-search").fill("أرامكو");
    await expect(page.getByTestId("preview-row-a-1006")).toBeVisible();
    await expect(page.getByTestId("preview-row-a-1001")).toHaveCount(0);

    // مسح البحث + عرض "المنشورة"
    await page.getByTestId("preview-search").fill("");
    await page.getByTestId("preview-view-published").click();
    await expect(page.getByTestId("preview-row-a-1004")).toBeVisible();
    await expect(page.getByTestId("preview-row-a-3001")).toHaveCount(0);

    // تبديل التمييز على مقال منشور + توست
    const featureBtn = page.getByTestId("preview-quick-feature-a-1002");
    if (await featureBtn.count()) {
      await featureBtn.first().click();
      await expect(page.getByText(/تم التمييز|أُلغي التمييز/).first()).toBeVisible();
    }

    // أرشفة عبر قائمة المزيد
    await page.getByTestId("preview-more-a-1004").click();
    await page.getByRole("menuitem", { name: "أرشفة" }).click();
    await expect(page.getByTestId("preview-note-input")).toBeVisible();
    await page.getByTestId("preview-note-input").fill("سبب تجريبي للاختبار");
    await page.getByTestId("preview-note-confirm").click();
    await expect(page.getByText(/تمت الأرشفة/).first()).toBeVisible();

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("detail sheet opens and shows AI summary", async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/dashboard/articles-preview");
    await expect(page.getByTestId("preview-heading-title")).toBeVisible({ timeout: 20000 });
    await page.getByTestId("preview-view-all").click();
    await expect(page.getByTestId("preview-row-a-1001")).toBeVisible();
    await page.getByTestId("preview-open-a-1001").click();
    await expect(page.getByTestId("preview-detail-title")).toBeVisible();
    await expect(page.getByText("ملخص ذكي")).toBeVisible();
    await page.screenshot({ path: "test-results/preview-detail-sheet.png" });
  });

  test("existing /dashboard/articles still renders (no regression)", async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/dashboard/articles");
    await expect(page.getByTestId("heading-title")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("button-create-article")).toBeVisible();
  });

  test("responsive: no horizontal overflow at 360/768/1280", async ({ page }) => {
    await mockApi(page);
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard/articles-preview");
      await expect(page.getByTestId("preview-heading-title")).toBeVisible({ timeout: 20000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/preview-${width}.png` });
    }
  });

  test("mobile: renders and stacks", async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/articles-preview");
    await expect(page.getByTestId("preview-heading-title")).toBeVisible({ timeout: 20000 });
    await page.getByTestId("preview-view-all").click();
    await expect(page.getByTestId("preview-row-a-1001")).toBeVisible();
    await page.screenshot({ path: "test-results/preview-mobile.png", fullPage: true });

    // تحديد عنصرين وإظهار الشريط السفلي
    await page.getByTestId("preview-check-a-1001").click({ force: true });
    await page.getByTestId("preview-check-a-1002").click({ force: true });
    await expect(page.getByTestId("preview-bulk-bar-mobile")).toBeVisible();
    await page.screenshot({ path: "test-results/preview-mobile-bulk.png" });
  });
});
