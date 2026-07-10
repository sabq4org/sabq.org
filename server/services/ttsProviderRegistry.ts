import { db } from '../db';
import { ttsUsageLogs } from '@shared/schema';
import { storage } from '../storage';
import type { TTSOptions, Voice } from './elevenlabs';
import { getElevenLabsService, ARABIC_NEWS_VOICES } from './elevenlabs';
import { getGoogleTTSService, GOOGLE_ARABIC_VOICES } from './googleTts';
import { getOpenAITTSService, OPENAI_VOICES, isOpenAIVoiceId } from './openaiTts';

export type TTSProviderName = 'openai' | 'elevenlabs' | 'google';

export interface TTSProvider {
  name: TTSProviderName;
  textToSpeech(opts: TTSOptions, timeoutMs?: number): Promise<Buffer>;
  getVoices(): Promise<Voice[]>;
  testVoice(voiceId?: string, sampleText?: string, voiceSettings?: TTSOptions['voiceSettings']): Promise<Buffer>;
  charLimit: number;
  // USD per 1M characters — used for cost estimation only.
  costPer1MChars: number;
}

export interface TtsSettings {
  primaryProvider: TTSProviderName;
  fallbackProviders: TTSProviderName[];
  defaultVoices: { ar?: string; en?: string; ur?: string };
  defaultTone?: string;
}

// ElevenLabs is the primary TTS path. Fallback chain:
// ElevenLabs → OpenAI → Google. Admins can override via /tts-settings.
export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  primaryProvider: 'elevenlabs',
  fallbackProviders: ['openai', 'google'],
  defaultVoices: {
    ar: 'G1HOkzin3NMwRHSq60UI',
    en: 'G1HOkzin3NMwRHSq60UI',
    ur: 'G1HOkzin3NMwRHSq60UI',
  },
};

export const SETTINGS_KEY = 'tts_settings';

export async function loadTtsSettings(): Promise<TtsSettings> {
  try {
    const stored = await storage.getSystemSetting(SETTINGS_KEY);
    if (!stored || typeof stored !== 'object') return { ...DEFAULT_TTS_SETTINGS };
    return {
      primaryProvider: (stored.primaryProvider as TTSProviderName) || DEFAULT_TTS_SETTINGS.primaryProvider,
      fallbackProviders: Array.isArray(stored.fallbackProviders)
        ? (stored.fallbackProviders as TTSProviderName[])
        : DEFAULT_TTS_SETTINGS.fallbackProviders,
      defaultVoices: { ...DEFAULT_TTS_SETTINGS.defaultVoices, ...(stored.defaultVoices || {}) },
      defaultTone: stored.defaultTone,
    };
  } catch (err) {
    console.error('[TTS Registry] Failed to load tts_settings, using defaults:', err);
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

export async function saveTtsSettings(settings: TtsSettings): Promise<void> {
  await storage.upsertSystemSetting(SETTINGS_KEY, settings, 'tts', false);
}

function buildOpenAIProvider(): TTSProvider | null {
  const svc = getOpenAITTSService();
  if (!svc) return null;
  return {
    name: 'openai',
    textToSpeech: (opts, timeoutMs) => svc.textToSpeech(opts, timeoutMs),
    getVoices: () => svc.getVoices(),
    testVoice: (voiceId, sampleText, voiceSettings) => svc.testVoice(voiceId, sampleText, voiceSettings),
    charLimit: 4000,
    costPer1MChars: 15.0,
  };
}

function buildElevenLabsProvider(): TTSProvider | null {
  const svc = getElevenLabsService();
  if (!svc) return null;
  return {
    name: 'elevenlabs',
    textToSpeech: (opts, timeoutMs) => svc.textToSpeech(opts, timeoutMs),
    getVoices: () => svc.getVoices(),
    testVoice: (voiceId, sampleText, voiceSettings) => svc.testVoice(voiceId, sampleText, voiceSettings),
    charLimit: 4000,
    costPer1MChars: 30.0,
  };
}

function buildGoogleProvider(): TTSProvider | null {
  const svc = getGoogleTTSService();
  if (!svc) return null;
  return {
    name: 'google',
    textToSpeech: (opts, timeoutMs) => svc.textToSpeech(opts, timeoutMs),
    getVoices: () => svc.getVoices(),
    testVoice: (voiceId, sampleText, voiceSettings) => svc.testVoice(voiceId, sampleText, voiceSettings),
    charLimit: 4500,
    costPer1MChars: 16.0,
  };
}

export function getProviderByName(name: TTSProviderName): TTSProvider | null {
  switch (name) {
    case 'openai': return buildOpenAIProvider();
    case 'elevenlabs': return buildElevenLabsProvider();
    case 'google': return buildGoogleProvider();
    default: return null;
  }
}

export function getAllConfiguredProviders(): TTSProvider[] {
  return [buildOpenAIProvider(), buildElevenLabsProvider(), buildGoogleProvider()]
    .filter((p): p is TTSProvider => p !== null);
}

/**
 * Resolve providers in priority order for a given newsletter.
 * Order:
 *   1. Newsletter-specific provider (metadata.ttsProvider) if configured.
 *   2. System primary provider.
 *   3. System fallbackProviders, in order.
 * Providers that aren't configured (no API key) are skipped silently.
 */
export async function resolveProvidersForNewsletter(
  newsletterMetadata?: Record<string, any> | null
): Promise<TTSProvider[]> {
  const settings = await loadTtsSettings();

  const order: TTSProviderName[] = [];
  const push = (n?: TTSProviderName | null) => {
    if (n && !order.includes(n)) order.push(n);
  };

  push(newsletterMetadata?.ttsProvider as TTSProviderName | undefined);
  push(settings.primaryProvider);
  for (const f of settings.fallbackProviders) push(f);

  // Legacy env override (kept for back-compat with existing deployments)
  const envOverride = (process.env.TTS_PROVIDER || '').toLowerCase() as TTSProviderName;
  if (envOverride === 'google' || envOverride === 'elevenlabs' || envOverride === 'openai') {
    // Move env override to the front (after newsletter-specific override).
    const idx = order.indexOf(envOverride);
    if (idx >= 0) order.splice(idx, 1);
    const insertAt = newsletterMetadata?.ttsProvider ? 1 : 0;
    order.splice(insertAt, 0, envOverride);
  }

  return order
    .map(getProviderByName)
    .filter((p): p is TTSProvider => p !== null);
}

/** Detect the provider that owns a given voice id (best-effort). */
export function detectProviderForVoice(voiceId: string | undefined | null): TTSProviderName | null {
  if (!voiceId) return null;
  if (voiceId.startsWith('ar-') || voiceId.startsWith('en-') || voiceId.startsWith('ur-')) return 'google';
  if (isOpenAIVoiceId(voiceId)) return 'openai';
  if (ARABIC_NEWS_VOICES.some(v => v.voice_id === voiceId)) return 'elevenlabs';
  // ElevenLabs IDs are typically 20+ alphanumeric chars (shared library + custom).
  if (/^[a-zA-Z0-9]{20,}$/.test(voiceId)) return 'elevenlabs';
  return null;
}

/**
 * Resolve a voice id usable by the given provider. If the requested voiceId
 * doesn't belong to this provider, returns the system default voice for the
 * provider/language, or undefined to let the provider use its own default.
 */
export async function resolveVoiceIdForProvider(
  provider: TTSProviderName,
  requestedVoiceId: string | undefined | null,
  language: 'ar' | 'en' | 'ur' = 'ar'
): Promise<string | undefined> {
  const owner = detectProviderForVoice(requestedVoiceId);
  if (owner === provider && requestedVoiceId) return requestedVoiceId;

  const settings = await loadTtsSettings();
  const fallback = settings.defaultVoices[language];
  if (fallback && detectProviderForVoice(fallback) === provider) return fallback;

  // Hard-coded sensible defaults per provider when no setting matches.
  if (provider === 'openai') return 'alloy';
  if (provider === 'elevenlabs') return 'yXEnnEln9armDCyhkXcA'; // Jeddawi Echo — Saudi radio
  if (provider === 'google') return 'ar-XA-Wavenet-C';
  return undefined;
}

export function getStaticVoicesForProvider(provider: TTSProviderName): Voice[] {
  switch (provider) {
    case 'openai': return OPENAI_VOICES;
    case 'elevenlabs': return ARABIC_NEWS_VOICES;
    case 'google': return GOOGLE_ARABIC_VOICES;
    default: return [];
  }
}

export interface UsageLogEntry {
  newsletterId?: string | null;
  provider: TTSProviderName;
  voiceId?: string | null;
  language?: string | null;
  charCount: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string | null;
}

export async function logTtsUsage(entry: UsageLogEntry): Promise<void> {
  try {
    const provider = getProviderByName(entry.provider);
    const cost = provider
      ? (entry.charCount / 1_000_000) * provider.costPer1MChars
      : 0;
    await db.insert(ttsUsageLogs).values({
      newsletterId: entry.newsletterId ?? null,
      provider: entry.provider,
      voiceId: entry.voiceId ?? null,
      language: entry.language ?? null,
      charCount: entry.charCount,
      durationMs: entry.durationMs,
      estimatedCostUsd: cost,
      success: entry.success,
      errorMessage: entry.errorMessage ?? null,
    });
  } catch (err) {
    console.error('[TTS Registry] Failed to log usage:', err);
  }
}
