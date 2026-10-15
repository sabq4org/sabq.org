import { test, expect } from "@playwright/test";
import path from "node:path";
import sharp from "sharp";

interface CapturedUpload {
  body: FormData;
  headers: Record<string, string>;
  credentials: boolean;
  progress: (loaded: number, total: number) => void;
  finish: (status: number, response: string) => void;
}
declare global {
  interface Window {
    newsTestUploads: CapturedUpload[];
    newsTestResults: string[];
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local Vite only");
  await page.addInitScript(() => {
    window.newsTestUploads = [];
    window.newsTestResults = [];
    class UploadRequest extends EventTarget {
      upload = new EventTarget();
      headers: Record<string, string> = {};
      withCredentials = false;
      status = 0;
      responseText = "";
      open() {}
      setRequestHeader(key: string, value: string) { this.headers[key] = value; }
      getResponseHeader() { return "application/json"; }
      send(body: FormData) {
        window.newsTestUploads.push({
          body, headers: this.headers, credentials: this.withCredentials,
          progress: (loaded, total) => this.upload.dispatchEvent(new ProgressEvent("progress", { loaded, total, lengthComputable: true })),
          finish: (status, response) => {
            this.status = status;
            this.responseText = response;
            this.dispatchEvent(new Event("load"));
          },
        });
      }
    }
    window.XMLHttpRequest = UploadRequest as unknown as typeof XMLHttpRequest;
  });
  const dependencies = `/@fs${path.resolve("node_modules/.vite/deps")}`;
  await page.route("**/__news-upload-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html dir="rtl"><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      document.cookie = 'csrf-token=news-test-token; path=/';
      const {default: React} = await import('${dependencies}/react.js');
      const {default: ReactDOM} = await import('${dependencies}/react-dom_client.js');
      const {ImageUploadDialog} = await import('/src/components/ImageUploadDialog.tsx');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ImageUploadDialog, {
        open:true, onOpenChange:()=>{}, multiple:true, maxFiles:10, uploadPurpose:'article-album',
        onImageUploaded:()=>{}, onAllImagesUploaded:(urls)=>{window.newsTestResults=urls;}
      }));
    </script></body></html>`,
  }));
  await page.goto("/__news-upload-test");
  await expect(page.getByTestId("input-image-file")).toBeAttached();
});

test("album shows transfer and saving separately; retry preserves completed uploads", async ({ page }) => {
  const png = await sharp({ create: { width: 3600, height: 2400, channels: 4, background: "#aaccee" } }).png().toBuffer();
  const original = Buffer.concat([png, Buffer.alloc(600_000)]);
  await page.getByTestId("input-image-file").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: original },
    { name: "two.png", mimeType: "image/png", buffer: original },
  ]);
  await page.getByTestId("button-upload-images").click();
  await expect.poll(() => page.evaluate(() => window.newsTestUploads.length)).toBe(1);
  const sent = await page.evaluate(() => {
    const request = window.newsTestUploads[0];
    const file = request.body.get("file") as File;
    request.progress(50, 100);
    return { size: file.size, purpose: request.body.get("entityType"), csrf: request.headers["x-csrf-token"], credentials: request.credentials };
  });
  expect(sent.size).toBeLessThan(original.length * 0.9);
  expect(sent).toMatchObject({ purpose: "article-album", csrf: "news-test-token", credentials: true });
  await expect(page.getByText("جارٍ رفع الصورة… 50%")).toBeVisible();
  await page.evaluate(() => window.newsTestUploads[0].progress(100, 100));
  await expect(page.getByText("اكتمل الإرسال، جارٍ حفظ الصورة…")).toBeVisible();
  expect(await page.evaluate(() => window.newsTestResults)).toEqual([]);
  await page.evaluate(() => window.newsTestUploads[0].finish(200, JSON.stringify({ url: "https://example.invalid/one.webp" })));
  await expect.poll(() => page.evaluate(() => window.newsTestUploads.length)).toBe(2);
  await page.evaluate(() => window.newsTestUploads[1].finish(500, JSON.stringify({ message: "تعذر الرفع" })));
  await expect(page.getByTestId("button-upload-images")).toBeEnabled();
  await page.getByTestId("button-upload-images").click();
  await expect.poll(() => page.evaluate(() => window.newsTestUploads.length)).toBe(3);
  expect(await page.evaluate(() => (window.newsTestUploads[2].body.get("file") as File).name)).toMatch(/^two\./);
  await page.evaluate(() => window.newsTestUploads[2].finish(200, JSON.stringify({ url: "https://example.invalid/two.webp" })));
  await expect.poll(() => page.evaluate(() => window.newsTestResults)).toEqual(["https://example.invalid/one.webp", "https://example.invalid/two.webp"]);
});

test("optimization preserves transparency, aspect ratio, orientation and fallback files", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/browserImageTranscode.ts";
    const { prepareNewsImage } = await import(modulePath);
    const canvas = document.createElement("canvas");
    canvas.width = 3600; canvas.height = 2400;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "red"; ctx.fillRect(100, 100, 3000, 2000);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), "image/png"));
    const file = new File([blob, new Uint8Array(600_000)], "transparent.png", { type: "image/png" });
    const optimized = await prepareNewsImage(file);
    const bitmap = await createImageBitmap(optimized);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const alpha = ctx.getImageData(0, 0, 1, 1).data[3];
    const dimensions = [bitmap.width, bitmap.height];
    bitmap.close();
    const bad = new File([new Uint8Array(600_000)], "unsupported.heic", { type: "image/heic" });
    const small = new File([blob], "small.png", { type: "image/png" });
    const gif = new File([new Uint8Array(600_000)], "animation.gif", { type: "image/gif" });
    return { dimensions, alpha, smaller: optimized.size < file.size, fallback: await prepareNewsImage(bad) === bad,
      smallUnchanged: await prepareNewsImage(small) === small, animationUnchanged: await prepareNewsImage(gif) === gif };
  });
  expect(result).toEqual({ dimensions: [2560, 1707], alpha: 0, smaller: true, fallback: true, smallUnchanged: true, animationUnchanged: true });

  const rotatedJpeg = await sharp({ create: { width: 3000, height: 1800, channels: 3, background: "#456789" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const orientation = await page.evaluate(async bytes => {
    const modulePath = "/src/lib/browserImageTranscode.ts";
    const { prepareNewsImage } = await import(modulePath);
    const original = new File([new Uint8Array(bytes), new Uint8Array(600_000)], "rotated.jpg", { type: "image/jpeg" });
    const prepared = await prepareNewsImage(original);
    const bitmap = await createImageBitmap(prepared);
    const size = [bitmap.width, bitmap.height];
    bitmap.close();
    return size;
  }, Array.from(rotatedJpeg));
  expect(orientation).toEqual([1536, 2560]);
});

test("reduces an unpadded camera-size JPEG payload", async ({ page }) => {
  const width = 3200, height = 2000;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 17;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed >>> 24) / 8;
      const offset = (y * width + x) * 3;
      pixels[offset] = x / width * 180 + noise;
      pixels[offset + 1] = y / height * 180 + noise;
      pixels[offset + 2] = 100 + noise;
    }
  }
  const jpeg = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  const sizes = await page.evaluate(async base64 => {
    const modulePath = "/src/lib/browserImageTranscode.ts";
    const { prepareNewsImage } = await import(modulePath);
    const source = new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], "camera.jpg", { type: "image/jpeg" });
    const output = await prepareNewsImage(source);
    return { before: source.size, after: output.size };
  }, jpeg.toString("base64"));
  expect(sizes.before).toBeGreaterThan(512 * 1024);
  expect(sizes.after).toBeLessThan(sizes.before * 0.9);
  await test.info().attach("upload-sizes.json", { body: JSON.stringify(sizes), contentType: "application/json" });
});
