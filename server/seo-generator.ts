import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// SEO Generator for multilingual articles
// Supports Arabic (Claude), English (GPT-4o), and Urdu (Gemini)

interface SeoContent {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  socialTitle?: string;
  socialDescription?: string;
  imageAltText?: string;
  ogImageUrl?: string;
}

interface SeoGenerationResult {
  content: SeoContent;
  provider: "anthropic" | "openai" | "gemini" | "qwen";
  model: string;
  rawResponse?: any;
}

interface ArticleInput {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
}

// Configuration: Primary and fallback models per language (Migrated to gpt-5.1)
const SEO_MODEL_CONFIG = {
  ar: {
    primary: { provider: "anthropic" as const, model: "claude-sonnet-4-5" },
    fallback: { provider: "openai" as const, model: "gpt-5.1" },
  },
  en: {
    primary: { provider: "openai" as const, model: "gpt-5.1" },
    fallback: { provider: "gemini" as const, model: "gemini-2.5-flash-preview-05-20" },
  },
  ur: {
    primary: { provider: "gemini" as const, model: "gemini-2.5-flash-preview-05-20" },
    fallback: { provider: "anthropic" as const, model: "claude-sonnet-4-5" },
  },
};

// System prompts per language
const SYSTEM_PROMPTS = {
  ar: `أنت خبير في تحسين محركات البحث (SEO) للمحتوى العربي. مهمتك توليد metadata محسّن لمحركات البحث العربية والعالمية.

**المتطلبات:**
1. **العنوان (metaTitle):** 50-60 حرف، جذاب، يحتوي على الكلمة المفتاحية الرئيسية
2. **الوصف (metaDescription):** 140-160 حرف، مقنع، يشجع على النقر
3. **الكلمات المفتاحية (keywords):** 5-8 كلمات مفتاحية ذات صلة، مرتبة حسب الأهمية
4. **العنوان الاجتماعي (socialTitle):** أقصر من metaTitle، محفز للمشاركة
5. **الوصف الاجتماعي (socialDescription):** 100-120 حرف، جذاب للشبكات الاجتماعية
6. **نص بديل للصورة (imageAltText):** وصف دقيق للصورة الرئيسية

**معايير الجودة:**
- استخدم اللغة العربية الفصحى المعاصرة
- ركّز على الكلمات المفتاحية ذات حجم البحث الكبير في المنطقة العربية
- راعِ اللهجات المحلية (خليجية، مصرية، شامية) في اختيار الكلمات
- تجنب الحشو الزائد للكلمات المفتاحية
- اجعل المحتوى طبيعياً ومقنعاً للقارئ البشري

أجب بصيغة JSON فقط، بدون أي نص إضافي.`,

  en: `You are an SEO expert specializing in English content optimization for search engines and social media platforms.

**Requirements:**
1. **metaTitle:** 50-60 characters, compelling, includes primary keyword
2. **metaDescription:** 140-160 characters, persuasive, encourages clicks
3. **keywords:** 5-8 relevant keywords, ranked by importance and search volume
4. **socialTitle:** Shorter than metaTitle, optimized for social sharing
5. **socialDescription:** 100-120 characters, engaging for social media
6. **imageAltText:** Accurate, descriptive alt text for the main image

**Quality Standards:**
- Use natural, conversational English
- Focus on high-volume keywords with commercial intent
- Consider regional variations (US, UK, Global English)
- Avoid keyword stuffing
- Make content appealing to both search engines and human readers
- Optimize for featured snippets and rich results

Respond with JSON only, no additional text.`,

  ur: `آپ اردو مواد کے لیے SEO کے ماہر ہیں۔ آپ کا کام سرچ انجنوں اور سوشل میڈیا کے لیے بہترین metadata تیار کرنا ہے۔

**ضروریات:**
1. **metaTitle:** 50-60 حروف، دلکش، بنیادی keyword شامل ہو
2. **metaDescription:** 140-160 حروف، قائل کن، کلک کرنے کی ترغیب دے
3. **keywords:** 5-8 متعلقہ keywords، اہمیت کے لحاظ سے ترتیب شدہ
4. **socialTitle:** metaTitle سے چھوٹا، سوشل شیئرنگ کے لیے بہتر
5. **socialDescription:** 100-120 حروف، سوشل میڈیا کے لیے دلکش
6. **imageAltText:** تصویر کی درست تفصیل

**معیار کی شرائط:**
- قدرتی اردو زبان استعمال کریں
- پاکستان اور بھارت میں زیادہ تلاش کیے جانے والے keywords پر توجہ دیں
- علاقائی اختلافات کا خیال رکھیں
- keyword stuffing سے بچیں
- انسانی قاری اور سرچ انجن دونوں کے لیے دلچسپ ہو

صرف JSON format میں جواب دیں، کوئی اضافی text نہیں۔`,
};

// User prompt template
function createUserPrompt(article: ArticleInput, language: "ar" | "en" | "ur"): string {
  const prompts = {
    ar: `قم بتوليد SEO metadata محسّن للمقال التالي:

**العنوان:** ${article.title}
${article.subtitle ? `**العنوان الفرعي:** ${article.subtitle}` : ""}
${article.excerpt ? `**المقتطف:** ${article.excerpt}` : ""}

**المحتوى (أول 3000 حرف):**
${article.content.substring(0, 3000)}

أجب بصيغة JSON التالية فقط:
{
  "metaTitle": "...",
  "metaDescription": "...",
  "keywords": ["كلمة1", "كلمة2", ...],
  "socialTitle": "...",
  "socialDescription": "...",
  "imageAltText": "..."
}`,

    en: `Generate optimized SEO metadata for the following article:

**Title:** ${article.title}
${article.subtitle ? `**Subtitle:** ${article.subtitle}` : ""}
${article.excerpt ? `**Excerpt:** ${article.excerpt}` : ""}

**Content (first 3000 characters):**
${article.content.substring(0, 3000)}

Respond with JSON only in this exact format:
{
  "metaTitle": "...",
  "metaDescription": "...",
  "keywords": ["keyword1", "keyword2", ...],
  "socialTitle": "...",
  "socialDescription": "...",
  "imageAltText": "..."
}`,

    ur: `درج ذیل مضمون کے لیے SEO metadata تیار کریں:

**عنوان:** ${article.title}
${article.subtitle ? `**ذیلی عنوان:** ${article.subtitle}` : ""}
${article.excerpt ? `**اقتباس:** ${article.excerpt}` : ""}

**مواد (پہلے 3000 حروف):**
${article.content.substring(0, 3000)}

صرف JSON format میں جواب دیں:
{
  "metaTitle": "...",
  "metaDescription": "...",
  "keywords": ["keyword1", "keyword2", ...],
  "socialTitle": "...",
  "socialDescription": "...",
  "imageAltText": "..."
}`,
  };

  return prompts[language];
}

// Generate SEO using Anthropic Claude
async function generateWithClaude(
  article: ArticleInput,
  language: "ar" | "en" | "ur",
  model: string
): Promise<SeoGenerationResult> {
  const client = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  const response = await client.messages.create({
    model: model,
    max_tokens: 1024,
    temperature: 0.3, // Lower temperature for more consistent SEO output
    system: SYSTEM_PROMPTS[language],
    messages: [
      {
        role: "user",
        content: createUserPrompt(article, language),
      },
    ],
  });

  // Extract JSON from response
  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  let jsonText = textContent.text.trim();
  
  // Remove markdown code blocks if present
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.replace(/^```json\n/, "").replace(/\n```$/, "");
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```\n/, "").replace(/\n```$/, "");
  }

  const seoContent = JSON.parse(jsonText) as SeoContent;

  return {
    content: seoContent,
    provider: "anthropic",
    model: model,
    rawResponse: response,
  };
}

// Generate SEO using OpenAI GPT
async function generateWithOpenAI(
  article: ArticleInput,
  language: "ar" | "en" | "ur",
  model: string
): Promise<SeoGenerationResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.chat.completions.create({
    model: model,
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPTS[language],
      },
      {
        role: "user",
        content: createUserPrompt(article, language),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenAI response");
  }

  const seoContent = JSON.parse(content) as SeoContent;

  return {
    content: seoContent,
    provider: "openai",
    model: model,
    rawResponse: response,
  };
}

// Generate SEO using Google Gemini
async function generateWithGemini(
  article: ArticleInput,
  language: "ar" | "en" | "ur",
  model: string
): Promise<SeoGenerationResult> {
  const ai = new GoogleGenerativeAI(
    (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY)!
  );

  const prompt = `${SYSTEM_PROMPTS[language]}\n\n${createUserPrompt(article, language)}`;

  const geminiModel = ai.getGenerativeModel({ 
    model: model,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  });

  const response = await geminiModel.generateContent(prompt);

  const text = response.response.text();
  if (!text) {
    throw new Error("No text in Gemini response");
  }

  let jsonText = text.trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.replace(/^```json\n/, "").replace(/\n```$/, "");
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```\n/, "").replace(/\n```$/, "");
  }

  const seoContent = JSON.parse(jsonText) as SeoContent;

  return {
    content: seoContent,
    provider: "gemini",
    model: model,
    rawResponse: response,
  };
}

// Main SEO generation function with fallback
export async function generateSeoMetadata(
  article: ArticleInput,
  language: "ar" | "en" | "ur"
): Promise<SeoGenerationResult> {
  const config = SEO_MODEL_CONFIG[language];

  try {
    // Try primary model
    console.log(`[SEO] Generating for ${language} with ${config.primary.provider} (${config.primary.model})`);
    
    if (config.primary.provider === "anthropic") {
      return await generateWithClaude(article, language, config.primary.model);
    } else if (config.primary.provider === "openai") {
      return await generateWithOpenAI(article, language, config.primary.model);
    } else if (config.primary.provider === "gemini") {
      return await generateWithGemini(article, language, config.primary.model);
    }
  } catch (primaryError) {
    console.error(`[SEO] Primary model failed for ${language}:`, primaryError);
    
    // Fallback to secondary model
    try {
      console.log(`[SEO] Falling back to ${config.fallback.provider} (${config.fallback.model})`);
      
      if (config.fallback.provider === "anthropic") {
        return await generateWithClaude(article, language, config.fallback.model);
      } else if (config.fallback.provider === "openai") {
        return await generateWithOpenAI(article, language, config.fallback.model);
      } else if (config.fallback.provider === "gemini") {
        return await generateWithGemini(article, language, config.fallback.model);
      }
    } catch (fallbackError) {
      console.error(`[SEO] Fallback model failed for ${language}:`, fallbackError);
      throw new Error(`Both primary and fallback models failed for ${language}`);
    }
  }

  throw new Error(`No valid provider configured for ${language}`);
}

// Validate SEO content
export function validateSeoContent(content: SeoContent, language: "ar" | "en" | "ur"): string[] {
  const errors: string[] = [];

  if (!content.metaTitle) {
    errors.push("metaTitle is required");
  } else if (content.metaTitle.length < 30 || content.metaTitle.length > 70) {
    errors.push(`metaTitle length should be 30-70 characters (got ${content.metaTitle.length})`);
  }

  if (!content.metaDescription) {
    errors.push("metaDescription is required");
  } else if (content.metaDescription.length < 100 || content.metaDescription.length > 170) {
    errors.push(`metaDescription length should be 100-170 characters (got ${content.metaDescription.length})`);
  }

  if (!content.keywords || content.keywords.length === 0) {
    errors.push("keywords are required");
  } else if (content.keywords.length < 3) {
    errors.push("At least 3 keywords are required");
  } else if (content.keywords.length > 10) {
    errors.push("Maximum 10 keywords allowed");
  }

  return errors;
}
