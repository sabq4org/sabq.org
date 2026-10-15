import { Buffer } from 'node:buffer';

export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';
export const GEMINI_TTS_VOICE = 'Orus';
export const GEMINI_TTS_STYLE = 'A professional male Saudi Arabian radio news anchor, native Saudi pronunciation and subtle Riyadh/Najdi vocal identity while reading correct Modern Standard Arabic. Authoritative, warm, composed medium-low register; crisp consonants; measured broadcast pace around 135 Arabic words per minute. Brief natural pauses after each sentence. News bulletin delivery, no theatrical exaggeration, no singing, no background music. Read the supplied Arabic verbatim. Pronounce سبق as سَبْق.';
export const GEMINI_TTS_CONFIG_VERSION = 'gemini-3.8-flash-tts:Orus:style-v1';
export const GEMINI_TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export const GEMINI_TTS_MAX_INPUT_CHARS = 32_000;
export const GEMINI_TTS_MAX_AUDIO_BYTES = 16 * 1024 * 1024;
export const GEMINI_TTS_MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
export const GEMINI_TTS_DEADLINE_MS = 25_000;

export class GeminiTtsError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = 'GeminiTtsError';
  }
}

export function isGeminiContentRejection(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown } | null;
  return value?.code === 'TTS_INPUT_NOT_ALLOWED' || value?.message === 'TTS_INPUT_NOT_ALLOWED';
}

function key(): string | undefined {
  // The dedicated key is preferred so an integration proxy cannot silently
  // change which Gemini tenant handles summary audio.
  return process.env.GEMINI_API_KEY?.trim() || process.env.AI_INTEGRATIONS_GEMINI_API_KEY?.trim();
}

function requestBody(text: string) {
  return {
    model: GEMINI_TTS_MODEL,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text,
        annotations: [{ type: 'speech_metadata', style: GEMINI_TTS_STYLE }],
      }],
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: GEMINI_TTS_VOICE }] },
  };
}

function validWav(buffer: Buffer): boolean {
  if (buffer.length < 12
    || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') return false;

  const riffSize = buffer.readUInt32LE(4);
  const riffEnd = 8 + riffSize;
  if (riffSize < 4 || riffEnd > buffer.length) return false;

  let offset = 12;
  let hasFmt = false;
  let hasData = false;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;

  while (offset + 8 <= riffEnd) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > riffEnd) return false;

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) return false;
      audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
      hasFmt = true;
    } else if (chunkId === 'data') {
      if (chunkSize === 0) return false;
      dataBytes += chunkSize;
      hasData = true;
    }

    const nextOffset = chunkEnd + (chunkSize % 2);
    if (nextOffset > riffEnd) return false;
    offset = nextOffset;
  }

  return offset === riffEnd && hasFmt && hasData && dataBytes > 0
    && audioFormat === 1 && channels === 1 && sampleRate === 24_000 && bitsPerSample === 16;
}

async function readBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > GEMINI_TTS_MAX_RESPONSE_BYTES) {
      throw new GeminiTtsError('TTS_RESPONSE_TOO_LARGE');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new GeminiTtsError('TTS_DEADLINE_EXCEEDED');
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > GEMINI_TTS_MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new GeminiTtsError('TTS_RESPONSE_TOO_LARGE');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

type JsonRecord = Record<string, unknown>;

const GEMINI_POLICY_CODES = new Set([
  'safety', 'recitation', 'language', 'prohibited_content', 'spii', 'blocklist',
  'content_blocked', 'image_safety', 'image_prohibited_content', 'image_recitation', 'image_other',
]);

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function policyCode(value: unknown): string | null {
  const payload = record(value);
  const error = record(payload?.error);
  const code = error?.code ?? payload?.code;
  return typeof code === 'string' ? code.toLowerCase() : null;
}

function policyText(value: unknown): boolean {
  const serialized = (JSON.stringify(value) ?? '').toLowerCase();
  return /(safety|prohibited|blocked|content[_ -]?filter|harmful|content[_ -]?not allowed)/i.test(serialized);
}

function refusalText(value: unknown): boolean {
  const payload = record(value);
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  for (const stepValue of steps) {
    const step = record(stepValue);
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const contentValue of step.content) {
      const content = record(contentValue);
      if (content?.type !== 'text' || typeof content.text !== 'string') continue;
      if (/\b(?:i\s+(?:can't|cannot|can not)|i(?:'m| am)\s+unable|unable to comply|cannot comply|refus(?:e|ed)|decline)\b/i.test(content.text)
        || /(?:لا\s+(?:أستطيع|يمكنني|أتمكن)|يتعذر(?:\s+علي)?|غير قادر(?:\s+على)?|عذراً|آسف)/u.test(content.text)) return true;
    }
  }
  return false;
}

function isPolicyResponse(status: number, value: unknown): boolean {
  const code = policyCode(value);
  if (code && GEMINI_POLICY_CODES.has(code)) return true;
  const payload = record(value);
  const hasErrorEnvelope = Boolean(payload?.error || payload?.blocked || payload?.safety);
  return (status === 400 || status === 403 || status === 422 || hasErrorEnvelope) && policyText(value);
}

function parseAudio(responseText: string, status: number): Buffer {
  let payload: any;
  try { payload = JSON.parse(responseText); }
  catch { throw new GeminiTtsError('TTS_MALFORMED_RESPONSE'); }

  if (isPolicyResponse(status, payload)) throw new GeminiTtsError('TTS_INPUT_NOT_ALLOWED');
  if (status < 200 || status >= 300) throw new GeminiTtsError('TTS_PROVIDER_ERROR');

  const candidates: unknown[] = [];
  if (Array.isArray(payload?.steps)) {
    for (const stepValue of payload.steps) {
      const step = record(stepValue);
      if (Array.isArray(step?.content)) candidates.push(...step.content);
    }
  }
  if (payload?.output_audio) candidates.push(payload.output_audio);
  let audio: JsonRecord | null = null;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = record(candidates[index]);
    if (candidate?.type === 'audio' && typeof candidate.data === 'string') { audio = candidate; break; }
  }
  if (!audio && refusalText(payload)) throw new GeminiTtsError('TTS_INPUT_NOT_ALLOWED');
  const audioData = audio?.data;
  if (typeof audioData !== 'string' || !audioData || !/^[A-Za-z0-9+/]*={0,2}$/.test(audioData) || audioData.length > Math.ceil(GEMINI_TTS_MAX_AUDIO_BYTES * 4 / 3) + 4) {
    throw new GeminiTtsError('TTS_MALFORMED_RESPONSE');
  }

  let buffer: Buffer;
  try { buffer = Buffer.from(audioData, 'base64'); }
  catch { throw new GeminiTtsError('TTS_MALFORMED_RESPONSE'); }
  if (buffer.length === 0 || buffer.length > GEMINI_TTS_MAX_AUDIO_BYTES || !validWav(buffer)) {
    throw new GeminiTtsError('TTS_INVALID_AUDIO');
  }
  return buffer;
}

/** Generate the fixed Orus summary voice using the official Interactions REST shape. */
export async function synthesizeGemini(text: string, timeoutMs = GEMINI_TTS_DEADLINE_MS): Promise<Buffer> {
  if (typeof text !== 'string' || !text.trim() || text.length > GEMINI_TTS_MAX_INPUT_CHARS) {
    throw new GeminiTtsError('TTS_INVALID_INPUT');
  }
  const apiKey = key();
  if (!apiKey) throw new GeminiTtsError('GEMINI_NOT_CONFIGURED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    let response: Response;
    try {
      response = await fetch(GEMINI_TTS_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(requestBody(text)),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new GeminiTtsError('TTS_DEADLINE_EXCEEDED');
      throw new GeminiTtsError('TTS_PROVIDER_ERROR');
    }
    let responseText: string;
    try { responseText = await readBody(response, controller.signal); }
    catch (error) {
      if (controller.signal.aborted) throw new GeminiTtsError('TTS_DEADLINE_EXCEEDED');
      if (error instanceof GeminiTtsError) throw error;
      throw new GeminiTtsError('TTS_PROVIDER_ERROR');
    }
    return parseAudio(responseText, response.status);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
