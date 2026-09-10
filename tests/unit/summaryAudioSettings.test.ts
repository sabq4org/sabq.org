import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getSystemSetting: vi.fn(), upsertSystemSetting: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage }));
import { DEFAULT_SUMMARY_AUDIO_SETTINGS as defaults, HUMAIN_NEWS_VOICES, loadSummaryAudioSettings, saveSummaryAudioSettings, summaryAudioCatalog, summaryAudioSettingsSchema } from '../../server/services/summaryAudioSettings';

describe('summary audio settings', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
  it('offers all four distinct Saudi voices and accepts each choice', () => {
    expect(new Set(HUMAIN_NEWS_VOICES.map(v => v.id)).size).toBe(4);
    for (const voice of HUMAIN_NEWS_VOICES) expect(summaryAudioSettingsSchema.parse({ ...defaults, humainVoiceId: voice.id }).humainVoiceId).toBe(voice.id);
  });
  it('rejects provider/voice mismatches, unknown IDs and secret fields', () => {
    for (const patch of [{ humainVoiceId: defaults.elevenlabsVoiceId }, { elevenlabsVoiceId: defaults.humainVoiceId }, { primaryProvider: 'other' }, { apiKey: 'do-not-store' }]) {
      expect(summaryAudioSettingsSchema.safeParse({ ...defaults, ...patch }).success).toBe(false);
    }
  });
  it('persists only private validated configuration in the existing table', async () => {
    expect(await saveSummaryAudioSettings(defaults)).toEqual(defaults);
    expect(storage.upsertSystemSetting).toHaveBeenCalledWith('summary_audio_settings', defaults, 'tts', false);
  });
  it('uses defaults only for an absent row; read failures are surfaced', async () => {
    expect(await loadSummaryAudioSettings()).toEqual(defaults);
    storage.getSystemSetting.mockRejectedValue(new Error('database unavailable'));
    await expect(loadSummaryAudioSettings()).rejects.toThrow('database unavailable');
  });
  it('reads saved selections on every request and ignores legacy provider override', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    const settings = { ...defaults, humainVoiceId: HUMAIN_NEWS_VOICES[2].id };
    storage.getSystemSetting.mockResolvedValue(settings);
    expect(await loadSummaryAudioSettings()).toEqual(settings);
  });
  it('never exposes keys in the catalog', () => {
    vi.stubEnv('HUMAIN_VOICE_API_KEY', 'test-secret');
    const result = summaryAudioCatalog();
    expect(result.configured.humain).toBe(true);
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
});
