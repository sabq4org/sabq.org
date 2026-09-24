import { test, expect, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

let vite: ViteDevServer;
let base: string;
test.beforeAll(async ({}, workerInfo) => {
  vite = await createServer({
    configFile: false, root: process.cwd(), plugins: [react()],
    cacheDir: path.resolve(`node_modules/.cache/vite-newsletter-${workerInfo.workerIndex}`),
    resolve: { alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") } },
    server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  });
  await vite.listen();
  base = vite.resolvedUrls!.local[0];
});
test.afterAll(async () => { await vite?.close(); });

async function setup(page: Page, hash = "") {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (route.request().method() !== "GET") {
      writes.push({ path: url.pathname, body: route.request().postDataJSON() });
      return route.fulfill({ json: url.pathname.endsWith("/confirm") ? { success: true } : { success: true, pendingConfirmation: true } });
    }
    if (url.pathname === "/api/auth/user") return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
    if (url.pathname === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "local-test-token" } });
    if (url.pathname === "/api/smart-newsletter/categories") return route.fulfill({ json: { categories: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}e2e/fixtures/newsletter.html${hash}`);
  return { writes, errors };
}

for (const mobile of [false, true]) {
  test(`signup preserves cadence and waits for confirmation (${mobile ? "mobile" : "desktop"})`, async ({ page }, info) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 });
    const { writes, errors } = await setup(page);
    await expect(page.getByRole("heading", { name: "سبق في ٣ دقائق", exact: true }).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`newsletter-${mobile ? "mobile" : "desktop"}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("textbox", { name: /البريد الإلكتروني/ }).fill("reader@example.com");
    await page.getByRole("radio", { name: /أسبوعيًا/ }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio", { name: /أسبوعيًا/ })).toBeChecked();
    await page.getByRole("button", { name: "أرسل لي النشرة" }).click();
    await expect(page.getByRole("alert")).toContainText("وافق");
    expect(writes).toHaveLength(0);
    await page.getByRole("checkbox", { name: /أوافق على تلقي/ }).check();
    await page.getByRole("button", { name: "أرسل لي النشرة" }).click();
    await expect(page.getByRole("status")).toContainText("تحقق من بريدك");
    expect(writes).toEqual([{ path: "/api/smart-newsletter/subscribe", body: expect.objectContaining({ email: "reader@example.com", frequency: "weekly", consent: true, language: "ar" }) }]);
    await expect(page.getByText("تم تأكيد اشتراكك", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("opening confirmation link never activates without an explicit click", async ({ page }) => {
  const { writes, errors } = await setup(page, "#confirm=test-confirmation-token");
  const confirm = page.getByRole("button", { name: "تأكيد الاشتراك", exact: true });
  await expect(confirm).toBeVisible();
  expect(writes).toHaveLength(0);
  await confirm.click();
  await expect(page.getByRole("heading", { name: "تم تأكيد اشتراكك" })).toBeVisible();
  expect(writes).toEqual([{ path: "/api/smart-newsletter/confirm", body: { token: "test-confirmation-token" } }]);
  expect(errors).toEqual([]);
});

test("failed signup keeps the form usable and never claims confirmation", async ({ page }) => {
  await setup(page);
  await page.route("**/api/smart-newsletter/subscribe", route => route.fulfill({ status: 503, json: { message: "تعذر إرسال رسالة التأكيد، حاول لاحقًا" } }));
  await page.getByRole("textbox", { name: /البريد الإلكتروني/ }).fill("reader@example.com");
  await page.getByRole("checkbox", { name: /أوافق على تلقي/ }).check();
  await page.getByRole("button", { name: "أرسل لي النشرة" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "أرسل لي النشرة" })).toBeEnabled();
  await expect(page.getByText("تم تأكيد اشتراكك", { exact: true })).toHaveCount(0);
});


test("signed-in reader loads and updates only their own cadence", async ({ page }) => {
  await setup(page);
  await page.route("**/api/auth/user", route => route.fulfill({ json: { id: "reader-1", email: "reader@example.com", emailVerified: true, role: "reader" } }));
  await page.route("**/api/smart-newsletter/status/**", route => route.fulfill({ json: { success: true, local: { status: "active", preferences: { frequency: "weekly" } } } }));
  const updates: Record<string, unknown>[] = [];
  await page.route("**/api/smart-newsletter/update", route => {
    updates.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, mailerliteSynced: true } });
  });
  await page.reload();
  const panel = page.getByTestId("newsletter-preferences");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("newsletter-preference-weekly")).toBeChecked();
  await page.getByTestId("newsletter-preference-daily").focus();
  await page.keyboard.press("Space");
  await page.getByTestId("newsletter-preferences-save").click();
  await expect(panel.getByRole("status")).toContainText("حُفظ");
  expect(updates).toEqual([expect.objectContaining({ email: "reader@example.com", frequency: "daily" })]);
});

test("provider failure never claims preferences or cancellation have reached the sender", async ({ page }) => {
  await setup(page);
  await page.route("**/api/auth/user", route => route.fulfill({ json: { id: "reader-1", email: "reader@example.com", emailVerified: true, role: "reader" } }));
  await page.route("**/api/smart-newsletter/status/**", route => route.fulfill({ json: { local: { status: "active", preferences: { frequency: "weekly" } } } }));
  await page.route("**/api/smart-newsletter/update", route => route.fulfill({ status: 202, json: { success: true, mailerliteSynced: false } }));
  await page.route("**/api/smart-newsletter/unsubscribe", route => route.fulfill({ status: 202, json: { success: true, mailerliteSynced: false } }));
  await page.reload();
  const panel = page.getByTestId("newsletter-preferences");
  await page.getByTestId("newsletter-preferences-save").click();
  await expect(panel.getByRole("status")).toContainText("تطبيقه على الرسائل لم يكتمل");
  await panel.getByRole("button", { name: "إلغاء اشتراك النشرة" }).click();
  await expect(panel.getByRole("status")).toContainText("إيقاف الرسائل لدى مزود البريد لم يكتمل");
  await expect(panel.getByRole("button", { name: "إلغاء اشتراك النشرة" })).toBeDisabled();
});

test("editor reviews saved content before approval and HTML export", async ({ page }, info) => {
  await setup(page);
  const draft = {
    id: "draft-1", title: "سبق في ٣ دقائق — معاينة محلية", preheader: "مسودة اختبار لا تحتوي أخبارًا حقيقية",
    type: "daily", status: "draft", revision: 1, contentHash: "a".repeat(64), approvedHash: null as string | null,
    approvedAt: null as string | null, updatedAt: "2026-09-24T10:00:00Z", sourceCount: 1,
    items: [{ articleId: "article-1", title: "عنوان توضيحي للمصدر", summary: "ملخص توضيحي لا يمثل خبرًا منشورًا، يستخدم لاختبار مراجعة النسخة واعتمادها.", url: "https://sabq.org/article/test", publishedAt: "2026-09-24T08:00:00Z" }],
    sourceReferences: [], html: "<html dir=rtl><body><h1>معاينة محلية</h1></body></html>",
  };
  const writes: string[] = [];
  await page.route("**/api/newsletter/editorial**", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      writes.push("save");
      const body = request.postDataJSON();
      draft.title = body.title; draft.preheader = body.preheader;
      draft.items[0].summary = body.items[0].summary;
      draft.contentHash = "b".repeat(64); draft.revision += 1;
      return route.fulfill({ json: draft });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/approve")) {
      writes.push("approve"); draft.status = "approved"; draft.approvedHash = draft.contentHash; draft.approvedAt = "2026-09-24T10:00:00Z";
      return route.fulfill({ json: draft });
    }
    if (url.pathname.endsWith("/export")) {
      writes.push("export");
      return route.fulfill({ body: draft.html, contentType: "text/html", headers: { "content-disposition": "attachment; filename=newsletter.html" } });
    }
    return route.fulfill({ json: url.pathname.endsWith("/draft-1") ? draft : [draft] });
  });
  await page.goto(`${base}e2e/fixtures/newsletter.html?editorial=1`);
  await page.getByRole("button", { name: /سبق في ٣ دقائق — معاينة محلية/ }).click();
  const title = page.getByRole("textbox", { name: "العنوان", exact: true });
  await expect(title).toHaveValue(draft.title);
  await page.screenshot({ path: info.outputPath("newsletter-editorial-desktop.png"), fullPage: true });
  const approve = page.getByRole("button", { name: "اعتماد بشري" });
  await title.fill("نسخة محررة للمراجعة المحلية");
  await expect(approve).toBeDisabled();
  await page.getByRole("button", { name: "حفظ التعديل" }).click();
  await expect(approve).toBeEnabled();
  await approve.click();
  const exportButton = page.getByRole("button", { name: "تصدير HTML" });
  await expect(exportButton).toBeEnabled();
  const download = page.waitForEvent("download");
  await exportButton.click();
  await download;
  expect(writes).toEqual(["save", "approve", "export"]);
});
