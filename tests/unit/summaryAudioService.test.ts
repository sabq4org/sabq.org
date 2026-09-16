import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ humain: vi.fn(), eleven: vi.fn(), google: vi.fn(), load: vi.fn(), cooldown: vi.fn() }));
vi.mock('../../server/services/humainTts', () => ({ synthesizeHumain: mocks.humain, isContentRejection: (e: Error) => e.message === 'TTS_INPUT_NOT_ALLOWED' }));
vi.mock('../../server/services/elevenlabs', () => ({ getElevenLabsService: () => ({ textToSpeech: mocks.eleven }), isElevenLabsQuotaCoolingDown: mocks.cooldown }));
vi.mock('../../server/services/googleTts', () => ({ getGoogleTTSService: () => ({ textToSpeech: mocks.google }) }));
vi.mock('../../server/services/summaryAudioSettings', () => ({ loadSummaryAudioSettings: mocks.load }));
const settings = { primaryProvider: 'humain' as const, humainVoiceId: 'humain-voice', elevenlabsVoiceId: 'eleven-voice' };
let service: typeof import('../../server/services/summaryAudioService');
beforeEach(async () => {
  vi.resetAllMocks(); vi.resetModules(); vi.stubEnv('HUMAIN_VOICE_API_KEY', 'unit-test-key');
  mocks.load.mockResolvedValue(settings); mocks.humain.mockResolvedValue(Buffer.from('wav')); mocks.eleven.mockResolvedValue(Buffer.from('mp3')); mocks.google.mockResolvedValue(Buffer.from('google'));
  service = await import('../../server/services/summaryAudioService');
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('summary provider chain', () => {
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
});
