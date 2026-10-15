import { test, expect, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

let vite: ViteDevServer;
let base: string;

const activeToken = () => ({
  id: "token-active",
  userId: "user-publisher",
  email: "publisher@example.test",
  name: "محرر النشر",
  tokenPrefix: "botpub_abc123",
  label: "بوت الأخبار",
  expiresAt: "2026-12-28T12:00:00.000Z",
  revokedAt: null as string | null,
  createdAt: "2026-09-29T08:00:00.000Z",
  lastUsedAt: "2026-09-29T09:00:00.000Z",
});

test.beforeAll(async ({}, workerInfo) => {
  vite = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    cacheDir: path.resolve(`node_modules/.cache/vite-publisher-tokens-${workerInfo.workerIndex}`),
    resolve: { alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") } },
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  await vite.listen();
  base = vite.resolvedUrls!.local[0];
});

test.afterAll(async () => { await vite?.close(); });

async function setup(page: Page) {
  let tokens = [activeToken()];
  const writes: Array<{ path: string; body: unknown; csrf: string | undefined }> = [];
  const externalRequests: string[] = [];

  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== new URL(base).origin) {
      externalRequests.push(requestUrl.href);
      return route.abort();
    }
    if (!requestUrl.pathname.startsWith("/api/")) return route.continue();
    if (requestUrl.pathname === "/api/auth/user") return route.fulfill({ json: { id: "admin-1", email: "admin@example.test", name: "مسؤول الاختبار", role: "admin", permissions: ["system.manage_settings"] } });
    if (requestUrl.pathname === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "publisher-test-csrf" } });
    if (requestUrl.pathname === "/api/accessibility/preferences") return route.fulfill({ json: {} });
    if (requestUrl.pathname === "/api/admin/bot-publisher-tokens" && route.request().method() === "GET") return route.fulfill({ json: tokens });

    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    const body = route.request().postDataJSON();
    writes.push({ path: requestUrl.pathname, body, csrf: route.request().headers()["x-csrf-token"] });

    if (requestUrl.pathname === "/api/admin/bot-publisher-tokens") {
      return route.fulfill({ json: { tokenId: "token-new", token: "botpub_fake_issue_value", tokenPrefix: "botpub_fake", user: { id: "user-publisher", email: body.email, name: "محرر النشر" }, label: body.label ?? null, expiresAt: "2026-12-28T12:00:00.000Z" } });
    }
    if (requestUrl.pathname.endsWith("/revoke")) {
      tokens = tokens.map((token) => token.id === "token-active" ? { ...token, revokedAt: "2026-09-29T10:00:00.000Z" } : token);
      return route.fulfill({ json: { ok: true } });
    }
    if (requestUrl.pathname.endsWith("/rotate")) {
      tokens = [{ ...activeToken(), id: "token-rotated", tokenPrefix: "botpub_rotated", label: "بوت الأخبار (مدوّر)", createdAt: "2026-09-29T10:00:00.000Z" }, ...tokens.map((token) => ({ ...token, revokedAt: "2026-09-29T10:00:00.000Z" }))];
      return route.fulfill({ json: { tokenId: "token-rotated", token: "botpub_fake_rotated_value", tokenPrefix: "botpub_rotated", user: { id: "user-publisher", email: "publisher@example.test", name: "محرر النشر" }, label: "بوت الأخبار (مدوّر)", expiresAt: "2026-12-28T12:00:00.000Z" } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${base}e2e/fixtures/publisher-tokens.html`);
  await expect(page.getByText("توكنات نشر سبق", { exact: true })).toBeVisible();
  return { writes, externalRequests };
}

test("issues and rotates a publisher token using the nested contract", async ({ page }, testInfo) => {
  const { writes, externalRequests } = await setup(page);
  await expect(page.getByText("نشط", { exact: true })).toBeVisible();
  await expect(page.getByText("محرر النشر", { exact: true })).toBeVisible();

  await page.getByLabel("بريد المستخدم").fill("publisher@example.test");
  await page.getByLabel("وصف التوكن").fill("بوت النشر التجريبي");
  await page.getByLabel("مدة الصلاحية بالأيام").fill("90");
  await page.getByRole("button", { name: "إصدار التوكن", exact: true }).click();
  await expect(page.getByText("التوكن الجديد — يظهر مرة واحدة", { exact: true })).toBeVisible();
  await expect(page.getByLabel("التوكن الجديد")).toHaveValue(/^•+$/);
  await page.getByRole("button", { name: "إظهار", exact: true }).click();
  await expect(page.getByLabel("التوكن الجديد")).toHaveValue("botpub_fake_issue_value");
  await page.screenshot({ path: testInfo.outputPath("publisher-tokens-arabic.png"), fullPage: true, animations: "disabled" });

  await page.getByRole("button", { name: "تدوير", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("تدوير التوكن؟");
  await page.getByRole("alertdialog").getByRole("button", { name: "تدوير التوكن", exact: true }).click();
  await expect(page.getByLabel("التوكن الجديد")).toHaveValue(/^•+$/);
  expect(writes.map((write) => write.path)).toEqual(["/api/admin/bot-publisher-tokens", "/api/admin/bot-publisher-tokens/token-active/rotate"]);
  expect(writes[0]).toMatchObject({ body: { email: "publisher@example.test", label: "بوت النشر التجريبي", expiresInDays: 90 }, csrf: "publisher-test-csrf" });
  expect(writes[1].csrf).toBe("publisher-test-csrf");
  expect(externalRequests).toEqual([]);
});

test("requires confirmation before revoking and renders revokedAt as revoked", async ({ page }) => {
  const { writes, externalRequests } = await setup(page);
  await page.getByRole("button", { name: "إبطال", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("إبطال التوكن؟");
  await page.getByRole("alertdialog").getByRole("button", { name: "إلغاء", exact: true }).click();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "إبطال", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "إبطال التوكن", exact: true }).click();
  await expect(page.getByText("ملغى", { exact: true })).toBeVisible();
  await expect(page.getByText("نشط", { exact: true })).toHaveCount(0);
  await expect(page.getByText("لا إجراءات", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ path: "/api/admin/bot-publisher-tokens/token-active/revoke", csrf: "publisher-test-csrf" });
  expect(externalRequests).toEqual([]);
});
