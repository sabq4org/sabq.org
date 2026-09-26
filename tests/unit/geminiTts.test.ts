import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GEMINI_TTS_ENDPOINT,
  GEMINI_TTS_MAX_INPUT_CHARS,
  GEMINI_TTS_MODEL,
  GEMINI_TTS_STYLE,
  GEMINI_TTS_VOICE,
  isGeminiContentRejection,
  synthesizeGemini,
} from '../../server/services/geminiTts';

function wav(): Buffer {
  const audio = Buffer.alloc(44 + 4);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVE', 8);
  audio.write('fmt ', 12); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22); audio.writeUInt32LE(24000, 24); audio.writeUInt32LE(48000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(4, 40);
  return audio;
}

function wavWithOptionalChunks(data = Buffer.from([1, 2, 3, 4])): Buffer {
  const chunk = (id: string, value: Buffer) => {
    const padding = value.length % 2;
    const result = Buffer.alloc(8 + value.length + padding);
    result.write(id, 0); result.writeUInt32LE(value.length, 4); value.copy(result, 8);
    return result;
  };
  const fmt = Buffer.alloc(18);
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(24000, 4);
  fmt.writeUInt32LE(48000, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14); fmt.writeUInt16LE(0, 16);
  const file = Buffer.concat([Buffer.from('RIFF    WAVE'), chunk('JUNK', Buffer.from([7, 8, 9])), chunk('fmt ', fmt), chunk('data', data)]);
  file.writeUInt32LE(file.length - 8, 4);
  return file;
}

function responseFor(audio: Buffer): Response {
  return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: audio.toString('base64') }] }] }), { status: 200 });
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Gemini 3.8 Flash TTS REST adapter', () => {
  it('sends the approved Interactions payload exactly and prefers GEMINI_API_KEY', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'dedicated-key');
    vi.stubEnv('AI_INTEGRATIONS_GEMINI_API_KEY', 'integration-key');
    const responseAudio = wav().toString('base64');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: responseAudio }] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(synthesizeGemini('نص الخبر')).resolves.toEqual(wav());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GEMINI_TTS_ENDPOINT);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('dedicated-key');
    expect(JSON.parse(String(init.body))).toEqual({
      model: GEMINI_TTS_MODEL,
      input: [{ type: 'user_input', content: [{ type: 'text', text: 'نص الخبر', annotations: [{ type: 'speech_metadata', style: GEMINI_TTS_STYLE }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: GEMINI_TTS_VOICE }] },
    });
  });

  it('rejects malformed or non-WAV responses', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ steps: [] }), { status: 200 })));
    await expect(synthesizeGemini('نص')).rejects.toThrow('TTS_MALFORMED_RESPONSE');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: Buffer.from('mp3').toString('base64') }] }] }), { status: 200 })));
    await expect(synthesizeGemini('نص')).rejects.toThrow('TTS_INVALID_AUDIO');
  });

  it('accepts valid WAV files with optional chunks, padding, and an extended fmt chunk', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseFor(wavWithOptionalChunks())));
    await expect(synthesizeGemini('نص')).resolves.toEqual(wavWithOptionalChunks());
  });

  it('rejects WAV files with invalid RIFF/data bounds or zero data', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    const badRiff = wavWithOptionalChunks();
    badRiff.writeUInt32LE(badRiff.length + 100, 4);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseFor(badRiff)));
    await expect(synthesizeGemini('نص')).rejects.toThrow('TTS_INVALID_AUDIO');

    const badData = wavWithOptionalChunks();
    const dataOffset = badData.lastIndexOf('data');
    badData.writeUInt32LE(10_000, dataOffset + 4);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseFor(badData)));
    await expect(synthesizeGemini('نص')).rejects.toThrow('TTS_INVALID_AUDIO');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseFor(wavWithOptionalChunks(Buffer.alloc(0)))));
    await expect(synthesizeGemini('نص')).rejects.toThrow('TTS_INVALID_AUDIO');
  });

  it('marks provider policy rejection so callers cannot bypass it with fallback', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'blocked by safety policy' } }), { status: 400 })));
    const error = await synthesizeGemini('نص').catch(value => value);
    expect(isGeminiContentRejection(error)).toBe(true);
  });

  it.each(['recitation', 'language', 'spii', 'blocklist'])('marks a structured HTTP-200 %s refusal as content rejection', async code => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failed', error: { code, message: `refused: ${code}` } }), { status: 200 })));
    const error = await synthesizeGemini('نص').catch(value => value);
    expect(isGeminiContentRejection(error)).toBe(true);
  });

  it('marks a HTTP-200 text-only refusal as content rejection instead of malformed technical output', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'I cannot generate this audio.' }] }] }), { status: 200 })));
    const error = await synthesizeGemini('نص').catch(value => value);
    expect(isGeminiContentRejection(error)).toBe(true);
  });

  it('enforces input and total request deadlines', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    await expect(synthesizeGemini('x'.repeat(GEMINI_TTS_MAX_INPUT_CHARS + 1))).rejects.toThrow('TTS_INVALID_INPUT');
    await expect(synthesizeGemini('نص', 10)).rejects.toThrow('TTS_DEADLINE_EXCEEDED');
  });

  it('aborts when headers arrive but the response body stalls', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
        controller.enqueue(new TextEncoder().encode('{"steps":'));
      },
    });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', () => bodyController?.error(new DOMException('aborted', 'AbortError')), { once: true });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(synthesizeGemini('نص', 30)).rejects.toThrow('TTS_DEADLINE_EXCEEDED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
