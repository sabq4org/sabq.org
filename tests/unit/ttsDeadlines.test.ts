import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ google: vi.fn() }));
vi.mock('@google-cloud/text-to-speech', () => ({ default: { TextToSpeechClient: class { synthesizeSpeech = mocks.google; } } }));
import { ElevenLabsService } from '../../server/services/elevenlabs';
import { GoogleTTSService } from '../../server/services/googleTts';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });
describe('fallback provider deadlines', () => {
  it('keeps ElevenLabs abort active while reading audio and performs one attempt', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const fetchMock = vi.fn(async (_url, init) => {
      signal = init.signal;
      return { ok: true, arrayBuffer: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = new ElevenLabsService('test-key').textToSpeech({ text: 'نص' }, 100, false);
    const result = expect(pending).rejects.toThrow('Request timeout');
    await vi.advanceTimersByTimeAsync(101); await result;
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(signal!.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not keep a timeout after a successful ElevenLabs response', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1,2]).buffer }));
    expect(await new ElevenLabsService('test-key').textToSpeech({ text: 'نص' }, 100, false)).toEqual(Buffer.from([1,2]));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('sets a Google transport deadline and disables nested retries for the fallback', async () => {
    mocks.google.mockResolvedValue([{ audioContent: new Uint8Array([1,2]) }]);
    const service = new GoogleTTSService(JSON.stringify({ client_email: 'unit-test', private_key: 'unit-test', project_id: 'unit-test' }));
    await service.textToSpeech({ text: 'نص' }, 15000, false);
    expect(mocks.google).toHaveBeenCalledWith(expect.objectContaining({ input: { text: 'نص' } }), { timeout: 15000, retry: null });
    expect(mocks.google).toHaveBeenCalledTimes(1);
  });
});
