import { z } from 'zod';
import { storage } from '../storage';
import { ARABIC_NEWS_VOICES } from './elevenlabs';

export const HUMAIN_NEWS_VOICES = [
  { id: 'cabd361b-cb91-4eb6-8d35-c8660bf82e7a', name: 'عبدالله', description: 'سعودي نجدي — رجل' },
  { id: '9bbc9620-a2ff-489b-b292-5007210f49ca', name: 'عبدالعزيز', description: 'سعودي نجدي — رجل' },
  { id: '42e38a63-849a-481a-b5bf-3c1b7a985de3', name: 'نورة', description: 'سعودية نجدية — امرأة' },
  { id: '19965876-8cd6-4b8c-9af4-35cbec69ff1d', name: 'سارة', description: 'سعودية نجدية — امرأة' },
] as const;

export const summaryAudioSettingsSchema = z.object({
  primaryProvider: z.enum(['humain', 'elevenlabs']),
  humainVoiceId: z.string().refine(id => HUMAIN_NEWS_VOICES.some(v => v.id === id), 'صوت HUMAIN غير صالح'),
  elevenlabsVoiceId: z.string().refine(id => ARABIC_NEWS_VOICES.some(v => v.voice_id === id), 'صوت ElevenLabs غير صالح'),
}).strict();
export type SummaryAudioSettings = z.infer<typeof summaryAudioSettingsSchema>;
export const SUMMARY_AUDIO_SETTINGS_KEY = 'summary_audio_settings';
export const DEFAULT_SUMMARY_AUDIO_SETTINGS: SummaryAudioSettings = {
  primaryProvider: 'humain',
  humainVoiceId: HUMAIN_NEWS_VOICES[0].id,
  elevenlabsVoiceId: 'MI88rOZjXbH22N8KHXUo',
};

export async function loadSummaryAudioSettings(): Promise<SummaryAudioSettings> {
  const stored = await storage.getSystemSetting(SUMMARY_AUDIO_SETTINGS_KEY);
  if (stored == null) {
    const envVoice = process.env.ELEVENLABS_NEWS_VOICE_ID;
    return { ...DEFAULT_SUMMARY_AUDIO_SETTINGS,
      ...(envVoice && ARABIC_NEWS_VOICES.some(v => v.voice_id === envVoice) ? { elevenlabsVoiceId: envVoice } : {}) };
  }
  // Failed reads/invalid saved data must not silently replace the administrator's choice.
  return summaryAudioSettingsSchema.parse(stored);
}

export async function saveSummaryAudioSettings(value: unknown): Promise<SummaryAudioSettings> {
  const settings = summaryAudioSettingsSchema.parse(value);
  await storage.upsertSystemSetting(SUMMARY_AUDIO_SETTINGS_KEY, settings, 'tts', false);
  return settings;
}

export function summaryAudioCatalog() {
  return {
    humainVoices: HUMAIN_NEWS_VOICES,
    elevenlabsVoices: ARABIC_NEWS_VOICES.map(v => ({ id: v.voice_id, name: v.name })),
    configured: {
      humain: Boolean(process.env.HUMAIN_VOICE_API_KEY?.trim()),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    },
  };
}
