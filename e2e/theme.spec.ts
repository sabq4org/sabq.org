import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Comfortable dark theme", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("theme-preference", "dark");
      localStorage.setItem("theme", "dark");
    });
  });

  test("applies the saved theme without using a pure-black page surface", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);
    await expect(html).toHaveAttribute("data-theme-preference", "dark");

    const background = await page.locator("body").evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(background).toBe("rgb(16, 20, 24)");
  });

  test("keeps the login surface free of WCAG color-contrast violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("follows operating-system changes while the system preference is selected", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("theme-preference", "system"));
    await page.goto("/login");
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
  });
});
