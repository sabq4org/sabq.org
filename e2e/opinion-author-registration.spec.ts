import { test, expect } from "@playwright/test";
import sharp from "sharp";
import path from "node:path";

// Vite-only fixture: exercise the real form without a database or real uploads.
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local Vite only");
  const dependencies = `/@fs${path.resolve("node_modules/.vite/deps")}`;
  await page.route("**/__opinion-registration-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html dir="rtl"><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('${dependencies}/react.js');
      const {default: ReactDOM} = await import('${dependencies}/react-dom_client.js');
      const {default: Form} = await import('/src/pages/opinion-author/OpinionAuthorRegister.tsx');
      const {useToast} = await import('/src/hooks/use-toast.ts');
      function Toaster() {
        return React.createElement('div', {role:'status'}, useToast().toasts.map(t =>
          React.createElement('p', {key:t.id}, t.description)));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
        React.createElement(Form), React.createElement(Toaster)));
    </script></body></html>`,
  }));
  await page.goto("/__opinion-registration-test");
  await expect(page.getByTestId("input-arabic-name")).toBeVisible();
});

test("upload timeout keeps entered data, and a deliberate retry can succeed", async ({ page }) => {
  const photo = await sharp({ create: { width: 2600, height: 1600, channels: 3, background: "#9aaaba" } }).png().toBuffer();
  // Trailing bytes preserve PNG decoding while exercising the >300KB path.
  const largePhoto = Buffer.concat([photo, Buffer.alloc(400_000)]);
  const pdf = Buffer.from("%PDF-1.4\nTest license fixture\n%%EOF");
  let requests = 0;
  let upload: FormData | undefined;
  // WebKit's interception protocol omits file bytes from postDataBuffer.
  // Inspect the actual FormData in the browser before passing it to fetch.
  await page.exposeFunction("captureRegistrationUpload", async (body: number[], contentType: string) => {
    upload = await new Response(new Uint8Array(body), {
      headers: { "content-type": contentType },
    }).formData();
  });
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (init?.body instanceof FormData) {
        const encoded = new Response(init.body);
        const capture = (window as unknown as { captureRegistrationUpload: (body: number[], type: string) => Promise<void> }).captureRegistrationUpload;
        await capture(Array.from(new Uint8Array(await encoded.arrayBuffer())), encoded.headers.get("content-type")!);
      }
      return originalFetch(input, init);
    };
  });
  await page.route("**/api/opinion-author-applications", async route => {
    requests++;
    await route.fulfill(requests === 1
      ? { status: 524, contentType: "text/html", body: "<html>Upload timed out</html>" }
      : { status: 201, contentType: "application/json", body: JSON.stringify({ applicationId: "test-application", message: "تم الاستلام" }) });
  });
  await page.getByTestId("input-photo").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: largePhoto });
  await page.getByTestId("input-license-file").setInputFiles({ name: "license.pdf", mimeType: "application/pdf", buffer: pdf });
  for (const [id, value] of Object.entries({
    "arabic-name": "كاتب تجريبي", "english-name": "Test Writer", email: "test@example.invalid",
    phone: "0500000000", city: "الرياض", "license-number": "TEST-123", "license-expiry": "2099-01-01",
    specializations: "سياسة اقتصاد", bio: "نبذة تجريبية",
  })) await page.getByTestId(`input-${id}`).fill(value);
  await page.getByTestId("checkbox-consent").check();
  await page.getByTestId("button-submit").click();
  await expect(page.getByText("تعذر تأكيد إرسال الطلب بسبب انقطاع الاتصال.", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("input-arabic-name")).toHaveValue("كاتب تجريبي");
  await expect(page.getByTestId("input-bio")).toHaveValue("نبذة تجريبية");
  await expect(page.getByTestId("text-success-title")).toHaveCount(0);
  expect(requests).toBe(1); // Never automatically repeat a write after an uncertain response.
  const sentPhoto = upload!.get("profilePhoto") as File;
  expect(sentPhoto.size).toBeLessThan(largePhoto.length);
  expect(sentPhoto.type).toBe("image/jpeg");
  expect((await sharp(Buffer.from(await sentPhoto.arrayBuffer())).metadata()).width).toBe(1200);
  expect(Buffer.from(await (upload!.get("licenseFile") as File).arrayBuffer())).toEqual(pdf);
  expect(upload!.get("arabicName")).toBe("كاتب تجريبي");
  await page.getByTestId("button-submit").click();
  await expect(page.getByTestId("text-success-title")).toBeVisible();
  expect(requests).toBe(2);
});

test("image licenses retain higher resolution and unsupported decoding retains the original", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const modulePath = "/src/pages/opinion-author/registrationUpload.ts";
    const { prepareRegistrationImage } = await import(modulePath);
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 2000;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 3000, 2000);
    context.fillStyle = "black";
    context.font = "80px sans-serif";
    context.fillText("Professional license 12345", 100, 150);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), "image/png"));
    const file = new File([blob, new Uint8Array(400_000)], "license.png", { type: "image/png" });
    const prepared = await prepareRegistrationImage(file, 2400);
    const bitmap = await createImageBitmap(prepared);
    const unsupported = new File([new Uint8Array(400_000)], "phone.heic", { type: "image/heic" });
    const retained = await prepareRegistrationImage(unsupported, 2400);
    const result = { width: bitmap.width, height: bitmap.height, smaller: prepared.size < file.size, retained: retained === unsupported };
    bitmap.close();
    return result;
  });
  expect(result).toEqual({ width: 2400, height: 1600, smaller: true, retained: true });
});
