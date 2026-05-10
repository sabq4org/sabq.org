/**
 * Smart Classification Routes
 * مسارات التصنيف الذكي للمقالات
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  classifyArticle,
  generateNewsletterSubtitle,
  updateArticleCategorySuggestion,
  updateArticleNewsletterContent,
} from '../services/smartCategoryClassifier';
import { db } from '../db';
import { articles } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Authentication middleware
function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user) {
    return res.status(401).json({ 
      success: false,
      message: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' 
    });
  }
  next();
}

// Check if user has editor/admin role
function isEditorOrAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as any;
  if (!user || !['editor', 'admin', 'chief_editor', 'correspondent', 'journalist'].includes(user.role)) {
    return res.status(403).json({ 
      success: false,
      message: 'لا تملك صلاحية الوصول إلى هذه الخدمة' 
    });
  }
  next();
}

// Request validation schemas
const classifyRequestSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

const newsletterSubtitleSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  content: z.string().optional(),
  excerpt: z.string().optional(),
});

/**
 * POST /api/smart-classification/classify
 * Classify article content and suggest the best category
 * تصنيف محتوى المقال واقتراح القسم الأنسب
 */
router.post('/classify', isAuthenticated, isEditorOrAdmin, async (req, res) => {
  try {
    const data = classifyRequestSchema.parse(req.body);
    const suggestion = await classifyArticle(data);
    
    res.json({
      success: true,
      suggestion,
    });
  } catch (error: any) {
    console.error('Classification error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صحيحة',
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'فشل التصنيف الذكي',
    });
  }
});

/**
 * POST /api/smart-classification/classify-article/:articleId
 * Classify an existing article and update its suggested category
 * تصنيف مقال موجود وتحديث القسم المقترح
 */
router.post('/classify-article/:articleId', isAuthenticated, isEditorOrAdmin, async (req, res) => {
  try {
    const { articleId } = req.params;
    
    // Fetch the article
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        excerpt: articles.excerpt,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'المقال غير موجود',
      });
    }
    
    // Classify the article
    const suggestion = await classifyArticle({
      title: article.title,
      content: article.content,
      excerpt: article.excerpt || undefined,
    });
    
    // Update the article with the suggestion
    await updateArticleCategorySuggestion(articleId, suggestion);
    
    res.json({
      success: true,
      suggestion,
      message: 'تم تحديث اقتراح التصنيف بنجاح',
    });
  } catch (error: any) {
    console.error('Article classification error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل تصنيف المقال',
    });
  }
});

/**
 * POST /api/smart-classification/newsletter-subtitle
 * Generate newsletter-specific subtitle for content
 * إنشاء عنوان فرعي مخصص للنشرة الإخبارية
 */
router.post('/newsletter-subtitle', isAuthenticated, isEditorOrAdmin, async (req, res) => {
  try {
    const data = newsletterSubtitleSchema.parse(req.body);
    const result = await generateNewsletterSubtitle(data);
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Newsletter subtitle generation error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صحيحة',
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'فشل إنشاء العنوان الفرعي',
    });
  }
});

/**
 * POST /api/smart-classification/newsletter-subtitle/:articleId
 * Generate and save newsletter subtitle for an existing article
 * إنشاء وحفظ العنوان الفرعي للنشرة لمقال موجود
 */
router.post('/newsletter-subtitle/:articleId', isAuthenticated, isEditorOrAdmin, async (req, res) => {
  try {
    const { articleId } = req.params;
    
    // Fetch the article
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        excerpt: articles.excerpt,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'المقال غير موجود',
      });
    }
    
    // Generate newsletter subtitle
    const result = await generateNewsletterSubtitle({
      title: article.title,
      content: article.content,
      excerpt: article.excerpt || undefined,
    });
    
    // Update the article
    await updateArticleNewsletterContent(articleId, result);
    
    res.json({
      success: true,
      ...result,
      message: 'تم إنشاء العنوان الفرعي للنشرة بنجاح',
    });
  } catch (error: any) {
    console.error('Article newsletter subtitle error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل إنشاء العنوان الفرعي',
    });
  }
});

/**
 * PUT /api/smart-classification/newsletter-content/:articleId
 * Manually update newsletter subtitle and excerpt
 * تحديث العنوان الفرعي والملخص للنشرة يدوياً
 */
router.put('/newsletter-content/:articleId', isAuthenticated, isEditorOrAdmin, async (req, res) => {
  try {
    const { articleId } = req.params;
    const { subtitle, excerpt } = req.body;
    
    await db
      .update(articles)
      .set({
        newsletterSubtitle: subtitle,
        newsletterExcerpt: excerpt,
      })
      .where(eq(articles.id, articleId));
    
    res.json({
      success: true,
      message: 'تم تحديث محتوى النشرة بنجاح',
    });
  } catch (error: any) {
    console.error('Newsletter content update error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل تحديث محتوى النشرة',
    });
  }
});

export default router;
