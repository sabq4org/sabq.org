import { describe, expect, it, vi } from "vitest";
import { streamEditAndGenerate } from "../../client/src/lib/editAndGenerateStream";

const streamHeaders = { "content-type": "text/event-stream; charset=utf-8" };

function responseFromChunks(chunks: string[], options: { status?: number; contentType?: string } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: options.status ?? 200,
    headers: options.contentType === undefined ? streamHeaders : { "content-type": options.contentType },
  });
}

function fetchReturning(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe("streamEditAndGenerate", () => {
  it("reads progress events and the final result from SSE", async () => {
    const onEvent = vi.fn();
    const fetchImpl = fetchReturning(responseFromChunks([
      'event: phase\ndata: {"phase":"edit","status":"done"}\n\n',
      'event: result\ndata: {"editedContent":"النص"}\n\n',
    ]));

    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent, fetchImpl }))
      .resolves.toEqual({ editedContent: "النص" });
    expect(onEvent).toHaveBeenCalledWith("phase", { phase: "edit", status: "done" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("handles an SSE frame split across transport reads", async () => {
    const onEvent = vi.fn();
    const fetchImpl = fetchReturning(responseFromChunks([
      "event: de",
      "lta\ndata: {\"text\":\"جزء\"}\n\nevent: result\ndata: {\"ok\":true}\n\n",
    ]));

    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent, fetchImpl }))
      .resolves.toEqual({ ok: true });
    expect(onEvent).toHaveBeenCalledWith("delta", { text: "جزء" });
  });

  it.each([404, 405])("returns the legacy-fallback sentinel only for HTTP %s", async status => {
    const fetchImpl = fetchReturning(new Response(null, { status }));
    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent: vi.fn(), fetchImpl }))
      .resolves.toBeNull();
  });

  it.each([401, 403, 429, 503])("surfaces HTTP %s without allowing a fallback", async status => {
    const fetchImpl = fetchReturning(new Response(null, { status }));
    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent: vi.fn(), fetchImpl }))
      .rejects.toMatchObject({ status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a 200 response that is not SSE", async () => {
    const fetchImpl = fetchReturning(new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent: vi.fn(), fetchImpl }))
      .rejects.toThrow("غير صالحة");
  });

  it("rejects an SSE response without a body", async () => {
    const fetchImpl = fetchReturning(new Response(null, { status: 200, headers: streamHeaders }));
    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent: vi.fn(), fetchImpl }))
      .rejects.toThrow("فارغة");
  });

  it.each([null, false, 0, "", []])("rejects invalid result %j instead of allowing a fallback", async result => {
    const fetchImpl = fetchReturning(responseFromChunks([
      `event: result\ndata: ${JSON.stringify(result)}\n\n`,
    ]));
    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent: vi.fn(), fetchImpl }))
      .rejects.toThrow("غير صالحة");
  });

  it("surfaces an interrupted read instead of starting another generation", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new DOMException("aborted", "AbortError"));
      },
    });
    const fetchImpl = fetchReturning(new Response(body, { status: 200, headers: streamHeaders }));

    await expect(streamEditAndGenerate({ content: "محتوى", url: "/stream", onEvent: vi.fn(), fetchImpl }))
      .rejects.toThrow("انقطع الاتصال");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
