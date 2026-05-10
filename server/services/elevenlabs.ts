import { Readable } from 'stream';
import { retryWithBackoff } from '../utils/retryWithBackoff';

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
}

// Curated Arabic voices for news broadcasting - Saudi/Gulf accent priority
export const ARABIC_NEWS_VOICES = [
  // ⭐ Saudi/Gulf Voices - Primary for Saudi audience
  {
    voice_id: '5Spsi3mCH9e7futpnGE5',
    name: 'فارس - مذيع أخبار خليجي',
    gender: 'male',
    accent: 'gulf',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت خليجي واضح ومتوازن، يتميز بالدفء والاحترافية - مثالي للنشرات الإخبارية'
  },
  {
    voice_id: 'IK7YYZcSpmlkjKrQxbSn',
    name: 'رائد - صوت سعودي أصيل',
    gender: 'male',
    accent: 'saudi',
    age: 'mature',
    use_case: 'storytelling',
    description: 'صوت سعودي رجالي ناضج بلهجة خليجية أصيلة'
  },
  // Modern Standard Arabic - Professional News
  {
    voice_id: 'G1HOkzin3NMwRHSq60UI',
    name: 'شوقي - مذيع إذاعي',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت عميق وواضح بلكنة عربية محايدة، مثالي للوثائقيات والأخبار'
  },
  {
    voice_id: 'JjTirzdD7T3GMLkwdd3a',
    name: 'حميدة - إذاعي محترف',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'radio',
    description: 'صوت مناسب للإذاعة والبث الإخباري'
  },
  {
    voice_id: 'kERwN6X2cY8g1XbfzJsX',
    name: 'مراد سامي - قارئ أخبار',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'news_reading',
    description: 'صوت هادئ مثالي لقراءة الأخبار والكتب والمقالات'
  },
  // Female Voices - Professional News Anchors
  {
    voice_id: 'VwC51uc4PUblWEJSPzeo',
    name: 'أبرار صباح - مذيعة أخبار',
    gender: 'female',
    accent: 'msa',
    age: 'young',
    use_case: 'formal_news',
    description: 'صوت نسائي عربي مثالي للبودكاست والإعلانات والوثائقيات والأخبار'
  },
  {
    voice_id: 'qi4PkV9c01kb869Vh7Su',
    name: 'أسماء - مذيعة محترفة',
    gender: 'female',
    accent: 'msa',
    age: 'young',
    use_case: 'narration',
    description: 'صوت نسائي بلهجة فصحى حديثة مع نبرة حوارية لطيفة'
  },
  {
    voice_id: 'u0TsaWvt0v8migutHM3M',
    name: 'غزلان - صوت هادئ',
    gender: 'female',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'podcast',
    description: 'صوت ناعم ومتوازن وهادئ، مناسب للبودكاست واليوتيوب والسرد'
  }
];

export class ElevenLabsService {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';
  
  // Voice Configuration for Arabic News Broadcasting
  // Using شوقي - صوت عميق وواضح بلكنة عربية محايدة، مثالي للوثائقيات والأخبار
  private defaultVoiceId = 'G1HOkzin3NMwRHSq60UI'; // Shawqi - Deep clear MSA voice for news
  
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
    return retryWithBackoff(
      () => this._textToSpeechRequest(options, timeoutMs),
      'ElevenLabs TTS',
      { maxRetries: 3, baseDelay: 2000 }
    );
  }

  private async _textToSpeechRequest(options: TTSOptions, timeoutMs: number): Promise<Buffer> {
    const voiceId = options.voiceId || this.defaultVoiceId;
    const model = options.model || 'eleven_multilingual_v2';
    
    const url = `${this.baseUrl}/text-to-speech/${voiceId}`;
    
    const requestBody = {
      text: options.text,
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
      const blob = new Blob([file], { type: 'audio/mpeg' });
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
    
    const blob = new Blob([options.file], { type: 'audio/mpeg' });
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
