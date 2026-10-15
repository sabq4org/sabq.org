import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const role = { id: "11111111-1111-4111-8111-111111111111", name: "writer", nameAr: "كاتب" };
const biography = "كاتب تجريبي متخصص في الشؤون الثقافية.";
const user = {
  id: "writer-test", email: "writer@example.invalid", firstName: "كاتب", lastName: "تجريبي",
  bio: biography, profileImageUrl: null, roles: [role], emailVerified: false, phoneVerified: false,
};

async function openDialog(page: Page) {
  page.on("pageerror", error => console.error(error.message));
  const dependencies = `/@fs${path.resolve("node_modules/.vite/deps")}`;
  // Use Vite's transformed import: optimized packages can have different hashes.
  const transformed = await (await page.request.get("/src/lib/queryClient.ts")).text();
  const queryImport = transformed.match(/from "([^"\n]*@tanstack_react-query\.js[^"\n]*)"/)?.[1];
  if (!queryImport) throw new Error("Vite React Query import was not found");
  await page.route("**/__edit-user-test", route => route.fulfill({
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
      window.refreshWriter = () => queryClient.invalidateQueries({queryKey: ['/api/admin/users', 'writer-test']});
      const {EditUserDialog} = await import('/src/components/EditUserDialog.tsx');
      await import('/src/index.css');
      function Fixture() {
        const [open, setOpen] = React.useState(true);
        return React.createElement(React.Fragment, null,
          React.createElement('button', {onClick: () => setOpen(true)}, 'فتح التعديل'),
          React.createElement(EditUserDialog, {open, onOpenChange: setOpen, userId: 'writer-test'}));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(QueryClientProvider, {client: queryClient}, React.createElement(Fixture)));
    </script></body></html>`,
  }));
  await page.goto("/__edit-user-test", { waitUntil: "commit" });
}

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local Vite only");
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    const data = url.pathname === "/api/auth/user" ? { id: "admin-test", roles: ["system_admin"], permissions: ["*"] }
      : url.pathname === "/api/admin/users/writer-test" ? user
      : url.pathname === "/api/admin/roles" ? [role]
      : url.pathname.endsWith("/staff") ? null
      : url.pathname === "/api/csrf-token" ? { csrfToken: "test-token" } : [];
    return route.fulfill({ json: data });
  });
});

test("loads the accepted writer biography and retains it in the staff save", async ({ page }) => {
  let saved: unknown;
  await page.route("**/api/admin/users/writer-test/staff", route => {
    if (route.request().method() === "PATCH") saved = route.request().postDataJSON();
    return route.fulfill({ json: null });
  });
  await openDialog(page);
  await expect(page.getByTestId("textarea-bioAr")).toHaveValue(biography);
  await expect(page.getByTestId("textarea-bio")).toHaveValue("");
  await page.getByTestId("input-titleAr").fill("كاتب رأي");
  await page.getByTestId("button-submit").click();
  await expect(page.getByTestId("dialog-edit-user")).toBeHidden();
  expect(saved).toMatchObject({ bioAr: biography, titleAr: "كاتب رأي" });
});

test("waits for staff, prefers its biography, and preserves edits across refetch", async ({ page }, testInfo) => {
  let release!: () => void;
  const delay = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/users/writer-test/staff", async route => {
    await delay;
    await route.fulfill({ json: { bioAr: "السيرة العربية المحفوظة للكاتب", bio: "Saved English biography", titleAr: "كاتب رأي" } });
  });
  await openDialog(page);
  await expect(page.getByTestId("loading-user")).toBeVisible();
  await expect(page.getByTestId("button-submit")).toHaveCount(0);
  release();
  await expect(page.getByTestId("textarea-bioAr")).toHaveValue("السيرة العربية المحفوظة للكاتب");
  await expect(page.getByTestId("textarea-bio")).toHaveValue("Saved English biography");
  await page.getByTestId("textarea-bioAr").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("loaded-biography.png") });
  await page.getByTestId("textarea-bioAr").fill("تعديل لم يحفظ بعد");
  await page.evaluate(() => (window as unknown as { refreshWriter: () => Promise<void> }).refreshWriter());
  await expect(page.getByTestId("textarea-bioAr")).toHaveValue("تعديل لم يحفظ بعد");
  await page.getByTestId("button-cancel").click();
  await page.getByRole("button", { name: "فتح التعديل" }).click();
  await expect(page.getByTestId("textarea-bioAr")).toHaveValue("السيرة العربية المحفوظة للكاتب");
});

test("a failed staff request blocks editing and can be retried", async ({ page }) => {
  let fail = true;
  await page.route("**/api/admin/users/writer-test/staff", route => fail
    ? route.fulfill({ status: 500, json: { message: "Unavailable" } })
    : route.fulfill({ json: null }));
  await openDialog(page);
  await expect(page.getByRole("alert")).toContainText("تعذر تحميل");
  await expect(page.getByTestId("button-submit")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect(page.getByTestId("textarea-bioAr")).toHaveValue(biography);
});

test("a writer with no biography has empty fields", async ({ page }) => {
  await page.route("**/api/admin/users/writer-test", route => route.fulfill({ json: { ...user, bio: null } }));
  await openDialog(page);
  await expect(page.getByTestId("textarea-bioAr")).toHaveValue("");
  await expect(page.getByTestId("textarea-bio")).toHaveValue("");
});

const existingPhone = "+966500000001";

test("saves biography without reassigning an unchanged legacy duplicate phone", async ({ page }) => {
  let saved: unknown;
  let profilePatch: Record<string, unknown> | undefined;
  await page.route("**/api/admin/users/writer-test", route => {
    if (route.request().method() === "PATCH") {
      profilePatch = route.request().postDataJSON();
      if (Object.hasOwn(profilePatch!, "phoneNumber")) {
        return route.fulfill({ status: 409, json: { message: "رقم الجوال مسجل مسبقاً" } });
      }
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { ...user, phoneNumber: existingPhone } });
  });
  await page.route("**/api/admin/users/writer-test/staff", route => {
    if (route.request().method() === "PATCH") saved = route.request().postDataJSON();
    return route.fulfill({ json: null });
  });
  await openDialog(page);
  await expect(page.getByTestId("input-phoneNumber")).toHaveValue(existingPhone);
  await page.getByTestId("textarea-bioAr").fill("السيرة بعد التعديل");
  await page.getByTestId("button-submit").click();
  await expect(page.getByTestId("dialog-edit-user")).toBeHidden();
  expect(profilePatch).toBeDefined();
  expect(profilePatch).not.toHaveProperty("phoneNumber");
  expect(saved).toMatchObject({ bioAr: "السيرة بعد التعديل" });
});

test("a changed phone still reaches server validation and a conflict blocks saving", async ({ page }) => {
  let submittedPhone: unknown;
  let staffWrites = 0;
  await page.route("**/api/admin/users/writer-test", route => {
    if (route.request().method() === "PATCH") {
      submittedPhone = route.request().postDataJSON().phoneNumber;
      return route.fulfill({ status: 409, json: { message: "رقم الجوال مسجل مسبقاً" } });
    }
    return route.fulfill({ json: { ...user, phoneNumber: existingPhone } });
  });
  await page.route("**/api/admin/users/writer-test/staff", route => {
    if (route.request().method() === "PATCH") staffWrites++;
    return route.fulfill({ json: null });
  });
  await openDialog(page);
  await page.getByTestId("input-phoneNumber").fill("+966500000002");
  await page.getByTestId("button-submit").click();
  await expect.poll(() => submittedPhone).toBe("+966500000002");
  await expect(page.getByTestId("button-submit")).toBeEnabled();
  await expect(page.getByTestId("dialog-edit-user")).toBeVisible();
  expect(staffWrites).toBe(0);
});

test("explicitly clearing the phone is sent and saved", async ({ page }) => {
  let profilePatch: Record<string, unknown> | undefined;
  await page.route("**/api/admin/users/writer-test", route => {
    if (route.request().method() === "PATCH") profilePatch = route.request().postDataJSON();
    return route.fulfill({ json: { ...user, phoneNumber: existingPhone } });
  });
  await openDialog(page);
  await expect(page.getByTestId("input-phoneNumber")).toHaveValue(existingPhone);
  await page.getByTestId("input-phoneNumber").fill("");
  await page.getByTestId("button-submit").click();
  await expect(page.getByTestId("dialog-edit-user")).toBeHidden();
  expect(profilePatch).toHaveProperty("phoneNumber", "");
});
