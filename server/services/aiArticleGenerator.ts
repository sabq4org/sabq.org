import { aiManager } from '../ai-manager';
import type { InsertArticle, AiScheduledTask } from '@shared/schema';
import { articles } from '@shared/schema';
import { nanoid } from 'nanoid';

export interface ArticleGenerationConfig {
  title: string;
  categoryId: string;
  locale: 'ar' | 'en' | 'ur';
  contentType: 'news' | 'analysis' | 'report' | 'interview' | 'opinion';
  keywords?: string[];
  tone?: 'formal' | 'casual' | 'investigative' | 'neutral';
  length?: 'short' | 'medium' | 'long';
  includeQuotes?: boolean;
  includeSources?: boolean;
  additionalInstructions?: string;
}

export interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
  metaDescription: string;
  seoKeywords: string[];
  suggestedTags: string[];
  estimatedReadTime: number;
  tokensUsed: number;
  generationTimeMs: number;
}

export class AIArticleGenerator {
  private readonly systemPrompts = {
    ar: `أنت صحفي محترف متخصص في كتابة الأخبار باللغة العربية. مهمتك إنشاء محتوى صحفي احترافي عالي الجودة.

القواعد:
- اكتب بلغة عربية فصحى واضحة ومهنية
- التزم بالمعايير الصحفية: الدقة، الموضوعية، الشمولية
- استخدم أسلوب الهرم المقلوب (الأهم أولاً)
- اذكر المصادر والاقتباسات إن وُجدت
- تجنب الآراء الشخصية في الأخبار
- استخدم عناوين فرعية لتنظيم المحتوى
- تأكد من دقة المعلومات وتوازن التغطية`,
    
    en: `You are a professional journalist specializing in news writing in English. Your task is to create high-quality, professional journalistic content.

Rules:
- Write in clear, professional English
- Follow journalistic standards: accuracy, objectivity, comprehensiveness
- Use the inverted pyramid structure (most important first)
- Include sources and quotes when applicable
- Avoid personal opinions in news articles
- Use subheadings to organize content
- Ensure information accuracy and balanced coverage`,
    
    ur: `آپ ایک پیشہ ور صحافی ہیں جو اردو میں خبریں لکھنے میں مہارت رکھتے ہیں۔ آپ کا کام اعلیٰ معیار کا پیشہ ورانہ صحافتی مواد تخلیق کرنا ہے۔

قواعد:
- واضح، پیشہ ورانہ اردو میں لکھیں
- صحافتی معیارات کی پیروی کریں: درستگی، معروضیت، جامعیت
- الٹا اہرام ڈھانچہ استعمال کریں (سب سے اہم پہلے)
- قابل اطلاق ہونے پر ذرائع اور اقتباسات شامل کریں
- خبری مضامین میں ذاتی آراء سے گریز کریں
- مواد کو منظم کرنے کے لیے ذیلی عنوانات استعمال کریں
- معلومات کی درستگی اور متوازن کوریج کو یقینی بنائیں`
  };

  private readonly contentTypeInstructions = {
    news: {
      ar: 'خبر عاجل: التزم بالحقائق، اكتب بموضوعية، استخدم أسلوب الهرم المقلوب',
      en: 'Breaking News: Stick to facts, write objectively, use inverted pyramid style',
      ur: 'تازہ خبر: حقائق پر قائم رہیں، معروضی انداز میں لکھیں، الٹا اہرام انداز استعمال کریں'
    },
    analysis: {
      ar: 'تحليل معمق: قدم سياقاً شاملاً، حلل الأسباب والنتائج، استخدم بيانات وأمثلة',
      en: 'In-depth Analysis: Provide comprehensive context, analyze causes and effects, use data and examples',
      ur: 'گہرائی سے تجزیہ: جامع سیاق و سباق فراہم کریں، اسباب اور اثرات کا تجزیہ کریں، ڈیٹا اور مثالیں استعمال کریں'
    },
    report: {
      ar: 'تقرير شامل: قدم معلومات تفصيلية، استخدم احصائيات، نظم بعناوين واضحة',
      en: 'Comprehensive Report: Provide detailed information, use statistics, organize with clear headings',
      ur: 'جامع رپورٹ: تفصیلی معلومات فراہم کریں، اعداد و شمار استعمال کریں، واضح عنوانات کے ساتھ منظم کریں'
    },
    interview: {
      ar: 'حوار صحفي: قدم خلفية عن الضيف، استخدم أسئلة وأجوبة واضحة، اختم بخلاصة',
      en: 'Interview: Provide guest background, use clear Q&A format, conclude with summary',
      ur: 'انٹرویو: مہمان کا پس منظر فراہم کریں، واضح سوال و جواب فارمیٹ استعمال کریں، خلاصہ کے ساتھ اختتام کریں'
    },
    opinion: {
      ar: 'مقال رأي: وضح الموقف بوضوح، ادعم بأدلة، احترم وجهات النظر المختلفة',
      en: 'Opinion Piece: State position clearly, support with evidence, respect different viewpoints',
      ur: 'رائے: موقف واضح طور پر بیان کریں، شواہد کے ساتھ تائید کریں، مختلف نقطہ نظر کا احترام کریں'
    }
  };

  private readonly wordCounts = {
    short: { ar: '300-500', en: '250-400', ur: '300-500' },
    medium: { ar: '600-900', en: '500-800', ur: '600-900' },
    long: { ar: '1000-1500', en: '800-1200', ur: '1000-1500' }
  };

  async generateArticle(config: ArticleGenerationConfig): Promise<GeneratedArticle> {
    const startTime = Date.now();
    
    const prompt = this.buildPrompt(config);
    
    const response = await aiManager.generate(prompt, {
      provider: 'openai',
      model: 'gpt-5.1'
      // maxTokens omitted - GPT-5.1 uses intelligent defaults
    });

    if (response.error) {
      throw new Error(`AI Generation failed: ${response.error}`);
    }

    const article = this.parseGeneratedContent(response.content, config.locale);
    
    return {
      ...article,
      tokensUsed: (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0),
      generationTimeMs: Date.now() - startTime
    };
  }

  private buildPrompt(config: ArticleGenerationConfig): string {
    const systemPrompt = this.systemPrompts[config.locale];
    const contentTypeInstr = this.contentTypeInstructions[config.contentType][config.locale];
    const wordCount = this.wordCounts[config.length || 'medium'][config.locale];
    
    let prompt = `${systemPrompt}

نوع المحتوى / Content Type: ${contentTypeInstr}
عدد الكلمات المستهدف / Target Word Count: ${wordCount}

العنوان المقترح / Suggested Title: ${config.title}`;

    if (config.keywords && config.keywords.length > 0) {
      prompt += `\nكلمات مفتاحية / Keywords: ${config.keywords.join(', ')}`;
    }

    if (config.tone) {
      const toneMap = {
        formal: { ar: 'رسمي', en: 'formal', ur: 'رسمی' },
        casual: { ar: 'غير رسمي', en: 'casual', ur: 'غیر رسمی' },
        investigative: { ar: 'استقصائي', en: 'investigative', ur: 'تحقیقاتی' },
        neutral: { ar: 'محايد', en: 'neutral', ur: 'غیر جانبدار' }
      };
      prompt += `\nالأسلوب / Tone: ${toneMap[config.tone][config.locale]}`;
    }

    if (config.additionalInstructions) {
      prompt += `\n\nتعليمات إضافية / Additional Instructions:\n${config.additionalInstructions}`;
    }

    prompt += `\n\nالمطلوب / Required Output Format (JSON):
{
  "title": "العنوان النهائي للمقال",
  "content": "المحتوى الكامل بصيغة HTML (استخدم <h2>, <p>, <ul>, <li>)",
  "summary": "ملخص تنفيذي (2-3 جمل)",
  "metaDescription": "وصف تعريفي للSEO (150-160 حرف)",
  "seoKeywords": ["كلمة1", "كلمة2", "كلمة3"],
  "suggestedTags": ["تاج1", "تاج2"],
  "estimatedReadTime": 5
}

ملاحظة مهمة: يجب أن يكون الرد بصيغة JSON صالحة فقط، بدون أي نص إضافي.`;

    return prompt;
  }

  private parseGeneratedContent(content: string, locale: string): Omit<GeneratedArticle, 'tokensUsed' | 'generationTimeMs'> {
    try {
      // Extract JSON from response (sometimes AI adds markdown code blocks)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(jsonStr);
      
      return {
        title: parsed.title || 'Untitled Article',
        content: parsed.content || '',
        summary: parsed.summary || '',
        metaDescription: parsed.metaDescription || '',
        seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
        suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
        estimatedReadTime: parsed.estimatedReadTime || 5
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      
      // Fallback: treat as raw content
      return {
        title: 'Generated Article',
        content: content,
        summary: content.substring(0, 200),
        metaDescription: content.substring(0, 160),
        seoKeywords: [],
        suggestedTags: [],
        estimatedReadTime: Math.ceil(content.split(/\s+/).length / 200)
      };
    }
  }

  async convertTaskToArticleData(
    task: AiScheduledTask,
    generatedContent: GeneratedArticle
  ): Promise<typeof articles.$inferInsert> {
    const now = new Date();
    
    // Generate slug from title (max 140 chars to leave room for suffix)
    const baseSlug = generatedContent.title
      .toLowerCase()
      .replace(/[^\u0600-\u06FF\w\s-]/g, '') // Keep Arabic, alphanumeric, spaces, hyphens
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .substring(0, 140); // Max 140 chars (leaving 10 for suffix)
    
    const { nanoid } = await import('nanoid');
    const slug = baseSlug + '-' + nanoid(8); // Total max 150 chars
    
    // Always use "سبق AI" as the author for all AI-generated articles
    // This ensures consistent branding and attribution for iFox content
    const SABQ_AI_AUTHOR_ID = 'bkIhDx7BM8quPu2W1tB6Z';
    const authorId = SABQ_AI_AUTHOR_ID;
    
    // Map contentType to supported articleType for auto-image generation and other features
    const contentTypeToArticleType: Record<string, string> = {
      'news': 'news',
      'analysis': 'analysis',
      'opinion': 'opinion',
      'report': 'news',      // Reports are treated as news articles
      'interview': 'news',   // Interviews are treated as news articles
    };
    const articleType = contentTypeToArticleType[task.contentType || 'news'] || 'news';
    
    return {
      title: generatedContent.title,
      slug,
      content: generatedContent.content,
      excerpt: generatedContent.summary.substring(0, 200), // Use summary as excerpt
      categoryId: task.categoryId,
      authorId: authorId,
      status: task.autoPublish ? 'published' : 'draft',
      publishedAt: task.autoPublish ? now : undefined,
      articleType, // ← Mapped from contentType for auto-image generation compatibility
      aiGenerated: true, // ← CRITICAL: Mark as AI-generated for iFox filtering
      // Database defaults handle: createdAt, updatedAt, views
    } as any; // Cast to bypass insertArticleSchema omit
  }
}

export const aiArticleGenerator = new AIArticleGenerator();
