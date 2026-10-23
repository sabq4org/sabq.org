import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ gemini: vi.fn(), humain: vi.fn(), eleven: vi.fn(), google: vi.fn(), load: vi.fn(), cooldown: vi.fn() }));
vi.mock('../../server/services/geminiTts', () => ({ GEMINI_TTS_CONFIG_VERSION: 'test-gemini-v1', GEMINI_TTS_VOICE: 'Orus', synthesizeGemini: mocks.gemini, isGeminiContentRejection: (e: Error) => e.message === 'TTS_INPUT_NOT_ALLOWED' }));
vi.mock('../../server/services/humainTts', () => ({ synthesizeHumain: mocks.humain, isContentRejection: (e: Error) => e.message === 'TTS_INPUT_NOT_ALLOWED' }));
vi.mock('../../server/services/elevenlabs', () => ({ getElevenLabsService: () => ({ textToSpeech: mocks.eleven }), isElevenLabsQuotaCoolingDown: mocks.cooldown }));
vi.mock('../../server/services/googleTts', () => ({ getGoogleTTSService: () => ({ textToSpeech: mocks.google }) }));
vi.mock('../../server/services/summaryAudioSettings', () => ({ loadSummaryAudioSettings: mocks.load }));
const store = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('../../server/services/summaryAudioStore', () => ({ readStoredSummaryAudio: store.read, storeSummaryAudio: store.write }));
const settings = { primaryProvider: 'humain' as const, humainVoiceId: 'humain-voice', elevenlabsVoiceId: 'eleven-voice' };
const geminiSettings = { ...settings, primaryProvider: 'gemini' as const };
const wav = () => { const audio = Buffer.alloc(48); audio.write('RIFF', 0); audio.write('WAVE', 8); audio.write('fmt ', 12); audio.write('data', 36); return audio; };
let service: typeof import('../../server/services/summaryAudioService');
beforeEach(async () => {
  vi.resetAllMocks(); vi.resetModules(); vi.stubEnv('HUMAIN_VOICE_API_KEY', 'unit-test-key'); vi.stubEnv('GEMINI_API_KEY', 'unit-test-gemini-key');
  mocks.load.mockResolvedValue(settings); mocks.gemini.mockResolvedValue(wav()); mocks.humain.mockResolvedValue(Buffer.from('wav')); mocks.eleven.mockResolvedValue(Buffer.from('mp3')); mocks.google.mockResolvedValue(Buffer.from('google'));
  store.read.mockResolvedValue(null);
  service = await import('../../server/services/summaryAudioService');
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('summary provider chain', () => {
  it('uses Gemini Orus as the new primary and keeps the result cached as primary audio', async () => {
    mocks.load.mockResolvedValue(geminiSettings);
    const result = await service.getSummaryAudio('gemini-id', 'نص الخبر');
    expect(result).toMatchObject({ provider: 'gemini', contentType: 'audio/wav', cache: 'MISS' });
    expect(mocks.gemini).toHaveBeenCalledWith('نص الخبر');
    expect(mocks.humain).not.toHaveBeenCalled();
  });

  it('falls from Gemini to HUMAIN, then keeps tertiary fallbacks available', async () => {
    mocks.gemini.mockRejectedValueOnce(new Error('network'));
    expect((await service.generateSummaryAudio('نص', geminiSettings)).provider).toBe('humain');
    expect(mocks.humain).toHaveBeenCalledWith('نص', settings.humainVoiceId);
  });

  it('skips Gemini when its key is missing and uses HUMAIN first', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    mocks.load.mockResolvedValue(geminiSettings);
    expect((await service.getSummaryAudio('missing-gemini-key', 'نص')).provider).toBe('humain');
    expect(mocks.gemini).not.toHaveBeenCalled();
    expect(mocks.humain).toHaveBeenCalledWith('نص', settings.humainVoiceId);
  });

  it('falls from Gemini and HUMAIN to ElevenLabs with the full source text', async () => {
    mocks.gemini.mockRejectedValueOnce(new Error('gemini-offline'));
    mocks.humain.mockRejectedValueOnce(new Error('humain-offline'));
    const result = await service.generateSummaryAudio('النص الكامل للموجز', geminiSettings);
    expect(result.provider).toBe('elevenlabs');
    expect(mocks.eleven).toHaveBeenCalledWith(expect.objectContaining({ text: 'النص الكامل للموجز', voiceId: settings.elevenlabsVoiceId }), 20_000, false);
  });

  it('does not bypass a Gemini content rejection', async () => {
    mocks.gemini.mockRejectedValue(new Error('TTS_INPUT_NOT_ALLOWED'));
    await expect(service.generateSummaryAudio('نص', geminiSettings)).rejects.toThrow('TTS_INPUT_NOT_ALLOWED');
    expect(mocks.humain).not.toHaveBeenCalled(); expect(mocks.eleven).not.toHaveBeenCalled();
  });

  it('uses the exact selected HUMAIN voice and WAV MIME', async () => {
    const result = await service.getSummaryAudio('id', 'نص الخبر');
    expect(result).toMatchObject({ provider: 'humain', contentType: 'audio/wav' });
    expect(mocks.humain).toHaveBeenCalledWith('نص الخبر', settings.humainVoiceId);
    expect(mocks.eleven).not.toHaveBeenCalled();
  });
  it.each(['network', 'timeout', 'incomplete stream'])('regenerates the full text with the independent ElevenLabs voice on %s', async error => {
    mocks.humain.mockRejectedValue(new Error(error));
    expect((await service.getSummaryAudio('id', 'كامل موجز الخبر')).provider).toBe('elevenlabs');
    expect(mocks.eleven).toHaveBeenCalledWith(expect.objectContaining({ text: 'كامل موجز الخبر', voiceId: 'eleven-voice', model: 'eleven_multilingual_v2' }), 20_000, false);
  });
  it('skips HUMAIN when its key is absent', async () => {
    vi.stubEnv('HUMAIN_VOICE_API_KEY', '');
    expect((await service.getSummaryAudio('id', 'نص')).provider).toBe('elevenlabs');
    expect(mocks.humain).not.toHaveBeenCalled();
  });
  it('supports ElevenLabs as the selected primary', async () => {
    expect((await service.generateSummaryAudio('نص', { ...settings, primaryProvider: 'elevenlabs' })).provider).toBe('elevenlabs');
    expect(mocks.humain).not.toHaveBeenCalled();
  });
  it('preserves Google as final fallback and rejects empty output', async () => {
    mocks.humain.mockResolvedValue(Buffer.alloc(0)); mocks.eleven.mockRejectedValue(new Error('quota'));
    expect((await service.getSummaryAudio('id', 'نص')).provider).toBe('google');
    mocks.google.mockResolvedValue(Buffer.alloc(0));
    await expect(service.getSummaryAudio('id2', 'نص')).rejects.toThrow('TTS_INVALID_AUDIO');
  });
  it('does not bypass a content rejection using another provider', async () => {
    mocks.humain.mockRejectedValue(new Error('TTS_INPUT_NOT_ALLOWED'));
    await expect(service.getSummaryAudio('id', 'نص')).rejects.toThrow('TTS_INPUT_NOT_ALLOWED');
    expect(mocks.eleven).not.toHaveBeenCalled(); expect(mocks.google).not.toHaveBeenCalled();
  });
  it('preview does not fall back or save settings', async () => {
    mocks.humain.mockRejectedValue(new Error('network'));
    await expect(service.previewSummaryVoice('humain', 'voice')).rejects.toThrow('network');
    expect(mocks.eleven).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('coalesces concurrent generation and reuses successful cached audio', async () => {
    await Promise.all([service.getSummaryAudio('id', 'نص'), service.getSummaryAudio('id', 'نص')]);
    expect(mocks.humain).toHaveBeenCalledTimes(1);
    expect((await service.getSummaryAudio('id', 'نص')).cache).toBe('HIT');
  });
  it('changing either voice, primary or text invalidates the audio key', async () => {
    await service.getSummaryAudio('id', 'نص');
    mocks.load.mockResolvedValue({ ...settings, humainVoiceId: 'second' });
    expect((await service.getSummaryAudio('id', 'نص')).cache).toBe('MISS');
    mocks.load.mockResolvedValue({ ...settings, elevenlabsVoiceId: 'fallback2' });
    expect((await service.getSummaryAudio('id', 'نص')).cache).toBe('MISS');
    expect((await service.getSummaryAudio('id', 'نص معدل')).cache).toBe('MISS');
  });
  it('recovers HUMAIN after a short outage instead of caching fallback for a day', async () => {
    vi.useFakeTimers(); mocks.humain.mockRejectedValueOnce(new Error('offline'));
    expect((await service.getSummaryAudio('id', 'نص')).provider).toBe('elevenlabs');
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await service.getSummaryAudio('id', 'نص')).provider).toBe('humain');
  });

  it('expires Gemini fallback cache after cooldown and recovers the Gemini primary', async () => {
    vi.useFakeTimers();
    mocks.load.mockResolvedValue(geminiSettings);
    mocks.gemini.mockRejectedValueOnce(new Error('gemini-offline'));
    expect((await service.getSummaryAudio('gemini-recovery', 'نص')).provider).toBe('humain');
    expect((await service.getSummaryAudio('gemini-recovery', 'نص')).cache).toBe('HIT');

    await vi.advanceTimersByTimeAsync(61_000);
    const recovered = await service.getSummaryAudio('gemini-recovery', 'نص');
    expect(recovered).toMatchObject({ provider: 'gemini', cache: 'MISS' });
    expect(mocks.gemini).toHaveBeenCalledTimes(2);
    expect(mocks.humain).toHaveBeenCalledTimes(1);
  });
});

describe('summary clip kept once (R2 copy, no second paid fallback, synthesis limit)', () => {
  const humainClip = () => ({ buffer: Buffer.from('stored-humain'), provider: 'humain' as const, contentType: 'audio/wav' as const });
  const deferred = () => { let resolve!: (value: Buffer) => void; const promise = new Promise<Buffer>(r => { resolve = r; }); return { promise, resolve }; };

  it('serves a stored primary clip without paying a provider, then from memory', async () => {
    store.read.mockResolvedValue(humainClip());
    expect(await service.getSummaryAudio('id', 'نص')).toMatchObject({ provider: 'humain', cache: 'STORE' });
    expect((await service.getSummaryAudio('id', 'نص')).cache).toBe('HIT');
    expect(store.read).toHaveBeenCalledTimes(1);
    expect(store.read).toHaveBeenCalledWith(service.summaryAudioCacheKey('id', 'نص', settings));
    expect(mocks.humain).not.toHaveBeenCalled(); expect(mocks.eleven).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('keeps a durable copy of a published clip only', async () => {
    const published = await service.getSummaryAudio('published', 'نص', { persist: true });
    expect(store.write).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledWith(service.summaryAudioCacheKey('published', 'نص', settings), expect.objectContaining({ provider: 'humain', buffer: published.buffer }));
    await service.getSummaryAudio('draft', 'نص');
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('keeps a stored fallback clip while Gemini is down instead of paying HUMAIN again', async () => {
    mocks.load.mockResolvedValue(geminiSettings);
    store.read.mockResolvedValue(humainClip());
    mocks.gemini.mockRejectedValue(new Error('credit exhausted'));
    expect(await service.getSummaryAudio('fallback', 'نص', { persist: true })).toMatchObject({ provider: 'humain', cache: 'STORE' });
    expect(mocks.gemini).toHaveBeenCalledTimes(1);
    expect(mocks.humain).not.toHaveBeenCalled(); expect(mocks.eleven).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('replaces a stored fallback clip with the primary voice once it is back', async () => {
    mocks.load.mockResolvedValue(geminiSettings);
    store.read.mockResolvedValue(humainClip());
    expect(await service.getSummaryAudio('upgrade', 'نص', { persist: true })).toMatchObject({ provider: 'gemini', cache: 'MISS' });
    expect(store.write).toHaveBeenCalledWith(service.summaryAudioCacheKey('upgrade', 'نص', geminiSettings), expect.objectContaining({ provider: 'gemini' }));
    expect(mocks.humain).not.toHaveBeenCalled();
    expect((await service.getSummaryAudio('upgrade', 'نص')).cache).toBe('HIT');
  });

  it('never pays the fallback twice for the same text, even without R2', async () => {
    vi.useFakeTimers(); mocks.humain.mockRejectedValue(new Error('offline'));
    expect((await service.getSummaryAudio('id', 'نص')).provider).toBe('elevenlabs');
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await service.getSummaryAudio('id', 'نص')).toMatchObject({ provider: 'elevenlabs', cache: 'HIT' });
    expect(mocks.humain).toHaveBeenCalledTimes(2);
    expect(mocks.eleven).toHaveBeenCalledTimes(1);
  });

  it('still refuses audio the primary voice rejects as content', async () => {
    mocks.load.mockResolvedValue(geminiSettings);
    store.read.mockResolvedValue(humainClip());
    mocks.gemini.mockRejectedValue(new Error('TTS_INPUT_NOT_ALLOWED'));
    await expect(service.getSummaryAudio('rejected', 'نص')).rejects.toThrow('TTS_INPUT_NOT_ALLOWED');
  });

  it('copies a primary clip voiced as a draft once the article is published', async () => {
    vi.useFakeTimers();
    await service.getSummaryAudio('draft-then-published', 'نص');
    expect(store.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(86_400_000 + 1_000);
    expect(await service.getSummaryAudio('draft-then-published', 'نص', { persist: true })).toMatchObject({ provider: 'humain', cache: 'HIT' });
    expect(mocks.humain).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('asks the synthesis limit only for a clip that exists nowhere', async () => {
    const takeSynthesisSlot = vi.fn(() => true);
    await service.getSummaryAudio('id', 'نص', { takeSynthesisSlot });
    await service.getSummaryAudio('id', 'نص', { takeSynthesisSlot });
    store.read.mockResolvedValue(humainClip());
    await service.getSummaryAudio('stored', 'نص', { takeSynthesisSlot });
    expect(takeSynthesisSlot).toHaveBeenCalledTimes(1);
  });

  it('refuses a new clip past the limit but still serves stored ones', async () => {
    const takeSynthesisSlot = () => false;
    await expect(service.getSummaryAudio('cold', 'نص', { takeSynthesisSlot })).rejects.toThrow('TTS_RATE_LIMITED');
    expect(mocks.humain).not.toHaveBeenCalled();
    store.read.mockResolvedValue(humainClip());
    expect(await service.getSummaryAudio('warm', 'نص', { takeSynthesisSlot })).toMatchObject({ provider: 'humain', cache: 'STORE' });
  });

  it('allows four syntheses at once; a fifth new clip is busy, a fallback clip is served as is', async () => {
    const calls = [deferred(), deferred(), deferred(), deferred()];
    calls.forEach(call => mocks.humain.mockReturnValueOnce(call.promise));
    const running = ['a', 'b', 'c', 'd'].map(id => service.getSummaryAudio(id, 'نص'));
    await vi.waitFor(() => expect(mocks.humain).toHaveBeenCalledTimes(4));
    const takeSynthesisSlot = vi.fn(() => true);
    await expect(service.getSummaryAudio('e', 'نص', { takeSynthesisSlot })).rejects.toThrow('TTS_BUSY');
    expect(takeSynthesisSlot).not.toHaveBeenCalled();
    mocks.load.mockResolvedValue(geminiSettings);
    store.read.mockResolvedValue(humainClip());
    expect(await service.getSummaryAudio('f', 'نص')).toMatchObject({ provider: 'humain', cache: 'STORE' });
    expect(mocks.gemini).not.toHaveBeenCalled();
    calls.forEach(call => call.resolve(Buffer.from('wav')));
    await Promise.all(running);
  });
});
