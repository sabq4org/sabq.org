import { describe, expect, it } from "vitest";
import { readBoundedImageBody } from "../../server/utils/boundedImageDownload";

function streamOf(chunks: number, chunkSize: number) {
  let sent = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) return controller.close();
      sent += 1;
      controller.enqueue(new Uint8Array(chunkSize));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, stats: () => ({ sent, cancelled }) };
}

describe("readBoundedImageBody", () => {
  it("returns the bytes of a normal image", async () => {
    const { body } = streamOf(3, 1024);
    const buf = await readBoundedImageBody(new Response(body, { headers: { "content-type": "image/jpeg" } }), 10_000);
    expect(buf.length).toBe(3072);
  });

  it("stops reading and cancels the stream once the cap is passed without Content-Length", async () => {
    const { body, stats } = streamOf(1000, 1024);
    await expect(
      readBoundedImageBody(new Response(body, { headers: { "content-type": "image/png" } }), 8 * 1024),
    ).rejects.toThrow(/too large/);
    expect(stats().cancelled).toBe(true);
    expect(stats().sent).toBeLessThan(20);
  });

  it("rejects a declared oversize body and non-image content up front", async () => {
    await expect(
      readBoundedImageBody(new Response("x", { headers: { "content-type": "image/png", "content-length": "99999999" } }), 1024),
    ).rejects.toThrow(/too large/);
    await expect(
      readBoundedImageBody(new Response("<html>", { headers: { "content-type": "text/html" } })),
    ).rejects.toThrow(/not an image/);
    await expect(readBoundedImageBody(new Response("x", { status: 404 }))).rejects.toThrow(/404/);
  });
});
