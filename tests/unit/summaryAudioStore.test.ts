import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const s3 = vi.hoisted(() => ({ send: vi.fn(), clients: 0 }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { constructor() { s3.clients += 1; } send = s3.send; },
  GetObjectCommand: class { constructor(public input: unknown) {} },
  PutObjectCommand: class { constructor(public input: unknown) {} },
}));

let store: typeof import('../../server/services/summaryAudioStore');
const KEY = 'a'.repeat(64);
const body = (bytes: string) => ({ transformToByteArray: async () => new Uint8Array(Buffer.from(bytes)) });

function configure() {
  vi.stubEnv('NEWS_IMAGES_R2_ACCOUNT_ID', 'account');
  vi.stubEnv('NEWS_IMAGES_R2_ACCESS_KEY_ID', 'access');
  vi.stubEnv('NEWS_IMAGES_R2_SECRET_ACCESS_KEY', 'secret');
  vi.stubEnv('NEWS_IMAGES_R2_BUCKET_NAME', 'sabq-news-images');
}

beforeEach(async () => {
  vi.resetModules(); s3.send.mockReset(); s3.clients = 0;
  for (const name of ['ACCOUNT_ID', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'BUCKET_NAME']) vi.stubEnv(`NEWS_IMAGES_R2_${name}`, '');
  store = await import('../../server/services/summaryAudioStore');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('«استمع» clips kept in R2', () => {
  it('does nothing without the bucket settings (memory cache only, as before)', async () => {
    expect(await store.readStoredSummaryAudio(KEY)).toBeNull();
    store.storeSummaryAudio(KEY, { buffer: Buffer.from('x'), provider: 'humain', contentType: 'audio/wav' });
    expect(s3.send).not.toHaveBeenCalled(); expect(s3.clients).toBe(0);
  });

  it('writes under summary-audio/ with the provider, type and a no-store header', async () => {
    configure(); s3.send.mockResolvedValue({});
    store.storeSummaryAudio(KEY, { buffer: Buffer.from('clip'), provider: 'humain', contentType: 'audio/wav' });
    expect(s3.send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'sabq-news-images', Key: `summary-audio/${KEY}`, ContentType: 'audio/wav',
      Metadata: { provider: 'humain' }, CacheControl: 'private, no-store',
    });
  });

  it('reads a stored clip back with its provider', async () => {
    configure();
    s3.send.mockResolvedValue({ Body: body('clip'), ContentType: 'audio/mpeg', ContentLength: 4, Metadata: { provider: 'elevenlabs' } });
    const clip = await store.readStoredSummaryAudio(KEY);
    expect(clip).toMatchObject({ provider: 'elevenlabs', contentType: 'audio/mpeg' });
    expect(clip?.buffer.toString()).toBe('clip');
    expect(s3.send.mock.calls[0][0].input).toEqual({ Bucket: 'sabq-news-images', Key: `summary-audio/${KEY}` });
    expect(s3.clients).toBe(1);
  });

  it('treats a missing or malformed object as no clip, and logs only real failures', async () => {
    configure();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    s3.send.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }));
    expect(await store.readStoredSummaryAudio(KEY)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    s3.send.mockResolvedValueOnce({ Body: body('clip'), ContentType: 'text/html', Metadata: { provider: 'humain' } });
    expect(await store.readStoredSummaryAudio(KEY)).toBeNull();
    s3.send.mockResolvedValueOnce({ Body: body('clip'), ContentType: 'audio/wav', Metadata: { provider: 'someone-else' } });
    expect(await store.readStoredSummaryAudio(KEY)).toBeNull();
    s3.send.mockResolvedValueOnce({ Body: body(''), ContentType: 'audio/wav', Metadata: { provider: 'humain' } });
    expect(await store.readStoredSummaryAudio(KEY)).toBeNull();
    s3.send.mockRejectedValueOnce(new Error('R2 unavailable'));
    s3.send.mockRejectedValueOnce(new Error('R2 unavailable'));
    expect(await store.readStoredSummaryAudio(KEY)).toBeNull();
    expect(await store.readStoredSummaryAudio(KEY)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('gives up on a slow read after three seconds', async () => {
    configure(); vi.useFakeTimers();
    s3.send.mockImplementation((_command: unknown, options: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.abortSignal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const read = store.readStoredSummaryAudio(KEY);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await read).toBeNull();
    vi.useRealTimers();
  });
});
