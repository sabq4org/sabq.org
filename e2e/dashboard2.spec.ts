import { test, expect, type Page } from "@playwright/test";

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const STATS = {
  articles: { total: 1200, published: 900, draft: 14, archived: 40, scheduled: 9, totalViews: 5_000_000, viewsToday: 18400 },
  comments: { total: 5000, pending: 12, approved: 4800, rejected: 188 },
  categories: { total: 18 },
  reactions: { total: 9000, todayCount: 210 },
  engagement: { averageTimeOnSite: 95, totalReads: 120000, readsToday: 3200 },
  mediaLibrary: { totalFiles: 4200, totalSize: 100 },
  aiImages: { total: 300, thisWeek: 20 },
  smartBlocks: { total: 11 },
  recentArticles: [
    { id: "a1", title: "اتفاقية اقتصادية جديدة ترفع التبادل التجاري", status: "published", publishedAt: iso(-3600_000), views: 1200, category: { nameAr: "اقتصاد" }, author: { firstName: "سارة", lastName: "الدوسري" } },
    { id: "a2", title: "مسودة تقرير الطاقة المتجددة", status: "draft", createdAt: iso(-1800_000), views: 0, author: { firstName: "خالد", lastName: "البقمي" } },
  ],
  topArticles: [{ id: "a1", title: "اتفاقية اقتصادية جديدة", views: 1200, category: { nameAr: "اقتصاد" } }],
};

const PULSE = {
  articles: { publishedToday: 23, publishedYesterday: 19, pendingReview: 3, needsChanges: 2, viewsYesterday: 17000 },
  comments: { receivedToday: 40, moderatedToday: 30, pendingOlderThanTwoHours: 4 },
  reactions: { yesterdayCount: 180 },
  engagement: { readsYesterday: 3000 },
  trendingArticles: [
    { id: "t1", title: "النفط يرتفع لأعلى مستوى", slug: "oil", views: 9000, recentViews: 3200, categoryName: "اقتصاد" },
    { id: "t2", title: "الأخضر يتأهل للنهائي", slug: "k", views: 15000, recentViews: 2800, categoryName: "رياضة" },
  ],
  upcomingSchedule: [{ id: "s1", title: "قرعة أبطال آسيا", scheduledAt: iso(2 * 3_600_000) }],
  hourlyViews: [{ hour: "00", views: 10 }, { hour: "01", views: 40 }],
  generatedAt: iso(0),
};

const FULL_ADMIN = {
  id: "u-admin",
  firstName: "علي",
  lastName: "الحزمي",
  email: "admin@sabq.org",
  role: "admin",
  roles: ["admin"],
  permissions: ["*"],
  profileImageUrl: null,
};

const LIMITED_EDITOR = {
  id: "u-editor",
  firstName: "نورة",
  lastName: "القحطاني",
  email: "editor@sabq.org",
  role: "editor",
  roles: ["editor"],
  permissions: ["articles.view", "dashboard.view_stats", "analytics.view"],
  profileImageUrl: null,
};

interface MockOptions {
  gapsError?: boolean;
  empty?: boolean;
}

async function mockApi(page: Page, user: unknown, options: MockOptions = {}) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/api/auth/user")) return json(user);
    if (url.includes("/api/admin/dashboard/stats")) return json(options.empty ? { ...STATS, articles: { ...STATS.articles, draft: 0, scheduled: 0 }, comments: { total: 0, pending: 0, approved: 0, rejected: 0 }, reactions: { total: 0, todayCount: 0 }, engagement: { averageTimeOnSite: 0, totalReads: 0, readsToday: 0 }, recentArticles: [] } : STATS);
    if (url.includes("/api/admin/dashboard/pulse")) return json(options.empty ? { ...PULSE, articles: { publishedToday: 0, publishedYesterday: 0, pendingReview: 0, needsChanges: 0, viewsYesterday: 0 }, comments: { receivedToday: 0, moderatedToday: 0, pendingOlderThanTwoHours: 0 }, trendingArticles: [], upcomingSchedule: [], hourlyViews: [] } : PULSE);
    if (url.includes("/api/calendar/upcoming-reminders")) return json(options.empty ? [] : [{ id: "r1", eventTitle: "تذكير تغطية الحدث", reminderTime: iso(3_600_000) }]);
    if (url.includes("/api/calendar/my-assignments")) return json(options.empty ? [] : [{ id: "as1", eventTitle: "مهمة تحريرية مسندة", status: "pending", role: "editor" }]);
    if (url.includes("/api/admin/dashboard/coverage-gaps")) {
      if (options.gapsError) return json({ message: "boom" }, 500);
      return json({ gaps: options.empty ? [] : [{ id: "g1", title: "موضوع متصاعد بلا تغطية داخلية", heatScore: 85, sourceName: "وكالة", sourceCount: 3, status: "open", firstDetectedAt: iso(-7200_000) }], matcher: {} });
    }
    if (url.includes("/api/admin/muqtarab/review-queue")) return json(options.empty ? [] : [{ id: "m1", title: "زاوية جديدة", angle: { nameAr: "زاوية" } }]);
    if (url.includes("/api/social-publishing/stats")) return json(options.empty ? { total: 0, publishedToday: 0, scheduledUpcoming: 0, failed: 0, pendingDrafts: 0, pendingAuthorProposals: 0 } : { total: 100, publishedToday: 5, scheduledUpcoming: 2, failed: 1, pendingDrafts: 3, pendingAuthorProposals: 2 });
    if (url.includes("/api/tasks/statistics")) return json(options.empty ? { total: 0, todo: 0, inProgress: 0, review: 0, completed: 0, overdue: 0 } : { total: 10, todo: 3, inProgress: 2, review: 1, completed: 4, overdue: 1 });
    if (url.includes("/api/admin/push/logs/stats")) return json(options.empty ? { totalSent: 0, totalFailed: 0, successRate: 100 } : { totalSent: 1200, totalFailed: 7, successRate: 99.4 });
    if (url.includes("/api/trending-keywords")) return json(options.empty ? [] : [{ keyword: "أرامكو", count: 12, category: "اقتصاد" }]);
    if (url.includes("/api/media/stats")) return json(options.empty ? { totalImages: 0, aiGenerated: 0, pendingAnalysis: 0, topUsed: [] } : { totalImages: 4200, aiGenerated: 300, pendingAnalysis: 5, topUsed: [{ id: "me1", title: "صورة الخبر", usage: 9 }] });
    if (url.includes("/api/smart-blocks/stage/summary")) return json(options.empty ? { total: 0, active: 0, inactive: 0, scheduled: 0, byPlacement: {} } : { total: 11, active: 7, inactive: 2, scheduled: 2, byPlacement: { hero: 1, section: 3 } });
    if (url.includes("/api/admin/online-moderators")) return json(options.empty ? [] : [{ id: "u1", email: "a@sabq.org", firstName: "علي", lastName: "ح", profileImageUrl: null, role: "editor", roleNameAr: "محرر", jobTitle: null, lastActivityAt: iso(0), isOnline: true }]);
    if (url.includes("/api/search")) return json({ results: [] });
    return json([]);
  });
}

async function revealAll(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe("dashboard2 editorial command center", () => {
  test("admin: renders all core sections", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await mockApi(page, FULL_ADMIN);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard2");

    await expect(page.getByTestId("d2-heading")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("d2-now-strip")).toBeVisible();
    await expect(page.getByTestId("d2-attention-list")).toBeVisible();
    await expect(page.getByTestId("d2-attention-pending-review")).toBeVisible();
    await expect(page.getByTestId("d2-newsroom-list")).toBeVisible();
    await expect(page.getByTestId("d2-pipeline")).toBeVisible();

    await revealAll(page);
    await expect(page.getByTestId("d2-section-publishing")).toBeVisible();
    await expect(page.getByTestId("d2-publish-social-failed")).toBeVisible();
    await expect(page.getByText("مكتبة الوسائط السريعة")).toBeVisible();
    await expect(page.getByText("الواجهة الرئيسية والبلوكات")).toBeVisible();
    await page.screenshot({ path: "test-results/d2-admin.png", fullPage: true });

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("command palette opens and toggles sections", async ({ page }) => {
    await mockApi(page, FULL_ADMIN);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard2");
    await expect(page.getByTestId("d2-heading")).toBeVisible({ timeout: 20000 });

    await page.keyboard.press("Meta+k");
    await expect(page.locator("[cmdk-input]")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("d2-customize").click();
    await page.getByTestId("d2-toggle-blocks").click();
    await expect(page.getByTestId("d2-section-blocks")).toHaveCount(0);
  });

  test("limited permissions: hides gated widgets", async ({ page }) => {
    await mockApi(page, LIMITED_EDITOR);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard2");
    await expect(page.getByTestId("d2-heading")).toBeVisible({ timeout: 20000 });
    await revealAll(page);

    // لا صلاحية نشر اجتماعي/إشعارات/وسائط/بلوكات
    await expect(page.getByText("مركز النشر")).toHaveCount(0);
    await expect(page.getByText("مكتبة الوسائط السريعة")).toHaveCount(0);
    await expect(page.getByText("الواجهة الرئيسية والبلوكات")).toHaveCount(0);
    // الأقسام المسموحة تبقى
    await expect(page.getByTestId("d2-attention-list")).toBeVisible();
    await expect(page.getByTestId("d2-pipeline")).toBeVisible();
  });

  test("empty data and error states", async ({ page }) => {
    await mockApi(page, FULL_ADMIN, { empty: true, gapsError: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard2");
    await expect(page.getByTestId("d2-heading")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("لا شيء ينتظرك الآن")).toBeVisible();
    await revealAll(page);
    await expect(page.getByText("تعذّر تحميل هذا القسم").first()).toBeVisible();
  });

  test("responsive: no horizontal overflow", async ({ page }) => {
    await mockApi(page, FULL_ADMIN);
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard2");
      await expect(page.getByTestId("d2-heading")).toBeVisible({ timeout: 20000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/d2-${width}.png` });
    }
  });
});
