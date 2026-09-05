import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { normalizeTextForTts } from '../utils/arabicTtsNormalize';

export class HumainTtsError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'HumainTtsError'; }
}
export function isContentRejection(error: unknown): boolean {
  return error instanceof HumainTtsError && ['TTS_INPUT_NOT_ALLOWED', 'TTS_INVALID_INPUT'].includes(error.code);
}

/** Count Unicode code points after number normalization. Never truncate news text. */
export function splitHumainText(text: string, limit = 450): string[] {
  if (limit < 2) throw new Error('Invalid chunk limit');
  const remaining = Array.from(normalizeTextForTts(text, { language: 'ar' }).trim());
  if (!remaining.length || remaining.length > 4000) throw new HumainTtsError('TTS_INVALID_INPUT');
  const chunks: string[] = [];
  while (remaining.length) {
    let end = Math.min(limit, remaining.length);
    if (remaining.length > limit) {
      let boundary = -1;
      for (let i = Math.floor(limit / 2); i < limit; i++) {
        if (/[.!؟؛\n]/u.test(remaining[i])) boundary = i + 1;
      }
      if (boundary < 0) for (let i = limit - 1; i > 0; i--) {
        if (/\s/u.test(remaining[i])) { boundary = i + 1; break; }
      }
      if (boundary > 0) end = boundary;
    }
    const chunk = remaining.splice(0, end).join('').trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

export function pcmToWav(pcm: Buffer): Buffer {
  if (!pcm.length || pcm.length % 2 || pcm.length > 16 * 1024 * 1024) throw new HumainTtsError('TTS_INVALID_AUDIO');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// SDK 0.18.0 close() only disconnects an already-connected socket. An isolated
// worker lets the parent terminate even a hung handshake/reconnect, without
// relying on private SDK internals or leaving paid work running after fallback.
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  let client;
  let code;
  try {
    const sdk = await import(workerData.sdkUrl);
    const TTSClient = sdk.TTSClient || sdk.default?.TTSClient;
    client = new TTSClient({ api_url: 'https://api.voice.humain.com', api_key: workerData.key,
      onError: error => { code = error.code || 'TTS_SYNTHESIS_FAILED'; } });
    await client.connect();
    const parts = [];
    let bytes = 0;
    for (const text of workerData.chunks) {
      let complete = false;
      let partBytes = 0;
      for await (const chunk of client.synthesizeStream(text, {
        voice_id: workerData.voiceId, model: 'nebula', timeoutSeconds: 12,
        onError: error => { code = error.code || 'TTS_SYNTHESIS_FAILED'; }
      })) {
        if (code) throw new Error(code);
        bytes += chunk.audio.byteLength;
        partBytes += chunk.audio.byteLength;
        if (bytes > 16 * 1024 * 1024) throw new Error('TTS_AUDIO_TOO_LARGE');
        parts.push(Buffer.from(chunk.audio));
        if (chunk.is_last) complete = true;
      }
      if (code || !complete || !partBytes || partBytes % 2) throw new Error(code || 'TTS_INCOMPLETE_AUDIO');
    }
    parentPort.postMessage({ audio: Buffer.concat(parts) });
  } catch (error) {
    parentPort.postMessage({ error: code || (error.message.startsWith('TTS_') ? error.message : 'TTS_SYNTHESIS_FAILED') });
  } finally {
    if (client) await client.close().catch(() => {});
    parentPort.close();
  }
})();
`;

export async function synthesizeHumain(text: string, voiceId: string, timeoutMs = 25_000): Promise<Buffer> {
  const key = process.env.HUMAIN_VOICE_API_KEY?.trim();
  if (!key) throw new HumainTtsError('HUMAIN_NOT_CONFIGURED');
  const chunks = splitHumainText(text);
  const sdkUrl = pathToFileURL(createRequire(import.meta.url).resolve('@humain-voice/sdk')).href;
  const worker = new Worker(workerSource, { eval: true, workerData: { sdkUrl, key, chunks, voiceId } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pcm = await new Promise<Buffer>((resolve, reject) => {
      timer = setTimeout(() => reject(new HumainTtsError('TTS_DEADLINE_EXCEEDED')), timeoutMs);
      worker.once('message', (message: { audio?: Uint8Array; error?: string }) => {
        if (message.error) reject(new HumainTtsError(message.error));
        else if (message.audio) resolve(Buffer.from(message.audio));
        else reject(new HumainTtsError('TTS_INCOMPLETE_AUDIO'));
      });
      worker.once('error', () => reject(new HumainTtsError('TTS_SYNTHESIS_FAILED')));
      worker.once('exit', () => reject(new HumainTtsError('TTS_INCOMPLETE_AUDIO')));
    });
    return pcmToWav(pcm);
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}
