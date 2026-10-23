import express from 'express';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  article: null as Record<string, unknown> | null,
  user: undefined as { id: string; role: string } | undefined,
  getSummaryAudio: vi.fn(),
  take: vi.fn(),
  retryAfter: vi.fn(),
}));

vi.mock('../../server/storage', () => ({ storage: { getArticleBySlug: async () => state.article } }));
vi.mock('../../server/services/summaryAudioService', () => ({ getSummaryAudio: state.getSummaryAudio }));
vi.mock('../../server/services/summaryAudioBudget', () => ({
  takeSummaryAudioSlot: state.take,
  summaryAudioRetryAfterSeconds: state.retryAfter,
}));

import router from '../../server/routes/articleSummaryAudio';

const PATH = '/api/articles/some-story/summary-audio?tts=summary-v5';
const published = { id: 'article-1', status: 'published', aiSummary: 'موجز الخبر', excerpt: 'مقتطف' };

describe('GET /api/articles/:slug/summary-audio', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = express();
    app.use((req, _res, next) => { (req as { user?: unknown }).user = state.user; next(); });
    app.use(router);
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => {
    state.article = { ...published };
    state.user = undefined;
    state.getSummaryAudio.mockReset();
    state.take.mockReset().mockReturnValue(true);
    state.retryAfter.mockReset().mockReturnValue(420);
    state.getSummaryAudio.mockResolvedValue({ buffer: Buffer.from('RIFF-audio'), provider: 'humain', contentType: 'audio/wav', cache: 'STORE' });
  });

  it('answers the audio bytes with the provider and cache headers, private to the origin', async () => {
    const res = await fetch(origin + PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(res.headers.get('x-tts-provider')).toBe('humain');
    expect(res.headers.get('x-tts-cache')).toBe('STORE');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('RIFF-audio');
    expect(state.getSummaryAudio).toHaveBeenCalledWith('article-1', 'موجز الخبر', expect.objectContaining({ persist: true }));
  });

  it('keeps a draft clip out of R2', async () => {
    state.article = { ...published, status: 'draft' };
    await fetch(origin + PATH);
    expect(state.getSummaryAudio).toHaveBeenCalledWith('article-1', 'موجز الخبر', expect.objectContaining({ persist: false }));
  });

  it('charges new clips to the signed-in user, not the address', async () => {
    state.user = { id: 'reader-7', role: 'reader' };
    state.getSummaryAudio.mockImplementation(async (_id: string, _text: string, options: { takeSynthesisSlot: () => boolean }) => {
      options.takeSynthesisSlot();
      return { buffer: Buffer.from('mp3'), provider: 'elevenlabs', contentType: 'audio/mpeg', cache: 'MISS' };
    });
    await fetch(origin + PATH);
    expect(state.take).toHaveBeenCalledWith('u:reader-7');
  });

  it('answers 503 with Retry-After past the limit (never 429, which the Pages proxy retries)', async () => {
    state.getSummaryAudio.mockRejectedValue(new Error('TTS_RATE_LIMITED'));
    const res = await fetch(origin + PATH);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('420');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers 503 with a short Retry-After when four clips are already being voiced', async () => {
    state.getSummaryAudio.mockRejectedValue(new Error('TTS_BUSY'));
    const res = await fetch(origin + PATH);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
  });

  it('keeps 404, 400 and 500 as before', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.getSummaryAudio.mockRejectedValue(new Error('NO_TTS_PROVIDER_AVAILABLE'));
    expect((await fetch(origin + PATH)).status).toBe(500);
    state.article = { ...published, aiSummary: null, excerpt: null };
    expect((await fetch(origin + PATH)).status).toBe(400);
    state.article = null;
    expect((await fetch(origin + PATH)).status).toBe(404);
    error.mockRestore();
  });

  it('is mounted right after the unpublished-article guard and no longer lives in routes.ts', () => {
    const index = readFileSync('server/routes/splitRoutesIndex.ts', 'utf8');
    const guard = index.indexOf('app.use(unpublishedArticleGuardRouter);');
    const audio = index.indexOf('app.use(articleSummaryAudioRouter);');
    expect(guard).toBeGreaterThan(-1);
    expect(audio).toBeGreaterThan(guard);
    expect(readFileSync('server/routes.ts', 'utf8')).not.toMatch(/app\.get\("\/api\/articles\/:slug\/summary-audio"/);
  });
});
