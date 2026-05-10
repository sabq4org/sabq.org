import Parser from 'rss-parser';
import { db } from '../db';
import { eq, desc, inArray, and, sql, isNull } from 'drizzle-orm';
import { createAIResponse } from '../openai';
import { analyzeSentiment, detectLanguage } from '../sentiment-analyzer';
import { ObjectStorageService, toCdnUrl } from '../objectStorage';
import { extractArticleContent } from './urlContentExtractor';
import {
  foreignRssSources,
  foreignRssItems,
  foreignProcessedArticles,
  saudiKeywords,
  categories,
  type ForeignRssSource,
  type ForeignRssItem,
  type ForeignProcessedArticle,
  type SaudiKeyword,
  type InsertForeignRssItem,
  type InsertForeignProcessedArticle,
} from '@shared/schema';
import { randomUUID } from 'crypto';

// Minimum content length threshold (in characters) before fetching full article
const MIN_CONTENT_LENGTH = 300;

const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'Sabq News Aggregator/1.0',
  },
});

const objectStorage = new ObjectStorageService();

const DEFAULT_SAUDI_KEYWORDS = [
  { keyword: 'Saudi Arabia', language: 'en', category: 'general', weight: 1.0 },
  { keyword: 'Kingdom of Saudi Arabia', language: 'en', category: 'general', weight: 1.0 },
  { keyword: 'KSA', language: 'en', category: 'general', weight: 0.8 },
  { keyword: 'Riyadh', language: 'en', category: 'cities', weight: 0.9 },
  { keyword: 'Jeddah', language: 'en', category: 'cities', weight: 0.9 },
  { keyword: 'Mecca', language: 'en', category: 'cities', weight: 1.0 },
  { keyword: 'Medina', language: 'en', category: 'cities', weight: 1.0 },
  { keyword: 'Dammam', language: 'en', category: 'cities', weight: 0.8 },
  { keyword: 'MBS', language: 'en', category: 'politics', weight: 1.0 },
  { keyword: 'Mohammed bin Salman', language: 'en', category: 'politics', weight: 1.0 },
  { keyword: 'Crown Prince', language: 'en', category: 'politics', weight: 0.7 },
  { keyword: 'King Salman', language: 'en', category: 'politics', weight: 1.0 },
  { keyword: 'Vision 2030', language: 'en', category: 'economy', weight: 1.0 },
  { keyword: 'NEOM', language: 'en', category: 'economy', weight: 1.0 },
  { keyword: 'Saudi Aramco', language: 'en', category: 'economy', weight: 1.0 },
  { keyword: 'Aramco', language: 'en', category: 'economy', weight: 0.9 },
  { keyword: 'Saudi PIF', language: 'en', category: 'economy', weight: 1.0 },
  { keyword: 'Public Investment Fund', language: 'en', category: 'economy', weight: 0.9 },
  { keyword: 'The Line', language: 'en', category: 'economy', weight: 0.8 },
  { keyword: 'Red Sea Project', language: 'en', category: 'economy', weight: 0.9 },
  { keyword: 'AlUla', language: 'en', category: 'tourism', weight: 0.9 },
  { keyword: 'Saudi tourism', language: 'en', category: 'tourism', weight: 0.9 },
  { keyword: 'Saudi Pro League', language: 'en', category: 'sports', weight: 0.9 },
  { keyword: 'Al-Hilal', language: 'en', category: 'sports', weight: 0.7 },
  { keyword: 'Al-Nassr', language: 'en', category: 'sports', weight: 0.7 },
  { keyword: 'Saudi Arabia', language: 'fr', category: 'general', weight: 1.0 },
  { keyword: 'Arabie Saoudite', language: 'fr', category: 'general', weight: 1.0 },
  { keyword: 'Riyad', language: 'fr', category: 'cities', weight: 0.9 },
  { keyword: 'Saudi-Arabien', language: 'de', category: 'general', weight: 1.0 },
  { keyword: 'Arabia Saudita', language: 'es', category: 'general', weight: 1.0 },
];

export interface ForeignNewsProcessingResult {
  success: boolean;
  rawItemId?: string;
  processedArticleId?: string;
  error?: string;
}

export interface FeedIngestionResult {
  sourceId: string;
  sourceName: string;
  itemsFound: number;
  itemsIngested: number;
  saudiRelatedItems: number;
  errors: string[];
}

export interface TranslationResult {
  translatedTitle: string;
  translatedContent: string;
  translatedExcerpt: string;
}

export interface ContentGenerationResult {
  aiHeadline: string;
  aiSubtitle: string;
  aiSummary: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  imageAltText: string;
  suggestedCategorySlug: string;
}

export class ForeignNewsService {
  private keywordsCache: SaudiKeyword[] | null = null;
  private keywordsCacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000;

  async ensureDefaultKeywords(): Promise<void> {
    const existingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(saudiKeywords)
      .then(r => Number(r[0]?.count || 0));

    if (existingCount === 0) {
      console.log('[ForeignNews] Initializing default Saudi keywords...');
      for (const kw of DEFAULT_SAUDI_KEYWORDS) {
        try {
          await db.insert(saudiKeywords).values({
            id: randomUUID(),
            keyword: kw.keyword,
            language: kw.language,
            category: kw.category,
            weight: kw.weight,
            isActive: true,
          }).onConflictDoNothing();
        } catch (err) {
          console.warn(`[ForeignNews] Could not insert keyword ${kw.keyword}:`, err);
        }
      }
      console.log('[ForeignNews] Default keywords initialized');
    }
  }

  async getActiveKeywords(): Promise<SaudiKeyword[]> {
    const now = Date.now();
    if (this.keywordsCache && (now - this.keywordsCacheTime) < this.CACHE_TTL) {
      return this.keywordsCache;
    }

    this.keywordsCache = await db
      .select()
      .from(saudiKeywords)
      .where(eq(saudiKeywords.isActive, true));
    this.keywordsCacheTime = now;
    return this.keywordsCache;
  }

  async ingestFeed(sourceId: string): Promise<FeedIngestionResult> {
    const source = await db
      .select()
      .from(foreignRssSources)
      .where(eq(foreignRssSources.id, sourceId))
      .limit(1)
      .then(r => r[0]);

    if (!source) {
      throw new Error(`RSS source not found: ${sourceId}`);
    }

    if (!source.isActive) {
      throw new Error(`RSS source is inactive: ${source.name}`);
    }

    const result: FeedIngestionResult = {
      sourceId: source.id,
      sourceName: source.name,
      itemsFound: 0,
      itemsIngested: 0,
      saudiRelatedItems: 0,
      errors: [],
    };

    try {
      console.log(`[ForeignNews] Fetching feed: ${source.name} (${source.url})`);
      const feed = await parser.parseURL(source.url);
      result.itemsFound = feed.items?.length || 0;

      console.log(`[ForeignNews] Found ${result.itemsFound} items in feed`);

      const keywords = await this.getActiveKeywords();

      for (const item of feed.items || []) {
        try {
          if (!item.title || !item.link) {
            continue;
          }

          const existing = await db
            .select({ id: foreignRssItems.id })
            .from(foreignRssItems)
            .where(eq(foreignRssItems.originalUrl, item.link))
            .limit(1)
            .then(r => r[0]);

          if (existing) {
            continue;
          }

          const { isSaudiRelated, relevanceScore, keywordsFound } = this.checkSaudiRelevance(
            item.title,
            item.contentSnippet || item.content || '',
            keywords
          );

          const newItem: InsertForeignRssItem = {
            sourceId: source.id,
            originalTitle: item.title,
            originalContent: item.content || item.contentSnippet || null,
            originalExcerpt: item.contentSnippet?.substring(0, 500) || null,
            originalUrl: item.link,
            originalImageUrl: this.extractImageUrl(item),
            originalAuthor: item.creator || item.author || null,
            originalPublishedAt: item.isoDate ? new Date(item.isoDate) : null,
            language: source.language || 'en',
            isSaudiRelated,
            saudiRelevanceScore: relevanceScore,
            saudiKeywordsFound: keywordsFound.length > 0 ? keywordsFound : null,
            status: 'pending',
          };

          await db.insert(foreignRssItems).values({
            id: randomUUID(),
            ...newItem,
          });

          result.itemsIngested++;
          if (isSaudiRelated) {
            result.saudiRelatedItems++;
          }
        } catch (itemError: any) {
          result.errors.push(`Item error: ${itemError.message}`);
        }
      }

      await db
        .update(foreignRssSources)
        .set({
          lastFetchedAt: new Date(),
          articlesImported: sql`${foreignRssSources.articlesImported} + ${result.itemsIngested}`,
          updatedAt: new Date(),
        })
        .where(eq(foreignRssSources.id, sourceId));

      console.log(`[ForeignNews] Ingested ${result.itemsIngested} items (${result.saudiRelatedItems} Saudi-related)`);
    } catch (error: any) {
      console.error(`[ForeignNews] Feed ingestion error for ${source.name}:`, error);
      result.errors.push(`Feed error: ${error.message}`);
    }

    return result;
  }

  async ingestAllActiveFeeds(): Promise<FeedIngestionResult[]> {
    const sources = await db
      .select()
      .from(foreignRssSources)
      .where(eq(foreignRssSources.isActive, true))
      .orderBy(desc(foreignRssSources.priority));

    console.log(`[ForeignNews] Starting ingestion for ${sources.length} active feeds`);
    const results: FeedIngestionResult[] = [];

    for (const source of sources) {
      try {
        const result = await this.ingestFeed(source.id);
        results.push(result);
      } catch (error: any) {
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          itemsFound: 0,
          itemsIngested: 0,
          saudiRelatedItems: 0,
          errors: [error.message],
        });
      }
    }

    return results;
  }

  checkSaudiRelevance(
    title: string,
    content: string,
    keywords: SaudiKeyword[]
  ): { isSaudiRelated: boolean; relevanceScore: number; keywordsFound: string[] } {
    const text = `${title} ${content}`.toLowerCase();
    const keywordsFound: string[] = [];
    let totalWeight = 0;

    for (const kw of keywords) {
      const kwLower = kw.keyword.toLowerCase();
      if (text.includes(kwLower)) {
        keywordsFound.push(kw.keyword);
        totalWeight += kw.weight || 1.0;
      }
    }

    const maxWeight = keywords.reduce((sum, kw) => sum + (kw.weight || 1), 0);
    const relevanceScore = maxWeight > 0 ? Math.min(1, totalWeight / 3) : 0;

    return {
      isSaudiRelated: keywordsFound.length > 0,
      relevanceScore,
      keywordsFound,
    };
  }

  private extractImageUrl(item: any): string | null {
    // Check standard enclosure
    if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
      return item.enclosure.url;
    }
    
    // Check enclosure without type check (some feeds don't specify type)
    if (item.enclosure?.url && /\.(jpg|jpeg|png|gif|webp)/i.test(item.enclosure.url)) {
      return item.enclosure.url;
    }

    // Check media:content - can be array or object
    const mediaContent = item['media:content'];
    if (Array.isArray(mediaContent) && mediaContent.length > 0) {
      const img = mediaContent.find((m: any) => m.$?.medium === 'image' || m.$?.type?.startsWith('image/'));
      if (img?.$?.url) return img.$.url;
      if (mediaContent[0].$?.url) return mediaContent[0].$.url;
    } else if (mediaContent?.$?.url) {
      return mediaContent.$.url;
    } else if (mediaContent?.url) {
      return mediaContent.url;
    }

    // Check media:thumbnail
    const mediaThumbnail = item['media:thumbnail'];
    if (Array.isArray(mediaThumbnail) && mediaThumbnail.length > 0) {
      if (mediaThumbnail[0].$?.url) return mediaThumbnail[0].$.url;
      if (mediaThumbnail[0].url) return mediaThumbnail[0].url;
    } else if (mediaThumbnail?.$?.url) {
      return mediaThumbnail.$.url;
    } else if (mediaThumbnail?.url) {
      return mediaThumbnail.url;
    }

    // Check media:group for grouped media
    const mediaGroup = item['media:group'];
    if (mediaGroup) {
      const groupContent = mediaGroup['media:content'];
      if (Array.isArray(groupContent) && groupContent.length > 0) {
        if (groupContent[0].$?.url) return groupContent[0].$.url;
      }
      const groupThumb = mediaGroup['media:thumbnail'];
      if (groupThumb?.$?.url) return groupThumb.$.url;
    }

    // Check image property directly
    if (item.image?.url) {
      return item.image.url;
    }
    if (typeof item.image === 'string' && item.image.startsWith('http')) {
      return item.image;
    }

    // Extract from content/description
    const content = item.content || item['content:encoded'] || item.description || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) {
      return imgMatch[1];
    }

    return null;
  }

  async translateContent(
    title: string,
    content: string,
    sourceLanguage: string
  ): Promise<TranslationResult> {
    console.log(`[ForeignNews] Translating content from ${sourceLanguage} to Arabic...`);

    const prompt = `أنت مترجم صحفي محترف متخصص في ترجمة الأخبار الدولية إلى العربية. مهمتك ترجمة النص التالي بأسلوب صحفي احترافي - ليس ترجمة حرفية، بل ترجمة تراعي السياق الثقافي العربي وتستخدم المصطلحات الصحفية المناسبة.

القواعد:
- استخدم لغة عربية فصحى صحفية سلسة
- حافظ على دقة المعلومات والأرقام
- استخدم المصطلحات المتداولة في الإعلام العربي
- تجنب الترجمة الحرفية التي تبدو غريبة
- احرص على أن يبدو النص كأنه مكتوب أصلاً بالعربية
- ترجم أسماء المنظمات والأماكن بالطريقة المتعارف عليها عربياً

العنوان الأصلي:
${title}

المحتوى الأصلي:
${content}

أعد الترجمة بصيغة JSON:
{
  "translatedTitle": "العنوان المترجم",
  "translatedContent": "المحتوى المترجم الكامل",
  "translatedExcerpt": "ملخص قصير في جملتين أو ثلاث"
}`;

    try {
      const response = await createAIResponse({
        messages: [
          { role: 'system', content: 'أنت مترجم صحفي خبير. أجب فقط بصيغة JSON المطلوبة.' },
          { role: 'user', content: prompt },
        ],
        responseFormat: { type: 'json_object' },
        maxTokens: 4096,
      });

      const responseText = response.choices?.[0]?.message?.content || '';
      const result = JSON.parse(responseText);

      return {
        translatedTitle: result.translatedTitle || title,
        translatedContent: result.translatedContent || content,
        translatedExcerpt: result.translatedExcerpt || '',
      };
    } catch (error: any) {
      console.error('[ForeignNews] Translation error:', error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async generateContent(
    translatedTitle: string,
    translatedContent: string,
    sourceAttribution: string
  ): Promise<ContentGenerationResult> {
    console.log('[ForeignNews] Generating AI content (headline, summary, SEO)...');

    const prompt = `أنت محرر صحفي خبير في "سبق". مهمتك إنشاء محتوى إضافي للخبر التالي:

العنوان: ${translatedTitle}

المحتوى: ${translatedContent.substring(0, 2000)}

المصدر: ${sourceAttribution}

أنشئ:
1. عنوان جذاب للسوشيال ميديا (قصير ومثير للاهتمام، 50-70 حرف)
2. عنوان فرعي قصير (جملة واحدة توضح الفكرة الرئيسية، 40-60 حرف)
3. ملخص قصير (2-3 جمل)
4. عنوان SEO (محسّن لمحركات البحث، 60-70 حرف)
5. وصف SEO (150-160 حرف)
6. كلمات مفتاحية SEO (5-7 كلمات)
7. نص بديل للصورة (وصف مناسب للصورة المرافقة)
8. التصنيف المناسب من القائمة التالية:
   - politics (سياسة)
   - economy (اقتصاد)
   - sports (رياضة)
   - society (مجتمع)
   - culture (ثقافة)
   - technology (تقنية)
   - health (صحة)
   - entertainment (ترفيه)
   - international (دولي)
   - local (محلي)
   - tourism (سياحة)

أجب بصيغة JSON:
{
  "aiHeadline": "العنوان الجذاب",
  "aiSubtitle": "العنوان الفرعي",
  "aiSummary": "الملخص",
  "seoTitle": "عنوان SEO",
  "seoDescription": "وصف SEO",
  "seoKeywords": ["كلمة1", "كلمة2"],
  "imageAltText": "وصف الصورة",
  "suggestedCategorySlug": "politics"
}`;

    try {
      const response = await createAIResponse({
        messages: [
          { role: 'system', content: 'أنت محرر صحفي خبير. أجب فقط بصيغة JSON.' },
          { role: 'user', content: prompt },
        ],
        responseFormat: { type: 'json_object' },
        maxTokens: 1024,
      });

      const responseText = response.choices?.[0]?.message?.content || '';
      const result = JSON.parse(responseText);

      return {
        aiHeadline: result.aiHeadline || translatedTitle.substring(0, 70),
        aiSubtitle: result.aiSubtitle || '',
        aiSummary: result.aiSummary || '',
        seoTitle: result.seoTitle || translatedTitle.substring(0, 70),
        seoDescription: result.seoDescription || '',
        seoKeywords: result.seoKeywords || [],
        imageAltText: result.imageAltText || '',
        suggestedCategorySlug: result.suggestedCategorySlug || 'international',
      };
    } catch (error: any) {
      console.error('[ForeignNews] Content generation error:', error);
      return {
        aiHeadline: translatedTitle.substring(0, 70),
        aiSubtitle: '',
        aiSummary: '',
        seoTitle: translatedTitle.substring(0, 70),
        seoDescription: '',
        seoKeywords: [],
        imageAltText: '',
        suggestedCategorySlug: 'international',
      };
    }
  }

  async analyzeSentimentAboutSaudi(
    content: string
  ): Promise<{ sentiment: string; score: number; confidence: number }> {
    console.log('[ForeignNews] Analyzing sentiment about Saudi Arabia...');

    const detectedLang = detectLanguage(content);

    try {
      const result = await analyzeSentiment(content, detectedLang);
      
      let score = 0;
      if (result.sentiment === 'positive') score = result.confidence;
      else if (result.sentiment === 'negative') score = -result.confidence;

      return {
        sentiment: result.sentiment,
        score,
        confidence: result.confidence,
      };
    } catch (error: any) {
      console.error('[ForeignNews] Sentiment analysis error:', error);
      return {
        sentiment: 'neutral',
        score: 0,
        confidence: 0,
      };
    }
  }

  async downloadAndSaveImage(
    imageUrl: string,
    articleId: string
  ): Promise<string | null> {
    if (!imageUrl) return null;

    console.log(`[ForeignNews] Downloading image: ${imageUrl}`);

    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Sabq News Aggregator/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = contentType.split('/')[1]?.split(';')[0] || 'jpg';
      const filename = `foreign-news/${articleId}.${extension}`;

      const { url } = await objectStorage.uploadFile(
        filename,
        buffer,
        contentType,
        'public'
      );

      console.log(`[ForeignNews] Image saved: ${url}`);
      return url;
    } catch (error: any) {
      console.error(`[ForeignNews] Image download error:`, error);
      return null;
    }
  }

  async processRawItem(rawItemId: string): Promise<ForeignNewsProcessingResult> {
    console.log(`[ForeignNews] Processing raw item: ${rawItemId}`);

    const rawItem = await db
      .select()
      .from(foreignRssItems)
      .where(eq(foreignRssItems.id, rawItemId))
      .limit(1)
      .then(r => r[0]);

    if (!rawItem) {
      return { success: false, error: 'Raw item not found' };
    }

    if (rawItem.status === 'processed') {
      return { success: false, error: 'Item already processed' };
    }

    try {
      await db
        .update(foreignRssItems)
        .set({ status: 'processing' })
        .where(eq(foreignRssItems.id, rawItemId));

      const source = await db
        .select()
        .from(foreignRssSources)
        .where(eq(foreignRssSources.id, rawItem.sourceId))
        .limit(1)
        .then(r => r[0]);

      const sourceAttribution = source?.name || 'Unknown Source';
      const sourceLanguage = rawItem.language || 'en';

      // Get content - fetch full article if RSS content is too short
      let contentForTranslation = rawItem.originalContent || rawItem.originalExcerpt || '';
      
      if (contentForTranslation.length < MIN_CONTENT_LENGTH && rawItem.originalUrl) {
        console.log(`[ForeignNews] RSS content too short (${contentForTranslation.length} chars), fetching full article from: ${rawItem.originalUrl}`);
        try {
          const fullContent = await extractArticleContent(rawItem.originalUrl);
          if (fullContent.success && fullContent.article?.content && fullContent.article.content.length > contentForTranslation.length) {
            console.log(`[ForeignNews] Successfully extracted full content (${fullContent.article.content.length} chars)`);
            contentForTranslation = fullContent.article.content;
          }
        } catch (extractError: any) {
          console.warn(`[ForeignNews] Failed to extract full content: ${extractError.message}, using RSS content`);
        }
      }

      const { translatedTitle, translatedContent, translatedExcerpt } =
        await this.translateContent(
          rawItem.originalTitle,
          contentForTranslation,
          sourceLanguage
        );

      const generatedContent = await this.generateContent(
        translatedTitle,
        translatedContent,
        sourceAttribution
      );

      const sentimentResult = await this.analyzeSentimentAboutSaudi(
        `${translatedTitle} ${translatedContent}`
      );

      const processedId = randomUUID();

      let localImageUrl: string | null = null;
      if (rawItem.originalImageUrl) {
        localImageUrl = await this.downloadAndSaveImage(
          rawItem.originalImageUrl,
          processedId
        );
      }

      // Look up category by slug
      let categoryId: string | null = null;
      if (generatedContent.suggestedCategorySlug) {
        const category = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.slug, generatedContent.suggestedCategorySlug))
          .limit(1)
          .then(r => r[0]);
        if (category) {
          categoryId = category.id;
        }
      }

      const processedArticle: InsertForeignProcessedArticle = {
        rawItemId: rawItem.id,
        sourceId: rawItem.sourceId,
        translatedTitle,
        translatedContent,
        translatedExcerpt,
        aiHeadline: generatedContent.aiHeadline,
        aiSubtitle: generatedContent.aiSubtitle,
        aiSummary: generatedContent.aiSummary,
        seoTitle: generatedContent.seoTitle,
        seoDescription: generatedContent.seoDescription,
        seoKeywords: generatedContent.seoKeywords,
        sentiment: sentimentResult.sentiment,
        sentimentScore: sentimentResult.score,
        sentimentConfidence: sentimentResult.confidence,
        localImageUrl,
        imageAltText: generatedContent.imageAltText,
        sourceAttribution,
        originalUrl: rawItem.originalUrl,
        editorialStatus: 'pending',
        categoryId,
      };

      await db.insert(foreignProcessedArticles).values({
        id: processedId,
        ...processedArticle,
      });

      await db
        .update(foreignRssItems)
        .set({
          status: 'processed',
          processedAt: new Date(),
        })
        .where(eq(foreignRssItems.id, rawItemId));

      console.log(`[ForeignNews] Successfully processed item: ${processedId}`);

      return {
        success: true,
        rawItemId: rawItem.id,
        processedArticleId: processedId,
      };
    } catch (error: any) {
      console.error(`[ForeignNews] Processing error for ${rawItemId}:`, error);

      await db
        .update(foreignRssItems)
        .set({
          status: 'error',
          processingError: error.message,
        })
        .where(eq(foreignRssItems.id, rawItemId));

      return {
        success: false,
        rawItemId,
        error: error.message,
      };
    }
  }

  async processPendingSaudiRelatedItems(limit: number = 10): Promise<ForeignNewsProcessingResult[]> {
    const pendingItems = await db
      .select()
      .from(foreignRssItems)
      .where(
        and(
          eq(foreignRssItems.status, 'pending'),
          eq(foreignRssItems.isSaudiRelated, true)
        )
      )
      .orderBy(desc(foreignRssItems.createdAt))
      .limit(limit);

    console.log(`[ForeignNews] Processing ${pendingItems.length} pending Saudi-related items`);

    const results: ForeignNewsProcessingResult[] = [];
    for (const item of pendingItems) {
      const result = await this.processRawItem(item.id);
      results.push(result);
    }

    return results;
  }

  async getSources(): Promise<ForeignRssSource[]> {
    return db
      .select()
      .from(foreignRssSources)
      .orderBy(desc(foreignRssSources.priority));
  }

  async getSource(id: string): Promise<ForeignRssSource | null> {
    return db
      .select()
      .from(foreignRssSources)
      .where(eq(foreignRssSources.id, id))
      .limit(1)
      .then(r => r[0] || null);
  }

  async createSource(data: {
    name: string;
    nameAr?: string;
    url: string;
    language?: string;
    country?: string;
    category?: string;
    priority?: number;
  }): Promise<ForeignRssSource> {
    const id = randomUUID();
    await db.insert(foreignRssSources).values({
      id,
      name: data.name,
      nameAr: data.nameAr,
      url: data.url,
      language: data.language || 'en',
      country: data.country,
      category: data.category,
      priority: data.priority || 5,
      isActive: true,
    });

    return this.getSource(id) as Promise<ForeignRssSource>;
  }

  async updateSource(
    id: string,
    data: Partial<{
      name: string;
      nameAr: string;
      url: string;
      language: string;
      country: string;
      category: string;
      priority: number;
      isActive: boolean;
      fetchIntervalMinutes: number;
    }>
  ): Promise<ForeignRssSource | null> {
    await db
      .update(foreignRssSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(foreignRssSources.id, id));

    return this.getSource(id);
  }

  async deleteSource(id: string): Promise<void> {
    await db.delete(foreignRssSources).where(eq(foreignRssSources.id, id));
  }

  async getRawItems(options: {
    sourceId?: string;
    status?: string;
    saudiRelatedOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<ForeignRssItem[]> {
    const conditions = [];
    
    if (options.sourceId) {
      conditions.push(eq(foreignRssItems.sourceId, options.sourceId));
    }
    if (options.status) {
      conditions.push(eq(foreignRssItems.status, options.status));
    }
    if (options.saudiRelatedOnly) {
      conditions.push(eq(foreignRssItems.isSaudiRelated, true));
    }

    let query = db.select().from(foreignRssItems);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query
      .orderBy(desc(foreignRssItems.createdAt))
      .limit(options.limit || 50)
      .offset(options.offset || 0);
  }

  async getProcessedArticles(options: {
    sourceId?: string;
    editorialStatus?: string;
    sentiment?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ForeignProcessedArticle[]> {
    const conditions = [];
    
    if (options.sourceId) {
      conditions.push(eq(foreignProcessedArticles.sourceId, options.sourceId));
    }
    if (options.editorialStatus) {
      conditions.push(eq(foreignProcessedArticles.editorialStatus, options.editorialStatus));
    }
    if (options.sentiment) {
      conditions.push(eq(foreignProcessedArticles.sentiment, options.sentiment));
    }

    let query = db.select().from(foreignProcessedArticles);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query
      .orderBy(desc(foreignProcessedArticles.createdAt))
      .limit(options.limit || 50)
      .offset(options.offset || 0);
  }

  async getProcessedArticle(id: string): Promise<ForeignProcessedArticle | null> {
    return db
      .select()
      .from(foreignProcessedArticles)
      .where(eq(foreignProcessedArticles.id, id))
      .limit(1)
      .then(r => r[0] || null);
  }

  async updateProcessedArticle(
    id: string,
    data: Partial<{
      translatedTitle: string;
      translatedContent: string;
      translatedExcerpt: string;
      aiHeadline: string;
      aiSubtitle: string;
      aiSummary: string;
      seoTitle: string;
      seoDescription: string;
      seoKeywords: string[];
      editorialStatus: string;
      reviewedBy: string;
      rejectionReason: string;
      categoryId: string;
    }>
  ): Promise<ForeignProcessedArticle | null> {
    const updateData: any = { ...data, updatedAt: new Date() };
    
    if (data.editorialStatus && ['approved', 'rejected'].includes(data.editorialStatus)) {
      updateData.reviewedAt = new Date();
    }

    await db
      .update(foreignProcessedArticles)
      .set(updateData)
      .where(eq(foreignProcessedArticles.id, id));

    return this.getProcessedArticle(id);
  }

  async getKeywords(): Promise<SaudiKeyword[]> {
    return db.select().from(saudiKeywords).orderBy(saudiKeywords.keyword);
  }

  async createKeyword(data: {
    keyword: string;
    language?: string;
    category?: string;
    weight?: number;
  }): Promise<SaudiKeyword> {
    const id = randomUUID();
    await db.insert(saudiKeywords).values({
      id,
      keyword: data.keyword,
      language: data.language || 'en',
      category: data.category,
      weight: data.weight || 1.0,
      isActive: true,
    });

    this.keywordsCache = null;

    return db
      .select()
      .from(saudiKeywords)
      .where(eq(saudiKeywords.id, id))
      .limit(1)
      .then(r => r[0]);
  }

  async updateKeyword(
    id: string,
    data: Partial<{
      keyword: string;
      language: string;
      category: string;
      weight: number;
      isActive: boolean;
    }>
  ): Promise<SaudiKeyword | null> {
    await db.update(saudiKeywords).set(data).where(eq(saudiKeywords.id, id));
    this.keywordsCache = null;

    return db
      .select()
      .from(saudiKeywords)
      .where(eq(saudiKeywords.id, id))
      .limit(1)
      .then(r => r[0] || null);
  }

  async deleteKeyword(id: string): Promise<void> {
    await db.delete(saudiKeywords).where(eq(saudiKeywords.id, id));
    this.keywordsCache = null;
  }

  async getStats(): Promise<{
    totalSources: number;
    activeSources: number;
    totalRawItems: number;
    pendingItems: number;
    saudiRelatedItems: number;
    processedArticles: number;
    pendingEditorial: number;
    positiveArticles: number;
    negativeArticles: number;
    neutralArticles: number;
  }> {
    const [
      sourcesResult,
      rawItemsResult,
      processedResult,
    ] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`sum(case when ${foreignRssSources.isActive} then 1 else 0 end)`,
        })
        .from(foreignRssSources),
      db
        .select({
          total: sql<number>`count(*)`,
          pending: sql<number>`sum(case when ${foreignRssItems.status} = 'pending' then 1 else 0 end)`,
          saudiRelated: sql<number>`sum(case when ${foreignRssItems.isSaudiRelated} then 1 else 0 end)`,
        })
        .from(foreignRssItems),
      db
        .select({
          total: sql<number>`count(*)`,
          pending: sql<number>`sum(case when ${foreignProcessedArticles.editorialStatus} = 'pending' then 1 else 0 end)`,
          positive: sql<number>`sum(case when ${foreignProcessedArticles.sentiment} = 'positive' then 1 else 0 end)`,
          negative: sql<number>`sum(case when ${foreignProcessedArticles.sentiment} = 'negative' then 1 else 0 end)`,
          neutral: sql<number>`sum(case when ${foreignProcessedArticles.sentiment} = 'neutral' then 1 else 0 end)`,
        })
        .from(foreignProcessedArticles),
    ]);

    return {
      totalSources: Number(sourcesResult[0]?.total || 0),
      activeSources: Number(sourcesResult[0]?.active || 0),
      totalRawItems: Number(rawItemsResult[0]?.total || 0),
      pendingItems: Number(rawItemsResult[0]?.pending || 0),
      saudiRelatedItems: Number(rawItemsResult[0]?.saudiRelated || 0),
      processedArticles: Number(processedResult[0]?.total || 0),
      pendingEditorial: Number(processedResult[0]?.pending || 0),
      positiveArticles: Number(processedResult[0]?.positive || 0),
      negativeArticles: Number(processedResult[0]?.negative || 0),
      neutralArticles: Number(processedResult[0]?.neutral || 0),
    };
  }
}

export const foreignNewsService = new ForeignNewsService();
