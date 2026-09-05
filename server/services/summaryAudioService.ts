import { createHash } from 'node:crypto';
import { synthesizeHumain, isContentRejection } from './humainTts';
import { getElevenLabsService, isElevenLabsQuotaCoolingDown } from './elevenlabs';
import { getGoogleTTSService } from './googleTts';
import { loadSummaryAudioSettings, type SummaryAudioSettings } from './summaryAudioSettings';

export type SummaryAudio = { buffer: Buffer; provider: 'humain' | 'elevenlabs' | 'google'; contentType: 'audio/wav' | 'audio/mpeg' };
export const SUMMARY_AUDIO_SAMPLE = 'أهلاً بكم في موجز الأخبار من سبق. من الرياض، نتابع أبرز المستجدات المحلية، ونستعرض أهم الأخبار الاقتصادية والرياضية. قراءة واضحة، ومعلومة موثوقة، ومتابعة مستمرة على مدار الساعة.';
const cache = new Map<string, { audio: SummaryAudio; expires: number }>();
const pending = new Map<string, Promise<SummaryAudio>>();
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
let cacheBytes = 0;
let humainUnavailableUntil = 0;

async function withDeadline<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TTS_DEADLINE_EXCEEDED')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
function checked(buffer: Buffer, provider: SummaryAudio['provider']): SummaryAudio {
  if (!buffer.length || buffer.length > 16 * 1024 * 1024) throw new Error('TTS_INVALID_AUDIO');
  return { buffer, provider, contentType: provider === 'humain' ? 'audio/wav' : 'audio/mpeg' };
}

async function elevenlabs(text: string, voiceId: string): Promise<SummaryAudio> {
  if (isElevenLabsQuotaCoolingDown()) throw new Error('ELEVENLABS_UNAVAILABLE');
  const service = getElevenLabsService();
  if (!service) throw new Error('ELEVENLABS_NOT_CONFIGURED');
  return checked(await withDeadline(service.textToSpeech({
    text, voiceId, model: 'eleven_multilingual_v2', language: 'ar',
    voiceSettings: { stability: 0.50, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true, speed: 0.95 },
  }, 20_000, false), 21_000), 'elevenlabs');
}

/** Preview must play exactly the requested voice; never conceal failure with fallback. */
export async function previewSummaryVoice(provider: 'humain' | 'elevenlabs', voiceId: string): Promise<SummaryAudio> {
  if (provider === 'humain') return checked(await synthesizeHumain(SUMMARY_AUDIO_SAMPLE, voiceId), 'humain');
  return elevenlabs(SUMMARY_AUDIO_SAMPLE, voiceId);
}

export async function generateSummaryAudio(text: string, settings: SummaryAudioSettings): Promise<SummaryAudio> {
  if (settings.primaryProvider === 'humain' && Date.now() >= humainUnavailableUntil && process.env.HUMAIN_VOICE_API_KEY?.trim()) {
    try {
      return checked(await synthesizeHumain(text, settings.humainVoiceId), 'humain');
    } catch (error) {
      if (isContentRejection(error)) throw error;
      humainUnavailableUntil = Date.now() + 60_000;
      console.warn('[summary-audio] HUMAIN unavailable; trying ElevenLabs');
    }
  }
  try { return await elevenlabs(text, settings.elevenlabsVoiceId); }
  catch {
    console.warn('[summary-audio] ElevenLabs unavailable; trying Google');
  }
  const google = getGoogleTTSService();
  if (!google) throw new Error('NO_TTS_PROVIDER_AVAILABLE');
  return checked(await withDeadline(google.textToSpeech({ text, voiceId: 'ar-XA-Wavenet-C', language: 'ar',
    voiceSettings: { stability: 0.6, speed: 1.0 } }, 15_000, false), 16_000), 'google');
}

export function summaryAudioCacheKey(articleId: string, text: string, settings: SummaryAudioSettings): string {
  return createHash('sha256').update(JSON.stringify(['summary-v4', articleId, text, settings])).digest('hex');
}

/** Shared by all existing web/iOS/Android article and opinion audio consumers. */
export async function getSummaryAudio(articleId: string, text: string): Promise<SummaryAudio & { cache: 'HIT' | 'MISS' }> {
  const settings = await loadSummaryAudioSettings();
  const key = summaryAudioCacheKey(articleId, text, settings);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return { ...cached.audio, cache: 'HIT' };
  let task = pending.get(key);
  if (!task) {
    if (pending.size >= 4) throw new Error('TTS_BUSY');
    task = generateSummaryAudio(text, settings).then(audio => {
      for (const [oldKey, entry] of cache) {
        if (entry.expires <= Date.now() || oldKey === key || cacheBytes + audio.buffer.length > MAX_CACHE_BYTES) {
          cache.delete(oldKey); cacheBytes -= entry.audio.buffer.length;
        }
      }
      // Recover the preferred provider after an outage rather than pinning fallback for a day.
      const ttl = audio.provider === settings.primaryProvider ? 86_400_000 : 60_000;
      cache.set(key, { audio, expires: Date.now() + ttl }); cacheBytes += audio.buffer.length;
      return audio;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
  }
  return { ...await task, cache: 'MISS' };
}
