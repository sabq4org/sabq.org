/**
 * صوت «نشرة سَبْق»: كل فقرة تُولَّد منفصلة بالمزود نفسه، ثم تُدمج في ملف MP3 واحد
 * وتُحسب بدايات الفقرات من عدد العينات فعلياً (لا تقدير). الملف يُرفع مرة واحدة إلى
 * R2 (media.sabq.org) فيسمعه كل الزوار من الحافة دون توليد لكل مستمع.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { isContentRejection } from './humainTts';
import { isGeminiContentRejection } from './geminiTts';
import { loadSummaryAudioSettings } from './summaryAudioSettings';
import { summaryVoiceOrder, synthesizeWithSummaryVoice, type SummaryVoiceProvider } from './summaryAudioService';

const run = promisify(execFile);

/** Silence between paragraphs, so the listener hears the move to the next story. */
export const PARAGRAPH_GAP_SEC = 0.7;

export interface PcmAudio {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  data: Buffer;
}

/** Reads a PCM WAV (any chunk order). Throws on anything that is not linear PCM. */
export function parseWav(buffer: Buffer): PcmAudio {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('BULLETIN_INVALID_WAV');
  }
  let offset = 12;
  let fmt: Omit<PcmAudio, 'data'> | null = null;
  const parts: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    // Streams written before their length is known declare 0 or 0xFFFFFFFF: take the rest.
    let size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'data' && (size === 0 || size === 0xffffffff || start + size > buffer.length)) size = buffer.length - start;
    if (start + size > buffer.length) throw new Error('BULLETIN_INVALID_WAV');
    if (id === 'fmt ') {
      if (size < 16 || buffer.readUInt16LE(start) !== 1) throw new Error('BULLETIN_INVALID_WAV');
      fmt = {
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      parts.push(buffer.subarray(start, start + size));
    }
    offset = start + size + (size % 2);
  }
  if (!fmt || parts.length === 0 || fmt.bitsPerSample !== 16 || fmt.channels < 1 || fmt.sampleRate < 8000) {
    throw new Error('BULLETIN_INVALID_WAV');
  }
  return { ...fmt, data: Buffer.concat(parts) };
}

export function wavFromPcm(audio: PcmAudio): Buffer {
  const blockAlign = audio.channels * (audio.bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + audio.data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(audio.channels, 22);
  header.writeUInt32LE(audio.sampleRate, 24);
  header.writeUInt32LE(audio.sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(audio.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(audio.data.length, 40);
  return Buffer.concat([header, audio.data]);
}

export function pcmDurationSec(audio: PcmAudio): number {
  return audio.data.length / (audio.sampleRate * audio.channels * (audio.bitsPerSample / 8));
}

/** Joins same-format parts with a gap and returns each part's start time in seconds. */
export function joinPcm(parts: PcmAudio[], gapSec = PARAGRAPH_GAP_SEC): { audio: PcmAudio; starts: number[] } {
  if (parts.length === 0) throw new Error('BULLETIN_NO_AUDIO');
  const [first] = parts;
  for (const part of parts) {
    if (part.sampleRate !== first.sampleRate || part.channels !== first.channels || part.bitsPerSample !== first.bitsPerSample) {
      throw new Error('BULLETIN_MIXED_AUDIO_FORMAT');
    }
  }
  const blockAlign = first.channels * (first.bitsPerSample / 8);
  const gap = Buffer.alloc(Math.round(gapSec * first.sampleRate) * blockAlign);
  const chunks: Buffer[] = [];
  const starts: number[] = [];
  let bytes = 0;
  parts.forEach((part, index) => {
    if (index > 0) { chunks.push(gap); bytes += gap.length; }
    starts.push(bytes / (first.sampleRate * blockAlign));
    // A part that ends mid-sample would shift every later sample: trim to whole frames.
    const data = part.data.subarray(0, part.data.length - (part.data.length % blockAlign));
    chunks.push(data); bytes += data.length;
  });
  return { audio: { ...first, data: Buffer.concat(chunks) }, starts };
}

async function lame(args: string[], input: Buffer, inputName: string, outputName: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'sabq-bulletin-'));
  try {
    const inPath = join(dir, inputName);
    const outPath = join(dir, outputName);
    await writeFile(inPath, input);
    await run('lame', [...args, inPath, outPath], { timeout: 120_000 });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let lameAvailable: boolean | null = null;
async function hasLame(): Promise<boolean> {
  if (lameAvailable === null) {
    lameAvailable = await run('lame', ['--version'], { timeout: 10_000 }).then(() => true, () => false);
    if (!lameAvailable) console.warn('[AudioBulletin] lame not installed: bulletins will be stored as WAV');
  }
  return lameAvailable;
}

async function toPcm(buffer: Buffer, contentType: string): Promise<PcmAudio> {
  if (contentType === 'audio/wav') return parseWav(buffer);
  if (!(await hasLame())) throw new Error('BULLETIN_MP3_DECODER_MISSING');
  return parseWav(await lame(['--quiet', '--decode'], buffer, 'in.mp3', 'out.wav'));
}

export interface BulletinAudioResult {
  buffer: Buffer;
  contentType: 'audio/mpeg' | 'audio/wav';
  provider: SummaryVoiceProvider;
  durationSec: number;
  /** Start of each paragraph, in the order given. */
  starts: number[];
}

/**
 * Tries each configured voice in the article-summary order. A provider failure
 * restarts the whole bulletin on the next provider so one bulletin never switches
 * voice halfway; a content refusal stops immediately, as it does for summaries.
 */
export async function synthesizeBulletin(paragraphs: string[]): Promise<BulletinAudioResult> {
  const settings = await loadSummaryAudioSettings();
  const order = summaryVoiceOrder(settings);
  if (order.length === 0) throw new Error('NO_TTS_PROVIDER_AVAILABLE');
  let lastError: unknown = null;
  for (const provider of order) {
    try {
      const parts: PcmAudio[] = [];
      for (const paragraph of paragraphs) {
        const audio = await synthesizeWithSummaryVoice(provider, paragraph, settings);
        parts.push(await toPcm(audio.buffer, audio.contentType));
      }
      const { audio, starts } = joinPcm(parts);
      const wav = wavFromPcm(audio);
      const durationSec = pcmDurationSec(audio);
      if (await hasLame()) {
        // Speech in mono: 64 kbps keeps a three-minute bulletin near 1.5 MB.
        const mp3 = await lame(['--quiet', '-m', 'm', '-b', '64'], wav, 'in.wav', 'out.mp3');
        return { buffer: mp3, contentType: 'audio/mpeg', provider, durationSec, starts };
      }
      return { buffer: wav, contentType: 'audio/wav', provider, durationSec, starts };
    } catch (error) {
      if (isGeminiContentRejection(error) || isContentRejection(error)) throw error;
      lastError = error;
      console.warn(`[AudioBulletin] ${provider} failed (${error instanceof Error ? error.message : 'unknown'}); trying next voice`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NO_TTS_PROVIDER_AVAILABLE');
}

/** Same bucket and public host as the Sahraa TV mirror and news images. */
function r2Config() {
  const accountId = (process.env.NEWS_IMAGES_R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.NEWS_IMAGES_R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = (process.env.NEWS_IMAGES_R2_BUCKET_NAME || '').trim();
  const publicUrl = (process.env.NEWS_IMAGES_R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) return null;
  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

export function isBulletinStorageConfigured(): boolean {
  return r2Config() !== null;
}

export async function uploadBulletinAudio(id: string, createdAt: Date, audio: Pick<BulletinAudioResult, 'buffer' | 'contentType'>): Promise<string> {
  const config = r2Config();
  if (!config) throw new Error('BULLETIN_STORAGE_NOT_CONFIGURED');
  const month = `${createdAt.getUTCFullYear()}/${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
  const key = `audio-bulletin/${month}/${id}.${audio.contentType === 'audio/mpeg' ? 'mp3' : 'wav'}`;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: audio.buffer,
    ContentType: audio.contentType,
    // Every bulletin gets a new id, so the file never changes and can be cached for good.
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${config.publicUrl}/${key}`;
}
