import OpenAI from 'openai';
import type { SpeechCreateParams } from 'openai/resources/audio/speech';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import type { TTSOptions, Voice } from './elevenlabs';

// OpenAI TTS voices — available across openai gpt-audio-mini / gpt-4o-mini-tts.
// All voices support multilingual content including Arabic.
export const OPENAI_VOICES: Voice[] = [
  { voice_id: 'alloy', name: 'Alloy — صوت محايد', gender: 'neutral', accent: 'multilingual', use_case: 'narration', description: 'صوت متوازن واضح، مناسب لقراءة الأخبار والمحتوى العام' },
  { voice_id: 'ash', name: 'Ash — صوت ذكوري دافئ', gender: 'male', accent: 'multilingual', use_case: 'storytelling', description: 'صوت ذكوري عميق مناسب للسرد والتحليل' },
  { voice_id: 'ballad', name: 'Ballad — صوت ذكوري هادئ', gender: 'male', accent: 'multilingual', use_case: 'podcast', description: 'صوت ذكوري ناعم بطابع روائي' },
  { voice_id: 'coral', name: 'Coral — صوت أنثوي حيوي', gender: 'female', accent: 'multilingual', use_case: 'morning_shows', description: 'صوت أنثوي مفعم بالحيوية مناسب للنشرات الصباحية' },
  { voice_id: 'echo', name: 'Echo — صوت ذكوري متوازن', gender: 'male', accent: 'multilingual', use_case: 'formal_news', description: 'صوت ذكوري واضح للنشرات الإخبارية الرسمية' },
  { voice_id: 'fable', name: 'Fable — صوت ذكوري بريطاني', gender: 'male', accent: 'multilingual', use_case: 'narration', description: 'صوت ذكوري بطابع بريطاني هادئ' },
  { voice_id: 'onyx', name: 'Onyx — صوت ذكوري عميق', gender: 'male', accent: 'multilingual', use_case: 'formal_news', description: 'صوت ذكوري قوي وعميق للأخبار الرسمية والوثائقيات' },
  { voice_id: 'nova', name: 'Nova — صوت أنثوي احترافي', gender: 'female', accent: 'multilingual', use_case: 'formal_news', description: 'صوت أنثوي واضح ومحترف للأخبار' },
  { voice_id: 'sage', name: 'Sage — صوت أنثوي حكيم', gender: 'female', accent: 'multilingual', use_case: 'narration', description: 'صوت أنثوي ناضج للسرد والتحليل' },
  { voice_id: 'shimmer', name: 'Shimmer — صوت أنثوي ناعم', gender: 'female', accent: 'multilingual', use_case: 'podcast', description: 'صوت أنثوي ناعم وحيوي مناسب للبودكاست' },
  { voice_id: 'verse', name: 'Verse — صوت ذكوري معبّر', gender: 'male', accent: 'multilingual', use_case: 'storytelling', description: 'صوت ذكوري معبّر مناسب للسرد التفاعلي' },
];

const VALID_VOICE_IDS = new Set(OPENAI_VOICES.map(v => v.voice_id));

export class OpenAITTSService {
  private client: OpenAI;
  // Default model — gpt-4o-mini-tts is the current production OpenAI TTS model
  // (the requested gpt-audio-mini / gpt-realtime-mini map to this TTS endpoint).
  private defaultModel = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
  private defaultVoiceId = 'alloy';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async textToSpeech(options: TTSOptions, timeoutMs: number = 30000): Promise<Buffer> {
    return retryWithBackoff(
      () => this._synthesize(options, timeoutMs),
      'OpenAI TTS',
      { maxRetries: 3, baseDelay: 2000 }
    );
  }

  private async _synthesize(options: TTSOptions, timeoutMs: number): Promise<Buffer> {
    const requestedVoice = options.voiceId || this.defaultVoiceId;
    const voice = VALID_VOICE_IDS.has(requestedVoice) ? requestedVoice : this.defaultVoiceId;
    const model = options.model || this.defaultModel;

    // Optional natural-language tone instructions (gpt-4o-mini-tts only).
    const instructions = options.instructions;
    const speed = options.voiceSettings?.speed ?? 1.0;

    const params: SpeechCreateParams = {
      model,
      voice,
      input: options.text,
      response_format: 'mp3',
      speed,
      ...(instructions ? { instructions } : {}),
    };

    const synthesizePromise = this.client.audio.speech.create(params);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`OpenAI TTS timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    const response = await Promise.race([synthesizePromise, timeoutPromise]);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getVoices(): Promise<Voice[]> {
    return OPENAI_VOICES;
  }

  async testVoice(
    voiceId?: string,
    sampleText: string = 'مرحباً، هذا اختبار للصوت. سنقرأ لكم أهم الأخبار اليوم.',
    voiceSettings?: TTSOptions['voiceSettings']
  ): Promise<Buffer> {
    return this.textToSpeech({ text: sampleText, voiceId, voiceSettings }, 15000);
  }
}

let openaiTtsInstance: OpenAITTSService | null = null;

export function getOpenAITTSService(): OpenAITTSService | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  if (!openaiTtsInstance) {
    openaiTtsInstance = new OpenAITTSService(apiKey);
    console.log('✅ OpenAI TTS service initialized');
  }
  return openaiTtsInstance;
}

export function isOpenAITTSConfigured(): boolean {
  const apiKey = process.env.OPENAI_API_KEY;
  return !!(apiKey && apiKey.trim() !== '');
}

export function isOpenAIVoiceId(id: string | undefined | null): boolean {
  return !!id && VALID_VOICE_IDS.has(id);
}
