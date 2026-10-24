/**
 * قراءة صورة بعيدة بحدود صريحة: نوع image/*، وسقف بايتات يُفحص من
 * Content-Length ثم أثناء التدفق، ومهلة. بدونها كان رابط من حاوية عامة
 * مسموحة (r2.dev / storage.googleapis.com) يستطيع إغراق ذاكرة عملية API.
 */
export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
export const REMOTE_IMAGE_TIMEOUT_MS = 15_000;

export async function readBoundedImageBody(
  response: Response,
  maxBytes: number = MAX_REMOTE_IMAGE_BYTES,
): Promise<Buffer> {
  if (response.status !== 200) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Remote file is not an image");
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Remote image is too large");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Remote image is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function downloadBoundedImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS),
  });
  return readBoundedImageBody(response);
}
