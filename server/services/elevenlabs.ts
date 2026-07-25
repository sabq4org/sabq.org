import { Readable } from 'stream';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import { normalizeTextForTts } from '../utils/arabicTtsNormalize';

export interface TTSOptions {
  text: string;
  voiceId?: string;
  model?: string;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    speed?: number;
  };
  /** Optional natural-language tone instructions (used by OpenAI gpt-4o-mini-tts). */
  instructions?: string;
  /** Language hint for Arabic number verbalization before synthesis. */
  language?: 'ar' | 'en' | 'ur';
}

export interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
  category?: string;
  labels?: Record<string, string>;
  description?: string;
  gender?: string;
  accent?: string;
  age?: string;
  use_case?: string;
  /** Highlighted in admin UI as a top pick for Sabq. */
  recommended?: boolean;
}

// Curated Arabic voices for news broadcasting — Saudi/Gulf first, then MSA.
// Shared-library IDs work for TTS on Creator+ without adding to My Voices.
export const ARABIC_NEWS_VOICES = [
  // ⭐ Saudi — primary for Sabq audience
  {
    voice_id: 'yXEnnEln9armDCyhkXcA',
    name: 'صوت جدة الإذاعي — Jeddawi Echo',
    gender: 'male',
    accent: 'saudi',
    age: 'young',
    use_case: 'formal_news',
    description: 'صوت سعودي عميق وواثق من جدة — مثالي للنشرات والإعلانات والبودكاست',
    recommended: true,
  },
  {
    voice_id: 'usjDi9nBY6UHvtKrL4ba',
    name: 'عبدالله — راوي سعودي',
    gender: 'male',
    accent: 'saudi',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت رجالي سعودي دافئ وواضح — مناسب للسرد والبودكاست والأخبار',
    recommended: true,
  },
  {
    voice_id: 'MI88rOZjXbH22N8KHXUo',
    name: 'علي — راوي سعودي عميق',
    gender: 'male',
    accent: 'saudi',
    age: 'middle_aged',
    use_case: 'narration',
    description: 'صوت رجالي عربي هادئ ورنّان بنبرة سعودية ثابتة وواضحة',
    recommended: true,
  },
  {
    voice_id: '3nav5pHC1EYvWOd5LmnA',
    name: 'سعود — رسمي وواضح',
    gender: 'male',
    accent: 'saudi',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت عميق ورسمي يوحي بالثقة — مناسب للنشرات الجادة',
    recommended: true,
  },
  {
    voice_id: 'cFUFIbKkO2iZFwS8cRnY',
    name: 'ناصر الجبيلي — سعودي احترافي',
    gender: 'male',
    accent: 'saudi',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت خليجي «لهجة بيضاء» متوازن بين الدفء والاحترافية',
  },
  {
    voice_id: 'oJCdZCYaJobw2GlrIQm5',
    name: 'ماجد — ثابت ودقيق',
    gender: 'male',
    accent: 'saudi',
    age: 'young',
    use_case: 'informative',
    description: 'صوت سعودي نجدي هادئ ودقيق — مناسب للمحتوى التعليمي والتوضيحي',
  },
  {
    voice_id: 'OoE8swS3hImZANNOodf6',
    name: 'علي أحمد — لهجة سعودية أصيلة',
    gender: 'male',
    accent: 'saudi',
    age: 'middle_aged',
    use_case: 'storytelling',
    description: 'صوت سعودي طبيعي بلهجة محلية أصيلة',
  },
  {
    voice_id: 'IK7YYZcSpmlkjKrQxbSn',
    name: 'رائد — صوت سعودي أصيل',
    gender: 'male',
    accent: 'saudi',
    age: 'mature',
    use_case: 'storytelling',
    description: 'صوت سعودي رجالي ناضج بلهجة خليجية أصيلة',
  },
  {
    voice_id: '5Spsi3mCH9e7futpnGE5',
    name: 'فارس — مذيع أخبار خليجي',
    gender: 'male',
    accent: 'gulf',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت خليجي واضح ومتوازن — مثالي للنشرات الإخبارية',
  },
  {
    voice_id: 'aMmeBf0lzDYlouyfqNjh',
    name: 'مريم — سعودية هادئة ودافئة',
    gender: 'female',
    accent: 'saudi',
    age: 'middle_aged',
    use_case: 'narration',
    description: 'صوت نسائي سعودي ناعم من المنطقة الشرقية — دافئ ومعبّر',
    recommended: true,
  },
  {
    voice_id: 'TbzNVcMOFmKd8tUT5liY',
    name: 'مصطفى عبدالله — خليجي',
    gender: 'male',
    accent: 'gulf',
    age: 'middle_aged',
    use_case: 'storytelling',
    description: 'راوٍ عربي هادئ بلهجة خليجية تمزج الكويتي والسعودي',
  },
  {
    voice_id: 'G1QUjBCuRBbLbAmYlTgl',
    name: 'أبو سالم — كويتي احترافي',
    gender: 'male',
    accent: 'gulf',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت كويتي قوي وواضح للتعليق الإخباري والوثائقيات',
  },
  // Modern Standard Arabic — professional news
  {
    voice_id: 'xvhpbk8otnNHtT3fjCpr',
    name: 'عمر — فصحى احترافية',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت رجالي عربي دافئ بفصحى حديثة مع لمسة سعودية خفيفة',
    recommended: true,
  },
  {
    voice_id: 'G1HOkzin3NMwRHSq60UI',
    name: 'شوقي — مذيع إذاعي',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت عميق وواضح بلكنة عربية محايدة — مثالي للوثائقيات والأخبار',
  },
  {
    voice_id: 'beZRlJoDAXQuY5EaPgHK',
    name: 'دارشو — فصحى ملكية',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'narration',
    description: 'صوت عميق ورنّان بفصحى فخمة — مناسب للسرد الوثائقي',
  },
  {
    voice_id: 'QRq5hPRAKf5ZhSlTBH6r',
    name: 'يحيى — دافئ ومعبّر',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'narration',
    description: 'صوت رجالي عربي دافئ ومعبّر — مناسب للأخبار والبودكاست',
  },
  {
    voice_id: 'kERwN6X2cY8g1XbfzJsX',
    name: 'مراد سامي — قارئ أخبار',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'news_reading',
    description: 'صوت هادئ مثالي لقراءة الأخبار والكتب والمقالات',
  },
  {
    voice_id: 'VwC51uc4PUblWEJSPzeo',
    name: 'أبرار صباح — مذيعة أخبار',
    gender: 'female',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت نسائي عربي واضح — مثالي للبودكاست والإعلانات والأخبار',
  },
  {
    voice_id: 'mRdG9GYEjJmIzqbYTidv',
    name: 'سناء — هادئة وصادقة',
    gender: 'female',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'narration',
    description: 'صوت نسائي عربي ناعم وصادق — من أكثر الأصوات استخداماً',
    recommended: true,
  },
  {
    voice_id: 'w4LX7bK479eHGM1k15Em',
    name: 'حبيبة — واضحة ودافئة',
    gender: 'female',
    accent: 'msa',
    age: 'young',
    use_case: 'formal_news',
    description: 'صوت نسائي شاب دافئ وواضح — مناسب للنشرات والقصص',
  },
  {
    voice_id: 'u0TsaWvt0v8migutHM3M',
    name: 'غزلان — صوت هادئ',
    gender: 'female',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'podcast',
    description: 'صوت ناعم ومتوازن وهادئ — مناسب للبودكاست والسرد',
  },
];

/** بعد نفاد الرصيد نتخطّى ElevenLabs لفترة بدل إعادة المحاولة في كل طلب صوت. */
const ELEVENLABS_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let elevenLabsQuotaCooldownUntil = 0;

export function isElevenLabsQuotaCoolingDown(): boolean {
  return Date.now() < elevenLabsQuotaCooldownUntil;
}

export function isElevenLabsQuotaError(error: unknown): boolean {
  const status = (error as any)?.status ?? (error as any)?.statusCode;
  if (status === 401 || status === 402) return true;
  const msg = String((error as any)?.message || error || "").toLowerCase();
  return (
    msg.includes("quota_exceeded") ||
    msg.includes("quota") ||
    msg.includes("payment_required") ||
    msg.includes("out of credits") ||
    msg.includes("insufficient credits")
  );
}

function armElevenLabsQuotaCooldown(reason: string): void {
  elevenLabsQuotaCooldownUntil = Date.now() + ELEVENLABS_QUOTA_COOLDOWN_MS;
  console.warn(
    `[ElevenLabs] quota cooldown ${ELEVENLABS_QUOTA_COOLDOWN_MS}ms — skipping provider: ${reason.slice(0, 160)}`,
  );
}

export class ElevenLabsService {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';
  
  // Voice Configuration for Arabic News Broadcasting
  // Jeddawi Echo — deep confident Saudi male from Jeddah
  private defaultVoiceId = 'yXEnnEln9armDCyhkXcA';
  
  // Optimized voice settings for smooth, professional news delivery
  // Higher stability = smoother flow without choppy pauses
  private defaultVoiceSettings = {
    stability: 0.75,           // High stability for smooth continuous delivery
    similarity_boost: 0.75,    // Good voice matching while allowing natural flow
    style: 0.30,               // Lower style for formal news reading without drama
    use_speaker_boost: true    // Enhances clarity and reduces artifacts
  };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async textToSpeech(options: TTSOptions, timeoutMs: number = 30000): Promise<Buffer> {
    if (isElevenLabsQuotaCoolingDown()) {
      const err: any = new Error('quota_exceeded: ElevenLabs cooling down after payment/quota failure');
      err.status = 402;
      throw err;
    }
    return retryWithBackoff(
      () => this._textToSpeechRequest(options, timeoutMs),
      'ElevenLabs TTS',
      {
        maxRetries: 3,
        baseDelay: 2000,
        // نفاد الرصيد/الدفع ليس عابراً — إعادة المحاولة تضاعف التأخير بلا فائدة.
        retryOn: (error) => {
          if (isElevenLabsQuotaError(error)) return false;
          const status = error?.status || error?.statusCode;
          if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
          const msg = (error?.message || '').toLowerCase();
          return (
            msg.includes('rate limit') ||
            msg.includes('timeout') ||
            msg.includes('econnreset') ||
            msg.includes('socket hang up') ||
            msg.includes('network') ||
            msg.includes('fetch failed')
          );
        },
      },
    );
  }

  private async _textToSpeechRequest(options: TTSOptions, timeoutMs: number): Promise<Buffer> {
    const voiceId = options.voiceId || this.defaultVoiceId;
    const model = options.model || 'eleven_multilingual_v2';
    // Leaf-level تفقيط so direct callers (summary-audio, job queue) get spoken numbers.
    const text = normalizeTextForTts(options.text, { language: options.language ?? 'auto' });
    
    const url = `${this.baseUrl}/text-to-speech/${voiceId}`;
    
    const requestBody = {
      text,
      model_id: model,
      voice_settings: options.voiceSettings || this.defaultVoiceSettings
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const err: any = new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
        err.status = response.status;
        if (isElevenLabsQuotaError(err) || response.status === 401 || response.status === 402) {
          armElevenLabsQuotaCooldown(`${response.status}: ${errorText.slice(0, 120)}`);
          err.message = `quota_exceeded: ${err.message}`;
        }
        throw err;
      }

      const audioBuffer = await response.arrayBuffer();
      return Buffer.from(audioBuffer);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout: ElevenLabs API did not respond within ${timeoutMs}ms`);
      }
      
      throw error;
    }
  }

  async getVoices(): Promise<Voice[]> {
    try {
      // Return curated Arabic voices instead of fetching all voices
      return ARABIC_NEWS_VOICES;
    } catch (error) {
      console.error('ElevenLabs get voices error:', error);
      throw new Error(`Failed to fetch voices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Test voice with sample text
  async testVoice(
    voiceId?: string,
    sampleText: string = 'مرحباً، هذا اختبار للصوت. سنقرأ لكم أهم الأخبار اليوم.',
    voiceSettings?: {
      stability?: number;
      similarity_boost?: number;
      style?: number;
      use_speaker_boost?: boolean;
      speed?: number;
    }
  ): Promise<Buffer> {
    return this.textToSpeech({
      text: sampleText,
      voiceId,
      model: 'eleven_flash_v2_5', // Use Flash v2.5 for faster preview
      voiceSettings: voiceSettings || this.defaultVoiceSettings
    }, 15000); // 15 second timeout for preview
  }

  async getVoiceById(voiceId: string): Promise<Voice | null> {
    try {
      const response = await fetch(`${this.baseUrl}/voices/${voiceId}`, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch voice: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('ElevenLabs get voice error:', error);
      throw new Error(`Failed to fetch voice: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  buildNewsletterScript(newsletterData: {
    title: string;
    description?: string;
    articles: Array<{
      title: string;
      excerpt?: string;
      aiSummary?: string;
    }>;
  }): string {
    const parts: string[] = [];
    
    // Introduction
    parts.push(`مرحباً بكم في ${newsletterData.title}.`);
    
    if (newsletterData.description) {
      parts.push(newsletterData.description);
    }
    
    // Articles
    newsletterData.articles.forEach((article, index) => {
      parts.push(`\n\nالخبر ${index + 1}: ${article.title}.`);
      
      const content = article.aiSummary || article.excerpt;
      if (content) {
        parts.push(content);
      }
    });
    
    // Closing
    parts.push('\n\nشكراً لاستماعكم إلى نشرة سبق الذكية.');
    
    return parts.join(' ');
  }

  // ==========================================
  // Voice Cloning API
  // ==========================================
  
  async cloneVoice(options: {
    name: string;
    description?: string;
    files: Buffer[];
    labels?: Record<string, string>;
  }): Promise<{ voice_id: string; name: string }> {
    const formData = new FormData();
    formData.append('name', options.name);
    
    if (options.description) {
      formData.append('description', options.description);
    }
    
    // Add labels as JSON
    if (options.labels) {
      formData.append('labels', JSON.stringify(options.labels));
    }
    
    // Add audio files
    options.files.forEach((file, index) => {
      // TS 6+: Buffer<ArrayBufferLike> is not a BlobPart; wrap as Uint8Array.
      const blob = new Blob([new Uint8Array(file)], { type: 'audio/mpeg' });
      formData.append('files', blob, `sample_${index}.mp3`);
    });

    try {
      const response = await fetch(`${this.baseUrl}/voices/add`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voice cloning failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[ElevenLabs] ✅ Voice cloned successfully: ${result.voice_id}`);
      return result;
    } catch (error) {
      console.error('[ElevenLabs] ❌ Voice cloning error:', error);
      throw error;
    }
  }

  async deleteVoice(voiceId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/voices/${voiceId}`, {
        method: 'DELETE',
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete voice: ${response.status}`);
      }

      console.log(`[ElevenLabs] ✅ Voice deleted: ${voiceId}`);
      return true;
    } catch (error) {
      console.error('[ElevenLabs] ❌ Voice deletion error:', error);
      return false;
    }
  }

  async listAllVoices(): Promise<Voice[]> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data = await response.json();
      return data.voices || [];
    } catch (error) {
      console.error('[ElevenLabs] ❌ List voices error:', error);
      throw error;
    }
  }

  // ==========================================
  // Speech to Text API
  // ==========================================
  
  async speechToText(options: {
    file: Buffer;
    languageCode?: string;
    diarize?: boolean;
    tagAudioEvents?: boolean;
  }): Promise<SpeechToTextResult> {
    const formData = new FormData();
    
    const blob = new Blob([new Uint8Array(options.file)], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');
    formData.append('model_id', 'scribe_v1');
    
    if (options.languageCode) {
      formData.append('language_code', options.languageCode);
    }
    
    if (options.diarize !== undefined) {
      formData.append('diarize', String(options.diarize));
    }
    
    if (options.tagAudioEvents !== undefined) {
      formData.append('tag_audio_events', String(options.tagAudioEvents));
    }

    try {
      console.log('[ElevenLabs] 🎤 Starting speech-to-text transcription...');
      
      const response = await fetch(`${this.baseUrl}/speech-to-text`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Speech-to-text failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[ElevenLabs] ✅ Transcription complete: ${result.text?.substring(0, 100)}...`);
      
      return {
        text: result.text || '',
        words: result.words || [],
        speakers: result.speakers || [],
        languageCode: result.language_code || options.languageCode || 'ara',
        audioEvents: result.audio_events || []
      };
    } catch (error) {
      console.error('[ElevenLabs] ❌ Speech-to-text error:', error);
      throw error;
    }
  }
}

// Speech to text result interface
export interface SpeechToTextResult {
  text: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    speaker?: string;
  }>;
  speakers: Array<{
    speaker: string;
    start: number;
    end: number;
  }>;
  languageCode: string;
  audioEvents: Array<{
    type: string;
    start: number;
    end: number;
  }>;
}

// Export singleton instance
let elevenLabsInstance: ElevenLabsService | null = null;

export function getElevenLabsService(): ElevenLabsService | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey || apiKey.trim() === '') {
    console.warn('⚠️ ELEVENLABS_API_KEY not set - Audio newsletter features disabled');
    return null;
  }
  
  if (!elevenLabsInstance) {
    elevenLabsInstance = new ElevenLabsService(apiKey);
  }
  
  return elevenLabsInstance;
}

export function isElevenLabsConfigured(): boolean {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  return !!(apiKey && apiKey.trim() !== '');
}
