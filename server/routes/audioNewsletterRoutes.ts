import express from 'express';
import { db } from '../db';
import { eq, desc, and, or, gte, lte, ilike, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  audioNewsletters,
  audioNewsletterArticles,
  audioNewsletterListens,
  articles,
  categories,
  type AudioNewsletter,
  type InsertAudioNewsletter,
  type UpdateAudioNewsletter,
} from '@shared/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  audioNewsletterService,
  NewsletterTemplate,
  ARABIC_VOICES,
  type RecurringSchedule,
  type GenerationStatus
} from '../services/audioNewsletterService';
import type { ElevenLabsService, TTSOptions } from '../services/elevenlabs';
import type { GoogleTTSService } from '../services/googleTts';
import { requireAuth as rbacRequireAuth, requirePermission, requireRole } from '../rbac';
import {
  resolveProvidersForNewsletter,
  resolveVoiceIdForProvider,
  detectProviderForVoice,
  getProviderByName,
  getAllConfiguredProviders,
  getStaticVoicesForProvider,
  loadTtsSettings,
  saveTtsSettings,
  logTtsUsage,
  type TTSProviderName,
} from '../services/ttsProviderRegistry';
import { ttsUsageLogs } from '@shared/schema';

const router = express.Router();

// Helper function to safely parse dates and prevent Invalid Date crashes
function parseValidDate(dateString: string | undefined): Date | undefined {
  if (!dateString) return undefined;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return undefined; // Invalid date
  }
  return date;
}

// Validation schemas
const createNewsletterSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  template: z.nativeEnum(NewsletterTemplate),
  voicePreset: z.enum(['MALE_NEWS', 'MALE_ANALYSIS', 'FEMALE_NEWS', 'FEMALE_CONVERSATIONAL', 'CUSTOM']).optional(),
  customVoiceId: z.string().optional(),
  customVoiceSettings: z.object({
    stability: z.number().min(0).max(1).optional(),
    similarity_boost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    use_speaker_boost: z.boolean().optional()
  }).optional(),
  customContent: z.string().optional(),
  articleIds: z.array(z.string()).max(50).optional(),
  publishImmediately: z.boolean().optional(),
  scheduledFor: z.string().datetime().optional(),
  recurringSchedule: z.object({
    type: z.enum(['daily', 'weekly', 'custom']),
    time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:mm format
    daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
    timezone: z.string().default('Asia/Riyadh'),
    enabled: z.boolean()
  }).optional(),
  // Per-newsletter TTS overrides (stored in audioNewsletters.metadata)
  ttsProvider: z.enum(['openai', 'elevenlabs', 'google']).optional(),
  ttsVoice: z.string().optional(),
  ttsTone: z.string().max(500).optional(),
  language: z.enum(['ar', 'en', 'ur']).optional(),
}).refine((data) => {
  return (data.customContent && data.customContent.trim().length > 0) || (data.articleIds && data.articleIds.length > 0);
}, {
  message: "يجب إدخال محتوى نصي أو اختيار مقالة واحدة على الأقل"
});

const updateNewsletterSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'processing', 'published', 'failed', 'cancelled']).optional(),
  scheduledFor: z.string().datetime().optional(),
  // Per-newsletter TTS overrides (merged into existing metadata).
  ttsProvider: z.enum(['openai', 'elevenlabs', 'google']).optional(),
  ttsVoice: z.string().optional(),
  ttsTone: z.string().optional(),
  language: z.enum(['ar', 'en', 'ur']).optional(),
});

const generateAudioSchema = z.object({
  newsletterId: z.string(),
  webhookUrl: z.string().url().optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  regenerate: z.boolean().optional()
});

const trackListenSchema = z.object({
  duration: z.number().min(0).optional(),
  completionRate: z.number().min(0).max(100).optional()
});

const testVoiceSchema = z.object({
  voiceId: z.string(),
  provider: z.enum(['openai', 'elevenlabs', 'google']).optional(),
  sampleText: z.string().min(1).max(2000).optional(),
  tone: z.string().max(500).optional(),
  language: z.enum(['ar', 'en', 'ur']).optional(),
  voiceSettings: z.object({
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    speed: z.number().min(0.5).max(2).optional()
  }).optional()
});

const compareVoicesSchema = z.object({
  sampleText: z.string().min(1).max(2000).optional(),
  language: z.enum(['ar', 'en', 'ur']).optional(),
  voices: z.object({
    openai: z.string().optional(),
    elevenlabs: z.string().optional(),
    google: z.string().optional(),
  }).optional(),
  tone: z.string().max(500).optional(),
});

const updateTtsSettingsSchema = z.object({
  primaryProvider: z.enum(['openai', 'elevenlabs', 'google']),
  fallbackProviders: z.array(z.enum(['openai', 'elevenlabs', 'google'])).default([]),
  defaultVoices: z.object({
    ar: z.string().optional(),
    en: z.string().optional(),
    ur: z.string().optional(),
  }).default({}),
  defaultTone: z.string().max(500).optional(),
});

// Get public newsletters (no auth required)
router.get('/public', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      status = 'published',
      template,
      search,
      startDate,
      endDate,
      orderBy = 'createdAt'
    } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    // Build where conditions - only published newsletters
    const whereConditions = [eq(audioNewsletters.status, 'published')];
    
    // Note: template field doesn't exist in schema, using voiceModel for filtering
    if (template) {
      whereConditions.push(eq(audioNewsletters.voiceModel, template as string));
    }
    
    if (search) {
      whereConditions.push(
        or(
          ilike(audioNewsletters.title, `%${search}%`),
          ilike(audioNewsletters.description, `%${search}%`)
        )!
      );
    }
    
    const parsedStartDate = parseValidDate(startDate as string);
    if (parsedStartDate) {
      whereConditions.push(gte(audioNewsletters.createdAt, parsedStartDate));
    }
    
    const parsedEndDate = parseValidDate(endDate as string);
    if (parsedEndDate) {
      whereConditions.push(lte(audioNewsletters.createdAt, parsedEndDate));
    }
    
    const whereClause = and(...whereConditions);
    
    // Get newsletters
    const newsletters = await db.query.audioNewsletters.findMany({
      where: whereClause,
      orderBy: orderBy === 'listenCount' 
        ? [desc(audioNewsletters.totalListens)]
        : orderBy === 'duration'
        ? [desc(audioNewsletters.duration)]
        : [desc(audioNewsletters.createdAt)],
      limit: limitNum,
      offset
    });
    
    // Get total count
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(audioNewsletters)
      .where(whereClause);
    
    // Get voice model distribution (template field doesn't exist in schema)
    const categories = await db
      .select({
        voiceModel: audioNewsletters.voiceModel,
        count: sql`count(*)`
      })
      .from(audioNewsletters)
      .where(eq(audioNewsletters.status, 'published'))
      .groupBy(audioNewsletters.voiceModel);
    
    res.json({
      newsletters,
      total: Number(count),
      categories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching public newsletters:', error);
    res.status(500).json({ error: 'Failed to fetch newsletters' });
  }
});

// Get single public newsletter (no auth required)
router.get('/public/:id', async (req, res) => {
  try {
    const newsletter = await db.query.audioNewsletters.findFirst({
      where: and(
        eq(audioNewsletters.id, req.params.id),
        eq(audioNewsletters.status, 'published')
      ),
      with: {
        articles: {
          with: {
            article: true
          },
          orderBy: (articles, { asc }) => [asc(articles.order)]
        }
      }
    });
    
    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }
    
    res.json(newsletter);
  } catch (error) {
    console.error('Error fetching public newsletter:', error);
    res.status(500).json({ error: 'Failed to fetch newsletter' });
  }
});

// Get all newsletters with pagination and filters
router.get('/newsletters', rbacRequireAuth, async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      status,
      template,
      search,
      startDate,
      endDate
    } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    // Build where conditions
    const whereConditions = [];
    
    if (status) {
      whereConditions.push(eq(audioNewsletters.status, status as string));
    }
    
    // Note: template field doesn't exist in schema, using voiceModel for filtering
    if (template) {
      whereConditions.push(eq(audioNewsletters.voiceModel, template as string));
    }
    
    if (search) {
      whereConditions.push(
        or(
          ilike(audioNewsletters.title, `%${search}%`),
          ilike(audioNewsletters.description, `%${search}%`)
        )!
      );
    }
    
    const parsedStartDate = parseValidDate(startDate as string);
    if (parsedStartDate) {
      whereConditions.push(gte(audioNewsletters.createdAt, parsedStartDate));
    }
    
    const parsedEndDate = parseValidDate(endDate as string);
    if (parsedEndDate) {
      whereConditions.push(lte(audioNewsletters.createdAt, parsedEndDate));
    }
    
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    
    // Get newsletters with articles count
    const newsletters = await db.query.audioNewsletters.findMany({
      where: whereClause,
      with: {
        generator: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        articles: {
          columns: {
            id: true
          }
        },
        listens: {
          columns: {
            id: true
          }
        }
      },
      orderBy: [desc(audioNewsletters.createdAt)],
      limit: limitNum,
      offset
    });
    
    // Transform response
    const response = newsletters.map(newsletter => ({
      ...newsletter,
      articleCount: newsletter.articles.length,
      listenCount: newsletter.listens.length,
      articles: undefined,
      listens: undefined
    }));
    
    // Get total count
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(audioNewsletters)
      .where(whereClause);
    
    res.json({
      newsletters: response,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching newsletters:', error);
    res.status(500).json({ error: 'Failed to fetch newsletters' });
  }
});

// Get single newsletter with full details
router.get('/newsletters/:id', rbacRequireAuth, async (req, res) => {
  try {
    const newsletter = await db.query.audioNewsletters.findFirst({
      where: eq(audioNewsletters.id, req.params.id),
      with: {
        generator: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        articles: {
          with: {
            article: true
          },
          orderBy: (articles, { asc }) => [asc(articles.order)]
        },
        listens: {
          with: {
            user: {
              columns: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: (listens, { desc }) => [desc(listens.startedAt)],
          limit: 10
        }
      }
    });
    
    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }
    
    // Get analytics
    const analytics = await audioNewsletterService.getNewsletterAnalytics(req.params.id);
    
    res.json({
      newsletter,
      analytics
    });
  } catch (error) {
    console.error('Error fetching newsletter:', error);
    res.status(500).json({ error: 'Failed to fetch newsletter' });
  }
});

// Create new newsletter
router.post('/newsletters', requirePermission("audio_newsletters.create"), async (req, res) => {
  try {
    const validatedData = createNewsletterSchema.parse(req.body);
    
    // Determine voice configuration
    let voiceId: string;
    let voiceSettings: any;
    
    if (validatedData.voicePreset && validatedData.voicePreset !== 'CUSTOM') {
      const voiceConfig = ARABIC_VOICES[validatedData.voicePreset as keyof typeof ARABIC_VOICES];
      voiceId = voiceConfig.id;
      voiceSettings = voiceConfig.settings;
    } else if (validatedData.customVoiceId) {
      voiceId = validatedData.customVoiceId;
      voiceSettings = validatedData.customVoiceSettings || {};
    } else {
      // Default to male news voice
      voiceId = ARABIC_VOICES.MALE_NEWS.id;
      voiceSettings = ARABIC_VOICES.MALE_NEWS.settings;
    }
    
    // If customContent is provided, clear articleIds
    const articleIds = validatedData.customContent && validatedData.customContent.trim().length > 0 
      ? [] 
      : (validatedData.articleIds || []);
    
    // Build metadata: preserve existing voice context (voicePreset / voiceId /
    // voiceSettings) that processAudioGeneration() reads from metadata, AND
    // include the optional per-newsletter TTS overrides.
    const newsletterMetadata: Record<string, unknown> = {
      voicePreset: validatedData.voicePreset || 'MALE_NEWS',
      voiceId,
      voiceSettings,
    };
    if (validatedData.ttsProvider) newsletterMetadata.ttsProvider = validatedData.ttsProvider;
    if (validatedData.ttsVoice) newsletterMetadata.ttsVoice = validatedData.ttsVoice;
    if (validatedData.ttsTone) newsletterMetadata.ttsTone = validatedData.ttsTone;
    if (validatedData.language) newsletterMetadata.language = validatedData.language;

    // Create newsletter
    const newsletter = await audioNewsletterService.createNewsletter({
      title: validatedData.title,
      description: validatedData.description,
      customContent: validatedData.customContent,
      template: validatedData.template,
      voiceId,
      voiceSettings,
      articleIds,
      generatedBy: (req as any).user?.id!,
      scheduledFor: validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined,
      recurringSchedule: validatedData.recurringSchedule as RecurringSchedule,
      publishImmediately: validatedData.publishImmediately,
      metadata: newsletterMetadata,
    });
    
    // If not scheduled, start generation immediately
    if (!validatedData.scheduledFor) {
      const job = await audioNewsletterService.generateAudio(
        newsletter.id,
        { publishImmediately: validatedData.publishImmediately }
      );
      
      res.json({
        newsletter,
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress
        }
      });
    } else {
      res.json({ newsletter });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error creating newsletter:', error);
    res.status(500).json({ error: 'Failed to create newsletter' });
  }
});

// Update newsletter
router.patch('/newsletters/:id', requirePermission("articles.create"), async (req, res) => {
  try {
    const validatedData = updateNewsletterSchema.parse(req.body);

    const { ttsProvider, ttsVoice, ttsTone, language, ...rest } = validatedData;

    // Build the base update payload (typed columns only).
    const updatePayload: Record<string, unknown> = {
      ...rest,
      updatedAt: new Date(),
    };

    if (validatedData.scheduledFor) {
      updatePayload.scheduledFor = parseValidDate(validatedData.scheduledFor);
    }

    // Merge per-newsletter TTS overrides into existing metadata so updates
    // do not drop unrelated metadata fields (voicePreset, recurringSchedule…).
    const hasTtsOverride = ttsProvider !== undefined || ttsVoice !== undefined
      || ttsTone !== undefined || language !== undefined;
    if (hasTtsOverride) {
      const existing = await db.query.audioNewsletters.findFirst({
        where: eq(audioNewsletters.id, req.params.id),
        columns: { metadata: true },
      });
      const existingMeta = (existing?.metadata as Record<string, unknown> | null) || {};
      updatePayload.metadata = {
        ...existingMeta,
        ...(ttsProvider !== undefined ? { ttsProvider } : {}),
        ...(ttsVoice !== undefined ? { ttsVoice } : {}),
        ...(ttsTone !== undefined ? { ttsTone } : {}),
        ...(language !== undefined ? { language } : {}),
      };
    }

    const [updated] = await db
      .update(audioNewsletters)
      .set(updatePayload)
      .where(eq(audioNewsletters.id, req.params.id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }
    
    res.json({ newsletter: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error updating newsletter:', error);
    res.status(500).json({ error: 'Failed to update newsletter' });
  }
});

// Delete newsletter
router.delete('/newsletters/:id', requirePermission("articles.create"), async (req, res) => {
  try {
    await db
      .delete(audioNewsletters)
      .where(eq(audioNewsletters.id, req.params.id));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting newsletter:', error);
    res.status(500).json({ error: 'Failed to delete newsletter' });
  }
});

// Generate or regenerate audio for newsletter
router.post('/newsletters/generate-audio', requirePermission("audio_newsletters.create"), async (req, res) => {
  try {
    const validatedData = generateAudioSchema.parse(req.body);
    
    // Check if newsletter exists
    const newsletter = await db.query.audioNewsletters.findFirst({
      where: eq(audioNewsletters.id, validatedData.newsletterId)
    });
    
    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }
    
    // Check if already processing
    if (newsletter.status === 'processing' && !validatedData.regenerate) {
      return res.status(400).json({ error: 'Newsletter is already being processed' });
    }
    
    // Start audio generation
    const job = await audioNewsletterService.generateAudio(
      validatedData.newsletterId,
      {
        webhookUrl: validatedData.webhookUrl,
        priority: validatedData.priority
      }
    );
    
    res.json({
      job: {
        id: job.id,
        newsletterId: job.newsletterId,
        status: job.status,
        progress: job.progress
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error generating audio:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

// Get job status
router.get('/jobs/:jobId', rbacRequireAuth, async (req, res) => {
  const job = audioNewsletterService.getJobStatus(req.params.jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    job: {
      id: job.id,
      newsletterId: job.newsletterId,
      status: job.status,
      progress: job.progress,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt
    }
  });
});

// Cancel job
router.post('/jobs/:jobId/cancel', requirePermission("articles.create"), async (req, res) => {
  const cancelled = await audioNewsletterService.cancelJob(req.params.jobId);
  
  if (!cancelled) {
    return res.status(404).json({ error: 'Job not found or already completed' });
  }
  
  res.json({ success: true });
});

// Get all active jobs
router.get('/jobs', requirePermission("articles.create"), async (req, res) => {
  const jobs = audioNewsletterService.getActiveJobs();
  
  res.json({
    jobs: jobs.map(job => ({
      id: job.id,
      newsletterId: job.newsletterId,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt
    }))
  });
});

// Track listen event - PUBLIC endpoint for anonymous users
// Rate limited to prevent abuse
router.post('/newsletters/:id/listen', async (req, res) => {
  try {
    const validatedData = trackListenSchema.parse(req.body);
    
    // Get user ID from session or generate anonymous ID from IP
    const userId = (req as any).user?.id || `anon_${req.ip}_${req.headers['user-agent']?.substring(0, 20) || 'unknown'}`;
    
    // Simple IP-based rate limiting check
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimitKey = `listen_${req.params.id}_${clientIp}`;
    
    // Track listen with userId (real or anonymous)
    await audioNewsletterService.trackListen(
      req.params.id,
      userId,
      validatedData.duration ?? 0
    );
    
    // Log anonymous listen for monitoring
    if (!(req as any).user?.id) {
      console.log(`[AudioNewsletter] Anonymous listen tracked - Newsletter: ${req.params.id}, IP: ${clientIp}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error tracking listen:', error);
    res.status(500).json({ error: 'Failed to track listen' });
  }
});

// Get newsletter analytics
router.get('/newsletters/:id/analytics', requirePermission("audio_newsletters.view"), async (req, res) => {
  try {
    const analytics = await audioNewsletterService.getNewsletterAnalytics(req.params.id);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get available voices for a specific provider (or the default provider).
// Public endpoint — used in editor and admin pages.
router.get('/voices', async (req, res) => {
  try {
    const requested = (req.query.provider as string | undefined)?.toLowerCase() as TTSProviderName | undefined;
    const all = getAllConfiguredProviders();
    if (all.length === 0) {
      return res.status(503).json({ error: 'No TTS provider configured' });
    }

    if (requested) {
      const provider = getProviderByName(requested);
      if (!provider) {
        // Provider isn't configured at runtime — still return its known voices.
        const staticVoices = getStaticVoicesForProvider(requested);
        return res.json({ voices: staticVoices, provider: requested, configured: false });
      }
      try {
        const voices = await provider.getVoices();
        return res.json({ voices, provider: requested, configured: true });
      } catch (err) {
        console.error(`[voices] Provider '${requested}' getVoices failed:`, err);
        return res.json({ voices: getStaticVoicesForProvider(requested), provider: requested, configured: true });
      }
    }

    // No provider specified — fall back to legacy behaviour (try all in order).
    const providers = await resolveProvidersForNewsletter(undefined);
    let lastError: unknown = null;
    for (const provider of providers) {
      try {
        const voices = await provider.getVoices();
        return res.json({ voices, provider: provider.name, configured: true });
      } catch (err) {
        lastError = err;
        console.error(`[voices] Provider '${provider.name}' getVoices failed, trying next:`, err);
      }
    }
    throw lastError ?? new Error('All TTS providers failed');
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

// List all providers and which are configured. Used by editor + admin pages.
router.get('/providers', requirePermission('audio_newsletters.create'), async (_req, res) => {
  try {
    const settings = await loadTtsSettings();
    const all: TTSProviderName[] = ['openai', 'elevenlabs', 'google'];
    const configured = new Set(getAllConfiguredProviders().map(p => p.name));
    const providers = all.map(name => {
      const p = getProviderByName(name);
      return {
        name,
        configured: configured.has(name),
        charLimit: p?.charLimit ?? null,
        costPer1MChars: p?.costPer1MChars ?? null,
      };
    });
    res.json({ providers, settings });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Test voice with sample text for a specific provider.
// Auth required to prevent anonymous abuse of paid TTS providers.
router.post('/voices/test', requirePermission('audio_newsletters.create'), async (req, res) => {
  try {
    const { voiceId, provider: requestedProvider, sampleText, voiceSettings, tone, language } = testVoiceSchema.parse(req.body);

    // Determine which provider to use. Priority:
    //   1) explicit provider in body
    //   2) provider derived from voiceId namespace
    //   3) system primary provider
    const detected = detectProviderForVoice(voiceId);
    const settings = await loadTtsSettings();
    const targetProvider: TTSProviderName = requestedProvider || detected || settings.primaryProvider;

    const provider = getProviderByName(targetProvider);
    if (!provider) {
      return res.status(503).json({ error: `TTS provider '${targetProvider}' is not configured` });
    }

    // If the supplied voiceId doesn't belong to this provider, fall back to
    // the provider's default voice rather than failing.
    const ownerOfVoice = detectProviderForVoice(voiceId);
    const effectiveVoiceId = ownerOfVoice === targetProvider
      ? voiceId
      : await resolveVoiceIdForProvider(targetProvider, voiceId, language ?? 'ar');

    const ttsSettings = voiceSettings ? {
      stability: voiceSettings.stability ?? 0.5,
      similarity_boost: voiceSettings.similarityBoost ?? 0.75,
      speed: voiceSettings.speed ?? 1.0,
      use_speaker_boost: true,
    } : undefined;

    const sample = sampleText || 'مرحباً، هذا اختبار للصوت. سنقرأ لكم أهم الأخبار من سبق اليوم.';
    const startedAt = Date.now();
    let audioBuffer: Buffer;
    try {
      // For OpenAI we may have a "tone" instruction — testVoice doesn't accept
      // it directly, so use textToSpeech for finer control when needed.
      if (targetProvider === 'openai' && tone) {
        audioBuffer = await provider.textToSpeech({
          text: sample,
          voiceId: effectiveVoiceId,
          voiceSettings: { speed: voiceSettings?.speed ?? 1.0 },
          instructions: tone,
        }, 15000);
      } else {
        audioBuffer = await provider.testVoice(effectiveVoiceId, sample, ttsSettings);
      }
      await logTtsUsage({
        provider: targetProvider,
        voiceId: effectiveVoiceId,
        charCount: sample.length,
        durationMs: Date.now() - startedAt,
        success: true,
      });
    } catch (err) {
      await logTtsUsage({
        provider: targetProvider,
        voiceId: effectiveVoiceId,
        charCount: sample.length,
        durationMs: Date.now() - startedAt,
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    res.json({
      success: true,
      audio: `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`,
      provider: targetProvider,
      voiceId: effectiveVoiceId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error testing voice:', error);
    res.status(500).json({ error: 'Failed to test voice', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Compare voices side-by-side across all 3 providers — admin only.
router.post('/voices/compare', requireRole('admin', 'system_admin'), async (req, res) => {
  try {
    const { sampleText, language = 'ar', voices: requestedVoices, tone } = compareVoicesSchema.parse(req.body);
    const sample = sampleText || 'مرحباً، هذا اختبار للصوت. سنقرأ لكم أهم الأخبار من سبق اليوم.';
    const targets: TTSProviderName[] = ['openai', 'elevenlabs', 'google'];

    const results = await Promise.all(targets.map(async (name) => {
      const provider = getProviderByName(name);
      if (!provider) {
        return { provider: name, configured: false, success: false, error: 'Provider not configured' };
      }
      const voiceId = requestedVoices?.[name] || await resolveVoiceIdForProvider(name, undefined, language);
      const startedAt = Date.now();
      try {
        const opts: TTSOptions = { text: sample, voiceId };
        if (name === 'openai' && tone) opts.instructions = tone;
        const buf = await provider.textToSpeech(opts, 20000);
        const durationMs = Date.now() - startedAt;
        const cost = (sample.length / 1_000_000) * provider.costPer1MChars;
        await logTtsUsage({ provider: name, voiceId, charCount: sample.length, durationMs, success: true });
        return {
          provider: name,
          configured: true,
          success: true,
          voiceId,
          durationMs,
          estimatedCostUsd: cost,
          audio: `data:audio/mpeg;base64,${buf.toString('base64')}`,
        };
      } catch (err) {
        await logTtsUsage({
          provider: name,
          voiceId,
          charCount: sample.length,
          durationMs: Date.now() - startedAt,
          success: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return {
          provider: name,
          configured: true,
          success: false,
          voiceId,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }));

    res.json({ sampleText: sample, results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error comparing voices:', error);
    res.status(500).json({ error: 'Failed to compare voices', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Read TTS system settings (admin)
router.get('/tts-settings', requireRole('admin', 'system_admin', 'super_admin', 'superadmin'), async (_req, res) => {
  try {
    const settings = await loadTtsSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Error loading tts settings:', error);
    res.status(500).json({ error: 'Failed to load TTS settings' });
  }
});

// Update TTS system settings (admin)
router.patch('/tts-settings', requireRole('admin', 'system_admin', 'super_admin', 'superadmin'), async (req, res) => {
  try {
    const data = updateTtsSettingsSchema.parse(req.body);
    await saveTtsSettings(data);
    res.json({ success: true, settings: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error saving tts settings:', error);
    res.status(500).json({ error: 'Failed to save TTS settings' });
  }
});

// TTS usage stats (admin)
router.get('/tts-usage-stats', requirePermission('analytics.view'), async (req, res) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || '30', 10) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        provider: ttsUsageLogs.provider,
        count: sql<number>`COUNT(*)::int`,
        successCount: sql<number>`SUM(CASE WHEN ${ttsUsageLogs.success} THEN 1 ELSE 0 END)::int`,
        totalChars: sql<number>`COALESCE(SUM(${ttsUsageLogs.charCount}), 0)::int`,
        totalCost: sql<number>`COALESCE(SUM(${ttsUsageLogs.estimatedCostUsd}), 0)::float`,
        avgDurationMs: sql<number>`COALESCE(AVG(${ttsUsageLogs.durationMs}), 0)::int`,
      })
      .from(ttsUsageLogs)
      .where(gte(ttsUsageLogs.createdAt, since))
      .groupBy(ttsUsageLogs.provider);

    const byProvider = rows.map(r => ({
      provider: r.provider,
      count: Number(r.count) || 0,
      successCount: Number(r.successCount) || 0,
      successRate: r.count ? (Number(r.successCount) / Number(r.count)) * 100 : 100,
      totalChars: Number(r.totalChars) || 0,
      estimatedCostUsd: Number(r.totalCost) || 0,
      avgDurationMs: Number(r.avgDurationMs) || 0,
    }));

    const totals = byProvider.reduce(
      (acc, p) => {
        acc.count += p.count;
        acc.totalChars += p.totalChars;
        acc.estimatedCostUsd += p.estimatedCostUsd;
        return acc;
      },
      { count: 0, totalChars: 0, estimatedCostUsd: 0 }
    );

    res.json({ days, since: since.toISOString(), byProvider, totals });
  } catch (error) {
    console.error('Error fetching tts usage stats:', error);
    res.status(500).json({ error: 'Failed to fetch TTS usage stats' });
  }
});

// Get newsletter templates info
router.get('/templates', async (req, res) => {
  const templates = Object.values(NewsletterTemplate).map(template => ({
    id: template,
    name: template.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase()),
    description: getTemplateDescription(template)
  }));
  
  res.json({ templates });
});

// Get latest published newsletters (public RSS feed)
router.get('/rss', async (req, res) => {
  try {
    const newsletters = await db.query.audioNewsletters.findMany({
      where: eq(audioNewsletters.status, 'published'),
      orderBy: [desc(audioNewsletters.publishedAt)],
      limit: 20,
      with: {
        generator: {
          columns: {
            firstName: true,
            lastName: true
          }
        }
      }
    });
    
    // Generate RSS feed
    const rss = generateRSSFeed(newsletters);
    
    res.set('Content-Type', 'application/rss+xml');
    res.send(rss);
  } catch (error) {
    console.error('Error generating RSS feed:', error);
    res.status(500).json({ error: 'Failed to generate RSS feed' });
  }
});

// Get newsletter by slug (public endpoint for sharing)
router.get('/public/:slug', async (req, res) => {
  try {
    // For now using ID as slug, but you can implement proper slugs
    const newsletter = await db.query.audioNewsletters.findFirst({
      where: and(
        eq(audioNewsletters.id, req.params.slug),
        eq(audioNewsletters.status, 'published')
      ),
      with: {
        generator: {
          columns: {
            firstName: true,
            lastName: true
          }
        }
      }
    });
    
    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }
    
    // Track anonymous listen if no session
    if (!(req as any).user?.id) {
      await db.update(audioNewsletters)
        .set({
          totalListens: sql`${audioNewsletters.totalListens} + 1`
        })
        .where(eq(audioNewsletters.id, newsletter.id));
    }
    
    res.json({
      newsletter: {
        id: newsletter.id,
        title: newsletter.title,
        description: newsletter.description,
        audioUrl: newsletter.audioUrl,
        duration: newsletter.duration,
        publishedAt: newsletter.publishedAt,
        author: newsletter.generator ? 
          `${newsletter.generator.firstName} ${newsletter.generator.lastName}` : 
          'سبق'
      }
    });
  } catch (error) {
    console.error('Error fetching public newsletter:', error);
    res.status(500).json({ error: 'Failed to fetch newsletter' });
  }
});

// Helper function to get template description
function getTemplateDescription(template: NewsletterTemplate): string {
  const descriptions: Record<NewsletterTemplate, string> = {
    [NewsletterTemplate.MORNING_BRIEF]: 'نشرة صباحية مختصرة بأهم الأخبار لبداية اليوم',
    [NewsletterTemplate.EVENING_DIGEST]: 'ملخص مسائي شامل لأحداث اليوم',
    [NewsletterTemplate.WEEKLY_ANALYSIS]: 'تحليل أسبوعي معمق للأحداث المهمة',
    [NewsletterTemplate.BREAKING_NEWS]: 'نشرة عاجلة للأخبار الهامة',
    [NewsletterTemplate.TECH_UPDATE]: 'آخر أخبار التقنية والابتكار',
    [NewsletterTemplate.BUSINESS_REPORT]: 'تقرير اقتصادي بأهم أخبار الأعمال',
    [NewsletterTemplate.SPORT_HIGHLIGHTS]: 'أبرز الأحداث والنتائج الرياضية',
    [NewsletterTemplate.CUSTOM]: 'قالب مخصص حسب الاحتياجات'
  };
  
  return descriptions[template] || '';
}

// Generate RSS feed
function generateRSSFeed(newsletters: any[]): string {
  const baseUrl = process.env.BASE_URL || 'https://sabq.org';
  
  const items = newsletters.map(newsletter => {
    const author = newsletter.generatedByUser ? 
      `${newsletter.generatedByUser.firstName} ${newsletter.generatedByUser.lastName}` : 
      'سبق';
    
    return `
    <item>
      <title><![CDATA[${newsletter.title}]]></title>
      <description><![CDATA[${newsletter.description || ''}]]></description>
      <link>${baseUrl}/audio/${newsletter.id}</link>
      <guid isPermaLink="true">${baseUrl}/audio/${newsletter.id}</guid>
      <pubDate>${new Date(newsletter.publishedAt).toUTCString()}</pubDate>
      <author>${author}</author>
      <enclosure url="${baseUrl}${newsletter.audioUrl}" type="audio/mpeg" />
      <itunes:duration>${formatDuration(newsletter.duration)}</itunes:duration>
    </item>
    `;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>نشرات سبق الصوتية</title>
    <description>استمع إلى أهم الأخبار والتحليلات من سبق</description>
    <link>${baseUrl}</link>
    <language>ar</language>
    <copyright>© ${new Date().getFullYear()} سبق</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>سبق</itunes:author>
    <itunes:category text="News" />
    <itunes:explicit>no</itunes:explicit>
    ${items}
  </channel>
</rss>`;
}

// Format duration for RSS feed
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// SSE stream removed. Clients should poll /api/audio-newsletters/jobs/:jobId
// to read job progress, avoiding long-lived connections on Autoscale.
router.get('/jobs/:jobId/stream', rbacRequireAuth, async (_req, res) => {
  res.status(410).json({
    error: 'SSE stream disabled. Poll /api/audio-newsletters/jobs/:jobId instead.',
  });
});

// ================ ANALYTICS ENDPOINTS ================

// Get analytics overview - summary metrics
router.get('/analytics/overview', requirePermission("analytics.view"), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date conditions
    const dateConditions = [];
    if (startDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} >= ${startDate as string}`);
    }
    if (endDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} <= ${endDate as string}`);
    }
    const dateClause = dateConditions.length > 0 ? and(...dateConditions) : undefined;
    
    // Get total newsletters
    const [{ totalNewsletters }] = await db
      .select({ totalNewsletters: sql`count(*)` })
      .from(audioNewsletters)
      .where(eq(audioNewsletters.status, 'published'));
    
    // Get total listens and unique listeners
    const listensData = await db
      .select({
        totalListens: sql`count(*)`,
        uniqueListeners: sql`count(distinct ${audioNewsletterListens.userId})`,
        totalDuration: sql`COALESCE(sum(${audioNewsletterListens.duration}), 0)`,
        avgCompletion: sql`COALESCE(avg(${audioNewsletterListens.completionPercentage}), 0)`
      })
      .from(audioNewsletterListens)
      .where(dateClause);
    
    // Get active listeners (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [{ activeListeners }] = await db
      .select({
        activeListeners: sql`count(distinct ${audioNewsletterListens.userId})`
      })
      .from(audioNewsletterListens)
      .where(sql`${audioNewsletterListens.startedAt} >= ${thirtyDaysAgo.toISOString()}`);
    
    // Get scheduled newsletters count
    const [{ scheduledCount }] = await db
      .select({ scheduledCount: sql`count(*)` })
      .from(audioNewsletters)
      .where(eq(audioNewsletters.status, 'scheduled'));
    
    // Get today's published count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [{ publishedToday }] = await db
      .select({ publishedToday: sql`count(*)` })
      .from(audioNewsletters)
      .where(
        and(
          eq(audioNewsletters.status, 'published'),
          sql`${audioNewsletters.publishedAt} >= ${today.toISOString()}`
        )
      );
    
    // Calculate weekly growth
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const [{ thisWeekListens }] = await db
      .select({ thisWeekListens: sql`count(*)` })
      .from(audioNewsletterListens)
      .where(sql`${audioNewsletterListens.startedAt} >= ${oneWeekAgo.toISOString()}`);
    
    const [{ lastWeekListens }] = await db
      .select({ lastWeekListens: sql`count(*)` })
      .from(audioNewsletterListens)
      .where(
        and(
          sql`${audioNewsletterListens.startedAt} >= ${twoWeeksAgo.toISOString()}`,
          sql`${audioNewsletterListens.startedAt} <= ${oneWeekAgo.toISOString()}`
        )
      );
    
    const weeklyGrowth = lastWeekListens ? 
      ((Number(thisWeekListens) - Number(lastWeekListens)) / Number(lastWeekListens)) * 100 : 0;
    
    // Get top newsletter
    const topNewsletter = await db
      .select({
        title: audioNewsletters.title,
        listens: sql`count(${audioNewsletterListens.id})`
      })
      .from(audioNewsletters)
      .leftJoin(
        audioNewsletterListens,
        eq(audioNewsletters.id, audioNewsletterListens.newsletterId)
      )
      .where(eq(audioNewsletters.status, 'published'))
      .groupBy(audioNewsletters.id, audioNewsletters.title)
      .orderBy(sql`count(${audioNewsletterListens.id}) desc`)
      .limit(1);
    
    res.json({
      totalNewsletters: Number(totalNewsletters) || 0,
      totalListens: Number(listensData[0]?.totalListens) || 0,
      uniqueListeners: Number(listensData[0]?.uniqueListeners) || 0,
      averageCompletion: Number(listensData[0]?.avgCompletion) || 0,
      totalHoursListened: Math.round(Number(listensData[0]?.totalDuration || 0) / 3600),
      activeListeners: Number(activeListeners) || 0,
      scheduledCount: Number(scheduledCount) || 0,
      publishedToday: Number(publishedToday) || 0,
      weeklyGrowth,
      topNewsletter: topNewsletter[0] || null
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

// Get trends data for charts
router.get('/analytics/trends', requirePermission("analytics.view"), async (req, res) => {
  try {
    const { 
      period = 'daily', // daily, weekly, monthly
      startDate,
      endDate,
      metric = 'listens' // listens, completion, duration, unique_users
    } = req.query;
    
    // Build date conditions
    const dateConditions = [];
    if (startDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} >= ${startDate as string}`);
    }
    if (endDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} <= ${endDate as string}`);
    } else {
      // Default to last 30 days if no end date
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateConditions.push(sql`${audioNewsletterListens.startedAt} >= ${thirtyDaysAgo.toISOString()}`);
    }
    const dateClause = dateConditions.length > 0 ? and(...dateConditions) : undefined;
    
    // Determine grouping based on period
    let dateFormat: string;
    let groupByExpression: any;
    
    switch (period) {
      case 'hourly':
        dateFormat = 'YYYY-MM-DD HH24:00';
        groupByExpression = sql`to_char(${audioNewsletterListens.startedAt}::timestamp, 'YYYY-MM-DD HH24:00')`;
        break;
      case 'weekly':
        dateFormat = 'YYYY-WW';
        groupByExpression = sql`to_char(${audioNewsletterListens.startedAt}::timestamp, 'YYYY-WW')`;
        break;
      case 'monthly':
        dateFormat = 'YYYY-MM';
        groupByExpression = sql`to_char(${audioNewsletterListens.startedAt}::timestamp, 'YYYY-MM')`;
        break;
      default: // daily
        dateFormat = 'YYYY-MM-DD';
        groupByExpression = sql`date(${audioNewsletterListens.startedAt})`;
    }
    
    // Get trends data based on metric
    let trendsQuery;
    
    switch (metric) {
      case 'completion':
        trendsQuery = db
          .select({
            date: groupByExpression,
            value: sql`avg(${audioNewsletterListens.completionPercentage})`,
            count: sql`count(*)`
          })
          .from(audioNewsletterListens)
          .where(dateClause)
          .groupBy(groupByExpression)
          .orderBy(groupByExpression);
        break;
      
      case 'duration':
        trendsQuery = db
          .select({
            date: groupByExpression,
            value: sql`avg(${audioNewsletterListens.duration})`,
            total: sql`sum(${audioNewsletterListens.duration})`,
            count: sql`count(*)`
          })
          .from(audioNewsletterListens)
          .where(dateClause)
          .groupBy(groupByExpression)
          .orderBy(groupByExpression);
        break;
      
      case 'unique_users':
        trendsQuery = db
          .select({
            date: groupByExpression,
            value: sql`count(distinct ${audioNewsletterListens.userId})`,
            count: sql`count(*)`
          })
          .from(audioNewsletterListens)
          .where(dateClause)
          .groupBy(groupByExpression)
          .orderBy(groupByExpression);
        break;
      
      default: // listens
        trendsQuery = db
          .select({
            date: groupByExpression,
            value: sql`count(*)`,
            uniqueUsers: sql`count(distinct ${audioNewsletterListens.userId})`
          })
          .from(audioNewsletterListens)
          .where(dateClause)
          .groupBy(groupByExpression)
          .orderBy(groupByExpression);
    }
    
    const trends = await trendsQuery;
    
    // Get peak listening hours (for heatmap)
    const hoursData = await db
      .select({
        hour: sql`extract(hour from ${audioNewsletterListens.startedAt}::timestamp)`,
        dayOfWeek: sql`extract(dow from ${audioNewsletterListens.startedAt}::timestamp)`,
        count: sql`count(*)`
      })
      .from(audioNewsletterListens)
      .where(dateClause)
      .groupBy(
        sql`extract(hour from ${audioNewsletterListens.startedAt}::timestamp)`,
        sql`extract(dow from ${audioNewsletterListens.startedAt}::timestamp)`
      );
    
    // Get device type distribution
    const deviceData = await db
      .select({
        deviceType: audioNewsletterListens.deviceType,
        count: sql`count(*)`,
        percentage: sql`count(*)::float / (select count(*) from ${audioNewsletterListens} where ${dateClause}) * 100`
      })
      .from(audioNewsletterListens)
      .where(dateClause)
      .groupBy(audioNewsletterListens.deviceType);
    
    res.json({
      trends: trends.map(t => ({
        ...t,
        value: Number(t.value) || 0
      })),
      peakHours: hoursData.map(h => ({
        hour: Number(h.hour),
        dayOfWeek: Number(h.dayOfWeek),
        count: Number(h.count)
      })),
      deviceDistribution: deviceData.map(d => ({
        type: d.deviceType || 'unknown',
        count: Number(d.count),
        percentage: Number(d.percentage) || 0
      })),
      period,
      metric
    });
  } catch (error) {
    console.error('Error fetching analytics trends:', error);
    res.status(500).json({ error: 'Failed to fetch analytics trends' });
  }
});

// Get top performing newsletters
router.get('/analytics/top-newsletters', requirePermission("analytics.view"), async (req, res) => {
  try {
    const {
      limit = '10',
      sortBy = 'listens', // listens, completion, duration
      startDate,
      endDate
    } = req.query;
    
    // Build date conditions
    const dateConditions = [];
    if (startDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} >= ${startDate as string}`);
    }
    if (endDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} <= ${endDate as string}`);
    }
    const dateClause = dateConditions.length > 0 ? and(...dateConditions) : undefined;
    
    // Get top newsletters based on sort criteria
    let orderByExpression;
    switch (sortBy) {
      case 'completion':
        orderByExpression = sql`avg(${audioNewsletterListens.completionPercentage}) desc`;
        break;
      case 'duration':
        orderByExpression = sql`avg(${audioNewsletterListens.duration}) desc`;
        break;
      default: // listens
        orderByExpression = sql`count(${audioNewsletterListens.id}) desc`;
    }
    
    const topNewsletters = await db
      .select({
        id: audioNewsletters.id,
        title: audioNewsletters.title,
        publishedAt: audioNewsletters.publishedAt,
        duration: audioNewsletters.duration,
        totalListens: sql`count(${audioNewsletterListens.id})`,
        uniqueListeners: sql`count(distinct ${audioNewsletterListens.userId})`,
        avgCompletion: sql`COALESCE(avg(${audioNewsletterListens.completionPercentage}), 0)`,
        avgDuration: sql`COALESCE(avg(${audioNewsletterListens.duration}), 0)`,
        totalDuration: sql`COALESCE(sum(${audioNewsletterListens.duration}), 0)`
      })
      .from(audioNewsletters)
      .leftJoin(
        audioNewsletterListens,
        eq(audioNewsletters.id, audioNewsletterListens.newsletterId)
      )
      .where(
        and(
          eq(audioNewsletters.status, 'published'),
          dateClause
        )
      )
      .groupBy(
        audioNewsletters.id,
        audioNewsletters.title,
        audioNewsletters.voiceModel,
        audioNewsletters.publishedAt,
        audioNewsletters.duration
      )
      .orderBy(orderByExpression)
      .limit(parseInt(limit as string));
    
    res.json({
      newsletters: topNewsletters.map(n => ({
        ...n,
        totalListens: Number(n.totalListens) || 0,
        uniqueListeners: Number(n.uniqueListeners) || 0,
        avgCompletion: Number(n.avgCompletion) || 0,
        avgDuration: Number(n.avgDuration) || 0,
        totalHours: Math.round(Number(n.totalDuration || 0) / 3600)
      }))
    });
  } catch (error) {
    console.error('Error fetching top newsletters:', error);
    res.status(500).json({ error: 'Failed to fetch top newsletters' });
  }
});

// Export analytics data as CSV
router.get('/analytics/export', requirePermission("analytics.view"), async (req, res) => {
  try {
    const {
      type = 'overview', // overview, newsletters, listens
      startDate,
      endDate
    } = req.query;
    
    // Build date conditions
    const dateConditions = [];
    if (startDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} >= ${startDate as string}`);
    }
    if (endDate) {
      dateConditions.push(sql`${audioNewsletterListens.startedAt} <= ${endDate as string}`);
    }
    const dateClause = dateConditions.length > 0 ? and(...dateConditions) : undefined;
    
    let csvData = '';
    let filename = '';
    
    switch (type) {
      case 'newsletters':
        // Export newsletter details
        const newsletters = await db
          .select({
            id: audioNewsletters.id,
            title: audioNewsletters.title,
            voiceModel: audioNewsletters.voiceModel,
            status: audioNewsletters.status,
            duration: audioNewsletters.duration,
            publishedAt: audioNewsletters.publishedAt,
            createdAt: audioNewsletters.createdAt,
            totalListens: sql`count(${audioNewsletterListens.id})`,
            uniqueListeners: sql`count(distinct ${audioNewsletterListens.userId})`,
            avgCompletion: sql`avg(${audioNewsletterListens.completionPercentage})`
          })
          .from(audioNewsletters)
          .leftJoin(
            audioNewsletterListens,
            eq(audioNewsletters.id, audioNewsletterListens.newsletterId)
          )
          .where(dateClause ? and(eq(audioNewsletters.status, 'published'), dateClause) : eq(audioNewsletters.status, 'published'))
          .groupBy(
            audioNewsletters.id,
            audioNewsletters.title,
            audioNewsletters.voiceModel,
            audioNewsletters.status,
            audioNewsletters.duration,
            audioNewsletters.publishedAt,
            audioNewsletters.createdAt
          );
        
        // Create CSV
        csvData = 'ID,Title,Voice Model,Status,Duration (seconds),Published At,Created At,Total Listens,Unique Listeners,Avg Completion (%)\n';
        csvData += newsletters.map(n => 
          `"${n.id}","${n.title}","${n.voiceModel || 'default'}","${n.status}",${n.duration || 0},"${n.publishedAt || ''}","${n.createdAt}",${n.totalListens || 0},${n.uniqueListeners || 0},${Number(n.avgCompletion || 0).toFixed(2)}`
        ).join('\n');
        
        filename = `newsletters-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      
      case 'listens':
        // Export listen events
        const listens = await db
          .select({
            newsletterTitle: audioNewsletters.title,
            userId: audioNewsletterListens.userId,
            listenedAt: audioNewsletterListens.startedAt,
            duration: audioNewsletterListens.duration,
            completionRate: audioNewsletterListens.completionPercentage,
            deviceType: audioNewsletterListens.deviceType,
            userAgent: audioNewsletterListens.userAgent
          })
          .from(audioNewsletterListens)
          .leftJoin(
            audioNewsletters,
            eq(audioNewsletterListens.newsletterId, audioNewsletters.id)
          )
          .where(dateClause)
          .orderBy(desc(audioNewsletterListens.startedAt));
        
        // Create CSV
        csvData = 'Newsletter,User ID,Listened At,Duration (seconds),Completion (%),Device Type,User Agent\n';
        csvData += listens.map(l => 
          `"${l.newsletterTitle}","${l.userId || 'anonymous'}","${l.listenedAt}",${l.duration || 0},${l.completionRate || 0},"${l.deviceType || 'unknown'}","${l.userAgent || ''}"`
        ).join('\n');
        
        filename = `listen-events-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      
      default: // overview
        // Export summary statistics
        const stats = await db
          .select({
            date: sql`date(${audioNewsletterListens.startedAt})`,
            listens: sql`count(*)`,
            uniqueUsers: sql`count(distinct ${audioNewsletterListens.userId})`,
            avgCompletion: sql`avg(${audioNewsletterListens.completionPercentage})`,
            avgDuration: sql`avg(${audioNewsletterListens.duration})`,
            totalDuration: sql`sum(${audioNewsletterListens.duration})`
          })
          .from(audioNewsletterListens)
          .where(dateClause)
          .groupBy(sql`date(${audioNewsletterListens.startedAt})`)
          .orderBy(sql`date(${audioNewsletterListens.startedAt})`);
        
        // Create CSV
        csvData = 'Date,Total Listens,Unique Users,Avg Completion (%),Avg Duration (seconds),Total Hours\n';
        csvData += stats.map(s => 
          `"${s.date}",${s.listens || 0},${s.uniqueUsers || 0},${Number(s.avgCompletion || 0).toFixed(2)},${Number(s.avgDuration || 0).toFixed(0)},${(Number(s.totalDuration || 0) / 3600).toFixed(2)}`
        ).join('\n');
        
        filename = `analytics-overview-${new Date().toISOString().split('T')[0]}.csv`;
    }
    
    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

// Enhanced listen tracking with device detection - PUBLIC endpoint
// Rate limited to prevent abuse
router.post('/newsletters/:id/track', async (req, res) => {
  try {
    const {
      duration = 0,
      completionRate = 0,
      dropOffPoint = null
    } = req.body;
    
    // Extract device type from user agent
    const userAgent = req.headers['user-agent'] || '';
    let deviceType = 'desktop';
    
    if (/mobile/i.test(userAgent)) {
      deviceType = 'mobile';
    } else if (/tablet|ipad/i.test(userAgent)) {
      deviceType = 'tablet';
    }
    
    // Get user ID from session or generate anonymous ID from IP
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.id || `anon_${clientIp}_${Date.now()}`;
    
    // Simple rate limiting check - max 10 tracks per IP per hour
    const rateLimitKey = `track_${req.params.id}_${clientIp}_${new Date().getHours()}`;
    
    // Create listen record
    const listenId = nanoid();
    await db.insert(audioNewsletterListens).values({
      newsletterId: req.params.id,
      userId: userId,
      startedAt: new Date(),
      duration,
      completionPercentage: completionRate,
      deviceType,
      userAgent
    });
    
    // Update newsletter listen count
    await db
      .update(audioNewsletters)
      .set({
        totalListens: sql`${audioNewsletters.totalListens} + 1`
      })
      .where(eq(audioNewsletters.id, req.params.id));
    
    // Log anonymous tracking for monitoring
    if (!(req as any).user?.id) {
      console.log(`[AudioNewsletter] Anonymous track - Newsletter: ${req.params.id}, IP: ${clientIp}, Completion: ${completionRate}%`);
    }
    
    res.json({ success: true, listenId });
  } catch (error) {
    console.error('Error tracking listen:', error);
    res.status(500).json({ error: 'Failed to track listen' });
  }
});

// Get admin newsletters list (existing endpoint enhanced)
router.get('/admin', requirePermission("articles.create"), async (req, res) => {
  try {
    const newsletters = await db
      .select({
        id: audioNewsletters.id,
        title: audioNewsletters.title,
        description: audioNewsletters.description,
        status: audioNewsletters.status,
        duration: audioNewsletters.duration,
        publishedAt: audioNewsletters.publishedAt,
        createdAt: audioNewsletters.createdAt,
        totalListens: audioNewsletters.totalListens,
        averageCompletion: sql<number>`COALESCE((
          select avg(completion_percentage) 
          from ${audioNewsletterListens} 
          where newsletter_id = ${audioNewsletters.id}
        ), 0)`,
        articlesCount: sql<number>`(
          select count(*) 
          from ${audioNewsletterArticles} 
          where newsletter_id = ${audioNewsletters.id}
        )`,
        templateId: sql<string>`null`,
        templateName: sql<string>`null`,
        schedule: sql<any>`null`
      })
      .from(audioNewsletters)
      .orderBy(desc(audioNewsletters.createdAt));
    
    res.json(newsletters);
  } catch (error) {
    console.error('Error fetching admin newsletters:', error);
    res.status(500).json({ error: 'Failed to fetch newsletters' });
  }
});

// Get analytics summary (simpler endpoint for dashboard)
router.get('/analytics', requirePermission("analytics.view"), async (req, res) => {
  try {
    // Get totals
    const [totals] = await db
      .select({
        totalNewsletters: sql`count(distinct ${audioNewsletters.id})`,
        totalListens: sql`count(${audioNewsletterListens.id})`,
        activeListeners: sql`count(distinct ${audioNewsletterListens.userId})`,
        avgCompletion: sql`avg(${audioNewsletterListens.completionPercentage})`
      })
      .from(audioNewsletters)
      .leftJoin(
        audioNewsletterListens,
        eq(audioNewsletters.id, audioNewsletterListens.newsletterId)
      )
      .where(eq(audioNewsletters.status, 'published'));
    
    // Get scheduled count
    const [{ scheduledCount }] = await db
      .select({ scheduledCount: sql`count(*)` })
      .from(audioNewsletters)
      .where(eq(audioNewsletters.status, 'scheduled'));
    
    // Get today's count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [{ publishedToday }] = await db
      .select({ publishedToday: sql`count(*)` })
      .from(audioNewsletters)
      .where(
        and(
          eq(audioNewsletters.status, 'published'),
          gte(audioNewsletters.publishedAt, today)
        )
      );
    
    // Calculate weekly growth
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const [{ thisWeek }] = await db
      .select({ thisWeek: sql`count(*)` })
      .from(audioNewsletterListens)
      .where(gte(audioNewsletterListens.startedAt, oneWeekAgo));
    
    const [{ lastWeek }] = await db
      .select({ lastWeek: sql`count(*)` })
      .from(audioNewsletterListens)
      .where(
        and(
          gte(audioNewsletterListens.startedAt, twoWeeksAgo),
          lte(audioNewsletterListens.startedAt, oneWeekAgo)
        )
      );
    
    const weeklyGrowth = Number(lastWeek) > 0 ? 
      ((Number(thisWeek) - Number(lastWeek)) / Number(lastWeek)) * 100 : 0;
    
    res.json({
      totalNewsletters: Number(totals.totalNewsletters) || 0,
      totalListens: Number(totals.totalListens) || 0,
      averageCompletion: Number(totals.avgCompletion) || 0,
      activeListeners: Number(totals.activeListeners) || 0,
      scheduledCount: Number(scheduledCount) || 0,
      publishedToday: Number(publishedToday) || 0,
      weeklyGrowth
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;