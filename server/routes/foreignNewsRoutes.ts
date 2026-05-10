import { Router, type Request, Response } from 'express';
import { foreignNewsService } from '../services/foreignNewsService';
import { insertForeignRssSourceSchema, insertSaudiKeywordSchema } from '@shared/schema';
import { db } from '../db';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { foreignRssItems, foreignRssSources, foreignProcessedArticles, articles, categories } from '@shared/schema';
import { randomUUID } from 'crypto';
import { ZodError, z } from 'zod';

const router = Router();

function isAuthenticated(req: Request, res: Response, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function isAdmin(req: Request, res: Response, next: any) {
  const user = req.user as any;
  if (!user || !['admin', 'editor', 'chief_editor'].includes(user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ============================================
// SOURCES MANAGEMENT
// ============================================

router.get('/sources', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const sources = await foreignNewsService.getSources();
    res.json(sources);
  } catch (error) {
    console.error('[ForeignNews API] Get sources error:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

router.post('/sources', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const data = insertForeignRssSourceSchema.parse(req.body);
    const source = await foreignNewsService.createSource({
      name: data.name,
      nameAr: data.nameAr ?? undefined,
      url: data.url,
      language: data.language ?? undefined,
      country: data.country ?? undefined,
      category: data.category ?? undefined,
      priority: data.priority ?? undefined,
    });
    res.status(201).json(source);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[ForeignNews API] Create source error:', error);
    res.status(500).json({ error: 'Failed to create source' });
  }
});

router.put('/sources/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const source = await foreignNewsService.updateSource(id, req.body);
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }
    res.json(source);
  } catch (error) {
    console.error('[ForeignNews API] Update source error:', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

router.delete('/sources/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await foreignNewsService.deleteSource(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[ForeignNews API] Delete source error:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

router.post('/sources/:id/fetch', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await foreignNewsService.ingestFeed(id);
    res.json(result);
  } catch (error: any) {
    console.error('[ForeignNews API] Fetch source error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch source' });
  }
});

// ============================================
// RAW ITEMS
// ============================================

router.get('/items', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { sourceId, status, isSaudiRelated, limit = '50', offset = '0' } = req.query;
    
    const items = await foreignNewsService.getRawItems({
      sourceId: sourceId as string,
      status: status as string,
      saudiRelatedOnly: isSaudiRelated === 'true',
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
    
    res.json(items);
  } catch (error) {
    console.error('[ForeignNews API] Get items error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.get('/items/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await db
      .select()
      .from(foreignRssItems)
      .where(eq(foreignRssItems.id, id))
      .limit(1)
      .then(r => r[0]);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('[ForeignNews API] Get item error:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

router.post('/items/:id/process', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await foreignNewsService.processRawItem(id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('[ForeignNews API] Process item error:', error);
    res.status(500).json({ error: error.message || 'Failed to process item' });
  }
});

// ============================================
// PROCESSED ARTICLES
// ============================================

router.get('/processed', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { sentimentFilter, statusFilter, page = '1' } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limit = 20;
    const offset = (pageNum - 1) * limit;
    
    // Build conditions
    const conditions = [];
    
    if (sentimentFilter && sentimentFilter !== 'all') {
      conditions.push(eq(foreignProcessedArticles.sentiment, sentimentFilter as string));
    }
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(foreignProcessedArticles.editorialStatus, statusFilter as string));
    }
    
    // Get articles with source name
    const articlesQuery = db
      .select({
        id: foreignProcessedArticles.id,
        translatedTitle: foreignProcessedArticles.translatedTitle,
        originalTitle: foreignRssItems.originalTitle,
        translatedContent: foreignProcessedArticles.translatedContent,
        originalContent: foreignRssItems.originalContent,
        translatedExcerpt: foreignProcessedArticles.translatedExcerpt,
        sentiment: foreignProcessedArticles.sentiment,
        status: foreignProcessedArticles.editorialStatus,
        source: foreignRssSources.name,
        sourceUrl: foreignProcessedArticles.originalUrl,
        imageUrl: foreignProcessedArticles.localImageUrl,
        seoTitle: foreignProcessedArticles.seoTitle,
        seoDescription: foreignProcessedArticles.seoDescription,
        createdAt: foreignProcessedArticles.createdAt,
      })
      .from(foreignProcessedArticles)
      .leftJoin(foreignRssItems, eq(foreignProcessedArticles.rawItemId, foreignRssItems.id))
      .leftJoin(foreignRssSources, eq(foreignProcessedArticles.sourceId, foreignRssSources.id));
    
    let articles;
    if (conditions.length > 0) {
      articles = await articlesQuery
        .where(and(...conditions))
        .orderBy(desc(foreignProcessedArticles.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      articles = await articlesQuery
        .orderBy(desc(foreignProcessedArticles.createdAt))
        .limit(limit)
        .offset(offset);
    }
    
    // Get total count
    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(foreignProcessedArticles);
    
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as any;
    }
    
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);
    
    res.json({ articles, total });
  } catch (error) {
    console.error('[ForeignNews API] Get processed articles error:', error);
    res.status(500).json({ error: 'Failed to fetch processed articles' });
  }
});

router.get('/processed/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const article = await foreignNewsService.getProcessedArticle(id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json(article);
  } catch (error) {
    console.error('[ForeignNews API] Get processed article error:', error);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

router.put('/processed/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const article = await foreignNewsService.updateProcessedArticle(id, req.body);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json(article);
  } catch (error) {
    console.error('[ForeignNews API] Update processed article error:', error);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

router.post('/processed/:id/approve', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { categoryId } = req.body;
    const user = req.user as any;
    
    // Get the processed article first
    const processedArticle = await foreignNewsService.getProcessedArticle(id);
    if (!processedArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Determine target category
    let targetCategoryId = categoryId || processedArticle.categoryId;
    if (!targetCategoryId) {
      // Get default "عالمي" (international) category
      const defaultCategory = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, 'international'))
        .limit(1)
        .then(r => r[0]);
      
      if (!defaultCategory) {
        // Fallback to first category
        const anyCategory = await db
          .select({ id: categories.id })
          .from(categories)
          .limit(1)
          .then(r => r[0]);
        targetCategoryId = anyCategory?.id;
      } else {
        targetCategoryId = defaultCategory.id;
      }
    }
    
    // Generate slug from translated title
    const baseSlug = processedArticle.translatedTitle
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);
    const uniqueSlug = `${baseSlug}-${Date.now()}`;
    
    // Create draft article in main articles table
    const insertResult = await db.insert(articles).values({
      title: processedArticle.translatedTitle,
      slug: uniqueSlug,
      content: processedArticle.translatedContent || '',
      excerpt: processedArticle.translatedExcerpt || processedArticle.translatedContent?.substring(0, 200),
      imageUrl: processedArticle.localImageUrl,
      categoryId: targetCategoryId,
      authorId: user.id,
      submitterId: user.id,
      status: 'draft', // Goes to drafts
      seoTitle: processedArticle.seoTitle,
      seoDescription: processedArticle.seoDescription,
      locale: 'ar',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: articles.id });
    
    const newArticleId = insertResult[0]?.id;
    
    // Update processed article status and link to draft
    const article = await foreignNewsService.updateProcessedArticle(id, {
      editorialStatus: 'approved',
      reviewedBy: user.id,
    });
    
    // Link the draft article ID
    await db
      .update(foreignProcessedArticles)
      .set({ 
        publishedArticleId: newArticleId,
        updatedAt: new Date(),
      })
      .where(eq(foreignProcessedArticles.id, id));
    
    console.log(`[ForeignNews] Article approved and saved as draft: ${newArticleId}`);
    
    res.json({ 
      ...article, 
      draftArticleId: newArticleId,
      message: 'تم اعتماد الخبر وإضافته للمسودات'
    });
  } catch (error) {
    console.error('[ForeignNews API] Approve article error:', error);
    res.status(500).json({ error: 'Failed to approve article' });
  }
});

router.post('/processed/:id/reject', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user as any;
    
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    
    const article = await foreignNewsService.updateProcessedArticle(id, {
      editorialStatus: 'rejected',
      reviewedBy: user.id,
      rejectionReason: reason,
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json(article);
  } catch (error) {
    console.error('[ForeignNews API] Reject article error:', error);
    res.status(500).json({ error: 'Failed to reject article' });
  }
});

// Re-extract full content from original URL
router.post('/processed/:id/re-extract', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const processedArticle = await foreignNewsService.getProcessedArticle(id);
    if (!processedArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    if (!processedArticle.originalUrl) {
      return res.status(400).json({ error: 'No original URL available for this article' });
    }
    
    const { extractArticleContent } = await import('../services/urlContentExtractor');
    
    console.log(`[ForeignNews] Re-extracting content from: ${processedArticle.originalUrl}`);
    const extractionResult = await extractArticleContent(processedArticle.originalUrl);
    
    if (!extractionResult.success || !extractionResult.article?.content) {
      return res.status(400).json({ error: 'Failed to extract content from URL' });
    }
    
    const fullContent = extractionResult.article.content;
    console.log(`[ForeignNews] Extracted ${fullContent.length} characters, re-translating...`);
    
    // Re-translate with full content
    const translation = await foreignNewsService.translateContent(
      extractionResult.article.title || processedArticle.translatedTitle,
      fullContent,
      'en' // Assume English source
    );
    
    // Re-generate AI content
    const generatedContent = await foreignNewsService.generateContent(
      translation.translatedTitle,
      translation.translatedContent,
      processedArticle.sourceAttribution || 'Unknown'
    );
    
    // Re-analyze sentiment
    const sentimentResult = await foreignNewsService.analyzeSentimentAboutSaudi(
      `${translation.translatedTitle} ${translation.translatedContent}`
    );
    
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
    
    // Update the processed article
    await db
      .update(foreignProcessedArticles)
      .set({
        translatedTitle: translation.translatedTitle,
        translatedContent: translation.translatedContent,
        translatedExcerpt: translation.translatedExcerpt,
        aiHeadline: generatedContent.aiHeadline,
        aiSubtitle: generatedContent.aiSubtitle,
        aiSummary: generatedContent.aiSummary,
        seoTitle: generatedContent.seoTitle,
        seoDescription: generatedContent.seoDescription,
        seoKeywords: generatedContent.seoKeywords,
        imageAltText: generatedContent.imageAltText,
        sentiment: sentimentResult.sentiment,
        sentimentScore: sentimentResult.score,
        sentimentConfidence: sentimentResult.confidence,
        categoryId,
        updatedAt: new Date(),
      })
      .where(eq(foreignProcessedArticles.id, id));
    
    const updatedArticle = await foreignNewsService.getProcessedArticle(id);
    
    console.log(`[ForeignNews] Successfully re-extracted and updated article: ${id}`);
    res.json({ 
      success: true, 
      article: updatedArticle,
      message: 'تم إعادة استخراج المحتوى الكامل وترجمته بنجاح'
    });
  } catch (error: any) {
    console.error('[ForeignNews API] Re-extract error:', error);
    res.status(500).json({ error: `Failed to re-extract content: ${error.message}` });
  }
});

router.post('/processed/:id/publish', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { categoryId } = req.body;
    const user = req.user as any;
    
    const processedArticle = await foreignNewsService.getProcessedArticle(id);
    if (!processedArticle) {
      return res.status(404).json({ error: 'Processed article not found' });
    }
    
    if (processedArticle.editorialStatus !== 'approved') {
      return res.status(400).json({ error: 'Article must be approved before publishing' });
    }
    
    if (processedArticle.publishedArticleId) {
      return res.status(400).json({ error: 'Article already published' });
    }
    
    let targetCategoryId = categoryId || processedArticle.categoryId;
    if (!targetCategoryId) {
      const defaultCategory = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, 'foreign-news'))
        .limit(1)
        .then(r => r[0]);
      
      if (!defaultCategory) {
        return res.status(400).json({ error: 'Category ID is required' });
      }
      targetCategoryId = defaultCategory.id;
    }
    
    const newArticleId = randomUUID();
    const slug = `foreign-${Date.now()}-${newArticleId.substring(0, 8)}`;
    
    await db.insert(articles).values({
      title: processedArticle.translatedTitle,
      content: processedArticle.translatedContent || '',
      excerpt: processedArticle.translatedExcerpt || processedArticle.aiSummary || '',
      slug,
      categoryId: targetCategoryId,
      authorId: user.id,
      status: 'published' as const,
      publishedAt: new Date(),
      imageUrl: processedArticle.localImageUrl,
      seo: {
        metaTitle: processedArticle.seoTitle,
        metaDescription: processedArticle.seoDescription,
        keywords: processedArticle.seoKeywords,
        imageAltText: processedArticle.imageAltText,
      },
      source: processedArticle.sourceAttribution,
      sourceUrl: processedArticle.originalUrl,
    } as any);
    
    const [insertedArticle] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);
    
    const publishedArticleId = insertedArticle?.id || newArticleId;
    
    await foreignNewsService.updateProcessedArticle(id, {
      editorialStatus: 'published',
    });
    
    await db
      .update(foreignProcessedArticles)
      .set({ 
        publishedArticleId,
        updatedAt: new Date(),
      })
      .where(eq(foreignProcessedArticles.id, id));
    
    res.json({
      success: true,
      articleId: publishedArticleId,
      slug,
    });
  } catch (error: any) {
    console.error('[ForeignNews API] Publish article error:', error);
    res.status(500).json({ error: error.message || 'Failed to publish article' });
  }
});

// ============================================
// KEYWORDS
// ============================================

router.get('/keywords', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const keywords = await foreignNewsService.getKeywords();
    res.json(keywords);
  } catch (error) {
    console.error('[ForeignNews API] Get keywords error:', error);
    res.status(500).json({ error: 'Failed to fetch keywords' });
  }
});

router.post('/keywords', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const data = insertSaudiKeywordSchema.parse(req.body);
    const keyword = await foreignNewsService.createKeyword({
      keyword: data.keyword,
      language: data.language ?? undefined,
      category: data.category ?? undefined,
      weight: data.weight ?? undefined,
    });
    res.status(201).json(keyword);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[ForeignNews API] Create keyword error:', error);
    res.status(500).json({ error: 'Failed to create keyword' });
  }
});

router.delete('/keywords/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await foreignNewsService.deleteKeyword(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[ForeignNews API] Delete keyword error:', error);
    res.status(500).json({ error: 'Failed to delete keyword' });
  }
});

// ============================================
// INCOMING ITEMS (Saudi-related, last 24 hours)
// ============================================

router.get('/incoming', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { filter = 'saudi', page = '1' } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limit = 10;
    const offset = (pageNum - 1) * limit;
    
    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Build conditions
    const conditions = [];
    
    // Always filter by last 24 hours
    conditions.push(gte(foreignRssItems.createdAt, twentyFourHoursAgo));
    
    // Apply filter
    if (filter === 'saudi') {
      conditions.push(eq(foreignRssItems.isSaudiRelated, true));
    } else if (filter === 'pending') {
      conditions.push(eq(foreignRssItems.status, 'pending'));
    } else if (filter === 'processed') {
      conditions.push(eq(foreignRssItems.status, 'processed'));
    }
    // 'all' filter = no additional conditions (just 24 hours)
    
    // Get items with source name, sorted by relevance score (highest first)
    const items = await db
      .select({
        id: foreignRssItems.id,
        originalTitle: foreignRssItems.originalTitle,
        source: foreignRssSources.name,
        publishedAt: foreignRssItems.originalPublishedAt,
        saudiRelevanceScore: foreignRssItems.saudiRelevanceScore,
        isProcessed: sql<boolean>`${foreignRssItems.status} = 'processed'`,
        isSaudiRelated: foreignRssItems.isSaudiRelated,
      })
      .from(foreignRssItems)
      .leftJoin(foreignRssSources, eq(foreignRssItems.sourceId, foreignRssSources.id))
      .where(and(...conditions))
      .orderBy(desc(foreignRssItems.saudiRelevanceScore), desc(foreignRssItems.createdAt))
      .limit(limit)
      .offset(offset);
    
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(foreignRssItems)
      .where(and(...conditions));
    
    const total = Number(countResult[0]?.count || 0);
    
    // Transform items for frontend
    const transformedItems = items.map(item => ({
      id: item.id,
      originalTitle: item.originalTitle || 'بدون عنوان',
      source: item.source || 'مصدر غير معروف',
      publishedAt: item.publishedAt?.toISOString() || new Date().toISOString(),
      saudiRelevanceScore: Math.round((item.saudiRelevanceScore || 0) * 100),
      isProcessed: item.isProcessed,
      isSaudiRelated: item.isSaudiRelated,
    }));
    
    res.json({ items: transformedItems, total });
  } catch (error) {
    console.error('[ForeignNews API] Get incoming items error:', error);
    res.status(500).json({ error: 'Failed to fetch incoming items' });
  }
});

router.post('/incoming/:id/process', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await foreignNewsService.processRawItem(id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('[ForeignNews API] Process incoming item error:', error);
    res.status(500).json({ error: error.message || 'Failed to process item' });
  }
});

// ============================================
// STATS & AUTOMATION
// ============================================

router.get('/stats', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await foreignNewsService.getStats();
    
    // Calculate items from last 24 hours for accurate count
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentCountResult = await db
      .select({ 
        pending: sql<number>`sum(case when ${foreignRssItems.isSaudiRelated} and ${foreignRssItems.status} = 'pending' then 1 else 0 end)`,
        saudiRelated: sql<number>`sum(case when ${foreignRssItems.isSaudiRelated} then 1 else 0 end)`,
        processedToday: sql<number>`sum(case when ${foreignRssItems.status} = 'processed' then 1 else 0 end)`,
      })
      .from(foreignRssItems)
      .where(gte(foreignRssItems.createdAt, twentyFourHoursAgo));
    
    // Map to frontend expected format with sentiment data
    res.json({
      totalSources: stats.activeSources,
      pendingItems: Number(recentCountResult[0]?.pending || 0),
      processedToday: Number(recentCountResult[0]?.processedToday || 0),
      saudiRelated: Number(recentCountResult[0]?.saudiRelated || 0),
      sentiment: {
        positive: stats.positiveArticles,
        negative: stats.negativeArticles,
        neutral: stats.neutralArticles,
      },
    });
  } catch (error) {
    console.error('[ForeignNews API] Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/ingest-all', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const results = await foreignNewsService.ingestAllActiveFeeds();
    
    const summary = {
      totalFeeds: results.length,
      totalItemsFound: results.reduce((sum, r) => sum + r.itemsFound, 0),
      totalItemsIngested: results.reduce((sum, r) => sum + r.itemsIngested, 0),
      totalSaudiRelated: results.reduce((sum, r) => sum + r.saudiRelatedItems, 0),
      feedResults: results,
    };
    
    res.json(summary);
  } catch (error: any) {
    console.error('[ForeignNews API] Ingest all error:', error);
    res.status(500).json({ error: error.message || 'Failed to ingest feeds' });
  }
});

router.post('/process-pending', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.body;
    const results = await foreignNewsService.processPendingSaudiRelatedItems(
      typeof limit === 'number' ? limit : parseInt(limit, 10)
    );
    
    const summary = {
      totalProcessed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
    
    res.json(summary);
  } catch (error: any) {
    console.error('[ForeignNews API] Process pending error:', error);
    res.status(500).json({ error: error.message || 'Failed to process pending items' });
  }
});

export default router;
