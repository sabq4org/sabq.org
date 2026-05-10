import OpenAI from "openai";
import type { Article } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateArticleSummary(article: Article): Promise<string> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return article.excerpt || (article.content ? article.content.substring(0, 150) + '...' : 'لا يوجد ملخص متاح');
    }

    const articleContent = article.content || article.excerpt || article.title;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت كاتب محترف في صحيفة سبق الإخبارية. مهمتك إنشاء ملخصات جذابة ومختصرة للأخبار باللغة العربية الفصحى.

قواعد الملخص:
- اكتب ملخصاً من 2-3 جمل فقط
- استخدم لغة واضحة وجذابة
- ركز على أهم المعلومات والأحداث
- تجنب التكرار والحشو
- اجعل الملخص يثير اهتمام القارئ لقراءة المقال كاملاً`
        },
        {
          role: "user",
          content: `اكتب ملخصاً جذاباً لهذا الخبر:\n\nالعنوان: ${article.title}\n\nالمحتوى: ${articleContent.substring(0, 1500)}`
        }
      ],
      max_completion_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || article.excerpt || 'لا يوجد ملخص متاح';
  } catch (error) {
    console.error("[AINewsletterService] Error generating article summary:", error);
    return article.excerpt || (article.content ? article.content.substring(0, 150) + '...' : 'لا يوجد ملخص متاح');
  }
}

export async function generatePersonalizedIntro(
  subscriberName?: string,
  categories?: string[],
  newsletterType?: 'morning_brief' | 'evening_digest' | 'weekly_roundup'
): Promise<string> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return getDefaultIntro(subscriberName, newsletterType);
    }

    const timeOfDay = newsletterType === 'morning_brief' ? 'صباح' : 
                      newsletterType === 'evening_digest' ? 'مساء' : 
                      'أسبوع';
    
    const categoriesText = categories && categories.length > 0 
      ? `اهتماماته تشمل: ${categories.join('، ')}` 
      : 'متابع عام للأخبار';

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت كاتب ودود في صحيفة سبق الإخبارية. مهمتك كتابة مقدمة شخصية قصيرة وجذابة للنشرة الإخبارية.

قواعد المقدمة:
- اكتب تحية شخصية ودافئة باللغة العربية
- إذا كان الاسم متاحاً، استخدمه بشكل طبيعي
- اربط المقدمة بوقت اليوم (صباح/مساء/أسبوع)
- اذكر اهتمامات المشترك إن وجدت بشكل طبيعي
- اجعل المقدمة قصيرة (جملتين أو ثلاث فقط)
- لا تستخدم الرموز التعبيرية (emoji)`
        },
        {
          role: "user",
          content: `اكتب مقدمة شخصية لنشرة ${timeOfDay}ية للمشترك:\n${subscriberName ? `الاسم: ${subscriberName}` : 'مشترك بدون اسم'}\n${categoriesText}`
        }
      ],
      max_completion_tokens: 150,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || getDefaultIntro(subscriberName, newsletterType);
  } catch (error) {
    console.error("[AINewsletterService] Error generating personalized intro:", error);
    return getDefaultIntro(subscriberName, newsletterType);
  }
}

function getDefaultIntro(
  subscriberName?: string,
  newsletterType?: 'morning_brief' | 'evening_digest' | 'weekly_roundup'
): string {
  const greeting = subscriberName ? `مرحباً ${subscriberName}` : 'مرحباً';
  
  switch (newsletterType) {
    case 'morning_brief':
      return `${greeting}، نتمنى لك صباحاً مشرقاً! إليك أهم الأخبار لتبدأ يومك.`;
    case 'evening_digest':
      return `${greeting}، نتمنى لك مساءً طيباً! إليك ملخص أهم أحداث اليوم.`;
    case 'weekly_roundup':
      return `${greeting}، نتمنى لك أسبوعاً موفقاً! إليك تحليل معمق لأبرز أحداث الأسبوع.`;
    default:
      return `${greeting}، إليك آخر الأخبار المهمة.`;
  }
}

export async function generateArticleSummaries(
  articles: Article[]
): Promise<{ articleId: string; summary: string }[]> {
  const summaries = await Promise.all(
    articles.map(async (article) => ({
      articleId: article.id,
      summary: await generateArticleSummary(article)
    }))
  );
  return summaries;
}
