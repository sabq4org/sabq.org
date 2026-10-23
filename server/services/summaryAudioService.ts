import { createHash } from 'node:crypto';
import { synthesizeHumain, isContentRejection } from './humainTts';
import { GEMINI_TTS_CONFIG_VERSION, GEMINI_TTS_VOICE, isGeminiContentRejection, synthesizeGemini } from './geminiTts';
import { getElevenLabsService, isElevenLabsQuotaCoolingDown } from './elevenlabs';
import { getGoogleTTSService } from './googleTts';
import { loadSummaryAudioSettings, type SummaryAudioSettings } from './summaryAudioSettings';
import { readStoredSummaryAudio, storeSummaryAudio } from './summaryAudioStore';

export type SummaryAudio = { buffer: Buffer; provider: 'gemini' | 'humain' | 'elevenlabs' | 'google'; contentType: 'audio/wav' | 'audio/mpeg' };
export const SUMMARY_AUDIO_SAMPLE = 'أهلاً بكم في موجز الأخبار من سبق. من الرياض، نتابع أبرز المستجدات المحلية، ونستعرض أهم الأخبار الاقتصادية والرياضية. قراءة واضحة، ومعلومة موثوقة، ومتابعة مستمرة على مدار الساعة.';
export type SummaryAudioResult = SummaryAudio & { cache: 'HIT' | 'MISS' | 'STORE' };
const cache = new Map<string, { audio: SummaryAudio; expires: number }>();
const pending = new Map<string, Promise<SummaryAudioResult>>();
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_SYNTHESES = 4;
const PRIMARY_TTL_MS = 86_400_000;
const FALLBACK_TTL_MS = 60_000;
let cacheBytes = 0;
let synthesizing = 0;
let humainUnavailableUntil = 0;
let geminiUnavailableUntil = 0;

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

function checkedGemini(buffer: Buffer): SummaryAudio {
  if (buffer.length < 44 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error('TTS_INVALID_AUDIO');
  }
  if (buffer.length > 16 * 1024 * 1024) throw new Error('TTS_INVALID_AUDIO');
  return { buffer, provider: 'gemini', contentType: 'audio/wav' };
}

function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.AI_INTEGRATIONS_GEMINI_API_KEY?.trim());
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
export async function previewSummaryVoice(provider: 'gemini' | 'humain' | 'elevenlabs', voiceId: string): Promise<SummaryAudio> {
  if (provider === 'gemini') {
    if (voiceId !== GEMINI_TTS_VOICE) throw new Error('GEMINI_INVALID_VOICE');
    return checkedGemini(await synthesizeGemini(SUMMARY_AUDIO_SAMPLE));
  }
  if (provider === 'humain') return checked(await synthesizeHumain(SUMMARY_AUDIO_SAMPLE, voiceId), 'humain');
  return elevenlabs(SUMMARY_AUDIO_SAMPLE, voiceId);
}

export type SummaryVoiceProvider = SummaryAudio['provider'];

function providerConfigured(provider: SummaryVoiceProvider): boolean {
  if (provider === 'gemini') return geminiConfigured();
  if (provider === 'humain') return Boolean(process.env.HUMAIN_VOICE_API_KEY?.trim());
  if (provider === 'elevenlabs') return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
  return Boolean(getGoogleTTSService());
}

/** The same provider order as article summaries, keeping only providers with a key. */
export function summaryVoiceOrder(settings: SummaryAudioSettings): SummaryVoiceProvider[] {
  const order: SummaryVoiceProvider[] = settings.primaryProvider === 'gemini'
    ? ['gemini', 'humain', 'elevenlabs', 'google']
    : settings.primaryProvider === 'humain' ? ['humain', 'elevenlabs', 'google'] : ['elevenlabs', 'google'];
  return order.filter(providerConfigured);
}

/**
 * One provider, no fallback: multi-part audio (the news bulletin) must keep a single
 * voice, so the caller restarts the whole job on the next provider instead.
 */
export async function synthesizeWithSummaryVoice(provider: SummaryVoiceProvider, text: string, settings: SummaryAudioSettings): Promise<SummaryAudio> {
  if (provider === 'gemini') return checkedGemini(await synthesizeGemini(text, 60_000));
  if (provider === 'humain') return checked(await synthesizeHumain(text, settings.humainVoiceId), 'humain');
  if (provider === 'elevenlabs') return elevenlabs(text, settings.elevenlabsVoiceId);
  const google = getGoogleTTSService();
  if (!google) throw new Error('GOOGLE_NOT_CONFIGURED');
  return checked(await withDeadline(google.textToSpeech({ text, voiceId: 'ar-XA-Wavenet-C', language: 'ar',
    voiceSettings: { stability: 0.6, speed: 1.0 } }, 15_000, false), 16_000), 'google');
}

/** One attempt behind the provider's one-minute outage breaker; null when it is skipped or fails. */
async function attemptGemini(text: string, next: string): Promise<SummaryAudio | null> {
  if (Date.now() < geminiUnavailableUntil || !geminiConfigured()) return null;
  try {
    return checkedGemini(await synthesizeGemini(text));
  } catch (error) {
    if (isGeminiContentRejection(error)) throw error;
    geminiUnavailableUntil = Date.now() + 60_000;
    console.warn(`[summary-audio] Gemini unavailable; ${next}`);
    return null;
  }
}

async function attemptHumain(text: string, voiceId: string, next: string): Promise<SummaryAudio | null> {
  if (Date.now() < humainUnavailableUntil || !process.env.HUMAIN_VOICE_API_KEY?.trim()) return null;
  try {
    return checked(await synthesizeHumain(text, voiceId), 'humain');
  } catch (error) {
    if (isContentRejection(error)) throw error;
    humainUnavailableUntil = Date.now() + 60_000;
    console.warn(`[summary-audio] HUMAIN unavailable; ${next}`);
    return null;
  }
}

export async function generateSummaryAudio(text: string, settings: SummaryAudioSettings): Promise<SummaryAudio> {
  if (settings.primaryProvider === 'gemini') {
    const audio = await attemptGemini(text, 'trying HUMAIN');
    if (audio) return audio;
  }
  if (settings.primaryProvider === 'gemini' || settings.primaryProvider === 'humain') {
    const audio = await attemptHumain(text, settings.humainVoiceId, 'trying ElevenLabs');
    if (audio) return audio;
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

/**
 * The primary voice alone, for a text that already has a fallback clip: free while
 * the primary is down (its breaker skips it), and the fallback is never paid twice.
 * Content rejections still propagate, as in the full chain.
 */
async function attemptPrimary(text: string, settings: SummaryAudioSettings): Promise<SummaryAudio | null> {
  if (settings.primaryProvider === 'gemini') return attemptGemini(text, 'keeping the fallback clip');
  if (settings.primaryProvider === 'humain') return attemptHumain(text, settings.humainVoiceId, 'keeping the fallback clip');
  try { return await elevenlabs(text, settings.elevenlabsVoiceId); }
  catch { return null; }
}

/** Bump `summary-vN` when a change should re-voice clips already kept in R2 (they never expire). */
export function summaryAudioCacheKey(articleId: string, text: string, settings: SummaryAudioSettings): string {
  return createHash('sha256').update(JSON.stringify(['summary-v5', GEMINI_TTS_CONFIG_VERSION, articleId, text, settings])).digest('hex');
}

export type SummaryAudioOptions = {
  /** Keep a durable copy in R2: published articles only. */
  persist?: boolean;
  /** Asked before paying for a clip that exists nowhere yet; false refuses with TTS_RATE_LIMITED. */
  takeSynthesisSlot?: () => boolean;
};

function remember(key: string, audio: SummaryAudio, ttl: number): void {
  for (const [oldKey, entry] of cache) {
    if (entry.expires <= Date.now() || oldKey === key || cacheBytes + audio.buffer.length > MAX_CACHE_BYTES) {
      cache.delete(oldKey); cacheBytes -= entry.audio.buffer.length;
    }
  }
  cache.set(key, { audio, expires: Date.now() + ttl }); cacheBytes += audio.buffer.length;
}

/** Counts toward the four concurrent provider calls per replica (TTS_BUSY beyond). */
async function synthesize<T>(task: () => Promise<T>): Promise<T> {
  synthesizing += 1;
  try { return await task(); } finally { synthesizing -= 1; }
}

function keep(key: string, audio: SummaryAudio, settings: SummaryAudioSettings, options: SummaryAudioOptions): SummaryAudioResult {
  // Recover the preferred provider after an outage rather than pinning fallback for a day.
  remember(key, audio, audio.provider === settings.primaryProvider ? PRIMARY_TTL_MS : FALLBACK_TTL_MS);
  if (options.persist) storeSummaryAudio(key, audio);
  return { ...audio, cache: 'MISS' };
}

/**
 * Memory missed: R2 (or an expired memory copy) first, then the primary voice for a
 * fallback clip, and only a clip that exists nowhere is paid for through the chain.
 */
async function resolveSummaryAudio(key: string, text: string, settings: SummaryAudioSettings, expired: SummaryAudio | undefined, options: SummaryAudioOptions): Promise<SummaryAudioResult> {
  const stored = await readStoredSummaryAudio(key);
  const known = stored ?? expired;
  const label = stored ? 'STORE' : 'HIT';
  if (known?.provider === settings.primaryProvider) {
    remember(key, known, PRIMARY_TTL_MS);
    // A draft voiced before publishing, or a lost write: copy it now instead of paying again.
    if (!stored && options.persist) storeSummaryAudio(key, known);
    return { ...known, cache: label };
  }
  if (known) {
    const upgraded = synthesizing < MAX_SYNTHESES ? await synthesize(() => attemptPrimary(text, settings)) : null;
    if (upgraded) return keep(key, upgraded, settings, options);
    remember(key, known, FALLBACK_TTL_MS);
    return { ...known, cache: label };
  }
  if (synthesizing >= MAX_SYNTHESES) throw new Error('TTS_BUSY');
  if (options.takeSynthesisSlot && !options.takeSynthesisSlot()) throw new Error('TTS_RATE_LIMITED');
  return keep(key, await synthesize(() => generateSummaryAudio(text, settings)), settings, options);
}

/** Shared by all existing web/iOS/Android article and opinion audio consumers. */
export async function getSummaryAudio(articleId: string, text: string, options: SummaryAudioOptions = {}): Promise<SummaryAudioResult> {
  const settings = await loadSummaryAudioSettings();
  const key = summaryAudioCacheKey(articleId, text, settings);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return { ...cached.audio, cache: 'HIT' };
  let task = pending.get(key);
  if (!task) {
    task = resolveSummaryAudio(key, text, settings, cached?.audio, options).finally(() => pending.delete(key));
    pending.set(key, task);
  }
  return task;
}
