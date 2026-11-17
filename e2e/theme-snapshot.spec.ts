import { expect, test } from "@playwright/test";

test("reuses a public theme across reloads until the original poll deadline", async ({ page }) => {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
  let requests = 0;
  let color = "red";
  await page.route("**/api/themes/active?scope=site_full", (route) => {
    requests++;
    return route.fulfill({
      headers: { "Cache-Control": "public, max-age=0" },
      json: { assets: {}, tokens: { colors: { probe: color } } },
    });
  });

  const renderedColor = async () => {
    await page.clock.runFor(5);
    return page.locator("html").evaluate((root) => root.style.getPropertyValue("--theme-probe"));
  };

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect.poll(renderedColor).toBe("red");
  await page.clock.fastForward(55_000);
  color = "blue";
  for (let visit = 0; visit < 2; visit++) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(renderedColor).toBe("red");
  }
  expect(requests).toBe(1);

  await page.clock.runFor(5_000);
  await expect.poll(renderedColor).toBe("blue");
  expect(requests).toBe(2);
});

test("restores the default logo on a failed poll and applies the next successful theme", async ({ page }) => {
  await page.clock.install();
  let status = 200;
  let customLogo = "/favicon.ico?test=first";
  await page.route("**/api/themes/active?scope=site_full", (route) =>
    route.fulfill({
      status,
      json: { assets: { logoLight: customLogo, logoDark: customLogo }, tokens: null },
    }),
  );
  await page.goto("/terms", { waitUntil: "domcontentloaded" });
  const logo = page.locator(".sabq-header-logo-desktop");
  await expect(logo).toHaveAttribute("src", customLogo);

  status = 503;
  await page.clock.fastForward(60_000);
  await expect(logo).toHaveAttribute("src", /sabq-logo[^/]*\.png/);

  status = 200;
  customLogo = "/favicon.ico?test=recovered";
  await page.clock.fastForward(60_000);
  await expect(logo).toHaveAttribute("src", customLogo);
});
