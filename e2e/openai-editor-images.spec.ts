import { test, expect } from "@playwright/test";
import path from "node:path";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1kAAAAASUVORK5CYII=";
const id = "1d0c84a5-666b-498e-9079-7bf7a046d661";

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local Vite only");
  const transformed = await (await page.request.get(`${baseURL}/src/components/OpenAIImageGeneratorDialog.tsx`)).text();
  const queryModule = transformed.match(/from "([^"]+@tanstack_react-query\.js[^"]*)"/)![1];
  const deps = `/@fs${path.resolve("node_modules/.vite/deps")}`;
  await page.route("**/__gpt-image-test", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type;
    window.__vite_plugin_react_preamble_installed__=true;
    document.cookie='csrf-token=test-csrf; path=/';
    await import('/src/index.css');
    const {default:React}=await import('${deps}/react.js');
    const {default:ReactDOM}=await import('${deps}/react-dom_client.js');
    const {QueryClientProvider}=await import('${queryModule}');
    const {queryClient}=await import('/src/lib/queryClient.ts');
    const {OpenAIImageGeneratorDialog}=await import('/src/components/OpenAIImageGeneratorDialog.tsx');
    const {AIImageGeneratorDialog}=await import('/src/components/AIImageGeneratorDialog.tsx');
    window.testInserted=[];
    function Test(){const [open,setOpen]=React.useState(true); const [old,setOld]=React.useState(false); return React.createElement(React.Fragment,null,
      React.createElement('button',{onClick:()=>setOpen(true)},'فتح صور GPT'),
      React.createElement('button',{onClick:()=>setOld(true)},'فتح التوليد الحالي'),
      React.createElement(OpenAIImageGeneratorDialog,{userId:'editor-a',open,onClose:()=>setOpen(false),onImageGenerated:url=>window.testInserted.push(url),articleTitle:'تقنيات جديدة في غرفة الأخبار',articleExcerpt:'صورة توضيحية عن أدوات العمل الصحفي.'}),
      React.createElement(AIImageGeneratorDialog,{open:old,onClose:()=>setOld(false),onImageGenerated:()=>{},initialPrompt:'صورة توضيحية لمحرر يعمل في غرفة الأخبار'})
    )}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(Test)));
  </script></body></html>` }));
  await page.route("**/api/csrf-token", route => route.fulfill({ json: { csrfToken: "test-csrf" } }));
  await page.route("**/api/editorial-images/capabilities", route => route.fulfill({ json: { configured: true } }));
  await page.route("**/api/image-styles", route => route.fulfill({ json: { styles: [], defaultSlug: null } }));
});

test("new tool generates only through its endpoint and requires explicit use", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/editorial-images/generations", async route => {
    const body = route.request().postDataJSON();
    expect(body.model).toBe("gpt-image-2.5-flare");
    expect(body).not.toHaveProperty("apiKey");
    expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
    calls++;
    await route.fulfill({ status: 202, json: { id, status: "processing", model: body.model, imageUrl: null, error: null } });
  });
  await page.route(`**/api/editorial-images/generations/${id}`, route => route.fulfill({ json: { id, status: "completed", model: "gpt-image-2.5-flare", imageUrl: image, error: null } }));
  await page.goto("/__gpt-image-test");
  await expect(page.getByTestId("button-use-openai-image")).toBeDisabled();
  await page.getByTestId("button-run-openai-image").click();
  await expect(page.getByTestId("button-use-openai-image")).toBeEnabled();
  expect(await page.evaluate(() => (window as any).testInserted)).toEqual([]);
  await page.getByTestId("button-use-openai-image").click();
  expect(await page.evaluate(() => (window as any).testInserted)).toEqual([image]);
  expect(calls).toBe(1);
});

test("reload recovers a pending paid job and closing preserves it", async ({ page }) => {
  let complete = false;
  await page.addInitScript(id => sessionStorage.setItem("sabq:gpt-image-job:editor-a", id), id);
  await page.route(`**/api/editorial-images/generations/${id}`, route => route.fulfill({ json: { id, status: complete ? "completed" : "processing", model: "gpt-image-2.5-flare", imageUrl: complete ? image : null, error: null } }));
  await page.goto("/__gpt-image-test");
  await expect(page.getByText("جارٍ إعداد الصورة")).toBeVisible();
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByRole("button", { name: "فتح صور GPT" }).click();
  await expect(page.getByText("جارٍ إعداد الصورة")).toBeVisible();
  await page.reload();
  await expect(page.getByText("جارٍ إعداد الصورة")).toBeVisible();
  complete = true;
  await expect(page.getByTestId("button-use-openai-image")).toBeEnabled();
});

test("missing dedicated key disables only GPT and the existing tool still uses Nano Banana", async ({ page }) => {
  await page.route("**/api/editorial-images/capabilities", route => route.fulfill({ json: { configured: false } }));
  let oldCalls = 0;
  await page.route("**/api/nano-banana/generate", route => { oldCalls++; return route.fulfill({ json: { imageUrl: image } }); });
  await page.goto("/__gpt-image-test");
  await expect(page.getByText("خدمة صور GPT غير مفعّلة.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("button-run-openai-image")).toBeDisabled();
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByRole("button", { name: "فتح التوليد الحالي" }).click();
  await page.getByRole("button", { name: "توليد الصورة", exact: true }).click();
  await expect.poll(() => oldCalls).toBe(1);
});

test("mobile dialog fits and shows a recoverable provider failure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/editorial-images/generations", route => route.fulfill({ status: 202, json: { id, status: "processing", model: "gpt-image-2.5-flare", imageUrl: null, error: null } }));
  await page.route(`**/api/editorial-images/generations/${id}`, route => route.fulfill({ json: { id, status: "failed", model: "gpt-image-2.5-flare", imageUrl: null, error: "حساب خدمة الصور يحتاج توثيق المؤسسة أو صلاحية الوصول للنموذج." } }));
  await page.goto("/__gpt-image-test");
  await expect(page.getByTestId("openai-image-dialog")).toBeVisible();
  const box = await page.getByTestId("openai-image-dialog").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ animations: "disabled", path: "output/openai-images/mobile-dialog.png" });
  await page.getByTestId("button-run-openai-image").click();
  await expect(page.getByText("حساب خدمة الصور يحتاج توثيق المؤسسة أو صلاحية الوصول للنموذج.")).toBeVisible();
  await expect(page.getByTestId("button-use-openai-image")).toBeDisabled();
  await expect(page.getByTestId("button-run-openai-image")).toBeEnabled();
  await page.getByTestId("button-use-openai-image").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("button-use-openai-image")).toBeInViewport();
});

test("desktop dialog renders with a separate GPT action", async ({ page }) => {
  await page.goto("/__gpt-image-test");
  await expect(page.getByTestId("button-run-openai-image")).toBeEnabled();
  await page.screenshot({ animations: "disabled", path: "output/openai-images/desktop-dialog.png" });
});


test("temporary status outage preserves the paid job and recovers without another POST", async ({ page }) => {
  let unavailable = true;
  let posts = 0;
  await page.addInitScript(id => sessionStorage.setItem("sabq:gpt-image-job:editor-a", id), id);
  await page.route("**/api/editorial-images/generations", route => { posts++; return route.abort(); });
  await page.route(`**/api/editorial-images/generations/${id}`, route => unavailable
    ? route.fulfill({ status: 503, json: { message: "تعذر جلب حالة الصورة. حاول التحديث مجددًا." } })
    : route.fulfill({ json: { id, status: "completed", model: "gpt-image-2.5-flare", imageUrl: image, error: null } }));
  await page.goto("/__gpt-image-test");
  await expect(page.getByRole("button", { name: "تحديث الحالة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "بدء محاولة جديدة" })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("sabq:gpt-image-job:editor-a"))).toBe(id);
  unavailable = false;
  await page.getByRole("button", { name: "تحديث الحالة" }).click();
  await expect(page.getByTestId("button-use-openai-image")).toBeEnabled();
  expect(posts).toBe(0);
});

test("confirmed missing job allows recovery after a rejected POST", async ({ page }) => {
  await page.addInitScript(id => sessionStorage.setItem("sabq:gpt-image-job:editor-a", id), id);
  await page.route(`**/api/editorial-images/generations/${id}`, route => route.fulfill({ status: 404, json: { message: "عملية التوليد غير موجودة." } }));
  await page.goto("/__gpt-image-test");
  await page.getByRole("button", { name: "بدء محاولة جديدة" }).click();
  await expect(page.getByTestId("button-run-openai-image")).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem("sabq:gpt-image-job:editor-a"))).toBeNull();
});


test("actual article editor exposes a distinct GPT button beside the existing generator", async ({ page }) => {
  await page.route("**/api/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/user") return route.fulfill({ json: { id: "editor-a", firstName: "محرر", lastName: "تجريبي", role: "admin", roles: ["admin"], permissions: ["*"], email: "editor@example.test", isProfileComplete: true } });
    if (pathname === "/api/editorial-images/capabilities") return route.fulfill({ json: { configured: true } });
    if (pathname === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test-csrf" } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard/articles/new");
  await page.getByTestId("button-toggle-image-tools").click();
  await expect(page.getByTestId("button-generate-ai-image")).toBeVisible();
  await expect(page.getByTestId("button-generate-openai-image")).toHaveText("صور GPT");
  await page.getByTestId("button-generate-openai-image").scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: "output/openai-images/editor-buttons.png" });
  await page.getByTestId("button-generate-openai-image").click();
  await expect(page.getByTestId("openai-image-dialog")).toBeVisible();
});
