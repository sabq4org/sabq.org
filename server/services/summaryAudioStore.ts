/**
 * Durable copy of the «استمع» clip of each published article, so a summary is
 * voiced once instead of once per replica, restart and memory eviction
 * (2026-10-23 logs: ~15 paid syntheses an hour, one article voiced 26 times).
 *
 * Same R2 bucket as news images and the audio bulletin (`NEWS_IMAGES_R2_*`),
 * under `summary-audio/<summaryAudioCacheKey>`. The API reads the object itself
 * and keeps answering with the audio bytes; nothing links to the media host.
 * Without the bucket settings both calls do nothing and the memory cache alone
 * applies, as before. A stored clip never expires: a change that should
 * re-voice old clips must bump the key version in `summaryAudioCacheKey`.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { SummaryAudio } from './summaryAudioService';

const PREFIX = 'summary-audio/';
const READ_DEADLINE_MS = 3_000;
const MAX_BYTES = 16 * 1024 * 1024;
const PROVIDERS: ReadonlySet<string> = new Set<SummaryAudio['provider']>(['gemini', 'humain', 'elevenlabs', 'google']);
const CONTENT_TYPES: ReadonlySet<string> = new Set<SummaryAudio['contentType']>(['audio/wav', 'audio/mpeg']);

let bucket: { client: S3Client; name: string } | null | undefined;
let lastWarnAt = 0;

function storeBucket() {
  if (bucket !== undefined) return bucket;
  const accountId = (process.env.NEWS_IMAGES_R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.NEWS_IMAGES_R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY || '').trim();
  const name = (process.env.NEWS_IMAGES_R2_BUCKET_NAME || '').trim();
  bucket = accountId && accessKeyId && secretAccessKey && name ? {
    name,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  } : null;
  return bucket;
}

/** One line a minute at most: an R2 outage must not flood the logs on every play. */
function warn(message: string, error: unknown): void {
  if (Date.now() - lastWarnAt < 60_000) return;
  lastWarnAt = Date.now();
  console.warn(`[summary-audio] ${message}:`, error instanceof Error ? error.message : error);
}

function isMissing(error: unknown): boolean {
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } } | null;
  return value?.name === 'NoSuchKey' || value?.$metadata?.httpStatusCode === 404;
}

export function summaryAudioObjectKey(cacheKey: string): string {
  return `${PREFIX}${cacheKey}`;
}

/** The stored clip, or null when there is none, it is malformed, or R2 does not answer in time. */
export async function readStoredSummaryAudio(cacheKey: string): Promise<SummaryAudio | null> {
  const target = storeBucket();
  if (!target) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_DEADLINE_MS);
  try {
    const object = await target.client.send(
      new GetObjectCommand({ Bucket: target.name, Key: summaryAudioObjectKey(cacheKey) }),
      { abortSignal: controller.signal },
    );
    const provider = object.Metadata?.provider ?? '';
    const contentType = object.ContentType ?? '';
    if (!object.Body || !PROVIDERS.has(provider) || !CONTENT_TYPES.has(contentType) || (object.ContentLength ?? 0) > MAX_BYTES) {
      return null;
    }
    const buffer = Buffer.from(await object.Body.transformToByteArray());
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    return { buffer, provider: provider as SummaryAudio['provider'], contentType: contentType as SummaryAudio['contentType'] };
  } catch (error) {
    if (!isMissing(error)) warn('stored clip read failed', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fire and forget: the listener never waits for the copy, and a failed write only costs a later synthesis. */
export function storeSummaryAudio(cacheKey: string, audio: SummaryAudio): void {
  const target = storeBucket();
  if (!target) return;
  target.client.send(new PutObjectCommand({
    Bucket: target.name,
    Key: summaryAudioObjectKey(cacheKey),
    Body: audio.buffer,
    ContentType: audio.contentType,
    Metadata: { provider: audio.provider },
    // Served only through the API; the public media host must not cache it.
    CacheControl: 'private, no-store',
  })).catch((error: unknown) => warn('stored clip write failed', error));
}
