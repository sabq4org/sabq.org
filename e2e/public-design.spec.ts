import { test, expect, type Page } from "@playwright/test";

// Vite-only component gallery. Never exercise mutation checks against production.
const origin = process.env.PW_BASE_URL || "http://localhost:5000";
test.skip(process.env.PW_PUBLIC_DESIGN !== "1" || !["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Opt-in local public design acceptance");

async function prepare(page: Page) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "local-test-csrf" } });
    if (path === "/api/auth/user") return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/__preview/public-design");
  await expect(page.getByRole("heading", { name: "مرجع واجهة سبق" })).toBeVisible();
}
const listCard = (page: Page) => page.locator('.public-news-card-list').first();

test("news cards use the calm blue hover and compact lists stay frameless", async ({ page }) => {
  await prepare(page);
  const gridCard = page.locator(".public-news-card-grid").first();
  const baseColor = await gridCard.evaluate(element => getComputedStyle(element).backgroundColor);
  await gridCard.hover();
  await expect.poll(() => gridCard.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(baseColor);

  const compactCard = page.locator(".public-news-compact-list .public-news-card").first();
  expect(await compactCard.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe("0px");
  expect(await compactCard.evaluate(element => getComputedStyle(element).boxShadow)).toBe("none");
});

test("opinion cards show the writer image in both homepage and archive layouts", async ({ page }) => {
  await prepare(page);
  const opinionSection = page.getByRole("region", { name: "بطاقات الرأي", exact: true });
  for (const variant of ["home", "grid"]) {
    const card = opinionSection.locator(`.public-opinion-card-${variant}`);
    const avatar = card.locator(".public-opinion-avatar");
    const quote = card.locator(".public-opinion-quote");
    const authorRow = card.locator(".public-opinion-author-row");
    const title = card.locator(".public-opinion-title");
    await expect(avatar.locator("img")).toBeVisible();
    const avatarBox = (await avatar.boundingBox())!;
    const quoteBox = (await quote.boundingBox())!;
    const authorRowBox = (await authorRow.boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    expect(quoteBox.x + quoteBox.width).toBeLessThan(avatarBox.x);
    expect(titleBox.y - (authorRowBox.y + authorRowBox.height)).toBeGreaterThanOrEqual(12);
  }
  const archiveCard = opinionSection.locator(".public-opinion-card-grid");
  await expect(archiveCard).not.toContainText("اقرأ المقال");
  await expect(archiveCard.getByTestId("opinion-views-public-opinion-sample")).toHaveText("1,240 مشاهدة");
  await page.setViewportSize({ width: 390, height: 844 });
  const sidebarTitle = opinionSection.locator(".public-opinion-card-sidebar .public-opinion-title");
  expect(await sidebarTitle.evaluate(title => getComputedStyle(title).fontSize)).toBe("17px");
});

test("opinion archive removes the empty category strip below the header", async ({ page }) => {
  const article = {
    id: "opinion-archive-sample",
    slug: "opinion-archive-sample",
    title: "مقال رأي تجريبي",
    excerpt: "ملخص تجريبي",
    publishedAt: "2026-09-10T18:00:00Z",
    views: 1240,
    author: { name: "كاتب تجريبي" },
  };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
    if (path === "/api/categories/smart") return route.fulfill({ json: [] });
    if (path === "/api/opinion") return route.fulfill({ json: { articles: [article], pagination: { page: 1, limit: 12, total: 1, totalPages: 1 } } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/opinion");
  await expect(page.getByText("مقال رأي تجريبي", { exact: true })).toBeVisible();

  const header = (await page.getByRole("banner", { name: "رأس الصفحة الرئيسي" }).boundingBox())!;
  const hero = (await page.getByTestId("section-hero").boundingBox())!;
  expect(Math.abs(hero.y - (header.y + header.height))).toBeLessThan(2);
  await expect(page.getByTestId("opinion-views-opinion-archive-sample")).toHaveText("1,240 مشاهدة");
});

test("category results follow the heading without a viewport-sized blank gap", async ({ page }) => {
  const category = { id: "category-local", slug: "saudi", englishSlug: "saudi", nameAr: "محليات", description: "أخبار المناطق والمدن السعودية", icon: "🗺️", type: "manual" };
  const article = { id: "category-article", slug: "category-article", englishSlug: "category-article", title: "خبر محلي تجريبي", excerpt: "وصف موجز للخبر المحلي.", publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), articleType: "news", newsType: "regular", imageUrl: null, category };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
    if (path === "/api/categories/slug/saudi") return route.fulfill({ json: category });
    if (path === "/api/categories/saudi/articles") return route.fulfill({ json: [article] });
    if (path === "/api/categories") return route.fulfill({ json: [category] });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/category/saudi");
  await expect(page.getByText("خبر محلي تجريبي", { exact: true })).toBeVisible();
  const mobileHeader = (await page.getByTestId("category-header").boundingBox())!;
  const mobileFilters = (await page.getByTestId("select-sort").boundingBox())!;
  expect(mobileHeader.height).toBeLessThan(160);
  expect(mobileFilters.y - (mobileHeader.y + mobileHeader.height)).toBeLessThan(80);
  expect(mobileFilters.width).toBeLessThan(180);
  await expect(page.getByText("وصف موجز للخبر المحلي.")).toBeHidden();
  const mobileCard = page.locator(".public-news-card").first();
  expect(await mobileCard.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe("0px");

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopHeader = (await page.getByTestId("category-header").boundingBox())!;
  const desktopFilters = (await page.getByTestId("select-sort").boundingBox())!;
  expect(desktopFilters.y - (desktopHeader.y + desktopHeader.height)).toBeLessThan(240);
  await expect(page.getByTestId("category-filter-bar")).toBeVisible();
  await expect(page.getByText("وصف موجز للخبر المحلي.")).toBeVisible();
});

test("keyword results follow a compact heading without full-width mobile filters", async ({ page }) => {
  const article = { id: "keyword-article", slug: "keyword-article", englishSlug: "keyword-article", title: "خبر كلمة مفتاحية تجريبي", excerpt: "وصف موجز لكلمة مفتاحية.", publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), articleType: "news", newsType: "regular", views: 12, commentsCount: 1, imageUrl: null };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
    if (path === "/api/keyword/السعودية" || path.endsWith("/keyword/%D8%A7%D9%84%D8%B3%D8%B9%D9%88%D8%AF%D9%8A%D8%A9")) {
      return route.fulfill({ json: { articles: [article], muqtarabTopics: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/keyword/" + encodeURIComponent("السعودية"));
  await expect(page.getByText("خبر كلمة مفتاحية تجريبي", { exact: true })).toBeVisible();
  const mobileHeader = (await page.getByTestId("keyword-header").boundingBox())!;
  const mobileFilters = (await page.getByTestId("button-filter-all").boundingBox())!;
  expect(mobileHeader.height).toBeLessThan(160);
  expect(mobileFilters.y - (mobileHeader.y + mobileHeader.height)).toBeLessThan(80);
  await expect(page.getByText("وصف موجز لكلمة مفتاحية.")).toBeHidden();
  const mobileCard = page.locator(".public-news-card").first();
  expect(await mobileCard.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe("0px");

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId("keyword-filter-bar")).toBeVisible();
  await expect(page.getByText("وصف موجز لكلمة مفتاحية.")).toBeVisible();
});

test("categories directory header stays compact instead of a marketing hero", async ({ page }) => {
  const categories = [
    { id: "tech", slug: "tech", nameAr: "تقنية", nameEn: "Tech", status: "visible", type: "core", displayOrder: 1, articleCount: 12, hasPulseData: true, pulseLevel: "hot", pulsePercent: 80, color: "#087dbb" },
    { id: "culture", slug: "culture", nameAr: "ثقافة", nameEn: "Culture", status: "visible", type: "core", displayOrder: 2, articleCount: 8, hasPulseData: true, pulseLevel: "active", pulsePercent: 40, color: "#8b5cf6" },
  ];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
    if (path === "/api/categories") return route.fulfill({ json: categories });
    return route.fulfill({ json: {} });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/categories");
  await expect(page.getByTestId("heading-categories")).toBeVisible();
  const mobileHeader = (await page.getByTestId("categories-header").boundingBox())!;
  const mobileQuick = (await page.getByRole("heading", { name: "تصفّح سريع" }).boundingBox())!;
  expect(mobileHeader.height).toBeLessThan(200);
  expect(mobileQuick.y - (mobileHeader.y + mobileHeader.height)).toBeLessThan(40);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopHeader = (await page.getByTestId("categories-header").boundingBox())!;
  const desktopQuick = (await page.getByRole("heading", { name: "تصفّح سريع" }).boundingBox())!;
  expect(desktopHeader.height).toBeLessThan(220);
  expect(desktopQuick.y - (desktopHeader.y + desktopHeader.height)).toBeLessThan(48);
});

test("all card layouts fit mobile, tablet and desktop in both themes", async ({ page }) => {
  await prepare(page);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const card of await page.locator('.public-news-card').all()) {
        const box = await card.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(width);
      }
      const action = listCard(page).getByRole("button").first();
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test("save follows server state, keeps failure state and sends CSRF without navigation", async ({ page }) => {
  await prepare(page);
  let writes = 0;
  await page.route("**/api/articles/public-design-sample/bookmark", async route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe("local-test-csrf");
    writes++;
    await new Promise(resolve => setTimeout(resolve, 150));
    return route.fulfill(writes === 3 ? { status: 500, json: { message: "test failure" } } : { json: { isBookmarked: writes === 1 } });
  });
  const save = listCard(page).getByRole("button").first();
  await save.click(); await expect(save).toBeDisabled(); await expect(save).toHaveAttribute("aria-pressed", "true");
  await save.click(); await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click(); await expect(page.getByText("تعذر حفظ المقال", { exact: true })).toBeVisible();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  expect(writes).toBe(3); await expect(page).toHaveURL(/__preview\/public-design$/);
});

test("English and Urdu preserve their routes, labels and bookmark contracts", async ({ page }) => {
  await prepare(page);
  await page.locator('#gallery-locale').selectOption("en");
  await expect(listCard(page).locator('a').first()).toHaveAttribute("href", "/en/article/public-design-sample");
  await expect(page.getByTestId("link-infographic-infographic")).toHaveAttribute("href", "/en/article/public-design-sample");
  await expect(page.getByText("Breaking", { exact: true })).toBeVisible();
  await expect(page.getByTestId("badge-content-type-localized-category")).toHaveText("Local section");
  let enRequests = 0;
  await page.route("**/api/en/articles/public-design-sample/bookmark", route => { enRequests++; return route.fulfill({ json: { isBookmarked: true } }); });
  await listCard(page).getByRole("button", { name: /^Save:/ }).click();
  await expect(listCard(page).getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  expect(enRequests).toBe(1);
  await page.locator('#gallery-locale').selectOption("ur");
  await expect(listCard(page).locator('a').first()).toHaveAttribute("href", "/ur/article/public-design-sample");
  await expect(page.getByTestId("link-infographic-infographic")).toHaveAttribute("href", "/ur/article/public-design-sample");
  await expect(page.getByText("بریکنگ", { exact: true })).toBeVisible();
  await expect(page.getByTestId("badge-content-type-localized-category")).toHaveText("مقامی خبریں");
  const methods: string[] = [];
  await page.route("**/api/ur/article/public-design-sample/bookmark", route => { methods.push(route.request().method()); return route.fulfill({ json: { id: "sample-bookmark" } }); });
  const save = listCard(page).getByRole("button").first();
  await save.click(); await expect(save).toHaveAttribute("aria-pressed", "true");
  await save.click(); await expect(save).toHaveAttribute("aria-pressed", "false");
  expect(methods).toEqual(["POST", "DELETE"]);
});

test("clipboard sharing uses selected locale and reports clipboard failure", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value: string) => { (window as Window & { sharedUrl?: string }).sharedUrl = value; } }, configurable: true });
  });
  await prepare(page); await page.locator('#gallery-locale').selectOption("en");
  await listCard(page).getByRole('button', { name: /^Share:/ }).click();
  await expect(page.getByText("Article link copied", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { sharedUrl?: string }).sharedUrl)).toBe(`${origin}/en/article/public-design-sample`);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; });
  await listCard(page).getByRole('button', { name: /^Share:/ }).click();
  await expect(page.getByText("Could not share article", { exact: true }).first()).toBeVisible();
});

test("unauthenticated save follows the existing sign-in recovery flow", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/articles/public-design-sample/bookmark", route => route.fulfill({ status: 401, json: { message: "Unauthorized" } }));
  const save = listCard(page).getByRole("button").first();
  await save.click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول", exact: true })).toBeVisible();
});


test("sidebar titles start at the image top and images fill their entire frame", async ({ page }) => {
  await prepare(page);
  const card = page.getByTestId("card-article-compact-sidebar-layout");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      const media = (await card.locator(".public-card-media").boundingBox())!;
      const image = (await card.locator("img").boundingBox())!;
      const title = (await card.locator(".public-card-title").boundingBox())!;
      expect(Math.abs(title.y - media.y)).toBeLessThan(1);
      expect(Math.abs(image.y - media.y)).toBeLessThan(1);
      expect(Math.abs(image.x - media.x)).toBeLessThan(1);
      expect(Math.abs(image.height - media.height)).toBeLessThan(1);
      expect(Math.abs(image.width - media.width)).toBeLessThan(1);
      expect(await card.locator("img").evaluate(image => getComputedStyle(image).objectFit)).toBe("cover");
      expect(await card.locator(".public-card-title").evaluate(title => getComputedStyle(title).fontSize)).toBe("17px");
    }
  }
});


test("summary expands and folds the same full prose without bullet points", async ({ page }) => {
  await prepare(page);
  const summary = page.getByRole("region", { name: "الموجز المشترك", exact: true });
  const text = summary.getByTestId("text-smart-summary");
  const toggle = summary.getByTestId("button-toggle-summary");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await summary.scrollIntoViewIfNeeded();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const original = await text.textContent();
    const foldedHeight = (await text.boundingBox())!.height;
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => (await text.boundingBox())!.height).toBeGreaterThan(foldedHeight);
    expect(await text.textContent()).toBe(original);
    await expect(text).toContainText("فقرة 5");
    await expect(text).toContainText("2024");
    expect(await text.textContent()).not.toContain("•");
    expect(await text.textContent()).not.toContain("2) ");
    await expect(summary.locator("ul,ol,li")).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await text.boundingBox())!.height).toBe(foldedHeight);
  }
  await summary.getByTestId("button-listen-summary").click();
  await expect(summary.getByTestId("button-listen-summary")).toHaveAccessibleName("إيقاف الاستماع");
  await expect(page.getByRole("region", { name: "الموجز القصير", exact: true }).getByTestId("button-toggle-summary")).toHaveCount(0);
});
