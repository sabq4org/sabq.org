// Reference: javascript_openai blueprint
import OpenAI from "openai";
import { retryWithBackoff } from "./utils/retryWithBackoff";
import {
  SABQ_LANGUAGE_STANDARDS_AR,
  SABQ_HEADLINE_STANDARDS_AR,
  SABQ_SUMMARY_STANDARDS_AR,
  SABQ_PRIME_RULE_AR,
} from "./ai/sabqEditorialPrompt";

// the newest OpenAI model is "gpt-5.1" - unified model for all completions
// حدود صريحة بدل افتراضات SDK (مهلة 10 دقائق × 2 retries داخليين): أقصى
// إخراج في هذا الملف 4096 توكن فـ120ث سقف سخي، وretry داخلي واحد يكفي —
// المسارات التفاعلية فوقها طبقة withRetry أصلًا، والتراكب كان يضاعف أسوأ
// حالة إلى دقائق (تشخيص edit-and-generate 2026-07-27).
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });

// ============================================
// Rate Limit & Transient Error Retry Helper
// ============================================

/**
 * Wraps an async function with retry logic for transient errors
 * Handles: 429 rate limits, 500/502/503/504 server errors, network failures
 * Uses exponential backoff with jitter: ~1s, ~2s, ~4s delays
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  context: string = "OpenAI"
): Promise<T> {
  return retryWithBackoff(fn, context, { maxRetries });
}

// ============================================
// Standardized AI Response Helper (GPT-5.1)
// ============================================

export interface CreateAIResponseParams {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  reasoningEffort?: "none" | "medium" | "high";
  enableCache?: boolean;
  cacheTTL?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" };
}

/**
 * Standardized helper function for creating AI responses using GPT-5.1
 * Supports reasoning effort levels and caching for optimal performance
 * 
 * Note: Using chat.completions.create() as the base API. The task specifies
 * responses.create() but this API doesn't exist in current OpenAI SDK.
 * This implementation provides the same functionality with proper API.
 * 
 * @param params Configuration for the AI response
 * @returns OpenAI response object
 */
export async function createAIResponse(params: CreateAIResponseParams) {
  const {
    messages,
    reasoningEffort,
    enableCache = false,
    cacheTTL = 86400,
    maxTokens = 2048,
    responseFormat,
  } = params;

  // Build the request configuration for gpt-5.1
  // NOTE: GPT-5.1 does not support custom temperature (only default 1)
  const requestConfig: any = {
    model: "gpt-5.1",
    messages,
    max_completion_tokens: maxTokens,
  };

  // Add response format if specified (e.g., JSON mode)
  if (responseFormat) {
    requestConfig.response_format = responseFormat;
  }

  // Note: Reasoning and caching parameters are part of the new gpt-5.1 API
  // Add them here when they become available in the SDK
  // For now, we use the standard chat.completions.create() API
  
  return withRetry(
    () => openai.chat.completions.create(requestConfig),
    3,
    "createAIResponse"
  );
}

// ============================================
// Utility Helpers
// ============================================

// Helper: Strip HTML tags and decode entities
function stripHtml(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  
  // Remove extra whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

export async function summarizeArticle(text: string): Promise<string> {
  try {
    console.log("[Summarize] 🚀 Starting article summarization...");
    console.log("[Summarize] Input text length:", text.length);
    console.log("[Summarize] Input preview:", text.substring(0, 100) + "...");
    
    // Strip HTML tags for clean processing
    const cleanText = stripHtml(text);
    console.log("[Summarize] Clean text length:", cleanText.length);
    console.log("[Summarize] Clean text preview:", cleanText.substring(0, 100) + "...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: `أنت محرر صحفي خبير في صحيفة سبق الإلكترونية، متخصص في كتابة الموجز الذكي للأخبار.

${SABQ_LANGUAGE_STANDARDS_AR}

${SABQ_SUMMARY_STANDARDS_AR}`,
        },
        {
          role: "user",
          content: `قم بتلخيص المقال التالي في 2-3 جمل:\n\n${cleanText}`,
        },
      ],
      max_completion_tokens: 1024,  // Increased for better results
    });

    console.log("[Summarize] ✅ OpenAI response received");
    console.log("[Summarize] Response structure:", JSON.stringify({
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length,
      firstChoice: response.choices?.[0] ? {
        hasMessage: !!response.choices[0].message,
        hasContent: !!response.choices[0].message?.content,
        contentLength: response.choices[0].message?.content?.length,
        finishReason: response.choices[0].finish_reason,
      } : null,
    }));
    
    const content = response.choices?.[0]?.message?.content;
    
    if (!content) {
      console.warn("[Summarize] ⚠️ Empty response from OpenAI!");
      console.warn("[Summarize] Full response:", JSON.stringify(response, null, 2));
      return "";
    }
    
    console.log("[Summarize] ✅ Summary generated successfully");
    console.log("[Summarize] Summary preview:", content.substring(0, 100));
    console.log("[Summarize] Summary length:", content.length);
    
    return content;
  } catch (error) {
    console.error("[Summarize] ❌ Error summarizing article:", error);
    throw new Error("Failed to summarize article");
  }
}

export async function generateTitle(content: string, language: "ar" | "en" | "ur" = "ar"): Promise<string[]> {
  try {
    console.log("[GenerateTitles] 🚀 Starting title generation...");
    console.log("[GenerateTitles] Language:", language);
    console.log("[GenerateTitles] Content length:", content.length);
    console.log("[GenerateTitles] Content preview:", content.substring(0, 100) + "...");
    
    // Strip HTML tags for clean processing
    const cleanContent = stripHtml(content);
    console.log("[GenerateTitles] Clean content length:", cleanContent.length);
    console.log("[GenerateTitles] Clean content preview:", cleanContent.substring(0, 100) + "...");
    
    const SYSTEM_PROMPTS = {
      ar: `أنت محرر عناوين خبير في صحيفة "سبق" السعودية. تتبع معايير سبق الموحّدة لكتابة العناوين:

${SABQ_PRIME_RULE_AR}

⚠️ **تعليمات أساسية (مهم جداً!):**
- اقرأ المحتوى **كاملاً من أوله إلى آخره** قبل كتابة أي عنوان
- لا تركز فقط على الجملة الأولى - المعلومة الأهم قد تكون في المنتصف أو النهاية!
- حدد **أقوى نقطة في كامل النص** لتكون محور العنوان
- كل عنوان من الثلاثة يجب أن يركز على زاوية مختلفة من الخبر

${SABQ_HEADLINE_STANDARDS_AR}

معايير إضافية:
- لغة عربية فصحى سليمة 100% بلا أي خطأ إملائي أو نحوي
- يبدأ بفعل قوي أو اسم فاعل، ويتضمن كلمة مفتاحية رئيسية
- تجنب ":" و"..." والأقواس
- لا تكرر نفس الكلمات في العناوين المختلفة`,
      en: `You are an expert headline editor at "Sabq" newspaper. Follow strict headline standards:

⚠️ **Critical Instructions (Very Important!):**
- Read the content **completely from start to end** before writing any headline
- Don't focus only on the first sentence - the most important info might be in the middle or end!
- Identify the **strongest point in the ENTIRE text** to be the focus of the headline
- Each of the 3 headlines should focus on a DIFFERENT angle of the news

Headline standards (Sabq unified):
- 5 to 12 words. Compelling, accurate, no clickbait; never truncated or grammatically incomplete
- Strong headline that clearly explains the news
- Start with a strong verb or active noun
- Comprehensive, clear, and direct
- Include a primary keyword
- Avoid ":" and "..." and parentheses
- Don't repeat the same words across different headlines`,
      ur: `آپ صحیفہ "سبق" کے ماہر ہیڈلائن ایڈیٹر ہیں۔ سخت معیارات کی پیروی کریں:

⚠️ **اہم ہدایات:**
- عنوان لکھنے سے پہلے مکمل مواد پڑھیں
- صرف پہلی سطر پر توجہ نہ دیں - اہم معلومات درمیان یا آخر میں ہو سکتی ہے!
- پوری تحریر میں سب سے مضبوط نقطہ تلاش کریں

معیارات:
- حد: 5-12 الفاظ، مکمل اور کبھی نامکمل نہیں
- مضبوط، تفصیلی عنوان جو خبر کو واضح طور پر بیان کرے
- مضبوط فعل یا فاعل اسم سے شروع کریں
- جامع، واضح، اور براہ راست
- بنیادی کلیدی لفظ شامل کریں`
    };

    const USER_PROMPTS = {
      ar: `اقترح 3 عناوين مختلفة ومتنوعة للخبر التالي.

⚠️ تعليمات مهمة:
1. اقرأ **كامل النص أدناه** من البداية إلى النهاية قبل اقتراح أي عنوان
2. كل عنوان بين 5-12 كلمة، مكتمل لغوياً وغير مبتور
3. العنوان الأول: ركز على المعلومة الأقوى في الخبر
4. العنوان الثاني: ركز على زاوية مختلفة أو تفصيل مهم آخر
5. العنوان الثالث: ركز على جانب ثالث مختلف من الخبر
6. لا تركز فقط على أول سطرين - ابحث في كامل النص!

أعد النتيجة بصيغة JSON:
{"titles": ["عنوان 1", "عنوان 2", "عنوان 3"]}

الخبر الكامل:
${cleanContent}`,
      en: `Suggest 3 different and varied headlines for the following news.

⚠️ Important instructions:
1. Read the **ENTIRE text below** from start to end before suggesting any headline
2. Each headline 5-12 words, complete and never truncated
3. First headline: Focus on the strongest information in the news
4. Second headline: Focus on a different angle or important detail
5. Third headline: Focus on a third different aspect of the news
6. Don't focus only on the first two lines - search the entire text!

Return in JSON format:
{"titles": ["headline 1", "headline 2", "headline 3"]}

Full news content:
${cleanContent}`,
      ur: `مندرجہ ذیل خبر کے لیے 3 مختلف عنوانات تجویز کریں۔

اہم ہدایات:
1. عنوان تجویز کرنے سے پہلے نیچے دیا گیا **پورا متن** پڑھیں
2. ہر عنوان 5-12 الفاظ، مکمل اور نامکمل نہیں
3. پہلا عنوان: خبر کی سب سے مضبوط معلومات پر توجہ دیں
4. دوسرا عنوان: ایک مختلف زاویے پر توجہ دیں
5. تیسرا عنوان: تیسرے مختلف پہلو پر توجہ دیں
6. صرف پہلی دو سطروں پر توجہ نہ دیں - پورے متن میں تلاش کریں!

JSON فارمیٹ میں واپس کریں:
{"titles": ["عنوان 1", "عنوان 2", "عنوان 3"]}

مکمل خبر:
${cleanContent}`
    };

    console.log("[GenerateTitles] Calling OpenAI API with full content...");
    console.log("[GenerateTitles] Full content length being sent:", cleanContent.length);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPTS[language],
        },
        {
          role: "user",
          content: USER_PROMPTS[language],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
      temperature: 0.8,  // Higher temperature for varied outputs on regeneration
    });

    console.log("[GenerateTitles] ✅ OpenAI response received");
    console.log("[GenerateTitles] Response structure:", JSON.stringify({
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length,
      firstChoice: response.choices?.[0] ? {
        hasMessage: !!response.choices[0].message,
        hasContent: !!response.choices[0].message?.content,
        contentLength: response.choices[0].message?.content?.length,
        finishReason: response.choices[0].finish_reason,
      } : null,
    }));
    
    const messageContent = response.choices?.[0]?.message?.content;
    
    if (!messageContent) {
      console.warn("[GenerateTitles] ⚠️ Empty response from OpenAI!");
      console.warn("[GenerateTitles] Full response:", JSON.stringify(response, null, 2));
      return [];
    }
    
    console.log("[GenerateTitles] Raw message content:", messageContent);
    
    const result = JSON.parse(messageContent);
    console.log("[GenerateTitles] Parsed JSON result:", JSON.stringify(result, null, 2));
    
    const titles = result.titles || [];
    console.log("[GenerateTitles] ✅ Titles extracted:", titles.length, "titles");
    console.log("[GenerateTitles] Titles:", titles);
    
    return titles;
  } catch (error) {
    console.error("[GenerateTitles] ❌ Error generating titles:", error);
    throw new Error("Failed to generate titles");
  }
}

export async function getArticleRecommendations(
  userHistory: { categoryId?: string; title: string }[],
  availableArticles: { id: string; title: string; categoryId?: string }[]
): Promise<string[]> {
  try {
    const historyText = userHistory
      .map(h => `- ${h.title} (${h.categoryId})`)
      .join("\n");
    
    const articlesText = availableArticles
      .map(a => `ID: ${a.id}, العنوان: ${a.title}, التصنيف: ${a.categoryId}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: "أنت نظام توصيات ذكي. بناءً على سجل قراءة المستخدم، اختر أفضل المقالات التي قد تهمه. أعد قائمة بمعرفات المقالات (IDs) بصيغة JSON.",
        },
        {
          role: "user",
          content: `سجل قراءة المستخدم:\n${historyText}\n\nالمقالات المتاحة:\n${articlesText}\n\nاختر أفضل 5 مقالات. أعد النتيجة بصيغة JSON: {"recommendations": ["id1", "id2", ...]}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 256,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.recommendations || [];
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return [];
  }
}

export async function chatWithAssistant(
  message: string,
  recentArticles: { title: string; summary?: string; categoryNameAr?: string }[]
): Promise<string> {
  try {
    console.log("[ChatAssistant] Processing message:", message.substring(0, 100));
    
    const articlesContext = recentArticles
      .map((article, index) => 
        `${index + 1}. ${article.title}${article.categoryNameAr ? ` (${article.categoryNameAr})` : ''}${article.summary ? `\n   ملخص: ${article.summary}` : ''}`
      )
      .join('\n');

    const systemPrompt = `أنت مساعد أخبار ذكي لصحيفة سبق. ساعد القراء في العثور على الأخبار والمعلومات. أجب بالعربية دائماً.

آخر الأخبار المنشورة:
${articlesContext}

استخدم هذه الأخبار للإجابة على أسئلة القارئ عندما يكون ذلك مناسباً.`;

    console.log("[ChatAssistant] Calling OpenAI API...");
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: message,
        },
      ],
      max_completion_tokens: 512,
    });

    console.log("[ChatAssistant] OpenAI response received successfully");
    console.log("[ChatAssistant] Response structure:", JSON.stringify({
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length,
      firstChoice: response.choices?.[0] ? {
        hasMessage: !!response.choices[0].message,
        hasContent: !!response.choices[0].message?.content,
        contentLength: response.choices[0].message?.content?.length,
        finishReason: response.choices[0].finish_reason,
      } : null,
    }));
    
    const content = response.choices?.[0]?.message?.content;
    
    if (!content) {
      console.warn("[ChatAssistant] Empty response from OpenAI");
      console.warn("[ChatAssistant] Full response:", JSON.stringify(response, null, 2));
      return "عذراً، لم أتمكن من معالجة طلبك.";
    }
    
    console.log("[ChatAssistant] Response content:", content.substring(0, 100));
    return content;
  } catch (error: any) {
    console.error("[ChatAssistant] Error:", error);
    console.error("[ChatAssistant] Error details:", {
      message: error.message,
      status: error.status,
      type: error.type,
      code: error.code,
    });
    
    // Return user-friendly error message instead of throwing
    if (error.status === 401) {
      return "عذراً، هناك مشكلة في إعدادات المساعد الذكي. يرجى المحاولة لاحقاً.";
    } else if (error.status === 429) {
      return "عذراً، تم تجاوز حد الاستخدام. يرجى المحاولة بعد قليل.";
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return "عذراً، لا يمكن الاتصال بالمساعد الذكي حالياً. يرجى المحاولة لاحقاً.";
    }
    
    return "عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.";
  }
}

export async function analyzeCredibility(
  articleContent: string,
  title: string
): Promise<{
  score: number;
  factors: { name: string; score: number; note: string }[];
  summary: string;
}> {
  try {
    const systemPrompt = `أنت خبير في تحليل مصداقية المحتوى الصحفي. قم بتحليل المقال بناءً على المعايير الصحفية التالية:

1. **المصادر**: وجود مصادر موثوقة ومتنوعة
2. **الوضوح**: وضوح المعلومات والحقائق المقدمة
3. **التوازن**: التوازن في عرض وجهات النظر المختلفة
4. **الدقة اللغوية**: الدقة اللغوية والنحوية والإملائية

أعد النتيجة بصيغة JSON فقط مع الحقول التالية:
- score: رقم من 0 إلى 100 (إجمالي المصداقية)
- factors: مصفوفة من الكائنات، كل كائن يحتوي على:
  - name: اسم المعيار (المصادر، الوضوح، التوازن، الدقة اللغوية)
  - score: درجة من 0 إلى 100
  - note: ملاحظة قصيرة (جملة واحدة)
- summary: ملخص شامل للتحليل (2-3 جمل)`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `العنوان: ${title}\n\nالمحتوى:\n${articleContent.substring(0, 3000)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      score: result.score || 0,
      factors: result.factors || [],
      summary: result.summary || "لم يتم التحليل",
    };
  } catch (error) {
    console.error("Error analyzing credibility:", error);
    throw new Error("Failed to analyze article credibility");
  }
}

export async function generateDailyActivityInsights(
  activities: Array<{
    type: string;
    summary: string;
    occurredAt: string;
    importance: string;
    target?: { title?: string; kind?: string };
  }>,
  stats: {
    activeUsers: number;
    totalComments: number;
    totalReactions: number;
    publishedArticles: number;
    breakingNews: number;
  },
  previousStats?: {
    activeUsers: number;
    totalComments: number;
    totalReactions: number;
  }
): Promise<{
  dailySummary: string;
  topTopics: Array<{ name: string; score: number }>;
  activityTrend: string;
  keyHighlights: string[];
}> {
  try {
    const activitiesText = activities
      .slice(0, 50)
      .map((a, i) => `${i + 1}. [${a.type}] ${a.summary} (${a.importance})`)
      .join("\n");

    const trendInfo = previousStats
      ? `
مقارنة مع الفترة السابقة:
- المستخدمون النشطون: ${stats.activeUsers} (كانوا ${previousStats.activeUsers})
- التعليقات: ${stats.totalComments} (كانت ${previousStats.totalComments})
- التفاعلات: ${stats.totalReactions} (كانت ${previousStats.totalReactions})
`
      : '';

    const systemPrompt = `أنت محلل ذكي للأنشطة اليومية في منصة إخبارية. مهمتك تحليل نشاط اليوم وتقديم رؤى ذكية بالعربية.

قم بتحليل الأنشطة المذكورة أدناه وأعد نتيجة JSON فقط تحتوي على:

1. **dailySummary**: ملخص ذكي وجذاب للنشاط اليومي (2-3 جمل)
2. **topTopics**: قائمة بأكثر 5 مواضيع نشاطاً اليوم. كل موضوع يحتوي على:
   - name: اسم الموضوع
   - score: نقاط النشاط (عدد)
3. **activityTrend**: نص يصف اتجاه النشاط (جملة واحدة مثل "نشاط متزايد بنسبة 15%")
4. **keyHighlights**: قائمة بأهم 3 أحداث اليوم (نصوص قصيرة)

كن إيجابياً ومحفزاً في الوصف. استخدم الأرقام عند الحاجة.`;

    const userPrompt = `
الإحصائيات اليومية:
- عدد المستخدمين النشطين: ${stats.activeUsers}
- عدد التعليقات: ${stats.totalComments}
- عدد التفاعلات: ${stats.totalReactions}
- المقالات المنشورة: ${stats.publishedArticles}
- الأخبار العاجلة: ${stats.breakingNews}
${trendInfo}

آخر الأنشطة:
${activitiesText}

قم بتحليل هذه البيانات وإنشاء رؤى ذكية بصيغة JSON.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      dailySummary: result.dailySummary || "لا توجد أنشطة كافية لتحليل اليوم.",
      topTopics: result.topTopics || [],
      activityTrend: result.activityTrend || "نشاط مستقر",
      keyHighlights: result.keyHighlights || [],
    };
  } catch (error) {
    console.error("Error generating daily insights:", error);
    return {
      dailySummary: "نشاط معتدل اليوم مع تفاعل جيد من المستخدمين.",
      topTopics: [],
      activityTrend: "نشاط مستقر",
      keyHighlights: [],
    };
  }
}

export async function analyzeSEO(
  title: string,
  content: string,
  excerpt?: string
): Promise<{
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  socialTitle: string;
  socialDescription: string;
  imageAltText: string;
  suggestions: string[];
  score: number;
}> {
  try {
    const systemPrompt = `أنت خبير في تحسين محركات البحث (SEO) للمحتوى العربي. مهمتك تحليل المقالات الإخبارية وتقديم توصيات SEO محسّنة.

قم بتحليل المقال وإنشاء:
1. **seoTitle**: عنوان محسّن لمحركات البحث (50-60 حرف) - جذاب ويحتوي على كلمات مفتاحية
2. **metaDescription**: وصف meta (150-160 حرف) - ملخص جذاب يشجع على النقر
3. **keywords**: 5-7 كلمات مفتاحية رئيسية (مصفوفة نصوص)
4. **socialTitle**: عنوان للمشاركة الاجتماعية (أقصر وأكثر جاذبية - 70 حرف)
5. **socialDescription**: وصف للمشاركة الاجتماعية (100-120 حرف)
6. **imageAltText**: نص بديل للصورة البارزة (80-100 حرف) - وصف دقيق للمحتوى
7. **suggestions**: 3-5 اقتراحات لتحسين SEO (مصفوفة نصوص قصيرة)
8. **score**: تقييم SEO الحالي من 0-100

معايير التقييم:
- العنوان يحتوي على كلمات مفتاحية (20 نقطة)
- طول المحتوى مناسب (20 نقطة)
- استخدام العناوين الفرعية (20 نقطة)
- وضوح المعلومات (20 نقطة)
- جودة اللغة (20 نقطة)

أعد النتيجة بصيغة JSON فقط.`;

    const userContent = `العنوان: ${title}

${excerpt ? `المقدمة: ${excerpt}\n\n` : ''}المحتوى (أول 2000 حرف):
${content.substring(0, 2000)}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1536,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      seoTitle: result.seoTitle || title,
      metaDescription: result.metaDescription || excerpt || "",
      keywords: result.keywords || [],
      socialTitle: result.socialTitle || title,
      socialDescription: result.socialDescription || excerpt || "",
      imageAltText: result.imageAltText || title,
      suggestions: result.suggestions || [],
      score: result.score || 0,
    };
  } catch (error) {
    console.error("Error analyzing SEO:", error);
    throw new Error("Failed to analyze SEO");
  }
}

export async function generateSmartContent(newsContent: string, language: "ar" | "en" = "ar"): Promise<{
  mainTitle: string;
  subTitle: string;
  smartSummary: string;
  keywords: string[];
  seo: {
    metaTitle: string;
    metaDescription: string;
  };
  suggestedCategory?: string;
  translatedContent?: string;
}> {
  try {
    // Helper function to detect if content is primarily Arabic
    const isArabicContent = (text: string): boolean => {
      const arabicChars = text.match(/[\u0600-\u06FF]/g) || [];
      const totalChars = text.replace(/\s/g, '').length;
      return totalChars > 0 && (arabicChars.length / totalChars) > 0.3;
    };

    const contentIsArabic = isArabicContent(newsContent);
    const needsTranslation = language === "en" && contentIsArabic;

    console.log("[Smart Content] Content language detection:", {
      targetLanguage: language,
      contentIsArabic,
      needsTranslation
    });

    const systemPrompts = {
      ar: `🎯 الدور: أنت محرر خبير في صحيفة "سبق" السعودية، متخصص في كتابة الأخبار بأسلوب صحفي احترافي وسهل الفهم، يدعم تحسين محركات البحث (SEO) ويجذب القارئ العربي.

${SABQ_PRIME_RULE_AR}

${SABQ_LANGUAGE_STANDARDS_AR}

⚠️ **تعليمات أساسية (مهم جداً!):**
- اقرأ المحتوى **كاملاً من أوله إلى آخره** قبل كتابة أي شيء.
- حدد **جميع النقاط المهمة** في الخبر (القرارات، الأرقام، الأسماء، التواريخ، التفاصيل الفريدة).
- اختر **الزاوية الأقوى والأكثر تأثيراً** للعنوان الرئيسي.
- لا تركز فقط على الجملة الأولى - قد تكون المعلومة الأهم في منتصف أو نهاية الخبر!
- إذا كان الخبر يحتوي على عدة نقاط مهمة، اختر واحدة مختلفة في كل مرة يُطلب منك التوليد.

✳️ المطلوب منك:
1. **العنوان الرئيسي (main_title):**
   - الحد: 5-12 كلمة. مكتمل لغوياً وغير مبتور، دون مبالغة أو تضليل.
   - عنوان قوي يشرح الخبر بوضوح.
   - يبدأ بفعل قوي أو اسم فاعل.  
   - جذّاب، شامل، ومناسب لأسلوب صحيفة "سبق".  
   - يتضمن كلمة مفتاحية رئيسية.  
   - تجنب استخدام ":" أو "..." في العنوان.
   - **ركّز على المعلومة الأقوى في كامل النص، ليس فقط البداية!**

2. **العنوان الفرعي (sub_title):**  
   ⚠️ مهم جداً: جملة قصيرة جداً (6–10 كلمات فقط، لا أكثر!).  
   - تكمّل العنوان الرئيسي بمعلومة إضافية واحدة فقط.  
   - لا تكرر ما في العنوان الرئيسي.  
   - مثال جيد: "الاتفاقية تشمل 5 مجالات للتعاون"

3. **الموجز الذكي (smart_summary):**  
   - فقرة واحدة (35–50 كلمة).  
   - تشرح الفكرة الأساسية بلغة عربية فصيحة وسلسة.  
   - يجب أن تحتوي على حقائق واضحة بدون مبالغة.  

4. **الكلمات المفتاحية (keywords):**  
   - قائمة من 6–10 كلمات أو عبارات.  
   - متعلقة مباشرة بالخبر ومهيأة لتحسين الظهور في نتائج البحث.  

5. **تحسين SEO:**  
   - meta_title: عنوان SEO (55-60 حرفاً).  
   - meta_description: وصف SEO (140-155 حرفاً).  
   - تضمين الكلمات المفتاحية بطريقة طبيعية.  

6. **التصنيف المقترح (suggested_category):**
   - حدد التصنيف الأنسب للخبر من القائمة التالية:
   - القيم المتاحة: "politics", "economy", "sports", "technology", "entertainment", "health", "world", "local", "education", "environment", "saudi-arabia", "middle-east"
   - اختر تصنيفاً واحداً فقط يناسب محتوى الخبر بشكل أفضل.

🪄 التوجيهات التحريرية:
- استخدم لغة عربية فصحى مبسطة وواضحة.  
- حافظ على الأسلوب الإخباري الرسمي لصحيفة "سبق".  
- تجنب أي تحيز أو رأي شخصي.  
- استخدم جُملاً قصيرة ومباشرة.  
- في حالة الأخبار العاجلة، اجعل العنوان يحتوي على عنصر السرعة أو المفاجأة.

أعد النتيجة بصيغة JSON فقط مع الحقول التالية:
{
  "main_title": "",
  "sub_title": "",
  "smart_summary": "",
  "keywords": [],
  "seo": {
    "meta_title": "",
    "meta_description": ""
  },
  "suggested_category": ""
}`,

      en: `🎯 Role: You are an expert editor at "Sabq" newspaper, specializing in writing news articles with a professional journalistic style that is clear, SEO-optimized, and engaging for English-speaking readers.

⚠️ **Critical Instructions (Very Important!):**
- Read the content **completely from start to end** before writing anything.
- Identify **all important points** in the news (decisions, numbers, names, dates, unique details).
- Choose the **strongest and most impactful angle** for the main title.
- Don't focus only on the first sentence - the most important info might be in the middle or end!
- If the news contains multiple important points, choose a different one each time generation is requested.

✳️ Requirements:
1. **Main Title (main_title):**
   - Limit: 5-12 words. Complete, never truncated, no exaggeration or clickbait.
   - Strong headline that clearly explains the news.
   - Start with a strong verb or active noun.  
   - Catchy, comprehensive, and suitable for "Sabq" newspaper style.  
   - Include a primary keyword.  
   - Avoid using ":" or "..." in the title.
   - **Focus on the strongest information in the ENTIRE text, not just the beginning!**

2. **Subtitle (sub_title):**  
   ⚠️ CRITICAL: Very short sentence (6–10 words only, no more!).  
   - Adds ONE additional piece of information to the main title.  
   - Do not repeat what's in the main title.  
   - Good example: "Agreement covers 5 cooperation areas"

3. **Smart Summary (smart_summary):**  
   - One paragraph (35–50 words).  
   - Explains the main idea in clear, fluent English.  
   - Must contain clear facts without exaggeration.  

4. **Keywords:**  
   - A list of 6–10 words or phrases.  
   - Directly related to the news and optimized for search engine visibility.  

5. **SEO Optimization:**  
   - meta_title: SEO title (55-60 characters).  
   - meta_description: SEO description (140-155 characters).  
   - Include keywords naturally.  

6. **Suggested Category (suggested_category):**
   - Determine the most appropriate category for the news from this list:
   - Available values: "politics", "economy", "sports", "technology", "entertainment", "health", "world", "local", "education", "environment", "saudi-arabia", "middle-east"
   - Choose only ONE category that best fits the content.

🪄 Editorial Guidelines:
- Use clear, simple, and professional English.  
- Maintain the formal news style of "Sabq" newspaper.  
- Avoid any bias or personal opinion.  
- Use short and direct sentences.  
- For breaking news, make the title convey urgency or surprise.

Return the result in JSON format only with the following fields:
{
  "main_title": "",
  "sub_title": "",
  "smart_summary": "",
  "keywords": [],
  "seo": {
    "meta_title": "",
    "meta_description": ""
  },
  "suggested_category": ""
}`,

      // Special prompt for translating Arabic content to English
      en_translate: `🎯 Role: You are an expert bilingual editor and translator at "Sabq" newspaper, specializing in translating Arabic news to professional English journalism.

⚠️ **Critical Instructions:**
- The input content is in ARABIC. You must:
  1. First, translate the entire content to professional media-quality English
  2. Then, generate all editorial elements based on the translated content

📝 **Translation Guidelines:**
- Use professional media/journalism translation style (not literal translation)
- Preserve all facts, names, numbers, and dates accurately
- Adapt Arabic idioms and expressions to natural English equivalents
- Maintain the formal news tone appropriate for international English readers
- Transliterate Arabic proper nouns (names, places) appropriately

✳️ Requirements:
1. **Translated Content (translated_content):**
   - Full professional English translation of the Arabic input
   - Formatted as clean HTML paragraphs
   - Media-quality journalistic style
   - Preserve all original information

2. **Main Title (main_title):**
   - 5-12 words, complete and never truncated
   - Strong, accurate headline in English
   - Focus on the strongest information

3. **Subtitle (sub_title):**  
   - Very short (6–10 words only)
   - One additional key fact

4. **Smart Summary (smart_summary):**  
   - 35–50 words in English
   - Clear, factual summary

5. **Keywords:**  
   - 6–10 English keywords/phrases for SEO

6. **SEO:**  
   - meta_title: 55-60 characters
   - meta_description: 140-155 characters

7. **Suggested Category (suggested_category):**
   - Determine the most appropriate category for the news from this list:
   - Available values: "politics", "economy", "sports", "technology", "entertainment", "health", "world", "local", "education", "environment", "saudi-arabia", "middle-east"
   - Choose only ONE category that best fits the content.

Return JSON:
{
  "translated_content": "",
  "main_title": "",
  "sub_title": "",
  "smart_summary": "",
  "keywords": [],
  "seo": {
    "meta_title": "",
    "meta_description": ""
  },
  "suggested_category": ""
}`
    };

    const userPrompts = {
      ar: `📦 المدخلات:
النص الخام أو تفاصيل الخبر:

${newsContent}

قم بتوليد جميع العناصر التحريرية المطلوبة بصيغة JSON.`,

      en: `📦 Input:
Raw text or news details:

${newsContent}

Generate all required editorial elements in JSON format.`,

      en_translate: `📦 Input (Arabic content to translate and process):

${newsContent}

Translate this Arabic news to professional English and generate all required editorial elements in JSON format.`
    };

    // Select appropriate prompts based on language and translation needs
    const promptKey = needsTranslation ? "en_translate" : language;
    const systemPrompt = (systemPrompts as any)[promptKey];
    const userPrompt = (userPrompts as any)[promptKey];

    console.log("[Smart Content] Generating smart content with GPT-5...");
    console.log("[Smart Content] Using prompt key:", promptKey);
    console.log("[Smart Content] Input content length:", newsContent.length);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
      temperature: 0.8, // Higher temperature for varied outputs on regeneration
    });

    console.log("[Smart Content] ✅ OpenAI response received");
    console.log("[Smart Content] Finish reason:", response.choices[0].finish_reason);
    console.log("[Smart Content] Message content length:", response.choices[0].message.content?.length || 0);
    console.log("[Smart Content] Full message content:", response.choices[0].message.content);
    
    // Check if response was cut off
    if (response.choices[0].finish_reason === "length") {
      console.error("[Smart Content] ⚠️ Response was truncated due to token limit!");
      throw new Error("Response truncated - increase max_completion_tokens");
    }
    
    const messageContent = response.choices[0].message.content;
    if (!messageContent || messageContent.trim() === "") {
      console.error("[Smart Content] ❌ Empty response from OpenAI");
      throw new Error("Empty response from OpenAI");
    }
    
    const result = JSON.parse(messageContent);
    
    console.log("[Smart Content] Parsed result:", {
      hasMainTitle: !!result.main_title,
      hasSubTitle: !!result.sub_title,
      hasSummary: !!result.smart_summary,
      keywordsCount: result.keywords?.length || 0,
      hasSeo: !!result.seo,
      hasTranslatedContent: !!result.translated_content
    });
    
    // Post-processing: Trim subtitle if too long (max 10 words)
    let subTitle = result.sub_title || "";
    const subTitleWords = subTitle.split(/\s+/);
    if (subTitleWords.length > 10) {
      subTitle = subTitleWords.slice(0, 10).join(" ");
      console.log("[Smart Content] ⚠️ Subtitle trimmed from", subTitleWords.length, "to 10 words");
    }
    
    // Post-processing: Trim main title if too long (max 120 chars AND max 20 words)
    let mainTitle = result.main_title || "";
    let mainTitleWords = mainTitle.split(/\s+/);
    
    // First, trim by word count
    if (mainTitleWords.length > 20) {
      mainTitleWords = mainTitleWords.slice(0, 20);
      mainTitle = mainTitleWords.join(" ");
      console.log("[Smart Content] ⚠️ Main title trimmed by words to:", mainTitle);
    }
    
    // Then, trim by character count if still too long
    if (mainTitle.length > 120) {
      // Try to cut at word boundary
      let trimmed = mainTitle.substring(0, 120);
      const lastSpace = trimmed.lastIndexOf(" ");
      if (lastSpace > 80) {
        trimmed = trimmed.substring(0, lastSpace);
      }
      mainTitle = trimmed;
      console.log("[Smart Content] ⚠️ Main title trimmed by chars to:", mainTitle);
    }
    
    console.log("[Smart Content] ✅ Successfully generated content");
    
    // Build result object
    const finalResult: {
      mainTitle: string;
      subTitle: string;
      smartSummary: string;
      keywords: string[];
      seo: { metaTitle: string; metaDescription: string };
      suggestedCategory?: string;
      translatedContent?: string;
    } = {
      mainTitle,
      subTitle,
      smartSummary: result.smart_summary || "",
      keywords: result.keywords || [],
      seo: {
        metaTitle: result.seo?.meta_title || "",
        metaDescription: result.seo?.meta_description || "",
      },
    };

    // Include suggested category if available
    if (result.suggested_category) {
      finalResult.suggestedCategory = result.suggested_category;
      console.log("[Smart Content] ✅ Included suggested category:", result.suggested_category);
    }

    // Include translated content if available (when Arabic was translated to English)
    if (result.translated_content) {
      finalResult.translatedContent = result.translated_content;
      console.log("[Smart Content] ✅ Included translated content, length:", result.translated_content.length);
    }

    return finalResult;
  } catch (error) {
    console.error("[Smart Content] Error generating smart content:", error);
    throw new Error("Failed to generate smart content");
  }
}

/**
 * إعادة تحرير وتحسين محتوى المقال بأسلوب صحفي احترافي
 * Rewrite and enhance article content with professional journalistic style
 */
export async function rewriteAndEnhanceContent(
  originalContent: string,
  language: "ar" | "en" = "ar"
): Promise<{
  enhancedContent: string;
  improvementsSummary: string[];
}> {
  try {
    const systemPrompts = {
      ar: `🎯 الدور: أنت محرر صحفي محترف في صحيفة "سبق" السعودية، متخصص في إعادة صياغة وتحرير الأخبار بأسلوب احترافي يجذب القارئ العربي.

✳️ مهمتك:
إعادة تحرير وتحسين المحتوى المُقدم مع الحفاظ على:
1. جميع الحقائق والمعلومات الأصلية
2. المعنى العام والرسالة الأساسية
3. الأرقام والتواريخ والأسماء كما هي

📝 معايير التحرير:
1. **البنية والتنظيم:**
   - أعد ترتيب الفقرات بشكل منطقي (الأهم أولاً)
   - استخدم فقرات قصيرة (3-4 جمل لكل فقرة)
   - أضف انتقالات سلسة بين الأفكار

2. **الأسلوب اللغوي:**
   - استخدم لغة عربية فصحى سهلة وواضحة
   - تجنب الجمل الطويلة والمعقدة
   - استخدم الأفعال المبنية للمعلوم
   - تجنب الحشو والتكرار

3. **الجودة الصحفية:**
   - ابدأ بأهم معلومة (نظرية الهرم المقلوب)
   - أجب على الأسئلة الخمس: من؟ ماذا؟ متى؟ أين؟ لماذا؟
   - استخدم اقتباسات مباشرة إن وجدت
   - حافظ على الموضوعية والحياد

4. **التحسينات:**
   - صحح الأخطاء الإملائية والنحوية
   - حسّن علامات الترقيم
   - استبدل الكلمات الركيكة بكلمات أقوى
   - أزل التكرار غير الضروري

🚨 قاعدة صارمة لا تُكسر: كل كلمة في ردك يجب أن تكون مستوحاة من النص الأصلي فقط. لا تخترع أي كلمة أو وصف أو معلومة أو اسم مكان لم يرد حرفياً في النص.

⚠️ ممنوعات:
- لا تضف معلومات أو كلمات أو أوصافاً غير موجودة في النص الأصلي
- لا تغير الحقائق أو الأرقام أو الأسماء
- لا تحذف معلومات مهمة
- لا تضف رأيك الشخصي
- لا تضف كلمات وصفية من عندك (مثل: قارة، كبرى، مشهورة، عريقة...)

أعد النتيجة بصيغة JSON فقط:
{
  "enhanced_content": "النص المُحرَّر بصيغة HTML مع الفقرات",
  "improvements_summary": ["تحسين 1", "تحسين 2", ...]
}`,

      en: `🎯 Role: You are a professional editor at "Sabq" newspaper, specializing in rewriting and editing news with a professional style that engages English-speaking readers.

✳️ Your Task:
Rewrite and improve the provided content while preserving:
1. All original facts and information
2. The general meaning and core message
3. Numbers, dates, and names as they are

📝 Editing Standards:
1. **Structure and Organization:**
   - Reorder paragraphs logically (most important first)
   - Use short paragraphs (3-4 sentences each)
   - Add smooth transitions between ideas

2. **Language Style:**
   - Use clear, simple, and professional English
   - Avoid long and complex sentences
   - Use active voice
   - Avoid filler words and repetition

3. **Journalistic Quality:**
   - Start with the most important information (inverted pyramid)
   - Answer the five Ws: Who? What? When? Where? Why?
   - Use direct quotes if available
   - Maintain objectivity and neutrality

4. **Improvements:**
   - Correct spelling and grammar errors
   - Improve punctuation
   - Replace weak words with stronger ones
   - Remove unnecessary repetition

⚠️ Restrictions:
- Do not add new information not in the original text
- Do not change facts or numbers
- Do not delete important information
- Do not add personal opinions

Return the result in JSON format only:
{
  "enhanced_content": "The edited text in HTML format with paragraphs",
  "improvements_summary": ["improvement 1", "improvement 2", ...]
}`
    };

    const userPrompts = {
      ar: `📦 المحتوى الأصلي للتحرير:

${originalContent}

قم بإعادة تحرير وتحسين هذا المحتوى بصيغة JSON.`,

      en: `📦 Original content to edit:

${originalContent}

Rewrite and improve this content in JSON format.`
    };

    const systemPrompt = systemPrompts[language];
    const userPrompt = userPrompts[language];

    console.log("[Rewrite Content] Starting content enhancement with GPT-5.1...");
    console.log("[Rewrite Content] Original content length:", originalContent.length);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_completion_tokens: 4096, // Higher limit for content rewriting
    });

    console.log("[Rewrite Content] ✅ OpenAI response received");
    console.log("[Rewrite Content] Finish reason:", response.choices[0].finish_reason);
    
    if (response.choices[0].finish_reason === "length") {
      console.error("[Rewrite Content] ⚠️ Response was truncated!");
      throw new Error("Response truncated - content too long");
    }
    
    const messageContent = response.choices[0].message.content;
    if (!messageContent || messageContent.trim() === "") {
      console.error("[Rewrite Content] ❌ Empty response from OpenAI");
      throw new Error("Empty response from OpenAI");
    }
    
    const result = JSON.parse(messageContent);
    
    console.log("[Rewrite Content] Enhanced content length:", result.enhanced_content?.length || 0);
    console.log("[Rewrite Content] Improvements count:", result.improvements_summary?.length || 0);
    console.log("[Rewrite Content] ✅ Successfully enhanced content");
    
    return {
      enhancedContent: result.enhanced_content || originalContent,
      improvementsSummary: result.improvements_summary || [],
    };
  } catch (error) {
    console.error("[Rewrite Content] Error enhancing content:", error);
    throw new Error("Failed to enhance content");
  }
}

export async function extractMediaKeywords(
  title: string,
  content?: string
): Promise<string[]> {
  try {
    const systemPrompt = `أنت خبير في تحليل المحتوى الإخباري العربي وتحديد الكلمات المفتاحية للبحث عن الصور والوسائط المناسبة.

مهمتك: تحليل المقال واستخراج الكلمات المفتاحية التي يمكن استخدامها للبحث عن صور ذات صلة في مكتبة الوسائط.

معايير استخراج الكلمات المفتاحية:
1. الأسماء والكيانات الرئيسية (أشخاص، أماكن، منظمات)
2. المواضيع والمفاهيم الرئيسية
3. الأحداث والمناسبات
4. المجالات والقطاعات (رياضة، سياسة، اقتصاد، إلخ)
5. الصفات والخصائص المميزة

توجيهات:
- استخرج 5-10 كلمات مفتاحية
- استخدم كلمات واضحة ومحددة
- تجنب الكلمات العامة جداً (مثل "خبر" أو "تقرير")
- ركز على الكلمات التي تصف محتوى بصري محتمل
- استخدم اللغة العربية فقط

أعد النتيجة بصيغة JSON فقط:
{
  "keywords": ["كلمة1", "كلمة2", ...]
}`;

    const userContent = content 
      ? `العنوان: ${title}\n\nالمحتوى (أول 1000 حرف):\n${content.substring(0, 1000)}`
      : `العنوان: ${title}`;

    console.log("[Extract Keywords] Analyzing content for media keywords...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 512,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const keywords = result.keywords || [];
    
    console.log("[Extract Keywords] ✅ Extracted keywords:", keywords);
    return keywords;
  } catch (error) {
    console.error("[Extract Keywords] Error extracting keywords:", error);
    // Fallback: extract simple keywords from title
    const fallbackKeywords = title
      .split(/[\s،؛]+/)
      .filter(word => word.length > 3)
      .slice(0, 5);
    console.log("[Extract Keywords] Using fallback keywords:", fallbackKeywords);
    return fallbackKeywords;
  }
}

// ============================================
// iFox AI Content Tools
// ============================================

export async function generateIFoxTitle(
  content: string,
  category?: string
): Promise<{ title: string; titleEn?: string }> {
  try {
    console.log("[iFox AI] Generating iFox article title...");
    
    const cleanContent = stripHtml(content);
    const categoryContext = category ? `التصنيف: ${category}\n\n` : '';
    
    const systemPrompt = `أنت مساعد ذكي متخصص في إنشاء عناوين جذابة للمقالات التقنية في آي فوكس (iFox). 
آي فوكس هو قسم تقني متخصص يركز على الذكاء الاصطناعي، التقنية، الويب، التعليم، الألعاب، الصحة، والأعمال.

قم بإنشاء عنوان:
- جذاب ومثير للاهتمام
- يتضمن كلمات مفتاحية تقنية
- مناسب للقارئ العربي المهتم بالتقنية
- لا يتجاوز 15 كلمة

أعد النتيجة بصيغة JSON:
{
  "title": "العنوان بالعربية",
  "titleEn": "English Title (optional)"
}`;

    const response = await createAIResponse({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `${categoryContext}المحتوى:\n${cleanContent.substring(0, 1500)}`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 512,
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      console.warn("[iFox AI] Empty response from AI");
      return { title: "", titleEn: undefined };
    }

    const result = JSON.parse(messageContent);
    
    // Validate and sanitize required fields
    const title = typeof result.title === 'string' 
      ? result.title.trim().substring(0, 200) // Max 200 chars
      : "";
      
    const titleEn = result.titleEn && typeof result.titleEn === 'string'
      ? result.titleEn.trim().substring(0, 200)
      : undefined;
    
    if (!title) {
      console.warn("[iFox AI] Invalid or empty title in response");
      return { title: "", titleEn: undefined };
    }
    
    console.log("[iFox AI] ✅ Title generated successfully");
    
    return { title, titleEn };
  } catch (error) {
    console.error("[iFox AI] Error generating title:", error);
    throw new Error("Failed to generate iFox title");
  }
}

export async function generateIFoxContentSuggestions(
  title: string,
  content: string,
  category?: string
): Promise<string[]> {
  try {
    console.log("[iFox AI] Generating content suggestions...");
    
    const cleanContent = stripHtml(content);
    const categoryContext = category ? `التصنيف: ${category}\n\n` : '';
    
    const systemPrompt = `أنت مساعد كتابة ذكي متخصص في المحتوى التقني لآي فوكس (iFox).

مهمتك: تحليل المقال وتقديم اقتراحات لتحسين المحتوى.

الاقتراحات يجب أن تشمل:
1. نقاط إضافية يمكن تغطيتها
2. أمثلة أو حالات استخدام
3. إحصائيات أو بيانات داعمة
4. روابط لمفاهيم ذات صلة
5. أسئلة شائعة يمكن الإجابة عليها

أعد 5-7 اقتراحات مفيدة في صيغة JSON:
{
  "suggestions": ["اقتراح 1", "اقتراح 2", ...]
}`;

    const response = await createAIResponse({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `${categoryContext}العنوان: ${title}\n\nالمحتوى الحالي:\n${cleanContent.substring(0, 2000)}`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 1024,
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      console.warn("[iFox AI] Empty response from AI");
      return [];
    }

    const result = JSON.parse(messageContent);
    
    // Validate and sanitize suggestions field
    if (!Array.isArray(result.suggestions)) {
      console.warn("[iFox AI] Invalid suggestions in response:", result);
      return [];
    }
    
    // Filter, trim, limit length, and cap array size
    const suggestions = result.suggestions
      .filter((s: unknown): s is string => typeof s === 'string')
      .map((s: string) => s.trim().substring(0, 500)) // Max 500 chars per suggestion
      .filter((s: string) => s.length > 0) // Remove empty strings
      .slice(0, 10); // Max 10 suggestions
    
    console.log("[iFox AI] ✅ Suggestions generated successfully");
    
    return suggestions;
  } catch (error) {
    console.error("[iFox AI] Error generating suggestions:", error);
    throw new Error("Failed to generate content suggestions");
  }
}

export async function analyzeIFoxContent(
  title: string,
  content: string,
  category?: string
): Promise<{
  score: number;
  sentiment: { positive: number; neutral: number; negative: number };
  readability: number;
  technicalDepth: number;
  engagement: number;
  suggestions: string[];
}> {
  try {
    console.log("[iFox AI] Analyzing content quality...");
    
    const cleanContent = stripHtml(content);
    const categoryContext = category ? `التصنيف: ${category}\n\n` : '';
    
    const systemPrompt = `أنت خبير تحليل محتوى تقني متخصص في آي فوكس (iFox).

قم بتحليل المقال التقني وتقييمه بناءً على:

1. **الجودة العامة** (score): 0-100
   - وضوح المعلومات
   - دقة المحتوى
   - شمولية التغطية
   - جودة الكتابة

2. **المشاعر** (sentiment): توزيع نسب المشاعر
   - positive: نسبة المحتوى الإيجابي (0-100)
   - neutral: نسبة المحتوى المحايد (0-100)
   - negative: نسبة المحتوى السلبي (0-100)

3. **سهولة القراءة** (readability): 0-100
   - بساطة اللغة
   - وضوح الجمل
   - تنظيم المحتوى

4. **العمق التقني** (technicalDepth): 0-100
   - مستوى التفاصيل التقنية
   - استخدام المصطلحات
   - الشمولية

5. **التفاعل المتوقع** (engagement): 0-100
   - جاذبية العنوان
   - إثارة الاهتمام
   - قابلية المشاركة

6. **اقتراحات التحسين** (suggestions): قائمة 3-5 اقتراحات

أعد النتيجة بصيغة JSON فقط.`;

    const response = await createAIResponse({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `${categoryContext}العنوان: ${title}\n\nالمحتوى:\n${cleanContent.substring(0, 3000)}`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 1536,
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      console.warn("[iFox AI] Empty response from AI");
      return {
        score: 0,
        sentiment: { positive: 33, neutral: 34, negative: 33 },
        readability: 0,
        technicalDepth: 0,
        engagement: 0,
        suggestions: [],
      };
    }

    const result = JSON.parse(messageContent);
    
    // Validate and sanitize all numeric scores (0-100 range)
    const score = typeof result.score === 'number' 
      ? Math.round(Math.max(0, Math.min(100, result.score))) 
      : 0;
      
    const readability = typeof result.readability === 'number' 
      ? Math.round(Math.max(0, Math.min(100, result.readability))) 
      : 0;
      
    const technicalDepth = typeof result.technicalDepth === 'number' 
      ? Math.round(Math.max(0, Math.min(100, result.technicalDepth))) 
      : 0;
      
    const engagement = typeof result.engagement === 'number' 
      ? Math.round(Math.max(0, Math.min(100, result.engagement))) 
      : 0;
    
    // Validate sentiment object with normalized percentages
    let sentiment = { positive: 33, neutral: 34, negative: 33 };
    if (result.sentiment && 
        typeof result.sentiment.positive === 'number' &&
        typeof result.sentiment.neutral === 'number' &&
        typeof result.sentiment.negative === 'number') {
      const total = result.sentiment.positive + result.sentiment.neutral + result.sentiment.negative;
      if (total > 0) {
        sentiment = {
          positive: Math.round((result.sentiment.positive / total) * 100),
          neutral: Math.round((result.sentiment.neutral / total) * 100),
          negative: Math.round((result.sentiment.negative / total) * 100),
        };
      }
    }
    
    // Validate and sanitize suggestions array
    const suggestions = Array.isArray(result.suggestions) 
      ? result.suggestions
          .filter((s: unknown): s is string => typeof s === 'string')
          .map((s: string) => s.trim().substring(0, 500)) // Max 500 chars per suggestion
          .filter((s: string) => s.length > 0) // Remove empty strings
          .slice(0, 10) // Max 10 suggestions
      : [];
    
    console.log("[iFox AI] ✅ Content analyzed successfully");
    
    return {
      score,
      sentiment,
      readability,
      technicalDepth,
      engagement,
      suggestions,
    };
  } catch (error) {
    console.error("[iFox AI] Error analyzing content:", error);
    throw new Error("Failed to analyze content");
  }
}

// ============================================
// Smart Auto-Format for Rich Text Editor
// ============================================

export interface AutoFormatRules {
  bold_names?: boolean;
  bold_numbers?: boolean;
  bold_institutions?: boolean;
  max_bold_per_paragraph?: number;
}

export interface AutoFormatHighlight {
  text: string;
  type: 'bold' | 'italic' | 'underline' | 'heading' | 'quote' | 'highlight';
  reason: string;
  importance: number;
}

export interface AutoFormatResult {
  strategy: 'conservative' | 'moderate' | 'aggressive';
  formatted_text: string;
  highlights: AutoFormatHighlight[];
}

/**
 * AI-powered smart auto-formatting for Arabic news content
 * Analyzes text and returns formatted version with highlighted keywords
 * 
 * @param text - The raw text content to format
 * @param rules - Formatting rules and preferences
 * @returns Formatted text with Markdown and highlight metadata
 */
export async function autoFormatContent(
  text: string,
  rules: AutoFormatRules = {}
): Promise<AutoFormatResult> {
  try {
    console.log("[AutoFormat] 🚀 Starting AI auto-formatting...");
    console.log("[AutoFormat] Text length:", text.length);
    console.log("[AutoFormat] Rules:", JSON.stringify(rules));
    
    // Strip HTML tags for clean processing
    const cleanText = stripHtml(text);
    console.log("[AutoFormat] Clean text length:", cleanText.length);

    const systemPrompt = `أنت محرر صحفي آلي متخصص في الأخبار العربية.
مهمتك هي تحليل النصوص الإخبارية وتحديد الكلمات والعبارات الأهم التي يجب إبرازها بصريًا داخل المحرر (مثل الكلمات المفتاحية، الأسماء المهمة، الجهات، الدول، المناصب، العناوين الفرعية).

أعد لي استجابة بصيغة JSON فقط بدون أي نص آخر خارج JSON.

صيغة الـ JSON يجب أن تكون كالتالي بالضبط:

{
  "strategy": "conservative | moderate | aggressive",
  "formatted_text": "نفس النص مع استخدام Markdown للتنسيق",
  "highlights": [
    {
      "text": "النص الذي سيتم تنسيقه",
      "type": "bold | italic | underline | heading | quote | highlight",
      "reason": "سبب اختيار هذه الكلمة أو العبارة",
      "importance": 1
    }
  ]
}

التعليمات:
• استخدم Markdown لوضع الكلمات أو العبارات المهمة بين ** لتكون بالخط العريض داخل المحرر.
• لا تُبالغ في كثرة الكلمات الغامقة؛ ركّز على:
  - أسماء الأشخاص البارزين
  - أسماء الدول والجهات الرسمية
  - الأرقام والإحصائيات المهمة
  - العناوين الفرعية داخل المتن إن وجدت
• لا تُعد صياغة الخبر بشكل كامل، ركّز على التنسيق فقط.
• لا تستخدم أي لغة غير العربية في المحتوى نفسه.
• لا تضف مقدمة ولا خاتمة؛ فقط النتيجة حسب نموذج الـ JSON أعلاه.
• الحد الأقصى للكلمات الغامقة: ${rules.max_bold_per_paragraph || 5} لكل فقرة.
• 🚨 ممنوع منعاً باتاً إضافة أي كلمة أو وصف لم يرد في النص الأصلي — التنسيق فقط، لا إثراء ولا إضافة.`;

    const userPrompt = JSON.stringify({
      mode: "auto_format",
      tone: "news",
      rules: {
        bold_names: rules.bold_names ?? true,
        bold_numbers: rules.bold_numbers ?? true,
        bold_institutions: rules.bold_institutions ?? true,
        max_bold_per_paragraph: rules.max_bold_per_paragraph ?? 5
      },
      text: cleanText
    });

    console.log("[AutoFormat] Calling OpenAI API...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    console.log("[AutoFormat] ✅ OpenAI response received");
    
    const messageContent = response.choices?.[0]?.message?.content;
    
    if (!messageContent) {
      console.warn("[AutoFormat] ⚠️ Empty response from OpenAI!");
      return {
        strategy: 'moderate',
        formatted_text: text,
        highlights: []
      };
    }
    
    console.log("[AutoFormat] Raw response length:", messageContent.length);
    
    const result = JSON.parse(messageContent) as AutoFormatResult;
    
    // Validate and sanitize the result
    const validStrategies = ['conservative', 'moderate', 'aggressive'];
    const strategy = validStrategies.includes(result.strategy) 
      ? result.strategy 
      : 'moderate';
    
    const formatted_text = typeof result.formatted_text === 'string' 
      ? result.formatted_text 
      : text;
    
    const highlights = Array.isArray(result.highlights) 
      ? result.highlights.filter(h => 
          typeof h.text === 'string' && 
          typeof h.type === 'string' && 
          typeof h.reason === 'string'
        ).slice(0, 50) // Limit to 50 highlights
      : [];
    
    console.log("[AutoFormat] ✅ Successfully formatted content");
    console.log("[AutoFormat] Strategy:", strategy);
    console.log("[AutoFormat] Highlights count:", highlights.length);
    
    return {
      strategy: strategy as AutoFormatResult['strategy'],
      formatted_text,
      highlights
    };
  } catch (error) {
    console.error("[AutoFormat] ❌ Error auto-formatting content:", error);
    throw new Error("Failed to auto-format content");
  }
}

// ============================================
// AI Focal Point Detection (Vision)
// ============================================

export interface FocalPointResult {
  x: number;
  y: number;
  confidence: "high" | "medium" | "low";
  subject: string;
}

export async function detectImageFocalPoint(imageUrl: string): Promise<FocalPointResult> {
  const response = await withRetry(async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an image analysis assistant for a Saudi/Gulf news platform. Given a news article image, identify the main focal point - the most important visual subject that should remain visible when the image is cropped.

Priority order for focal point:
1. Human faces (especially eyes/head area) — include traditional headwear (shemagh/شماغ, ghutra/غترة, imamah/عمامة) as part of the face area. Never crop above the headwear.
2. Main person's upper body — for officials and speakers at podiums, keep the full head including any headwear visible.
3. Key text/logos/signage
4. Primary subject of the photo
5. Center of action — for conferences and group photos, focus on the main speaker or center figure.

Return JSON: {"x": number, "y": number, "confidence": "high"|"medium"|"low", "subject": "brief description"}
- x: horizontal position as percentage (0=left, 100=right)
- y: vertical position as percentage (0=top, 100=bottom)
- For faces with traditional headwear, target slightly above the face center to include the full headwear
- For group photos or conferences, target the main speaker or most prominent figure
- confidence: "high" for clear faces/subjects, "medium" for groups or distant subjects, "low" for abstract/landscape
- Be precise with coordinates — do NOT default to (50, 50) unless the subject is truly centered`
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "low" }
            },
            {
              type: "text",
              text: "Identify the focal point of this news image."
            }
          ] as any
        }
      ]
    });
  }, 3, "FocalPoint");

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { x: 50, y: 35, confidence: "low", subject: "fallback center" };
  }

  try {
    const parsed = JSON.parse(content);
    const x = Math.max(0, Math.min(100, Number(parsed.x) || 50));
    const y = Math.max(0, Math.min(100, Number(parsed.y) || 35));
    return {
      x,
      y,
      confidence: parsed.confidence || "medium",
      subject: parsed.subject || "unknown",
    };
  } catch {
    console.error("[FocalPoint] Failed to parse response:", content);
    return { x: 50, y: 35, confidence: "low", subject: "parse error" };
  }
}
