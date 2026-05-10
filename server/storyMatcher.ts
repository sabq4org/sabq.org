// Story Matcher Service - AI-powered automatic article classification to stories
import OpenAI from "openai";
import { storage } from "./storage";
import type { Article, Story, StoryWithDetails } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface MatchResult {
  storyId: string;
  confidence: number;
  relation: 'root' | 'followup';
  reasoning?: string;
}

/**
 * تحليل المقال وإيجاد القصص المشابهة باستخدام AI
 */
export async function findMatchingStories(article: Article): Promise<MatchResult[]> {
  try {
    // جلب جميع القصص النشطة
    const stories = await storage.getAllStories({ status: 'active' });
    
    if (stories.length === 0) {
      return [];
    }

    // تحضير البيانات للـ AI
    const articleContext = {
      title: article.title,
      content: article.content.substring(0, 1000), // أول 1000 حرف
      excerpt: article.excerpt,
    };

    const storiesContext = stories.map((s: StoryWithDetails) => ({
      id: s.id,
      title: s.title,
      entities: s.entities || {},
      tags: s.tags || [],
      rootArticle: s.rootArticle ? {
        title: s.rootArticle.title,
        excerpt: s.rootArticle.excerpt
      } : null
    }));

    // استخدام OpenAI لتحليل التطابق
    const prompt = `أنت محلل أخبار ذكي. مهمتك هي تحديد إذا كان هذا المقال ينتمي لأي من القصص الموجودة.

المقال الجديد:
العنوان: ${articleContext.title}
المحتوى: ${articleContext.content}

القصص الموجودة:
${JSON.stringify(storiesContext, null, 2)}

قم بتحليل المقال وإرجاع مصفوفة JSON من القصص المطابقة. كل قصة يجب أن تحتوي على:
- storyId: معرف القصة
- confidence: نسبة الثقة من 0 إلى 1
- relation: "followup" (تطور للقصة)
- reasoning: سبب التطابق (اختياري)

أرجع فقط القصص ذات confidence أكثر من 0.6. إذا لم يكن هناك تطابق، أرجع مصفوفة فارغة [].

مهم: أرجع JSON فقط بدون أي نص إضافي.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: "أنت محلل أخبار عربي متخصص في تصنيف الأخبار وربطها بالقصص. دائماً أرجع JSON صحيح."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 1024,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content;
    if (!result) {
      return [];
    }

    // استخراج المطابقات من الاستجابة
    const parsed = JSON.parse(result);
    const matches = parsed.matches || parsed.stories || [];

    // التحقق من صحة البيانات
    return matches
      .filter((m: any) => m.storyId && m.confidence >= 0.6)
      .map((m: any) => ({
        storyId: m.storyId,
        confidence: Math.min(1, Math.max(0, m.confidence)),
        relation: 'followup' as const,
        reasoning: m.reasoning
      }))
      .sort((a: MatchResult, b: MatchResult) => b.confidence - a.confidence)
      .slice(0, 3); // أفضل 3 تطابقات فقط

  } catch (error) {
    console.error("Error in story matching:", error);
    return [];
  }
}

/**
 * محاولة ربط المقال بقصة موجودة تلقائياً
 */
export async function autoLinkArticleToStory(articleId: string): Promise<boolean> {
  try {
    const article = await storage.getArticleById(articleId);
    if (!article) {
      return false;
    }

    // البحث عن قصص مطابقة
    const matches = await findMatchingStories(article);
    
    if (matches.length === 0) {
      console.log(`No matching stories found for article: ${article.title}`);
      return false;
    }

    // ربط المقال بأفضل قصة (confidence أعلى)
    const bestMatch = matches[0];
    
    if (bestMatch.confidence >= 0.75) {
      await storage.createStoryLink({
        storyId: bestMatch.storyId,
        articleId: article.id,
        relation: bestMatch.relation,
        confidence: bestMatch.confidence,
      });

      console.log(`Article linked to story with confidence ${bestMatch.confidence}: ${bestMatch.reasoning || 'Auto-matched'}`);
      return true;
    }

    console.log(`Best match confidence too low (${bestMatch.confidence}), skipping auto-link`);
    return false;
  } catch (error) {
    console.error("Error in auto-linking article:", error);
    return false;
  }
}

/**
 * ربط مقال بقصة أو إنشاء قصة جديدة - هذه الدالة المطلوبة من routes.ts
 */
export async function matchAndLinkArticle(articleId: string): Promise<void> {
  try {
    console.log(`[STORY MATCHER] Starting story matching for article: ${articleId}`);
    
    const article = await storage.getArticleById(articleId);
    if (!article) {
      console.error(`[STORY MATCHER] Article not found: ${articleId}`);
      return;
    }

    // البحث عن قصص مطابقة
    const matches = await findMatchingStories(article);
    
    if (matches.length > 0 && matches[0].confidence >= 0.75) {
      // وجدنا قصة مطابقة - نربط المقال بها
      const bestMatch = matches[0];
      
      await storage.createStoryLink({
        storyId: bestMatch.storyId,
        articleId: article.id,
        relation: 'followup',
        confidence: bestMatch.confidence,
      });

      console.log(`[STORY MATCHER] ✅ Article linked to existing story (confidence: ${bestMatch.confidence})`);
      
      // إرسال إشعارات للمتابعين
      const { notifyStoryFollowers } = await import("./storyNotifier");
      await notifyStoryFollowers(bestMatch.storyId, article.id);
      
      return;
    }

    // لم نجد قصة مطابقة - ننشئ قصة جديدة
    console.log(`[STORY MATCHER] No matching story found, creating new story...`);
    
    const newStory = await storage.createStory({
      slug: `story-${article.slug}`,
      title: article.title,
      rootArticleId: article.id,
      entities: {},
      tags: [],
      status: 'active',
    });

    console.log(`[STORY MATCHER] ✅ Created new story: ${newStory.id}`);

    // ربط المقال بالقصة الجديدة
    await storage.createStoryLink({
      storyId: newStory.id,
      articleId: article.id,
      relation: 'root',
      confidence: 1.0,
    });

    console.log(`[STORY MATCHER] ✅ Article linked to new story as root`);
  } catch (error) {
    console.error("[STORY MATCHER] ❌ Error in matchAndLinkArticle:", error);
    throw error;
  }
}

/**
 * إنشاء قصة جديدة من مقال
 */
export async function createStoryFromArticle(article: Article, entities?: Record<string, any>, tags?: string[]): Promise<Story | null> {
  try {
    // إنشاء slug من العنوان
    const slug = article.slug + '-story';

    const story = await storage.createStory({
      slug,
      title: article.title,
      rootArticleId: article.id,
      entities: entities || {},
      tags: tags || [],
      status: 'active',
    });

    // ربط المقال كجذر للقصة
    await storage.createStoryLink({
      storyId: story.id,
      articleId: article.id,
      relation: 'root',
      confidence: 1.0,
    });

    console.log(`New story created from article: ${article.title}`);
    return story;
  } catch (error) {
    console.error("Error creating story from article:", error);
    return null;
  }
}

/**
 * استخراج الكيانات والوسوم من المقال باستخدام AI
 */
export async function extractEntitiesAndTags(article: Article): Promise<{
  entities: Record<string, any>;
  tags: string[];
}> {
  try {
    const prompt = `استخرج الكيانات الرئيسية والوسوم من هذا المقال:

العنوان: ${article.title}
المحتوى: ${article.content.substring(0, 2000)}

أرجع JSON يحتوي على:
- entities: كائن يحتوي على (أشخاص، أماكن، منظمات، مصطلحات رئيسية)
- tags: مصفوفة من الوسوم المهمة (5-10 وسوم)

مثال:
{
  "entities": {
    "people": ["محمد بن سلمان"],
    "places": ["الرياض", "السعودية"],
    "organizations": ["وزارة الخارجية"],
    "keywords": ["اقتصاد", "تطوير"]
  },
  "tags": ["سياسة", "اقتصاد", "السعودية"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: "أنت محلل محتوى عربي متخصص في استخراج الكيانات والوسوم من النصوص."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 512,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content;
    if (!result) {
      return { entities: {}, tags: [] };
    }

    const parsed = JSON.parse(result);
    return {
      entities: parsed.entities || {},
      tags: parsed.tags || []
    };
  } catch (error) {
    console.error("Error extracting entities and tags:", error);
    return { entities: {}, tags: [] };
  }
}
