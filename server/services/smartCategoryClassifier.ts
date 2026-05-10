/**
 * Smart Category Classifier Service
 * خدمة التصنيف الذكي للمقالات
 * 
 * Uses AI to analyze article content and suggest the most appropriate category
 */

import { aiManager } from '../ai-manager';
import { db } from '../db';
import { categories, articles } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: number;
  reason: string;
  alternativeCategories?: Array<{
    categoryId: string;
    categoryName: string;
    confidence: number;
  }>;
}

export interface ClassificationRequest {
  title: string;
  content?: string;
  excerpt?: string;
  keywords?: string[];
}

/**
 * Get all active categories for classification
 */
async function getActiveCategories(): Promise<Array<{ id: string; nameAr: string; nameEn: string; description: string | null }>> {
  const result = await db
    .select({
      id: categories.id,
      nameAr: categories.nameAr,
      nameEn: categories.nameEn,
      description: categories.description,
    })
    .from(categories)
    .where(eq(categories.status, 'active'));
  
  return result;
}

/**
 * Analyze article content and suggest the best category
 */
export async function classifyArticle(request: ClassificationRequest): Promise<CategorySuggestion> {
  const activeCategories = await getActiveCategories();
  
  if (activeCategories.length === 0) {
    throw new Error('No active categories found');
  }

  const categoriesList = activeCategories
    .map(c => `- ${c.id}: ${c.nameAr} (${c.nameEn})${c.description ? ` - ${c.description}` : ''}`)
    .join('\n');

  const articleContent = [
    `العنوان: ${request.title}`,
    request.excerpt ? `الملخص: ${request.excerpt}` : '',
    request.content ? `المحتوى: ${request.content.substring(0, 2000)}...` : '',
    request.keywords?.length ? `الكلمات المفتاحية: ${request.keywords.join(', ')}` : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `أنت محلل تصنيف صحفي متخصص. مهمتك تحليل المقال التالي واختيار القسم الأنسب له.

## الأقسام المتاحة:
${categoriesList}

## المقال للتحليل:
${articleContent}

## التعليمات:
1. حلل محتوى المقال بعناية
2. حدد الموضوع الرئيسي والمواضيع الفرعية
3. اختر القسم الأنسب من القائمة أعلاه
4. اذكر سبب اختيارك بوضوح
5. اقترح أقسام بديلة إن وجدت

## مثال على التصنيف الصحيح:
- مقال عن iPhone أو تطبيقات = تقنية (ليس محليات)
- مقال عن مباراة كرة قدم = رياضة
- مقال عن قرار حكومي سعودي = محليات
- مقال عن أسعار النفط = اقتصاد
- مقال عن حدث في دولة أجنبية = عربي ودولي

أجب بصيغة JSON فقط:
{
  "categoryId": "معرف القسم المختار",
  "confidence": رقم من 0 إلى 1 يمثل نسبة الثقة,
  "reason": "سبب اختيار هذا القسم",
  "alternatives": [
    {"categoryId": "معرف بديل", "confidence": نسبة الثقة}
  ]
}`;

  try {
    const response = await aiManager.generate(prompt, {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxTokens: 500,
      jsonMode: true,
    });

    let parsed: { categoryId: string; confidence: number; reason: string; alternatives?: Array<{ categoryId: string; confidence: number }> };
    
    try {
      parsed = JSON.parse(response.content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', response.content);
      // Fallback: return first category with low confidence
      const fallbackCategory = activeCategories[0];
      return {
        categoryId: fallbackCategory.id,
        categoryName: fallbackCategory.nameAr,
        confidence: 0.3,
        reason: 'تعذر تحليل التصنيف التلقائي. يرجى المراجعة يدوياً.',
        alternativeCategories: [],
      };
    }

    // Validate required fields
    if (!parsed.categoryId || typeof parsed.confidence !== 'number') {
      console.error('Invalid AI response structure:', parsed);
      const fallbackCategory = activeCategories[0];
      return {
        categoryId: fallbackCategory.id,
        categoryName: fallbackCategory.nameAr,
        confidence: 0.3,
        reason: 'استجابة غير صالحة من نظام الذكاء الاصطناعي. يرجى المراجعة يدوياً.',
        alternativeCategories: [],
      };
    }
    
    // Find the category names for the suggestion
    const mainCategory = activeCategories.find(c => c.id === parsed.categoryId);
    if (!mainCategory) {
      console.error(`Category not found: ${parsed.categoryId}`);
      // Fallback: return first category
      const fallbackCategory = activeCategories[0];
      return {
        categoryId: fallbackCategory.id,
        categoryName: fallbackCategory.nameAr,
        confidence: 0.3,
        reason: `القسم المقترح (${parsed.categoryId}) غير موجود. يرجى المراجعة يدوياً.`,
        alternativeCategories: [],
      };
    }

    const alternativeCategories = parsed.alternatives?.map((alt: { categoryId: string; confidence: number }) => {
      const cat = activeCategories.find(c => c.id === alt.categoryId);
      return cat ? {
        categoryId: alt.categoryId,
        categoryName: cat.nameAr,
        confidence: alt.confidence,
      } : null;
    }).filter(Boolean) || [];

    return {
      categoryId: parsed.categoryId,
      categoryName: mainCategory.nameAr,
      confidence: parsed.confidence,
      reason: parsed.reason || 'تم التصنيف بواسطة الذكاء الاصطناعي',
      alternativeCategories,
    };
  } catch (error: any) {
    console.error('Category classification error:', error);
    // Return soft failure with fallback instead of throwing
    const fallbackCategory = activeCategories[0];
    return {
      categoryId: fallbackCategory.id,
      categoryName: fallbackCategory.nameAr,
      confidence: 0.2,
      reason: `فشل التصنيف التلقائي: ${error.message}. يرجى المراجعة يدوياً.`,
      alternativeCategories: [],
    };
  }
}

/**
 * Generate newsletter-specific subtitle for an article
 */
export async function generateNewsletterSubtitle(request: {
  title: string;
  content?: string;
  excerpt?: string;
}): Promise<{ subtitle: string; excerpt: string }> {
  const articleContent = [
    `العنوان: ${request.title}`,
    request.excerpt ? `الملخص: ${request.excerpt}` : '',
    request.content ? `المحتوى: ${request.content.substring(0, 1500)}` : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `أنت محرر نشرة إخبارية محترف. مهمتك إنشاء عنوان فرعي جذاب وملخص قصير للمقال التالي ليُستخدم في النشرة الإخبارية عبر البريد الإلكتروني.

## المقال:
${articleContent}

## التعليمات:
1. اكتب عنوان فرعي جذاب (10-15 كلمة) يحفز القارئ على فتح المقال
2. اكتب ملخص مختصر (30-50 كلمة) يلخص أهم نقطة في المقال
3. استخدم أسلوب مشوق ومباشر
4. تجنب التكرار مع العنوان الرئيسي

أجب بصيغة JSON فقط:
{
  "subtitle": "العنوان الفرعي الجذاب هنا",
  "excerpt": "الملخص المختصر هنا"
}`;

  try {
    const response = await aiManager.generate(prompt, {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxTokens: 300,
      jsonMode: true,
    });

    let parsed: { subtitle?: string; excerpt?: string };
    
    try {
      parsed = JSON.parse(response.content);
    } catch (parseError) {
      console.error('Failed to parse newsletter AI response:', response.content);
      // Fallback: use original title and excerpt
      return {
        subtitle: request.title,
        excerpt: request.excerpt || request.title,
      };
    }

    // Validate and provide fallbacks
    return {
      subtitle: parsed.subtitle || request.title,
      excerpt: parsed.excerpt || request.excerpt || request.title,
    };
  } catch (error: any) {
    console.error('Newsletter subtitle generation error:', error);
    // Return soft failure with fallback
    return {
      subtitle: request.title,
      excerpt: request.excerpt || request.title,
    };
  }
}

/**
 * Update article with AI category suggestion
 */
export async function updateArticleCategorySuggestion(
  articleId: string,
  suggestion: CategorySuggestion
): Promise<void> {
  await db
    .update(articles)
    .set({
      suggestedCategoryId: suggestion.categoryId,
      categorySuggestionConfidence: suggestion.confidence,
      categorySuggestionReason: suggestion.reason,
    })
    .where(eq(articles.id, articleId));
}

/**
 * Update article with newsletter subtitle
 */
export async function updateArticleNewsletterContent(
  articleId: string,
  content: { subtitle: string; excerpt: string }
): Promise<void> {
  await db
    .update(articles)
    .set({
      newsletterSubtitle: content.subtitle,
      newsletterExcerpt: content.excerpt,
    })
    .where(eq(articles.id, articleId));
}
