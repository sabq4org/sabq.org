import textToSpeech from '@google-cloud/text-to-speech';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import { normalizeTextForTts } from '../utils/arabicTtsNormalize';
import type { TTSOptions, Voice } from './elevenlabs';

export const GOOGLE_ARABIC_VOICES: Voice[] = [
  {
    voice_id: 'ar-XA-Wavenet-C',
    name: 'صوت ذكوري - WaveNet C',
    gender: 'male',
    accent: 'msa',
    age: 'mature',
    use_case: 'narration',
    description: 'صوت ذكوري عميق - مناسب للسرد والوثائقيات',
  },
  {
    voice_id: 'ar-XA-Wavenet-B',
    name: 'صوت ذكوري - WaveNet B',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'صوت ذكوري واضح بالعربية الفصحى - مثالي للأخبار',
  },
  {
    voice_id: 'ar-XA-Wavenet-A',
    name: 'صوت أنثوي - WaveNet A',
    gender: 'female',
    accent: 'msa',
    age: 'young',
    use_case: 'formal_news',
    description: 'صوت أنثوي واضح بالعربية الفصحى - مثالي للأخبار',
  },
  {
    voice_id: 'ar-XA-Wavenet-D',
    name: 'صوت أنثوي - WaveNet D',
    gender: 'female',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'podcast',
    description: 'صوت أنثوي ناعم - مناسب للبودكاست',
  },
  {
    voice_id: 'ar-XA-Standard-B',
    name: 'صوت ذكوري - Standard B (اقتصادي)',
    gender: 'male',
    accent: 'msa',
    age: 'middle_aged',
    use_case: 'formal_news',
    description: 'جودة قياسية بتكلفة أقل',
  },
  {
    voice_id: 'ar-XA-Standard-A',
    name: 'صوت أنثوي - Standard A (اقتصادي)',
    gender: 'female',
    accent: 'msa',
    age: 'young',
    use_case: 'formal_news',
    description: 'جودة قياسية بتكلفة أقل',
  },
];

type TTSClient = InstanceType<typeof textToSpeech.TextToSpeechClient>;

export class GoogleTTSService {
  private client: TTSClient;
  private defaultVoiceId = 'ar-XA-Wavenet-C';
  private languageCode = 'ar-XA';

  constructor(credentialsJson: string) {
    const creds = JSON.parse(credentialsJson);
    this.client = new textToSpeech.TextToSpeechClient({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
      projectId: creds.project_id,
    });
  }

  async textToSpeech(options: TTSOptions, timeoutMs: number = 30000, retry = true): Promise<Buffer> {
    if (!retry) return this._synthesize(options, timeoutMs);
    return retryWithBackoff(
      () => this._synthesize(options, timeoutMs),
      'Google TTS',
      { maxRetries: 3, baseDelay: 2000 }
    );
  }

  private async _synthesize(options: TTSOptions, timeoutMs: number): Promise<Buffer> {
    const voiceId = options.voiceId || this.defaultVoiceId;
    const speakingRate = options.voiceSettings?.speed ?? 1.0;
    const stability = options.voiceSettings?.stability ?? 0.75;
    const pitch = (stability - 0.5) * 4;
    const text = normalizeTextForTts(options.text, { language: options.language ?? 'auto' });

    const request = {
      input: { text },
      voice: {
        languageCode: this.languageCode,
        name: voiceId,
      },
      audioConfig: {
        audioEncoding: 'MP3' as const,
        speakingRate,
        pitch,
        sampleRateHertz: 24000,
      },
    };

    // gRPC deadline covers the response and cancels the request on timeout.
    const [response] = await this.client.synthesizeSpeech(request, { timeout: timeoutMs, retry: null });

    if (!response.audioContent) {
      throw new Error('Google TTS returned empty audio');
    }
    return Buffer.from(response.audioContent as Uint8Array);
  }

  async getVoices(): Promise<Voice[]> {
    return GOOGLE_ARABIC_VOICES;
  }

  async testVoice(
    voiceId?: string,
    sampleText: string = 'مرحباً، هذا اختبار للصوت. سنقرأ لكم أهم الأخبار اليوم.',
    voiceSettings?: TTSOptions['voiceSettings']
  ): Promise<Buffer> {
    return this.textToSpeech({ text: sampleText, voiceId, voiceSettings }, 15000);
  }
}

let googleInstance: GoogleTTSService | null = null;

export function getGoogleTTSService(): GoogleTTSService | null {
  const creds = process.env.GOOGLE_TTS_CREDENTIALS_JSON;
  if (!creds || creds.trim() === '') {
    return null;
  }
  if (!googleInstance) {
    try {
      googleInstance = new GoogleTTSService(creds);
      console.log('✅ Google TTS service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google TTS:', error);
      return null;
    }
  }
  return googleInstance;
}

export function isGoogleTTSConfigured(): boolean {
  const creds = process.env.GOOGLE_TTS_CREDENTIALS_JSON;
  return !!(creds && creds.trim() !== '');
}
