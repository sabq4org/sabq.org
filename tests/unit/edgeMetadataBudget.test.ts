import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Pages middleware has no TypeScript declaration.
import { cachedJson, onRequest, seoRequestPath } from '../../functions/_middleware.js';
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
  it.each([
    ['https://sabq.org/article/story?utm_source=x', '/article/story'],
    ['https://sabq.org/category/saudi?page=2&utm_source=x', '/category/saudi?page=2'],
    ['https://sabq.org/author/name?page=0', '/author/name?page=0'],
  ])('accepts URL, Request and string inputs for %s', (input, expected) => {
    for (const value of [new URL(input), new Request(input), input]) {
      expect(seoRequestPath(value)).toBe(expected);
    }
  });

  it.each(['/article/khz0oxh', '/', '/category/local?page=2'])('serves valid SSR HTML to Googlebot at %s', async (path) => {
    const html = '<html><head><script type="application/ld+json">{"@type":"CollectionPage"}</script></head><body><main><h1>خبر الاختبار</h1><p>المحتوى الكامل</p></main></body></html>';
    fetcher.mockImplementation((target) => String(target).includes('/slug-redirect')
      ? Promise.resolve(Response.json({}))
      : Promise.resolve(new Response(html, { headers: { 'Content-Type': 'text/html' } })));
    const next = vi.fn();
    const response = await onRequest({
      ...context,
      request: new Request(`https://sabq.org${path}`, { headers: { 'User-Agent': 'Googlebot/2.1' } }),
      env: { SSR_ROUTES: 'on', EDGE_SEO: 'on', NEXT_ORIGIN: 'https://next.sabq.org' },
      next,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(html);
    expect(fetcher).toHaveBeenCalledWith(`https://next.sabq.org${path}`, expect.objectContaining({ method: 'GET' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves only positive pagination on category and author SEO paths', () => {
    expect(seoRequestPath('https://sabq.org/category/saudi?page=2&utm_source=x')).toBe('/category/saudi?page=2');
    expect(seoRequestPath('https://sabq.org/author/name?page=0&utm_source=x')).toBe('/author/name?page=0');
    expect(seoRequestPath('https://sabq.org/article/story?page=2&utm_source=x')).toBe('/article/story');
  });

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

  it('does not cache a generic SPA fallback for a crawler when SSR is invalid', async () => {
    fetcher.mockImplementation((target) => String(target).includes('/slug-redirect')
      ? Promise.resolve(Response.json({}))
      : Promise.resolve(new Response('<html><body><div id="root"></div></body></html>', { headers: { 'Content-Type': 'text/html' } })));
    const next = vi.fn(async () => new Response('<html><body><div id="root"></div></body></html>', { headers: { 'Content-Type': 'text/html' } }));
    const response = await onRequest({
      ...context,
      request: new Request('https://sabq.org/article/test', { headers: { 'User-Agent': 'OAI-SearchBot/1.0' } }),
      env: { SSR_ROUTES: 'on', EDGE_SEO: 'on', NEXT_ORIGIN: 'https://next.sabq.org' },
      next,
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.text()).toContain('SSR temporarily unavailable');
  });
});
