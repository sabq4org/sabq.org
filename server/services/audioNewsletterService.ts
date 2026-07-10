import { Readable } from 'stream';
import { db } from '../db';
import { eq, desc, and, gte, lte, inArray, not, sql } from 'drizzle-orm';
import {
  audioNewsletters,
  audioNewsletterArticles,
  audioNewsletterListens,
  articles,
  categories,
  type AudioNewsletter,
  type InsertAudioNewsletter,
  type UpdateAudioNewsletter,
  type AudioNewsletterArticle,
  type InsertAudioNewsletterArticle,
  type Article,
} from '@shared/schema';
import { nanoid } from 'nanoid';
import { getElevenLabsService } from './elevenlabs';
import type { ElevenLabsService, TTSOptions } from './elevenlabs';
import { EventEmitter } from 'events';
import { ObjectStorageService } from '../objectStorage';
import {
  resolveProvidersForNewsletter,
  resolveVoiceIdForProvider,
  getAllConfiguredProviders,
  logTtsUsage,
  loadTtsSettings,
  type TTSProvider,
  type TTSProviderName,
} from './ttsProviderRegistry';
import { normalizeTextForTts } from '../utils/arabicTtsNormalize';

// Voice configurations for different narrators
// Using Gulf/Saudi Arabic voices for authentic Saudi news experience
// ElevenLabs Flash v2.5 model for Arabic optimization
export const ARABIC_VOICES = {
  // ⭐ Saudi Male Voices — primary for Sabq audience
  MALE_NEWS: {
    id: 'yXEnnEln9armDCyhkXcA', // صوت جدة الإذاعي
    name: 'صوت جدة الإذاعي — Jeddawi Echo',
    model_id: 'eleven_flash_v2_5',
    settings: {
      stability: 0.50,
      similarity_boost: 0.80,
      style: 0.55,
      use_speaker_boost: true,
    },
  },
  MALE_ANALYSIS: {
    id: 'xvhpbk8otnNHtT3fjCpr', // عمر — فصحى احترافية
    name: 'عمر — محلل إخباري',
    model_id: 'eleven_flash_v2_5',
    settings: {
      stability: 0.55,
      similarity_boost: 0.75,
      style: 0.45,
      use_speaker_boost: true,
    },
  },
  MALE_SAUDI: {
    id: 'usjDi9nBY6UHvtKrL4ba', // عبدالله — راوي سعودي
    name: 'عبدالله — صوت سعودي',
    model_id: 'eleven_flash_v2_5',
    settings: {
      stability: 0.50,
      similarity_boost: 0.80,
      style: 0.50,
      use_speaker_boost: true,
    },
  },
  FEMALE_NEWS: {
    id: 'mRdG9GYEjJmIzqbYTidv', // سناء
    name: 'سناء — مذيعة أخبار',
    model_id: 'eleven_flash_v2_5',
    settings: {
      stability: 0.50,
      similarity_boost: 0.80,
      style: 0.50,
      use_speaker_boost: true,
    },
  },
  FEMALE_CONVERSATIONAL: {
    id: 'aMmeBf0lzDYlouyfqNjh', // مريم — سعودية
    name: 'مريم — صوت سعودي هادئ',
    model_id: 'eleven_flash_v2_5',
    settings: {
      stability: 0.45,
      similarity_boost: 0.75,
      style: 0.40,
      use_speaker_boost: true,
    },
  },
};

// Newsletter templates with different script structures
export enum NewsletterTemplate {
  MORNING_BRIEF = 'morning_brief',
  EVENING_DIGEST = 'evening_digest',
  WEEKLY_ANALYSIS = 'weekly_analysis',
  BREAKING_NEWS = 'breaking_news',
  TECH_UPDATE = 'tech_update',
  BUSINESS_REPORT = 'business_report',
  SPORT_HIGHLIGHTS = 'sport_highlights',
  CUSTOM = 'custom'
}

// Newsletter scheduling types
export interface RecurringSchedule {
  type: 'daily' | 'weekly' | 'custom';
  time: string; // HH:mm format
  daysOfWeek?: number[]; // 0-6, Sunday to Saturday
  timezone: string; // e.g., 'Asia/Riyadh'
  enabled: boolean;
}

// Audio generation status
export enum GenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  GENERATING_AUDIO = 'generating_audio',
  UPLOADING = 'uploading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// Job data for queue processing
export interface AudioGenerationJob {
  id: string;
  newsletterId: string;
  status: GenerationStatus;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
  webhookUrl?: string;
  metadata?: Record<string, any>;
}

// Script template builder interface
interface ScriptTemplate {
  introduction: (data: any) => string;
  articleSegment: (article: any, index: number) => string;
  transition: (fromTopic: string, toTopic: string) => string;
  conclusion: (data: any) => string;
}

// Newsletter script templates
const SCRIPT_TEMPLATES: Record<NewsletterTemplate, ScriptTemplate> = {
  [NewsletterTemplate.MORNING_BRIEF]: {
    introduction: (data) => `
      صباح الخير ومرحباً بكم في نشرة سبق الصباحية ليوم ${data.date}.
      معكم أبرز الأخبار والتطورات التي يجب أن تعرفوها لبداية يومكم.
    `,
    articleSegment: (article, index) => `
      الخبر ${index === 0 ? 'الأول' : index === 1 ? 'الثاني' : `رقم ${index + 1}`}: 
      ${article.title}.
      ${article.aiSummary || article.excerpt || ''}
    `,
    transition: (from, to) => `
      وننتقل الآن من أخبار ${from} إلى أخبار ${to}.
    `,
    conclusion: (data) => `
      كانت هذه أبرز أخبار الصباح من سبق.
      نتمنى لكم يوماً موفقاً، ونلقاكم في النشرة المسائية.
      للمزيد من الأخبار، تابعونا على تطبيق سبق.
    `
  },
  
  [NewsletterTemplate.EVENING_DIGEST]: {
    introduction: (data) => `
      مساء الخير، أهلاً بكم في النشرة المسائية من سبق.
      نستعرض معكم أهم ما حدث اليوم ${data.date} من أخبار وتطورات.
    `,
    articleSegment: (article, index) => `
      في التفاصيل: ${article.title}.
      ${article.aiSummary || article.excerpt || ''}
      ${article.author ? `كتبها: ${article.author}` : ''}
    `,
    transition: (from, to) => `
      ومن ${from}، ننتقل إلى ${to}.
    `,
    conclusion: (data) => `
      إلى هنا نصل إلى ختام نشرتنا المسائية.
      شكراً لاستماعكم، ونراكم غداً بإذن الله.
      تصبحون على خير.
    `
  },
  
  [NewsletterTemplate.WEEKLY_ANALYSIS]: {
    introduction: (data) => `
      أهلاً بكم في النشرة الأسبوعية التحليلية من سبق.
      نقدم لكم تحليلاً معمقاً لأبرز أحداث الأسبوع الماضي وتأثيراتها المحتملة.
      معكم ${data.narrator || 'فريق سبق الإخباري'}.
    `,
    articleSegment: (article, index) => `
      التحليل ${index + 1}: ${article.title}.
      
      السياق: ${article.context || ''}
      
      التفاصيل: ${article.aiSummary || article.excerpt || ''}
      
      التأثير المتوقع: ${article.impact || 'يُتابع تطور الأحداث.'}
    `,
    transition: (from, to) => `
      بعد استعراض ${from}، دعونا ننتقل إلى ${to}.
    `,
    conclusion: (data) => `
      نشكركم على الاستماع إلى تحليلنا الأسبوعي.
      نلقاكم الأسبوع المقبل مع المزيد من التحليلات المعمقة.
      لا تنسوا متابعتنا على تطبيق سبق للحصول على آخر الأخبار فور حدوثها.
    `
  },
  
  [NewsletterTemplate.BREAKING_NEWS]: {
    introduction: (data) => `
      عاجل من سبق.
      ${data.urgency ? 'خبر هام وعاجل.' : ''}
      نقاطعكم بآخر التطورات.
    `,
    articleSegment: (article, index) => `
      ${article.title}.
      ${article.aiSummary || article.excerpt || ''}
      ${article.location ? `من ${article.location}` : ''}
    `,
    transition: () => '',
    conclusion: (data) => `
      سنوافيكم بالمزيد من التفاصيل فور ورودها.
      تابعوا تطبيق سبق للحصول على آخر التحديثات.
    `
  },
  
  [NewsletterTemplate.TECH_UPDATE]: {
    introduction: (data) => `
      مرحباً بكم في نشرة سبق التقنية.
      نستعرض معكم أحدث التطورات في عالم التكنولوجيا والابتكار.
    `,
    articleSegment: (article, index) => `
      الخبر التقني ${index + 1}: ${article.title}.
      ${article.aiSummary || article.excerpt || ''}
      ${article.impact ? `التأثير على السوق: ${article.impact}` : ''}
    `,
    transition: (from, to) => `
      ومن ${from} إلى ${to}.
    `,
    conclusion: (data) => `
      كانت هذه نشرة سبق التقنية.
      للمزيد من أخبار التكنولوجيا، تابعونا على تطبيق سبق.
    `
  },
  
  [NewsletterTemplate.BUSINESS_REPORT]: {
    introduction: (data) => `
      أهلاً بكم في التقرير الاقتصادي من سبق.
      نستعرض أبرز التطورات في الأسواق المحلية والعالمية.
      ${data.marketStatus ? `حالة الأسواق: ${data.marketStatus}` : ''}
    `,
    articleSegment: (article, index) => `
      في الأخبار الاقتصادية: ${article.title}.
      ${article.aiSummary || article.excerpt || ''}
      ${article.marketImpact ? `التأثير على الأسواق: ${article.marketImpact}` : ''}
    `,
    transition: (from, to) => `
      من ${from} إلى ${to}.
    `,
    conclusion: (data) => `
      هذا كل ما لدينا في التقرير الاقتصادي اليوم.
      نراكم في التقرير القادم مع المزيد من التحليلات الاقتصادية.
    `
  },
  
  [NewsletterTemplate.SPORT_HIGHLIGHTS]: {
    introduction: (data) => `
      مرحباً بمحبي الرياضة، هذه نشرة سبق الرياضية.
      أبرز الأحداث والنتائج الرياضية ${data.period || 'اليوم'}.
    `,
    articleSegment: (article, index) => `
      في الأخبار الرياضية: ${article.title}.
      ${article.aiSummary || article.excerpt || ''}
      ${article.score ? `النتيجة: ${article.score}` : ''}
    `,
    transition: (from, to) => `
      من ${from} إلى ${to}.
    `,
    conclusion: (data) => `
      كانت هذه أبرز الأحداث الرياضية.
      تابعونا للمزيد من الأخبار الرياضية على تطبيق سبق.
    `
  },
  
  [NewsletterTemplate.CUSTOM]: {
    introduction: (data) => data.customIntro || 'مرحباً بكم في نشرة سبق.',
    articleSegment: (article, index) => `
      ${article.title}.
      ${article.aiSummary || article.excerpt || ''}
    `,
    transition: (from, to) => `من ${from} إلى ${to}.`,
    conclusion: (data) => data.customConclusion || 'شكراً لاستماعكم.'
  }
};

export class AudioNewsletterService extends EventEmitter {
  private elevenLabs: ElevenLabsService | null;
  private ttsProvider: TTSProvider | null;
  private activeJobs: Map<string, AudioGenerationJob>;
  
  constructor() {
    super();
    this.elevenLabs = getElevenLabsService();
    const configured = getAllConfiguredProviders();
    this.ttsProvider = configured[0] ?? null;
    this.activeJobs = new Map();
    if (configured.length > 0) {
      console.log(`🔊 Audio newsletter TTS providers configured: ${configured.map(p => p.name).join(', ')}`);
    }
  }
  
  isConfigured(): boolean {
    return getAllConfiguredProviders().length > 0;
  }
  
  // Create a new audio newsletter
  async createNewsletter(data: {
    title: string;
    description?: string;
    customContent?: string;
    template: NewsletterTemplate;
    voiceId?: string;
    voiceSettings?: any;
    articleIds: string[];
    generatedBy: string;
    scheduledFor?: Date;
    recurringSchedule?: RecurringSchedule;
    metadata?: Record<string, any>;
    publishImmediately?: boolean;
  }): Promise<AudioNewsletter> {
    const newsletterId = nanoid();
    
    // Generate slug from title
    const baseSlug = data.title
      .toLowerCase()
      .replace(/[\s\u0600-\u06FF]+/g, '-') // Replace spaces and Arabic chars with hyphens
      .replace(/[^\w\-]+/g, '') // Remove special characters
      .replace(/\-\-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+/, '') // Trim hyphens from start
      .replace(/-+$/, ''); // Trim hyphens from end
    
    // Make slug unique by adding timestamp
    const slug = `${baseSlug || 'newsletter'}-${Date.now()}`;
    
    // Create newsletter record
    const [newsletter] = await db.insert(audioNewsletters).values({
      title: data.title,
      description: data.description,
      slug: slug,
      customContent: data.customContent,
      generatedBy: data.generatedBy,
      status: 'draft',
      publishedAt: null,
      voiceId: data.voiceId || ARABIC_VOICES.MALE_NEWS.id,
      voiceModel: 'eleven_multilingual_v2',
      voiceSettings: data.voiceSettings || ARABIC_VOICES.MALE_NEWS.settings,
      metadata: data.metadata || {}
    }).returning();
    
    // Add articles to newsletter (only if not using custom content)
    if (data.articleIds.length > 0) {
      const articleLinks = data.articleIds.map((articleId, index) => ({
        newsletterId: newsletter.id,
        articleId,
        order: index
      }));
      
      await db.insert(audioNewsletterArticles).values(articleLinks);
    }
    
    return newsletter;
  }
  
  // Generate audio for newsletter
  async generateAudio(newsletterId: string, options?: {
    webhookUrl?: string;
    priority?: 'high' | 'normal' | 'low';
    publishImmediately?: boolean;
  }): Promise<AudioGenerationJob> {
    const job: AudioGenerationJob = {
      id: nanoid(),
      newsletterId,
      status: GenerationStatus.PENDING,
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
      webhookUrl: options?.webhookUrl,
      metadata: { 
        priority: options?.priority || 'normal',
        publishImmediately: options?.publishImmediately
      }
    };
    
    this.activeJobs.set(job.id, job);
    
    // Start processing in background
    this.processAudioGeneration(job).catch(err => {
      console.error('Audio generation failed:', err);
      job.status = GenerationStatus.FAILED;
      job.error = err.message;
      this.emit('job:failed', job);
    });
    
    return job;
  }
  
  // Process audio generation
  private async processAudioGeneration(job: AudioGenerationJob): Promise<void> {
    try {
      // Get newsletter early so we can resolve providers based on its metadata.
      const newsletterEarly = await this.getNewsletterWithArticles(job.newsletterId);
      const earlyMeta = (newsletterEarly?.metadata as Record<string, unknown> | null) ?? null;
      const providers = await resolveProvidersForNewsletter(earlyMeta);
      if (providers.length === 0) {
        throw new Error('No TTS provider configured - please add OPENAI_API_KEY, ELEVENLABS_API_KEY or GOOGLE_TTS_CREDENTIALS_JSON');
      }
      this.ttsProvider = providers[0];
      
      job.status = GenerationStatus.PROCESSING;
      job.startedAt = new Date();
      job.progress = 10;
      this.emit('job:started', job);
      
      // Reuse the early-fetched newsletter (avoids a duplicate query).
      const newsletter = newsletterEarly;
      if (!newsletter) {
        throw new Error('Newsletter not found');
      }
      
      // Update newsletter status
      await db.update(audioNewsletters)
        .set({ status: 'processing' })
        .where(eq(audioNewsletters.id, job.newsletterId));
      
      job.progress = 20;
      this.emit('job:progress', job);
      
      // Build script from template, then verbalize numbers/dates/% for Arabic TTS.
      const rawScript = await this.buildScript(newsletter);
      interface NewsletterTtsMeta {
        ttsVoice?: string;
        ttsTone?: string;
        language?: 'ar' | 'en' | 'ur';
        voicePreset?: string;
        voiceId?: string;
        voiceSettings?: Record<string, unknown>;
      }
      const newsletterMeta = (newsletter.metadata as NewsletterTtsMeta | null) || {};
      const language: 'ar' | 'en' | 'ur' =
        newsletterMeta.language === 'en' || newsletterMeta.language === 'ur'
          ? newsletterMeta.language
          : 'ar';
      const script = normalizeTextForTts(rawScript, { language });
      
      job.progress = 30;
      this.emit('job:progress', job);
      
      // Chunk text for processing — use the smallest charLimit across the
      // active provider chain so any fallback can also synthesize the chunk.
      const safeChunkLimit = Math.min(...providers.map(p => p.charLimit));
      const chunks = this.chunkText(script, safeChunkLimit);
      
      job.status = GenerationStatus.GENERATING_AUDIO;
      job.progress = 40;
      this.emit('job:progress', job);
      
      // Generate audio for each chunk
      const audioBuffers: Buffer[] = [];
      
      // Get voice configuration based on preset or custom settings
      const voicePreset = newsletterMeta.voicePreset || newsletter.metadata?.voicePreset || 'MALE_NEWS';
      const voiceConfig = ARABIC_VOICES[voicePreset as keyof typeof ARABIC_VOICES] || ARABIC_VOICES.MALE_NEWS;
      const voiceId = newsletterMeta.voiceId || newsletter.metadata?.voiceId || voiceConfig.id;
      const voiceSettings = newsletterMeta.voiceSettings || newsletter.metadata?.voiceSettings || voiceConfig.settings;
      const modelId = voiceConfig.model_id || 'eleven_flash_v2_5'; // Use Flash v2.5 for low latency
      
      const overrideVoice = newsletterMeta.ttsVoice;
      // Fall back to system-wide defaultTone when newsletter doesn't override.
      const systemSettings = await loadTtsSettings();
      const overrideTone = newsletterMeta.ttsTone ?? systemSettings.defaultTone;

      // Provider-specific TTS request builder. Voice IDs are namespaced per
      // provider so we resolve a usable voice id for whichever provider runs.
      const buildOptionsFor = async (providerName: TTSProviderName, chunkText: string) => {
        const requested = overrideVoice || voiceId;
        const resolvedVoice = await resolveVoiceIdForProvider(providerName, requested, language);
        if (providerName === 'elevenlabs') {
          return {
            text: chunkText,
            voiceId: resolvedVoice,
            voiceSettings,
            model: modelId,
            language,
          };
        }
        if (providerName === 'openai') {
          return {
            text: chunkText,
            voiceId: resolvedVoice,
            voiceSettings: { speed: voiceSettings?.speed ?? 1.0 },
            language,
            ...(overrideTone ? { instructions: overrideTone } : {}),
          };
        }
        return { text: chunkText, voiceId: resolvedVoice, language };
      };

      // Active provider index — stays on the working provider once we fall back.
      let activeProviderIdx = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const progress = 40 + (40 * (i / chunks.length));
        
        try {
          let audioBuffer: Buffer | null = null;
          let lastError: unknown = null;
          // Try the currently active provider first, then fall back to the rest.
          for (let offset = 0; offset < providers.length; offset++) {
            const idx = (activeProviderIdx + offset) % providers.length;
            const provider = providers[idx];
            const startedAt = Date.now();
            try {
              const opts = await buildOptionsFor(provider.name, chunk);
              audioBuffer = await provider.textToSpeech(opts, 30000);
              await logTtsUsage({
                newsletterId: job.newsletterId,
                provider: provider.name,
                voiceId: opts.voiceId ?? null,
                language,
                charCount: chunk.length,
                durationMs: Date.now() - startedAt,
                success: true,
              });
              if (idx !== activeProviderIdx) {
                console.warn(`[AudioNewsletter] Provider '${providers[activeProviderIdx].name}' failed for chunk ${i + 1}, fell back to '${provider.name}' (sticking with it for remaining chunks)`);
                activeProviderIdx = idx;
                this.ttsProvider = provider;
              }
              break;
            } catch (err) {
              lastError = err;
              await logTtsUsage({
                newsletterId: job.newsletterId,
                provider: provider.name,
                voiceId: null,
                language,
                charCount: chunk.length,
                durationMs: Date.now() - startedAt,
                success: false,
                errorMessage: err instanceof Error ? err.message : String(err),
              });
              console.error(`[AudioNewsletter] Provider '${provider.name}' failed for chunk ${i + 1}:`, err instanceof Error ? err.message : err);
            }
          }
          if (!audioBuffer) {
            throw lastError ?? new Error('All TTS providers failed');
          }

          audioBuffers.push(audioBuffer);
          
          job.progress = Math.round(progress);
          this.emit('job:progress', job);
        } catch (error) {
          console.error(`Failed to generate audio for chunk ${i + 1}:`, error);
          
          // Retry logic
          if (job.retryCount < job.maxRetries) {
            job.retryCount++;
            await this.delay(2000 * job.retryCount); // Exponential backoff
            i--; // Retry the same chunk
            continue;
          }
          
          throw new Error(`Failed to generate audio for chunk ${i + 1}: ${error}`);
        }
      }
      
      job.status = GenerationStatus.UPLOADING;
      job.progress = 80;
      this.emit('job:progress', job);
      
      // Combine audio buffers
      const combinedAudio = Buffer.concat(audioBuffers);
      
      // Upload to storage (implement your storage logic here)
      const audioUrl = await this.uploadAudio(combinedAudio, job.newsletterId);
      
      // Update newsletter with audio URL and duration
      const duration = await this.calculateAudioDuration(combinedAudio);
      
      // Check if should publish immediately
      const publishImmediately = job.metadata?.publishImmediately || newsletter.metadata?.publishImmediately;
      
      const updateData: any = {
        audioUrl,
        duration,
        fileSize: combinedAudio.length,
        generationStatus: 'completed'
      };
      
      if (publishImmediately) {
        updateData.status = 'published';
        updateData.publishedAt = new Date();
      } else {
        updateData.status = 'draft';
      }
      
      await db.update(audioNewsletters)
        .set(updateData)
        .where(eq(audioNewsletters.id, job.newsletterId));
      
      job.status = GenerationStatus.COMPLETED;
      job.progress = 100;
      job.completedAt = new Date();
      this.emit('job:completed', job);
      
      // Send webhook notification if configured
      if (job.webhookUrl) {
        await this.sendWebhookNotification(job.webhookUrl, {
          jobId: job.id,
          newsletterId: job.newsletterId,
          status: 'completed',
          audioUrl,
          duration
        });
      }
      
    } catch (error) {
      job.status = GenerationStatus.FAILED;
      job.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('job:failed', job);
      
      // Update newsletter status
      await db.update(audioNewsletters)
        .set({ status: 'failed' })
        .where(eq(audioNewsletters.id, job.newsletterId));
      
      // Send failure webhook
      if (job.webhookUrl) {
        await this.sendWebhookNotification(job.webhookUrl, {
          jobId: job.id,
          newsletterId: job.newsletterId,
          status: 'failed',
          error: job.error
        });
      }
      
      throw error;
    } finally {
      // Clean up job from active jobs
      this.activeJobs.delete(job.id);
    }
  }
  
  // Build script from template
  private async buildScript(newsletter: any): Promise<string> {
    // If custom content is provided, use it directly
    if (newsletter.customContent && newsletter.customContent.trim().length > 0) {
      // Format custom content for audio reading
      const formattedContent = this.formatCustomContentForAudio(newsletter.customContent);
      return formattedContent;
    }
    
    // Otherwise, build from articles using a default template (MORNING_BRIEF)
    const template = SCRIPT_TEMPLATES[NewsletterTemplate.MORNING_BRIEF];
    const scriptParts: string[] = [];
    
    // Add introduction
    const introData = {
      date: new Date().toLocaleDateString('ar-SA-u-ca-gregory', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      narrator: newsletter.metadata?.narrator,
      urgency: newsletter.metadata?.urgency,
      period: newsletter.metadata?.period,
      marketStatus: newsletter.metadata?.marketStatus,
      customIntro: newsletter.metadata?.customIntro
    };
    
    scriptParts.push(template.introduction(introData));
    
    // Process articles by category for smooth transitions
    const articlesByCategory = this.groupArticlesByCategory(newsletter.articles);
    let previousCategory = '';
    
    for (const [category, categoryArticles] of Object.entries(articlesByCategory)) {
      // Add transition if not first category
      if (previousCategory && template.transition) {
        scriptParts.push(template.transition(previousCategory, category));
      }
      
      // Add articles
      for (let i = 0; i < categoryArticles.length; i++) {
        const article = categoryArticles[i] as any;
        const articleData = {
          ...article,
          context: newsletter.metadata?.articleContext?.[article.id],
          impact: newsletter.metadata?.articleImpact?.[article.id],
          location: article.metadata?.location,
          author: article.authorName,
          score: article.metadata?.score,
          marketImpact: article.metadata?.marketImpact
        };
        
        scriptParts.push(template.articleSegment(articleData, i));
        
        // Add pause between articles
        if (i < categoryArticles.length - 1) {
          scriptParts.push('\n\n');
        }
      }
      
      previousCategory = category;
    }
    
    // Add conclusion
    const conclusionData = {
      customConclusion: newsletter.metadata?.customConclusion
    };
    
    scriptParts.push(template.conclusion(conclusionData));
    
    return scriptParts.join('\n\n').trim();
  }
  
  // Format custom content for audio reading
  private formatCustomContentForAudio(content: string): string {
    // Clean up the content
    let formatted = content.trim();
    
    // Ensure proper spacing between paragraphs
    formatted = formatted.replace(/\n\n+/g, '\n\n');
    
    // Add slight pauses for better readability (using punctuation)
    formatted = formatted.replace(/([.!?])\s+/g, '$1 ');
    
    // Remove markdown-style formatting that doesn't translate well to audio
    formatted = formatted.replace(/[*_`#]/g, '');
    
    // Remove URLs that would sound awkward
    formatted = formatted.replace(/https?:\/\/[^\s]+/g, '');
    
    return formatted;
  }
  
  // Group articles by category for better flow
  private groupArticlesByCategory(articles: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    for (const article of articles) {
      const category = article.category?.nameAr || 'عام';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(article);
    }
    
    return grouped;
  }
  
  // Chunk text for processing within API limits
  private chunkText(text: string, maxChars: number = 4000): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]\s+/);
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const sentenceWithPunctuation = sentence + '. ';
      
      if ((currentChunk + sentenceWithPunctuation).length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentenceWithPunctuation;
        } else {
          // Single sentence exceeds limit, split it
          const words = sentenceWithPunctuation.split(' ');
          let wordChunk = '';
          
          for (const word of words) {
            if ((wordChunk + word + ' ').length > maxChars) {
              chunks.push(wordChunk.trim());
              wordChunk = word + ' ';
            } else {
              wordChunk += word + ' ';
            }
          }
          
          if (wordChunk) {
            currentChunk = wordChunk;
          }
        }
      } else {
        currentChunk += sentenceWithPunctuation;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  // Get newsletter with articles
  private async getNewsletterWithArticles(newsletterId: string): Promise<any> {
    const newsletter = await db.query.audioNewsletters.findFirst({
      where: eq(audioNewsletters.id, newsletterId),
      with: {
        articles: {
          with: {
            article: true
          }
        }
      }
    });
    
    if (!newsletter) return null;
    
    // Sort articles by order index and map to simpler structure
    const sortedArticles = newsletter.articles
      .sort((a, b) => a.order - b.order)
      .map(item => ({
        ...item.article,
        orderIndex: item.order
      }));
    
    return {
      ...newsletter,
      articles: sortedArticles
    };
  }
  
  // Upload audio to storage
  private async uploadAudio(audioBuffer: Buffer, newsletterId: string): Promise<string> {
    try {
      const objectStorageService = new ObjectStorageService();
      const filePath = `newsletters/audio_${newsletterId}_${Date.now()}.mp3`;
      
      // Upload to object storage (public for streaming)
      const result = await objectStorageService.uploadFile(
        filePath,
        audioBuffer,
        'audio/mpeg',
        'public'
      );
      
      // Extract object path from full path (remove bucket name)
      // result.path format: /sabq-production-bucket/public/newsletters/audio_xxx.mp3
      // We need: public/newsletters/audio_xxx.mp3
      const pathParts = result.path.split('/').filter(part => part);
      const objectPath = pathParts.slice(1).join('/'); // Skip bucket name, keep rest
      
      // Return the public media endpoint URL
      return `/api/public-media/${objectPath}`;
    } catch (error) {
      console.error('Failed to upload audio to storage:', error);
      throw error; // Let the caller handle the error
    }
  }
  
  // Calculate audio duration
  private async calculateAudioDuration(audioBuffer: Buffer): Promise<number> {
    // This is a simplified estimation
    // For accurate duration, use an audio processing library like ffprobe
    
    // Rough estimation: ~150 words per minute, ~5 chars per word
    // MP3 at 128kbps = ~16KB per second
    const sizeInKB = audioBuffer.length / 1024;
    const estimatedSeconds = sizeInKB / 16;
    
    return Math.round(estimatedSeconds);
  }
  
  // Send webhook notification
  private async sendWebhookNotification(url: string, data: any): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
    }
  }
  
  // Utility delay function
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Get job status
  getJobStatus(jobId: string): AudioGenerationJob | undefined {
    return this.activeJobs.get(jobId);
  }
  
  // Cancel job
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status === GenerationStatus.COMPLETED) {
      return false;
    }
    
    job.status = GenerationStatus.CANCELLED;
    this.emit('job:cancelled', job);
    
    // Update newsletter status
    await db.update(audioNewsletters)
      .set({ status: 'cancelled' })
      .where(eq(audioNewsletters.id, job.newsletterId));
    
    this.activeJobs.delete(jobId);
    return true;
  }
  
  // Get all active jobs
  getActiveJobs(): AudioGenerationJob[] {
    return Array.from(this.activeJobs.values());
  }
  
  // Track listen event
  async trackListen(newsletterId: string, userId: string, duration: number): Promise<void> {
    await db.insert(audioNewsletterListens).values({
      newsletterId,
      userId,
      duration,
      startedAt: new Date(),
      lastPosition: 0,
      completionPercentage: 0
    });
    
    // Update total listens count
    await db.update(audioNewsletters)
      .set({
        totalListens: sql`COALESCE(${audioNewsletters.totalListens}, 0) + 1`
      })
      .where(eq(audioNewsletters.id, newsletterId));
  }
  
  // Get newsletter analytics
  async getNewsletterAnalytics(newsletterId: string): Promise<any> {
    const listens = await db.query.audioNewsletterListens.findMany({
      where: eq(audioNewsletterListens.newsletterId, newsletterId),
      with: {
        user: true
      }
    });
    
    const uniqueListeners = new Set(listens.map(l => l.userId)).size;
    const totalDuration = listens.reduce((sum, l) => sum + (l.duration || 0), 0);
    const avgDuration = listens.length > 0 ? totalDuration / listens.length : 0;
    
    // Group listens by hour
    const listensByHour: Record<number, number> = {};
    listens.forEach(listen => {
      const hour = new Date(listen.startedAt).getHours();
      listensByHour[hour] = (listensByHour[hour] || 0) + 1;
    });
    
    // Group listens by day
    const listensByDay: Record<string, number> = {};
    listens.forEach(listen => {
      const startDate = listen.startedAt instanceof Date ? listen.startedAt : new Date(listen.startedAt);
      const day = startDate.toISOString().split('T')[0];
      listensByDay[day] = (listensByDay[day] || 0) + 1;
    });
    
    return {
      totalListens: listens.length,
      uniqueListeners,
      avgDuration,
      totalDuration,
      listensByHour,
      listensByDay,
      recentListens: listens.slice(-10)
    };
  }
  
  // Get scheduled newsletters
  async getScheduledNewsletters(): Promise<AudioNewsletter[]> {
    // Since we don't have a scheduledFor field, we'll return newsletters 
    // that are in 'draft' status and ready to be processed
    return await db.query.audioNewsletters.findMany({
      where: eq(audioNewsletters.status, 'draft'),
      limit: 10 // Process up to 10 at a time
    });
  }
  
  // Process scheduled newsletters
  async processScheduledNewsletters(): Promise<void> {
    const scheduled = await this.getScheduledNewsletters();
    
    for (const newsletter of scheduled) {
      // Generate audio for scheduled newsletter
      await this.generateAudio(newsletter.id);
    }
  }
  
  // Calculate next scheduled time for recurring newsletter
  private calculateNextScheduledTime(schedule: RecurringSchedule): Date {
    const now = new Date();
    const [hours, minutes] = schedule.time.split(':').map(Number);
    
    let nextDate = new Date();
    nextDate.setHours(hours, minutes, 0, 0);
    
    switch (schedule.type) {
      case 'daily':
        // If time has passed today, schedule for tomorrow
        if (nextDate <= now) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
        break;
        
      case 'weekly':
        // Find next occurrence based on days of week
        if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
          const currentDay = now.getDay();
          let daysToAdd = 0;
          
          for (let i = 1; i <= 7; i++) {
            const checkDay = (currentDay + i) % 7;
            if (schedule.daysOfWeek.includes(checkDay)) {
              daysToAdd = i;
              break;
            }
          }
          
          nextDate.setDate(nextDate.getDate() + daysToAdd);
        }
        break;
        
      case 'custom':
        // Implement custom logic based on metadata
        break;
    }
    
    return nextDate;
  }
}

// Export singleton instance
export const audioNewsletterService = new AudioNewsletterService();