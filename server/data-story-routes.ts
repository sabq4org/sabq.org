import { Router } from 'express';
import multer from 'multer';
import { objectStorageClient, getBucketConfig } from './objectStorage';
import { parseCSV, parseExcel, parseJSON } from './data-parser';
import { analyzeDataset, generateStory } from './data-story-ai';
import type { IStorage } from './storage';
import type { Request, Response } from 'express';
import { db } from './db';
import { dataStoryAnalyses, articles } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Get the bucket name from environment configuration
function getBucketName(): string {
  return getBucketConfig().bucketName;
}

const bucketName = getBucketName();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع CSV أو Excel أو JSON فقط.'));
    }
  }
});

// Helper: Check authentication
function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: 'غير مصرح' });
  }
  next();
}

// Helper: Check editor/admin role
function requireEditor(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return res.status(403).json({ message: 'يتطلب صلاحيات محرر أو مدير' });
  }
  next();
}

export function registerDataStoryRoutes(app: any, dbStorage: IStorage) {
  
  // POST /api/data-stories/upload - Upload and parse data file
  app.post('/api/data-stories/upload', requireAuth, requireEditor, upload.single('file'), async (req: any, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'لم يتم رفع أي ملف' });
      }

      const file = req.file;
      const userId = req.user.id;

      // Determine file type
      let fileType: string;
      if (file.mimetype === 'text/csv') {
        fileType = 'csv';
      } else if (file.mimetype.includes('sheet') || file.mimetype.includes('excel')) {
        fileType = 'excel';
      } else if (file.mimetype === 'application/json') {
        fileType = 'json';
      } else {
        return res.status(400).json({ message: 'نوع الملف غير مدعوم' });
      }

      // Upload to Google Cloud Storage
      const timestamp = Date.now();
      const filename = `data-stories/${userId}/${timestamp}-${file.originalname}`;
      const bucket = objectStorageClient.bucket(bucketName);
      const blob = bucket.file(filename);

      await blob.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        }
      });

      const storageUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;

      // Create source record
      const source = await dbStorage.createDataStorySource({
        userId,
        fileName: file.originalname,
        fileType,
        fileSize: file.size,
        storageKey: filename,
        storageUrl,
        parseStatus: 'parsing'
      });

      // Parse file asynchronously
      try {
        let dataset;
        if (fileType === 'csv') {
          dataset = await parseCSV(file.buffer);
        } else if (fileType === 'excel') {
          dataset = await parseExcel(file.buffer);
        } else {
          dataset = await parseJSON(file.buffer);
        }

        // Update source with parsed data
        await dbStorage.updateDataStorySource(source.id, {
          parseStatus: 'completed',
          parsedAt: new Date(),
          rowCount: dataset.rowCount,
          columnCount: dataset.columnCount,
          columns: dataset.columns as any,
          previewData: dataset.previewData as any
        });

        // Return updated source
        const updatedSource = await dbStorage.getDataStorySource(source.id);
        res.json(updatedSource);

      } catch (parseError: any) {
        // Update source with error
        await dbStorage.updateDataStorySource(source.id, {
          parseStatus: 'failed',
          parseError: parseError.message
        });

        throw parseError;
      }

    } catch (error: any) {
      console.error('Error uploading data file:', error);
      res.status(500).json({ 
        message: error.message || 'فشل رفع الملف'
      });
    }
  });

  // POST /api/data-stories/:sourceId/analyze - Analyze dataset with AI
  app.post('/api/data-stories/:sourceId/analyze', requireAuth, requireEditor, async (req: any, res: Response) => {
    try {
      const { sourceId } = req.params;
      const userId = req.user.id;

      // Get source
      const source = await dbStorage.getDataStorySource(sourceId);
      if (!source) {
        return res.status(404).json({ message: 'الملف غير موجود' });
      }

      if (source.userId !== userId) {
        return res.status(403).json({ message: 'غير مصرح' });
      }

      if (source.parseStatus !== 'completed') {
        return res.status(400).json({ message: 'الملف لم يتم تحليله بعد' });
      }

      // Create analysis record
      const analysis = await dbStorage.createDataStoryAnalysis({
        sourceId,
        userId,
        status: 'analyzing'
      });

      // Reconstruct dataset from source
      const dataset = {
        rows: [], // We don't store all rows, AI will work with stats
        columns: source.columns as any,
        rowCount: source.rowCount || 0,
        columnCount: source.columnCount || 0,
        previewData: source.previewData as any
      };

      // Analyze with AI
      try {
        const result = await analyzeDataset(dataset, source.fileName);

        // Update analysis with results
        const now = new Date();
        await db.update(dataStoryAnalyses)
          .set({
            status: 'completed',
            statistics: result.statistics,
            aiInsights: result.insights as any,
            chartConfigs: result.charts as any,
            aiProvider: result.provider,
            aiModel: result.model,
            tokensUsed: result.tokensUsed,
            processingTime: result.processingTime,
            completedAt: now
          })
          .where(eq(dataStoryAnalyses.id, analysis.id));

        // Return updated analysis
        const updatedAnalysis = await dbStorage.getDataStoryAnalysis(analysis.id);
        res.json(updatedAnalysis);

      } catch (aiError: any) {
        // Update analysis with error
        await dbStorage.updateDataStoryAnalysis(analysis.id, {
          status: 'failed',
          error: aiError.message
        });

        throw aiError;
      }

    } catch (error: any) {
      console.error('Error analyzing dataset:', error);
      res.status(500).json({ 
        message: error.message || 'فشل تحليل البيانات'
      });
    }
  });

  // POST /api/data-stories/:analysisId/generate-story - Generate Arabic story from analysis
  app.post('/api/data-stories/:analysisId/generate-story', requireAuth, requireEditor, async (req: any, res: Response) => {
    try {
      const { analysisId } = req.params;
      const userId = req.user.id;

      // Get analysis
      const analysis = await dbStorage.getDataStoryAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ message: 'التحليل غير موجود' });
      }

      if (analysis.userId !== userId) {
        return res.status(403).json({ message: 'غير مصرح' });
      }

      if (analysis.status !== 'completed') {
        return res.status(400).json({ message: 'التحليل لم يكتمل بعد' });
      }

      // Get source
      const source = await dbStorage.getDataStorySource(analysis.sourceId);
      if (!source) {
        return res.status(404).json({ message: 'الملف غير موجود' });
      }

      // Reconstruct dataset
      const dataset = {
        rows: [],
        columns: source.columns as any,
        rowCount: source.rowCount || 0,
        columnCount: source.columnCount || 0,
        previewData: source.previewData as any
      };

      // Reconstruct analysis result
      const analysisResult = {
        statistics: analysis.statistics,
        insights: analysis.aiInsights as any,
        charts: analysis.chartConfigs as any,
        provider: analysis.aiProvider || 'openai',
        model: analysis.aiModel || 'gpt-5.1',
        tokensUsed: analysis.tokensUsed || 0,
        processingTime: analysis.processingTime || 0
      };

      // Generate story with AI
      const storyResult = await generateStory(dataset, analysisResult, source.fileName);

      // Create draft
      const draft = await dbStorage.createDataStoryDraft({
        analysisId,
        userId,
        title: storyResult.draft.title,
        subtitle: storyResult.draft.subtitle,
        content: storyResult.draft.content,
        excerpt: storyResult.draft.excerpt,
        outline: storyResult.draft.outline as any,
        aiProvider: storyResult.provider,
        aiModel: storyResult.model,
        tokensUsed: storyResult.tokensUsed,
        generationTime: storyResult.generationTime
      });

      res.json(draft);

    } catch (error: any) {
      console.error('Error generating story:', error);
      res.status(500).json({ 
        message: error.message || 'فشل توليد القصة'
      });
    }
  });

  // GET /api/data-stories/my-sources - Get user's uploaded sources
  app.get('/api/data-stories/my-sources', requireAuth, requireEditor, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const sources = await dbStorage.getUserDataStorySources(userId, 50);
      res.json(sources);
    } catch (error: any) {
      console.error('Error fetching sources:', error);
      res.status(500).json({ message: 'فشل جلب الملفات' });
    }
  });

  // GET /api/data-stories/my-drafts - Get user's story drafts
  app.get('/api/data-stories/my-drafts', requireAuth, requireEditor, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const drafts = await dbStorage.getUserDataStoryDrafts(userId, 50);
      res.json(drafts);
    } catch (error: any) {
      console.error('Error fetching drafts:', error);
      res.status(500).json({ message: 'فشل جلب المسودات' });
    }
  });

  // GET /api/data-stories/:sourceId - Get source with all details
  app.get('/api/data-stories/:sourceId', requireAuth, requireEditor, async (req: any, res: Response) => {
    try {
      const { sourceId } = req.params;
      const userId = req.user.id;

      const dataStory = await dbStorage.getDataStoryWithDetails(sourceId);
      if (!dataStory) {
        return res.status(404).json({ message: 'الملف غير موجود' });
      }

      if (dataStory.userId !== userId) {
        return res.status(403).json({ message: 'غير مصرح' });
      }

      res.json(dataStory);
    } catch (error: any) {
      console.error('Error fetching data story:', error);
      res.status(500).json({ message: 'فشل جلب البيانات' });
    }
  });

  // PATCH /api/data-stories/drafts/:draftId - Update draft
  app.patch('/api/data-stories/drafts/:draftId', requireAuth, requireEditor, async (req: any, res: Response) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      // Get draft
      const draft = await dbStorage.getDataStoryDraft(draftId);
      if (!draft) {
        return res.status(404).json({ message: 'المسودة غير موجودة' });
      }

      if (draft.userId !== userId) {
        return res.status(403).json({ message: 'غير مصرح' });
      }

      // Update draft
      const updated = await dbStorage.updateDataStoryDraft(draftId, {
        ...updates,
        editedBy: userId,
        editedAt: new Date()
      });

      res.json(updated);
    } catch (error: any) {
      console.error('Error updating draft:', error);
      res.status(500).json({ message: 'فشل تحديث المسودة' });
    }
  });

  // POST /api/data-stories/drafts/:draftId/convert - Convert draft to article
  app.post('/api/data-stories/drafts/:draftId/convert', requireAuth, requireEditor, async (req: any, res: Response) => {
    try {
      const { draftId } = req.params;
      const userId = req.user.id;

      // Get draft
      const draft = await dbStorage.getDataStoryDraft(draftId);
      if (!draft) {
        return res.status(404).json({ message: 'المسودة غير موجودة' });
      }

      if (draft.userId !== userId) {
        return res.status(403).json({ message: 'غير مصرح' });
      }

      // Create article from draft
      const slug = draft.title
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const article = await dbStorage.createArticle({
        title: draft.title,
        subtitle: draft.subtitle || null,
        content: draft.content,
        excerpt: draft.excerpt || null,
        slug,
        status: 'draft'
      } as any); // authorId will be set by the database default or needs to be added manually
      
      // Update the article with authorId since it's required
      await db.update(articles).set({ authorId: userId }).where(eq(articles.id, article.id));

      // Update draft with article link
      await dbStorage.convertDraftToArticle(draftId, article.id);

      res.json({ article, draft: await dbStorage.getDataStoryDraft(draftId) });
    } catch (error: any) {
      console.error('Error converting draft:', error);
      res.status(500).json({ message: 'فشل تحويل المسودة إلى مقال' });
    }
  });
}
