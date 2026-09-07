import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Pages middleware has no TypeScript declaration.
import { cachedJson, onRequest } from '../../functions/_middleware.js';
const match = vi.fn();
const put = vi.fn();
const fetcher = vi.fn();
const context = { waitUntil: vi.fn() };
function rejectOnAbort(signal: AbortSignal) {
  return new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  match.mockResolvedValue(undefined);
  put.mockResolvedValue(undefined);
  vi.stubGlobal('caches', { default: { match, put } });
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('deadline', 'TimeoutError')), ms);
    return controller.signal;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Pages metadata budget', () => {
  it('serves a cache hit without contacting origin', async () => {
    match.mockResolvedValue(Response.json({ title: 'خبر' }));
    expect(await cachedJson('https://api.sabq.org/meta', 300, context)).toEqual({ title: 'خبر' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns metadata without waiting for a stalled cache write', async () => {
    put.mockReturnValue(new Promise(() => {}));
    fetcher.mockResolvedValue(Response.json({ title: 'خبر' }));
    expect(await cachedJson('https://api.sabq.org/meta', 300, context)).toEqual({ title: 'خبر' });
    expect(context.waitUntil).toHaveBeenCalledOnce();
  });
  it('never caches malformed JSON', async () => {
    fetcher.mockResolvedValue(new Response('{"title":'));
    expect(await cachedJson('https://api.sabq.org/meta', 300, context)).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });
  it.each(['headers', 'body'])('aborts stalled %s within 2500ms', async (stage) => {
    fetcher.mockImplementation((_url, init) => stage === 'headers'
      ? rejectOnAbort(init.signal)
      : Promise.resolve({ ok: true, text: () => rejectOnAbort(init.signal) }));
    const result = expect(cachedJson('https://api.sabq.org/meta', 300, context)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(2500);
    await result;
    expect(put).not.toHaveBeenCalled();
  });
  it('returns a no-store SPA shell when origin metadata stalls', async () => {
    fetcher.mockImplementation((_url, init) => rejectOnAbort(init.signal));
    const next = vi.fn(async () => new Response('<html>shell</html>', { headers: { 'Content-Type': 'text/html' } }));
    const result = onRequest({ ...context, request: new Request('https://sabq.org/article/test', { headers: { 'User-Agent': 'Mozilla/5.0' } }), env: { EDGE_SEO: 'on' }, next });
    await vi.advanceTimersByTimeAsync(2500);
    const response = await result;
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.text()).toContain('shell');
  });
});
