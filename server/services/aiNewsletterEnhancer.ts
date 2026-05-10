/**
 * AI Newsletter Enhancer Service
 * خدمة تحسين النشرة البريدية بالذكاء الاصطناعي
 * 
 * Features:
 * - Generate engaging subject lines that maximize open rates
 * - Create curiosity-inducing article summaries
 * - Generate personalized content based on subscriber behavior
 * - Suggest optimal send times
 * - Generate daily questions and interactive elements
 */

import OpenAI from "openai";
import type { Article } from "@shared/schema";
import type { NewsletterTemplateType, ArticleSummary } from "./smartNewsletterTemplates";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// Subject line styles for A/B testing
export type SubjectLineStyle = 
  | 'curiosity'      // إثارة الفضول
  | 'urgency'        // الاستعجال
  | 'benefit'        // الفائدة
  | 'question'       // السؤال
  | 'personalized'   // مخصص
  | 'news'           // إخباري
  | 'exclusive';     // حصري

interface SubjectLineResult {
  subject: string;
  preheader: string;
  style: SubjectLineStyle;
  predictedOpenRate: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface EnhancedArticleSummary extends ArticleSummary {
  engagementScore: number;
  curiosityHook: string;
  keyTakeaway: string;
  emotionalTone: string;
}

interface DailyQuestion {
  question: string;
  options?: string[];
  context: string;
  engagementType: 'poll' | 'opinion' | 'quiz' | 'discussion';
}

/**
 * Generate multiple engaging subject line variations for A/B testing
 */
export async function generateSubjectLines(
  articles: Article[],
  templateType: NewsletterTemplateType,
  subscriberName?: string,
  subscriberInterests?: string[]
): Promise<SubjectLineResult[]> {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return getDefaultSubjectLines(templateType, subscriberName);
    }

    const topArticle = articles[0];
    const articleTitles = articles.slice(0, 3).map(a => a.title).join('\n- ');
    const interestsText = subscriberInterests?.join('، ') || 'عام';

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت خبير في التسويق عبر البريد الإلكتروني ومتخصص في كتابة عناوين جذابة باللغة العربية تحقق أعلى معدلات فتح.

مهمتك: إنشاء 5 عناوين مختلفة لنشرة إخبارية، كل عنوان بأسلوب مختلف.

القواعد:
1. العنوان يجب أن يكون 50-70 حرفاً
2. نص المعاينة (preheader) يجب أن يكون 80-100 حرف ويكمل العنوان
3. استخدم تقنيات إثارة الفضول والاستعجال بذكاء
4. لا تستخدم رموز تعبيرية (emoji) في العنوان الرئيسي
5. يمكن استخدام رمز واحد في نص المعاينة فقط

الأساليب المطلوبة:
- curiosity: إثارة الفضول بطرح سؤال ضمني أو معلومة غير مكتملة
- urgency: خلق شعور بالاستعجال أو الأهمية الآنية
- benefit: التركيز على الفائدة التي سيحصل عليها القارئ
- question: طرح سؤال مباشر يجذب الانتباه
- exclusive: التأكيد على حصرية المحتوى أو الأهمية

أجب بتنسيق JSON فقط كالتالي:
{
  "subjects": [
    {
      "subject": "العنوان هنا",
      "preheader": "نص المعاينة هنا",
      "style": "curiosity",
      "predictedOpenRate": "high",
      "reasoning": "سبب اختيار هذا الأسلوب"
    }
  ]
}`
        },
        {
          role: "user",
          content: `نوع النشرة: ${getTemplateTypeArabic(templateType)}
${subscriberName ? `اسم المشترك: ${subscriberName}` : ''}
اهتمامات المشترك: ${interestsText}

العناوين الرئيسية للأخبار:
- ${articleTitles}

${topArticle ? `الخبر الأبرز: ${topArticle.title}` : ''}

اكتب 5 عناوين مختلفة بأساليب متنوعة.`
        }
      ],
      max_completion_tokens: 1500,
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"subjects": []}');
    return result.subjects || getDefaultSubjectLines(templateType, subscriberName);
  } catch (error) {
    console.error("[AINewsletterEnhancer] Error generating subject lines:", error);
    return getDefaultSubjectLines(templateType, subscriberName);
  }
}

/**
 * Generate an engaging, curiosity-inducing article summary
 */
export async function generateEngagingSummary(article: Article): Promise<EnhancedArticleSummary> {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return createDefaultEnhancedSummary(article);
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت كاتب محترف متخصص في صياغة ملخصات إخبارية جذابة تثير فضول القارئ.

مهمتك: تحويل الخبر إلى ملخص قصير ومشوق يجبر القارئ على النقر لقراءة المزيد.

التقنيات المستخدمة:
1. افتتاحية قوية تجذب الانتباه (hook)
2. معلومة مثيرة للفضول دون كشف كل التفاصيل
3. الإشارة لنتيجة مهمة أو تأثير دون ذكره
4. استخدام أرقام محددة إن وجدت
5. لغة حيوية ومباشرة

أجب بتنسيق JSON:
{
  "excerpt": "ملخص مختصر 2-3 جمل",
  "curiosityHook": "جملة افتتاحية جذابة",
  "keyTakeaway": "النقطة الرئيسية التي سيفهمها القارئ",
  "emotionalTone": "إيجابي/سلبي/محايد/مثير/مفاجئ",
  "engagementScore": 85
}`
        },
        {
          role: "user",
          content: `العنوان: ${article.title}

المحتوى: ${(article.content || article.excerpt || '').substring(0, 2000)}

القسم: ${article.categoryId || 'عام'}`
        }
      ],
      max_completion_tokens: 400,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    // For infographic articles, prefer infographicBannerUrl over regular imageUrl
    const displayImage = (article.articleType === 'infographic' && article.infographicBannerUrl)
      ? article.infographicBannerUrl
      : article.imageUrl;
    
    return {
      id: article.id,
      title: article.title || '',
      excerpt: result.excerpt || article.excerpt || '',
      url: article.slug ? `/article/${article.slug}` : undefined,
      imageUrl: displayImage || undefined,
      engagementScore: result.engagementScore || 50,
      curiosityHook: result.curiosityHook || '',
      keyTakeaway: result.keyTakeaway || '',
      emotionalTone: result.emotionalTone || 'محايد',
    };
  } catch (error) {
    console.error("[AINewsletterEnhancer] Error generating engaging summary:", error);
    return createDefaultEnhancedSummary(article);
  }
}

/**
 * Generate a daily question for subscriber engagement
 */
export async function generateDailyQuestion(
  articles: Article[],
  templateType: NewsletterTemplateType
): Promise<DailyQuestion> {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return getDefaultDailyQuestion(templateType);
    }

    const articleTopics = articles.slice(0, 5).map(a => a.title).join('\n');

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت خبير في إشراك الجمهور وطرح الأسئلة التي تحفز التفاعل.

مهمتك: إنشاء سؤال تفاعلي للنشرة الإخبارية يرتبط بأحداث اليوم.

أنواع الأسئلة:
- poll: استطلاع رأي بخيارات محددة
- opinion: سؤال رأي مفتوح
- quiz: سؤال معلوماتي مع إجابة
- discussion: سؤال يفتح نقاشاً

القواعد:
1. السؤال يجب أن يكون ذا صلة بأخبار اليوم
2. يجب أن يكون محايداً وغير مثير للجدل السياسي
3. يجب أن يشجع على المشاركة والتفاعل
4. إذا كان poll، قدم 3-4 خيارات قصيرة

أجب بتنسيق JSON:
{
  "question": "السؤال هنا",
  "options": ["خيار 1", "خيار 2", "خيار 3"],
  "context": "سياق السؤال وعلاقته بالأخبار",
  "engagementType": "poll"
}`
        },
        {
          role: "user",
          content: `نوع النشرة: ${getTemplateTypeArabic(templateType)}

أهم عناوين اليوم:
${articleTopics}

اكتب سؤالاً تفاعلياً مناسباً.`
        }
      ],
      max_completion_tokens: 300,
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    return {
      question: result.question || 'ما رأيك في أخبار اليوم؟',
      options: result.options,
      context: result.context || '',
      engagementType: result.engagementType || 'opinion',
    };
  } catch (error) {
    console.error("[AINewsletterEnhancer] Error generating daily question:", error);
    return getDefaultDailyQuestion(templateType);
  }
}

/**
 * Generate a personalized intro based on subscriber profile
 */
export async function generateSmartPersonalizedIntro(
  subscriberName?: string,
  subscriberInterests?: string[],
  readingHistory?: { categoryId: string; count: number }[],
  templateType?: NewsletterTemplateType,
  topArticle?: Article
): Promise<string> {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return getDefaultSmartIntro(subscriberName, templateType);
    }

    const timeOfDay = getTimeOfDay();
    const topCategories = readingHistory?.slice(0, 3).map(h => h.categoryId).join('، ') || '';
    const interests = subscriberInterests?.join('، ') || 'متنوعة';

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت كاتب ودود ومحترف في صحيفة سبق الإخبارية.

مهمتك: كتابة مقدمة شخصية قصيرة (2-3 جمل) للنشرة الإخبارية.

القواعد:
1. ابدأ بتحية مناسبة لوقت اليوم
2. إذا توفر الاسم، استخدمه بشكل طبيعي
3. اربط المقدمة باهتمامات المشترك إن وجدت
4. اذكر ميزة أو معلومة مثيرة من أخبار اليوم
5. لا تستخدم رموز تعبيرية
6. اجعل النبرة ودية ومهنية`
        },
        {
          role: "user",
          content: `الوقت: ${timeOfDay}
${subscriberName ? `اسم المشترك: ${subscriberName}` : 'مشترك بدون اسم'}
اهتمامات: ${interests}
${topCategories ? `أكثر الأقسام متابعة: ${topCategories}` : ''}
${topArticle ? `الخبر الأبرز: ${topArticle.title}` : ''}

اكتب مقدمة شخصية جذابة.`
        }
      ],
      max_completion_tokens: 150,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || getDefaultSmartIntro(subscriberName, templateType);
  } catch (error) {
    console.error("[AINewsletterEnhancer] Error generating smart intro:", error);
    return getDefaultSmartIntro(subscriberName, templateType);
  }
}

/**
 * Score and rank articles by predicted engagement
 */
export async function scoreArticlesForEngagement(
  articles: Article[],
  subscriberInterests?: string[]
): Promise<{ article: Article; score: number; reason: string }[]> {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return articles.map((article, index) => ({
        article,
        score: 100 - (index * 10),
        reason: 'ترتيب افتراضي',
      }));
    }

    const articlesList = articles.slice(0, 20).map((a, i) => ({
      index: i,
      title: a.title,
      category: a.categoryId,
    }));

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت محلل محتوى متخصص في تقييم جاذبية الأخبار.

مهمتك: ترتيب الأخبار حسب توقع التفاعل معها (النقر والقراءة).

معايير التقييم:
1. جاذبية العنوان وقوته
2. أهمية الموضوع وآنيته
3. قابلية المشاركة
4. ملاءمة اهتمامات المشترك

أجب بتنسيق JSON:
{
  "rankings": [
    {"index": 0, "score": 95, "reason": "سبب قصير"},
    {"index": 1, "score": 88, "reason": "سبب قصير"}
  ]
}`
        },
        {
          role: "user",
          content: `اهتمامات المشترك: ${subscriberInterests?.join('، ') || 'عامة'}

الأخبار:
${JSON.stringify(articlesList, null, 2)}

قيّم ورتب هذه الأخبار.`
        }
      ],
      max_completion_tokens: 600,
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"rankings": []}');
    
    const scoredArticles = result.rankings
      ?.map((r: { index: number; score: number; reason: string }) => ({
        article: articles[r.index],
        score: r.score,
        reason: r.reason,
      }))
      .filter((item: any) => item.article)
      .sort((a: any, b: any) => b.score - a.score) || [];

    // Add any articles that weren't scored
    const scoredIds = new Set(scoredArticles.map((s: any) => s.article.id));
    articles.forEach((article, index) => {
      if (!scoredIds.has(article.id)) {
        scoredArticles.push({
          article,
          score: 50 - index,
          reason: 'غير مقيّم',
        });
      }
    });

    return scoredArticles;
  } catch (error) {
    console.error("[AINewsletterEnhancer] Error scoring articles:", error);
    return articles.map((article, index) => ({
      article,
      score: 100 - (index * 5),
      reason: 'ترتيب افتراضي',
    }));
  }
}

/**
 * Generate exclusive content teaser
 */
export async function generateExclusiveTeaser(
  topArticle: Article
): Promise<{ title: string; teaser: string } | null> {
  try {
    const client = getOpenAIClient();
    if (!client || !topArticle) {
      return null;
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت كاتب محترف متخصص في إنشاء محتوى تشويقي.

مهمتك: تحويل خبر إلى "محتوى حصري" مثير للفضول يحفز القارئ على النقر.

أجب بتنسيق JSON:
{
  "title": "عنوان تشويقي قصير (5-8 كلمات)",
  "teaser": "نص تشويقي مختصر (جملة واحدة تثير الفضول)"
}`
        },
        {
          role: "user",
          content: `الخبر: ${topArticle.title}

الملخص: ${topArticle.excerpt || (topArticle.content || '').substring(0, 300)}

اكتب محتوى تشويقي حصري.`
        }
      ],
      max_completion_tokens: 150,
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    if (result.title && result.teaser) {
      return {
        title: result.title,
        teaser: result.teaser,
      };
    }
    return null;
  } catch (error) {
    console.error("[AINewsletterEnhancer] Error generating exclusive teaser:", error);
    return null;
  }
}

// Helper functions

function getTemplateTypeArabic(type: NewsletterTemplateType): string {
  const types: Record<NewsletterTemplateType, string> = {
    morning_brief: 'نشرة صباحية',
    evening_digest: 'نشرة مسائية',
    weekly_roundup: 'نشرة أسبوعية',
    breaking_news: 'أخبار عاجلة',
    personalized_digest: 'نشرة مخصصة',
  };
  return types[type] || 'نشرة إخبارية';
}

function getTimeOfDay(): string {
  // Use Saudi Arabia timezone (UTC+3) for accurate time-based greetings
  const saudiTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' });
  const hour = new Date(saudiTime).getHours();
  if (hour >= 5 && hour < 12) return 'صباح';
  if (hour >= 12 && hour < 17) return 'ظهيرة';
  if (hour >= 17 && hour < 21) return 'مساء';
  return 'ليل';
}

function getDefaultSubjectLines(
  templateType: NewsletterTemplateType,
  subscriberName?: string
): SubjectLineResult[] {
  const greeting = subscriberName ? `${subscriberName}،` : '';
  
  const defaults: Record<NewsletterTemplateType, SubjectLineResult[]> = {
    morning_brief: [
      {
        subject: `${greeting} أهم 5 أخبار لتبدأ يومك`,
        preheader: 'ملخص شامل لأبرز الأحداث هذا الصباح',
        style: 'benefit',
        predictedOpenRate: 'medium',
        reasoning: 'عنوان افتراضي',
      },
    ],
    evening_digest: [
      {
        subject: `${greeting} ماذا حدث اليوم؟ ملخص سريع`,
        preheader: 'أهم الأحداث والأخبار في دقائق معدودة',
        style: 'curiosity',
        predictedOpenRate: 'medium',
        reasoning: 'عنوان افتراضي',
      },
    ],
    weekly_roundup: [
      {
        subject: `${greeting} أسبوع في دقائق: أهم ما جرى`,
        preheader: 'تحليل شامل لأبرز أحداث الأسبوع',
        style: 'benefit',
        predictedOpenRate: 'medium',
        reasoning: 'عنوان افتراضي',
      },
    ],
    breaking_news: [
      {
        subject: 'عاجل: خبر مهم الآن',
        preheader: 'تطورات متسارعة في هذه اللحظة',
        style: 'urgency',
        predictedOpenRate: 'high',
        reasoning: 'عنوان افتراضي',
      },
    ],
    personalized_digest: [
      {
        subject: `${greeting} أخبار مختارة خصيصاً لك`,
        preheader: 'محتوى مخصص بناءً على اهتماماتك',
        style: 'personalized',
        predictedOpenRate: 'medium',
        reasoning: 'عنوان افتراضي',
      },
    ],
  };

  return defaults[templateType] || defaults.morning_brief;
}

function createDefaultEnhancedSummary(article: Article): EnhancedArticleSummary {
  // For infographic articles, prefer infographicBannerUrl over regular imageUrl
  const displayImage = (article.articleType === 'infographic' && article.infographicBannerUrl)
    ? article.infographicBannerUrl
    : article.imageUrl;
  
  return {
    id: article.id,
    title: article.title || '',
    excerpt: article.excerpt || (article.content || '').substring(0, 150) + '...',
    url: article.slug ? `/article/${article.slug}` : undefined,
    imageUrl: displayImage || undefined,
    engagementScore: 50,
    curiosityHook: article.title || '',
    keyTakeaway: '',
    emotionalTone: 'محايد',
  };
}

function getDefaultDailyQuestion(templateType: NewsletterTemplateType): DailyQuestion {
  const questions: Record<NewsletterTemplateType, DailyQuestion> = {
    morning_brief: {
      question: 'كيف تخطط ليومك؟',
      options: ['عمل مكثف', 'توازن بين العمل والراحة', 'يوم هادئ', 'أنتظر ما يحمله'],
      context: 'سؤال صباحي تحفيزي',
      engagementType: 'poll',
    },
    evening_digest: {
      question: 'ما أكثر خبر لفت انتباهك اليوم؟',
      context: 'مراجعة نهاية اليوم',
      engagementType: 'opinion',
    },
    weekly_roundup: {
      question: 'ما أهم حدث برأيك هذا الأسبوع؟',
      context: 'مراجعة أسبوعية',
      engagementType: 'discussion',
    },
    breaking_news: {
      question: 'هل تابعت هذا الخبر؟',
      options: ['نعم', 'لا', 'سأتابعه الآن'],
      context: 'خبر عاجل',
      engagementType: 'poll',
    },
    personalized_digest: {
      question: 'هل المحتوى المقترح يناسب اهتماماتك؟',
      options: ['نعم تماماً', 'إلى حد ما', 'أريد تغيير تفضيلاتي'],
      context: 'تقييم التخصيص',
      engagementType: 'poll',
    },
  };

  return questions[templateType] || questions.morning_brief;
}

function getDefaultSmartIntro(
  subscriberName?: string,
  templateType?: NewsletterTemplateType
): string {
  const greeting = subscriberName ? `مرحباً ${subscriberName}` : 'مرحباً';
  const timeOfDay = getTimeOfDay();
  
  const intros: Record<string, string> = {
    صباح: `${greeting}، نتمنى لك صباحاً مشرقاً! إليك أهم الأخبار لتبدأ يومك على اطلاع.`,
    ظهيرة: `${greeting}، نتمنى لك وقتاً ممتعاً! إليك آخر المستجدات والأخبار المهمة.`,
    مساء: `${greeting}، نتمنى لك مساءً طيباً! إليك ملخص أهم أحداث اليوم.`,
    ليل: `${greeting}، قبل أن تنام، إليك أهم ما جرى اليوم.`,
  };

  return intros[timeOfDay] || intros.صباح;
}
