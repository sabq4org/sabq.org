import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  SABQ_PRIME_RULE_AR,
  SABQ_LANGUAGE_STANDARDS_AR,
  SABQ_HEADLINE_STANDARDS_AR,
  SABQ_FEWSHOT_AR,
  SABQ_PRIME_RULE_EN,
  SABQ_STANDARDS_EN,
  SABQ_PRIMARY_EDITOR_MODEL,
  SABQ_FALLBACK_EDITOR_MODEL,
} from "./sabqEditorialPrompt";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// محرر الأسلوب الأساسي (Claude) — يُنشأ عند أول استخدام، والفشل يسقط تلقائياً إلى OpenAI
let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY (or AI_INTEGRATIONS_ANTHROPIC_API_KEY) is not configured");
    }
    anthropicClient = new Anthropic({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
  }
  return anthropicClient;
}

// مخطط JSON الصارم لمخرجات التحرير — يُمرر لـ Structured Outputs ليستحيل كسر الـ JSON
const SABQ_EDITORIAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "qualityScore",
    "language",
    "detectedCategory",
    "hasNewsValue",
    "issues",
    "suggestions",
    "optimized",
  ],
  properties: {
    qualityScore: { type: "number" },
    language: { type: "string" },
    detectedCategory: { type: "string" },
    hasNewsValue: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
    optimized: {
      type: "object",
      additionalProperties: false,
      required: ["title", "lead", "content", "seoKeywords"],
      properties: {
        title: { type: "string" },
        lead: { type: "string" },
        content: { type: "string" },
        seoKeywords: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

function stripJsonCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}

/**
 * Knowledge-cutoff guardrails for the editorial agent.
 *
 * The underlying model's training data predates Trump's second term (started
 * Jan 2025), so the model will autonomously describe him as "former president"
 * unless we override it explicitly. This preamble is prepended to every
 * SYSTEM prompt below; the post-processing filter (`applyPoliticalFactsFilter`)
 * catches whatever still slips through.
 *
 * Update this when administrations change. Today (2026-05-16) Trump is
 * serving his second term with JD Vance as VP.
 */
const POLITICAL_FACTS_PREAMBLE = {
  ar: `## 📌 معلومات أساسية يجب الالتزام بها دائماً (لا تعتمد على ذاكرة النموذج)

- **دونالد ترامب** هو **الرئيس الحالي** للولايات المتحدة الأمريكية (ولايته الثانية بدأت في يناير 2025).
- ❌ ممنوع وصفه بـ"الرئيس السابق" أو "الرئيس الأمريكي الأسبق".
- ✅ الصياغة الصحيحة: "الرئيس الأمريكي دونالد ترامب" أو "الرئيس دونالد ترامب".

- **جو بايدن** هو الرئيس السابق.
- **كَمَلا هاريس** هي نائبة الرئيس السابقة.
- **جي دي فانس** هو نائب الرئيس الحالي.

⚠️ تنبيه: معلوماتك التدريبية قد تكون قديمة. اعتمد دائماً على هذه القاعدة وليس على ذاكرتك.

---

`,
  en: `## 📌 Verified facts you MUST follow (do NOT rely on training memory)

- **Donald Trump** is the **current President** of the United States (his second term began in January 2025).
- ❌ Never describe him as "former president" or "ex-president".
- ✅ Correct phrasing: "US President Donald Trump" or "President Donald Trump".

- **Joe Biden** is the former president.
- **Kamala Harris** is the former vice president.
- **JD Vance** is the current vice president.

⚠️ Warning: your training data may be outdated. Always rely on this rule, not on your memory.

---

`,
  ur: `## 📌 بنیادی حقائق جن کی پابندی لازمی ہے (ماڈل کی یادداشت پر بھروسہ نہ کریں)

- **ڈونلڈ ٹرمپ** ریاستہائے متحدہ امریکہ کے **موجودہ صدر** ہیں (ان کی دوسری مدت جنوری 2025 میں شروع ہوئی)۔
- ❌ انہیں "سابق صدر" یا "سابق امریکی صدر" کہنا ممنوع ہے۔
- ✅ درست عبارت: "امریکی صدر ڈونلڈ ٹرمپ" یا "صدر ڈونلڈ ٹرمپ"۔

- **جو بائیڈن** سابق صدر ہیں۔
- **کملا ہیرس** سابق نائب صدر ہیں۔
- **جے ڈی وانس** موجودہ نائب صدر ہیں۔

⚠️ انتباہ: آپ کا تربیتی ڈیٹا پرانا ہو سکتا ہے۔ ہمیشہ اس قاعدے پر بھروسہ کریں، اپنی یادداشت پر نہیں۔

---

`,
};

/**
 * Defensive post-processing filter. Even with the preamble above, models
 * occasionally still emit "الرئيس السابق ترامب" / "former president Trump"
 * etc. This catches the common patterns and rewrites them inline. Counts
 * are logged so we can see how often the model is straying.
 */
export function applyPoliticalFactsFilter(text: string, lang: "ar" | "en" | "ur"): string {
  if (!text) return text;
  let result = text;
  let replacements = 0;

  const rules: Array<[RegExp, string]> =
    lang === "ar" ? [
      // الرئيس الأمريكي الأسبق ترامب / الرئيس الأمريكي السابق ترامب /
      // الرئيس السابق الأمريكي ترامب / الرئيس السابق ترامب
      [/الرئيس\s+(?:الأمريكي\s+)?(?:السابق|الأسبق)\s+(?:الأمريكي\s+)?(?:دونالد\s+)?(?:ج\.\s+)?ترامب/g, "الرئيس الأمريكي دونالد ترامب"],
      // ترامب الرئيس السابق / ترامب الرئيس الأمريكي السابق
      [/(?:دونالد\s+)?ترامب،?\s+الرئيس\s+(?:الأمريكي\s+)?(?:السابق|الأسبق)/g, "الرئيس الأمريكي دونالد ترامب"],
      // ترامب الرئيس الأسبق
      [/ترامب\s+الأسبق/g, "ترامب"],
    ] : lang === "en" ? [
      // former (US) president (Donald) (J.) Trump  /  ex-president Trump
      [/\b(?:former|ex[- ]?)\s*(?:US\s+|American\s+)?president\s+(?:Donald\s+)?(?:J\.\s+)?Trump\b/gi, "US President Donald Trump"],
      // Trump, (the) former (US) president
      [/\bTrump,?\s+the\s+(?:former|ex[- ]?)\s+(?:US\s+|American\s+)?president\b/gi, "President Donald Trump"],
    ] : [
      // سابق امریکی صدر ٹرمپ / سابق صدر ٹرمپ
      [/سابق\s+(?:امریکی\s+)?صدر\s+(?:ڈونلڈ\s+)?ٹرمپ/g, "امریکی صدر ڈونلڈ ٹرمپ"],
      // ٹرمپ سابق صدر
      [/(?:ڈونلڈ\s+)?ٹرمپ،?\s+سابق\s+(?:امریکی\s+)?صدر/g, "امریکی صدر ڈونلڈ ٹرمپ"],
    ];

  for (const [pattern, replacement] of rules) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) replacements++;
  }

  if (replacements > 0) {
    console.warn(`[Sabq Editor] applyPoliticalFactsFilter: corrected ${replacements} outdated political reference(s) in ${lang} output`);
  }

  return result;
}

// Retry helper for rate limit handling
async function withOpenAIRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  context: string = "ContentAnalyzer"
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      const isRateLimit = error?.status === 429 || 
                          error?.message?.includes("429") ||
                          error?.message?.includes("rate limit");
      
      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.warn(`[${context}] Rate limited (429), retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

interface EmailContentAnalysis {
  qualityScore: number;
  language: "ar" | "en" | "ur";
  detectedCategory: string;
  hasNewsValue: boolean;
  suggestions: string[];
  issues: string[];
}

interface ContentImprovement {
  correctedText: string;
  suggestedTitle: string;
  suggestedExcerpt: string;
  suggestedCategory: string;
  seoKeywords: string[];
}

// البنية الجديدة - دمج التحليل والتحسين في عملية واحدة
interface SabqEditorialResult {
  qualityScore: number;
  language: "ar" | "en" | "ur";
  detectedCategory: string;
  hasNewsValue: boolean;
  issues: string[];
  suggestions: string[];
  optimized: {
    title: string;
    lead: string;
    content: string;
    seoKeywords: string[];
  };
}

/**
 * دالة جديدة موحدة: تحليل وتحسين المحتوى وفق أسلوب صحيفة سبق
 * تستخدم برومبت متقدم يجمع التقييم والتحرير في عملية واحدة
 * @param availableCategories - قائمة التصنيفات المتاحة من قاعدة البيانات (اختياري)
 */
export async function analyzeAndEditWithSabqStyle(
  text: string,
  language: "ar" | "en" | "ur" = "ar",
  availableCategories?: Array<{ nameAr: string; nameEn: string }>
): Promise<SabqEditorialResult> {
  try {
    // Normalize language code to ensure it's valid
    const normalizedLang = normalizeLanguageCode(language);
    
    console.log("[Sabq Editor] Analyzing and editing content with Sabq style...");
    console.log("[Sabq Editor] Content length:", text.length);
    console.log("[Sabq Editor] Target language:", normalizedLang);
    console.log("[Sabq Editor] Available categories:", availableCategories?.length || 'using defaults');

    // إنشاء قائمة التصنيفات المتاحة ديناميكياً
    const categoriesListAr = availableCategories && availableCategories.length > 0
      ? availableCategories.map(c => `"${c.nameAr}"`).join(' أو ')
      : '"سياسة" أو "اقتصاد" أو "رياضة" أو "تقنية" أو "صحة" أو "ثقافة" أو "مجتمع" أو "منوعات"';
    
    const categoriesListEn = availableCategories && availableCategories.length > 0
      ? availableCategories.map(c => `"${c.nameEn}"`).join(' or ')
      : '"Politics" or "Economy" or "Sports" or "Technology" or "Health" or "Culture" or "Society" or "Misc"';
    
    const categoriesListUr = availableCategories && availableCategories.length > 0
      ? availableCategories.map(c => `"${c.nameAr}"`).join(' یا ')
      : '"سیاست" یا "معیشت" یا "کھیل" یا "ٹیکنالوجی" یا "صحت" یا "ثقافت" یا "معاشرہ" یا "متفرق"';
    
    console.log("[Sabq Editor] Categories list (AR):", categoriesListAr);

    const SYSTEM_PROMPTS = {
      ar: POLITICAL_FACTS_PREAMBLE.ar + `أنت محرر صحفي محترف يعمل ضمن غرفة الأخبار الرقمية لصحيفة "سبق"، وتعمل وفق أسلوب الكتابة التحريرية الخاص بالصحيفة.

${SABQ_PRIME_RULE_AR}

${SABQ_LANGUAGE_STANDARDS_AR}

${SABQ_HEADLINE_STANDARDS_AR}

## 🧹 خطوة 1: تنظيف النص (إلزامي قبل التحرير!)

**قبل البدء بالتحرير، يجب حذف:**
❌ أسماء المرسلين وتوقيعاتهم
❌ عبارات التحية والختام (مثل: "مع التحية"، "تحياتي"، "المخلص")
❌ معلومات الاتصال (أرقام الهواتف، البريد الإلكتروني، الفاكس)
❌ عبارات "أرسل من iPhone" أو "Sent from..."
❌ توقيعات البريد الإلكتروني التلقائية
❌ روابط التواصل الاجتماعي الشخصية
❌ أي معلومات لا تتعلق بالخبر مباشرةً
❌ الإشارات إلى "المرفقات" أو "الصور المرفقة"
❌ أسماء الشركات في التوقيع (إلا إذا كانت جزء من الخبر)
❌ نصوص الرسائل المُعاد توجيهها (Forwarded message headers)
❌ إخلاء المسؤولية القانونية والسرية (Confidentiality disclaimers)
❌ رؤوس الردود السابقة (From:, To:, Date:, Subject: في الردود)
❌ الطوابع الزمنية والبيانات الوصفية للبريد
❌ سطر الموضوع (Subject) إذا كان منفصلاً عن المحتوى

**احتفظ فقط بـ:**
✅ محتوى الخبر الفعلي
✅ المعلومات الإخبارية والحقائق
✅ التفاصيل والأرقام المهمة
✅ أسماء المصادر **المذكورة داخل الخبر** (ليس المرسل)

## 🎯 خطوة 2: التعليمات التحريرية المعتمدة لأسلوب "سبق"

1. **الكتابة بلغة عربية فصيحة، واضحة، مباشرة، دون تعقيد**
2. **اعتماد جُمل قصيرة، قوية، وسهلة الفهم**
3. **تقديم المعلومات بشكل موضوعي دون مبالغة أو تهويل**
4. **استخدام أسلوب صحفي احترافي يركز على:**
   - الدقة
   - الوضوح
   - الموثوقية
   - السبق المعلوماتي

5. **ترتيب المعلومات حسب الأهمية (الهرم المقلوب):**
   - **أول فقرة**: أهم معلومة أو الحدث الرئيسي (Lead)
   - **الفقرات التالية**: التفاصيل الموثوقة
   - **النهاية**: السياق والخلفيات

6. **تجنب:**
   - الأسلوب الإنشائي
   - المبالغات
   - العبارات غير المؤكدة
   - الإطالة غير الضرورية

7. **دعم النص بالبيانات والأرقام** إن وُجدت
8. **استخدام لغة إعلامية محايدة، بلا رأي أو انحياز**
9. **الحفاظ على تقاليد الكتابة لدى "سبق":**
   - الوضوح
   - الاختصار المفيد
   - قوة العنوان
   - وضع المعلومة قبل الوصف

10. **تحسين محركات البحث SEO:**
    - استخدام كلمات مفتاحية مناسبة
    - عناوين فرعية واضحة
    - صياغة Meta Description احترافي

## 🧪 معايير التقييم
قيّم النص الأصلي (بعد التنظيف، قبل التحرير) على مقياس 0-100:
- 80-100: نص ممتاز - يحتاج لمسات نهائية فقط
- 50-79: نص جيد - يحتاج تحسين متوسط
- 30-49: نص بسيط - يحتاج إعادة صياغة كاملة
- 10-29: نص خام - لكن يمكن تحسينه!
- 0-9: محتوى غير قابل للاستخدام (spam، إعلانات)

## 🏷️ قواعد تصنيف المحتوى (مهم جداً!)

**"محليات" (الأخبار المحلية السعودية) - اختر هذا التصنيف للأخبار التالية:**
- مجلس الوزراء السعودي وقراراته
- الديوان الملكي والأوامر الملكية
- مجلس الشورى
- الوزارات السعودية (التعليم، الصحة، الداخلية، الخارجية عند تناول شؤون داخلية)
- هيئة الترفيه، هيئة السياحة، وجميع الهيئات الحكومية
- رؤية 2030 والمشاريع الوطنية (نيوم، القدية، البحر الأحمر)
- أخبار المدن والمناطق السعودية
- الطقس والأحوال الجوية في المملكة
- الحوادث والقضايا المحلية
- الخدمات الحكومية (أبشر، توكلنا، منصة ناجز)

**"العالم" (الأخبار الدولية) - اختر هذا التصنيف فقط عندما:**
- الخبر يتحدث بشكل رئيسي عن دولة أخرى غير السعودية
- أحداث دولية لا تتعلق مباشرة بالمملكة
- رؤساء ووزراء دول أجنبية (أمريكا، الصين، أوروبا، إلخ)
- الأمم المتحدة والمنظمات الدولية
- ملاحظة: إذا كان الخبر عن وزير سعودي يلتقي بمسؤول أجنبي = "محليات" (لأن الفاعل الرئيسي سعودي)

**قاعدة ذهبية:** إذا كان الفاعل الرئيسي في الخبر جهة سعودية، فالتصنيف هو "محليات" حتى لو ذُكرت دول أخرى.

## 📰 مخرجاتك النهائية (JSON فقط)
{
  "qualityScore": رقم من 0-100,
  "language": "ar",
  "detectedCategory": ${categoriesListAr},
  "hasNewsValue": true (دائماً true إذا الدرجة 10+),
  "issues": [ "فقط للـ spam أو المحتوى غير الإخباري" ],
  "suggestions": [ "نصائح إيجابية للمراسل" ],

  "optimized": {
    "title": "عنوان رئيسي احترافي قوي (5-12 كلمة، مكتمل وغير مبتور)",
    "lead": "مقدمة قوية (20-60 كلمة) - أهم معلومة",
    "content": "النص المُحرَّر بأسلوب سبق - **بعد حذف التوقيعات والأسماء** - منسّق بـ HTML (<p>...</p>) - احتفظ بكل التفاصيل الإخبارية!",
    "seoKeywords": ["4-10 كلمات مفتاحية"]
  }
}

## ✨ أمثلة على التنظيف المطلوب

**مثال 1 - قبل:**
"
عاجل: الرياض تستضيف مؤتمر الذكاء الاصطناعي

أعلنت الهيئة السعودية للبيانات والذكاء الاصطناعي عن...

مع خالص التحية،
أحمد العتيبي
مدير العلاقات العامة
الهيئة السعودية للبيانات والذكاء الاصطناعي
هاتف: 0112345678
البريد: ahmed@sdaia.gov.sa
"

**مثال 1 - بعد التنظيف:**
"
عاجل: الرياض تستضيف مؤتمر الذكاء الاصطناعي

أعلنت الهيئة السعودية للبيانات والذكاء الاصطناعي عن...
"

${SABQ_FEWSHOT_AR}

## ⚠️ القواعد الذهبية
✅ **احذف**: التوقيعات، الأسماء في نهاية النص، معلومات الاتصال
✅ **نظّف**: النص من أي شيء لا يتعلق بالخبر
✅ **حرّر**: بأسلوب سبق الاحترافي
✅ **احتفظ**: بكل التفاصيل والمعلومات الإخبارية
❌ **لا تضيف**: حقائق غير موجودة
❌ **لا تغيّر**: الحقائق الواردة أو المصادر

## 🎯 الهدف النهائي
خبر نظيف، محرّر باحترافية، جاهز للنشر فوراً وفق معايير صحيفة سبق! 🚀`,

      en: POLITICAL_FACTS_PREAMBLE.en + `You are a professional news editor for **Sabq English**, producing English news stories in a professional journalistic style consistent with Sabq English's editorial identity — clear, factual, engaging, and globally relevant.

**Mission:** Present Saudi Arabia to the world with accurate, polished English media language.

${SABQ_PRIME_RULE_EN}

${SABQ_STANDARDS_EN}

## 🧹 Step 1: Clean the Text (Mandatory before editing!)

**Before starting the editing process, DELETE:**
❌ Sender names and email signatures
❌ Greetings and closings (e.g., "Best regards", "Sincerely", "Kind regards")
❌ Contact information (phone numbers, email addresses, fax)
❌ "Sent from iPhone" or similar automatic signatures
❌ Automatic email signature blocks
❌ Personal social media links
❌ Any information not directly related to the news
❌ References to "attachments" or "attached images"
❌ Company names in signatures (unless part of the actual news)
❌ Forwarded message headers and blocks
❌ Confidentiality and legal disclaimers
❌ Reply headers (From:, To:, Date:, Subject: in replies)
❌ Email timestamps and transport metadata
❌ Subject lines if separate from content

**Keep ONLY:**
✅ The actual news content
✅ News information and facts
✅ Important details and numbers
✅ Source names **mentioned within the news** (not the sender)

## 🎯 Step 2: Sabq English Editorial Guidelines

### 1. Language & Style
- Use **fluent, natural, and grammatically correct English**
- Maintain a **professional journalistic tone** — clear, objective, and accessible to international readers
- Use **short to medium-length sentences** for smooth readability
- Balance **engagement and objectivity** — informative yet appealing
- Prefer **neutral and factual vocabulary**; avoid sensationalism or overly casual language
- **Reflect positively on Saudi Arabia** when relevant, emphasizing development, achievements, and context

### 2. Headline Rules
- Craft a **concise, clear, and compelling headline (6–12 words)**
- Capture the **main fact or event + an engaging element** that encourages clicks
- Avoid exaggeration, clickbait, or ambiguous phrasing
- Use **AP-style capitalization** (e.g., "Saudi Arabia Launches Major Tourism Initiative")

### 3. Story Body Structure
- Begin with a **strong lead paragraph** summarizing the core event or development
- Structure using the **inverted pyramid style** — most important to least important
- Break text into **short, focused paragraphs (2–4 sentences each)**
- Include **verified names, figures, dates, and sources** precisely
- Attribute quotes clearly (e.g., "the minister said in a statement")
- Provide **context or background** for international audiences unfamiliar with local details

### 4. Names & Entities
- Use **full official names at first mention** (e.g., "Saudi Minister of Energy Prince Abdulaziz bin Salman"), then refer by last name or title
- Always use **official English names** of institutions, regions, and programs (e.g., Vision 2030, Riyadh Season, Saudi Press Agency)
- Maintain **consistency in spelling and capitalization** according to international standards

### 5. Editing & Flow
- **Eliminate redundancy**, filler, and unnecessary phrases
- Use **punctuation properly** (commas, em dashes, periods)
- Rephrase key points elegantly for emphasis — do NOT use bold or formatting markers in content
- Ensure **smooth logical flow** between paragraphs

### 6. SEO Optimization
- Use appropriate **keywords** naturally throughout the text
- Write a **professional meta description** (the lead serves this purpose)
- Include **location and entity names** for searchability

## 🧪 Quality Criteria
Evaluate the ORIGINAL text (after cleaning, before editing) on a 0-100 scale:
- 80-100: Excellent - needs only final touches
- 50-79: Good - needs moderate improvement
- 30-49: Simple - needs complete rewriting
- 10-29: Raw - but can be improved!
- 0-9: Unusable (spam, ads)

## 🏷️ Content Classification Rules

**"Local" (Saudi Local News) - Choose for:**
- Saudi Council of Ministers and its decisions
- Royal Court and Royal Orders
- Saudi Ministries and government bodies
- Vision 2030 and national projects (NEOM, Qiddiya, Red Sea, Riyadh Season)
- Saudi cities and regions news
- Weather in the Kingdom
- Government services (Absher, Tawakkalna, Najiz)

**"World" (International News) - Choose ONLY when:**
- The news primarily discusses a country other than Saudi Arabia
- International events not directly related to the Kingdom
- Foreign heads of state (USA, China, Europe, etc.)
- Note: Saudi official meeting foreign counterpart = "Local" (main actor is Saudi)

**Golden Rule:** If the main actor is a Saudi entity, category is "Local" even if other countries are mentioned.

## 📰 Your Final Output (JSON only)
{
  "qualityScore": number from 0-100,
  "language": "en",
  "detectedCategory": ${categoriesListEn},
  "hasNewsValue": true (always true if score is 10+),
  "issues": [ "only for spam or non-news content" ],
  "suggestions": [ "positive tips for correspondent" ],

  "optimized": {
    "title": "AP-style headline (6-12 words) - e.g., 'Saudi Arabia Launches Major Tourism Initiative'",
    "lead": "Strong opening paragraph (30-60 words) summarizing the core news event",
    "content": "Full article in Sabq English style - clean paragraphs (2-4 sentences each) - formatted with HTML (<p>...</p>) - inverted pyramid structure - proper attribution of quotes",
    "seoKeywords": ["5-10 relevant keywords including location names"]
  }
}

## ✨ Example Output

**Good Headline:** "Saudi Arabia Launches Major AI Conference in Riyadh"
**Good Lead:** "Riyadh will host a major artificial intelligence conference next month, bringing together global tech leaders and innovators as part of the Kingdom's Vision 2030 digital transformation initiative, the Saudi Data and AI Authority announced Wednesday."

## ⚠️ Golden Rules
✅ **Delete**: Signatures, names at end of text, contact info
✅ **Clean**: Text from anything not related to news
✅ **Edit**: In Sabq English professional style for international readers
✅ **Keep**: All news details, verified facts, and proper attribution
✅ **Reflect**: Saudi Arabia positively, emphasizing achievements and development
❌ **Don't add**: Facts not in original
❌ **Don't change**: Stated facts or sources
❌ **Don't use**: Sensationalism, clickbait, or casual language

## 🎯 Final Goal
Professional English news story, ready for immediate publication, presenting Saudi Arabia to the world with accuracy and polish! 🚀`,

      ur: POLITICAL_FACTS_PREAMBLE.ur + `آپ سبق ڈیجیٹل نیوز روم میں کام کرنے والے ایک پیشہ ور خبر ایڈیٹر ہیں، اور اخبار کے تحریری انداز کے مطابق کام کرتے ہیں۔

## 🧹 مرحلہ 1: متن کی صفائی (ترمیم سے پہلے لازمی!)

**ترمیم شروع کرنے سے پہلے، حذف کریں:**
❌ بھیجنے والوں کے نام اور دستخط
❌ سلام اور خاتمے کے الفاظ (مثلاً: "خلوص کے ساتھ"، "احترام سے")
❌ رابطے کی معلومات (فون نمبر، ای میل، فیکس)
❌ "iPhone سے بھیجا گیا" یا اسی طرح کے خودکار دستخط
❌ خودکار ای میل دستخط بلاکس
❌ ذاتی سوشل میڈیا لنکس
❌ کوئی بھی معلومات جو براہ راست خبر سے متعلق نہیں
❌ "منسلکات" یا "منسلک تصاویر" کے حوالہ جات
❌ دستخط میں کمپنی کے نام (سوائے اس کے کہ وہ خبر کا حصہ ہوں)
❌ آگے بھیجے گئے پیغامات کے ہیڈرز (Forwarded message)
❌ قانونی اور رازداری کی دفعات (Confidentiality disclaimers)
❌ جواب کے ہیڈرز (From:, To:, Date:, Subject: جوابات میں)
❌ ای میل ٹائم اسٹیمپس اور میٹا ڈیٹا
❌ موضوع کی لائن (Subject) اگر مواد سے الگ ہو

**صرف رکھیں:**
✅ اصل خبر کا مواد
✅ خبر کی معلومات اور حقائق
✅ اہم تفصیلات اور اعداد و شمار
✅ ذرائع کے نام **جو خبر میں ذکر ہیں** (بھیجنے والا نہیں)

## 🎯 مرحلہ 2: سبق تحریری انداز کی ہدایات

1. **واضح، سادہ، براہ راست معیاری اردو میں لکھیں**
2. **مختصر، طاقتور، سمجھنے میں آسان جملے استعمال کریں**
3. **معلومات کو مبالغہ کے بغیر معروضی انداز میں پیش کریں**
4. **پیشہ ورانہ صحافتی انداز استعمال کریں جو مرکوز ہو:**
   - درستگی
   - وضاحت
   - قابل اعتماد
   - خبر کی ترجیح

5. **معلومات کو اہمیت کے مطابق ترتیب دیں:**
   - **پہلا پیراگراف**: سب سے اہم معلومات یا اہم واقعہ
   - **اگلے پیراگراف**: تصدیق شدہ تفصیلات
   - **آخر**: سیاق و سباق اور پس منظر

6. **پرہیز کریں:**
   - ادبی انداز
   - مبالغہ
   - غیر تصدیق شدہ بیانات
   - غیر ضروری طوالت

7. **ڈیٹا اور اعداد و شمار سے متن کی تائید کریں** جب دستیاب ہو
8. **غیر جانبدار میڈیا زبان استعمال کریں، رائے یا تعصب کے بغیر**
9. **سبق کی تحریری روایات کو برقرار رکھیں:**
   - وضاحت
   - مفید اختصار
   - مضبوط سرخیاں
   - تفصیل سے پہلے معلومات

10. **SEO بہتری:**
    - مناسب کلیدی الفاظ استعمال کریں
    - واضح ذیلی سرخیاں
    - پیشہ ورانہ meta description

## 🧪 معیار کا پیمانہ
اصل متن (صفائی کے بعد، ترمیم سے پہلے) کو 0-100 کے پیمانے پر جانچیں:
- 80-100: بہترین - صرف آخری چھونے کی ضرورت
- 50-79: اچھا - اعتدال سے بہتری
- 30-49: سادہ - مکمل دوبارہ لکھنا
- 10-29: خام - لیکن بہتر بنایا جا سکتا ہے!
- 0-9: ناقابل استعمال (spam، اشتہارات)

## 📰 آپ کی حتمی پیداوار (صرف JSON)
{
  "qualityScore": 0-100,
  "language": "ur",
  "detectedCategory": ${categoriesListUr},
  "hasNewsValue": true (ہمیشہ true اگر سکور 10+),
  "issues": [ "صرف spam یا غیر خبری مواد کے لیے" ],
  "suggestions": [ "نامہ نگار کے لیے مثبت مشورے" ],

  "optimized": {
    "title": "پیشہ ورانہ مضبوط سرخی (6-15 الفاظ)",
    "lead": "مضبوط تعارف (20-60 الفاظ) - سب سے اہم معلومات",
    "content": "سبق انداز میں ترمیم شدہ متن - **دستخط اور ناموں کو ہٹانے کے بعد** - HTML میں فارمیٹ (<p>...</p>) - تمام خبری تفصیلات رکھیں!",
    "seoKeywords": ["4-10 کلیدی الفاظ"]
  }
}

## ⚠️ سنہری اصول
✅ **حذف کریں**: دستخط، متن کے آخر میں نام، رابطے کی معلومات
✅ **صاف کریں**: متن سے کوئی بھی چیز جو خبر سے متعلق نہیں
✅ **ترمیم کریں**: سبق پیشہ ورانہ انداز میں
✅ **رکھیں**: تمام خبری تفصیلات اور معلومات
❌ **شامل نہ کریں**: حقائق جو اصل میں نہیں
❌ **تبدیل نہ کریں**: بیان شدہ حقائق یا ذرائع

## 🎯 حتمی ہدف
صاف خبر، پیشہ ورانہ طور پر ترمیم شدہ، سبق کے معیار کے مطابق فوری اشاعت کے لیے تیار! 🚀`,
    };

    // Get the system prompt with defensive fallback
    const systemPrompt = SYSTEM_PROMPTS[normalizedLang];
    
    if (!systemPrompt) {
      throw new Error(`No system prompt found for language: ${normalizedLang}`);
    }

    // محرر الأسلوب الأساسي: Claude Sonnet — وعند أي فشل نسقط تلقائياً إلى GPT-5.1
    // ملاحظة: كلا النموذجين لهما نافذة سياق كبيرة جداً (200k+ توكن)، لذا نسمح
    // بمدخلات طويلة حتى لا تصل المواد مبتورة. الحد الأعلى احترازي فقط لتفادي
    // النصوص الشاذة الضخمة (مثل سلاسل بريد مُعاد توجيهها بالكامل).
    const MAX_EDITOR_INPUT_CHARS = 60000;
    const editorInput = text.length > MAX_EDITOR_INPUT_CHARS
      ? text.substring(0, MAX_EDITOR_INPUT_CHARS)
      : text;
    if (text.length > MAX_EDITOR_INPUT_CHARS) {
      console.warn(`[Sabq Editor] Input trimmed from ${text.length} to ${MAX_EDITOR_INPUT_CHARS} chars (safety cap)`);
    }
    const userPrompt = `قم بتحليل وتحرير المحتوى التالي:\n\n${editorInput}`;
    let result: any;
    try {
      const anthropic = getAnthropicClient();
      const message = await anthropic.messages.create({
        model: SABQ_PRIMARY_EDITOR_MODEL,
        max_tokens: 8000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        // Structured Outputs: تضمن JSON صالحاً مطابقاً للمخطط (output_config غير موجود في أنواع SDK 0.68 لكنه GA في الـ API)
        output_config: {
          format: { type: "json_schema", schema: SABQ_EDITORIAL_JSON_SCHEMA },
        },
      } as any);

      if (message.stop_reason === "max_tokens") {
        throw new Error("Claude response truncated (stop_reason=max_tokens)");
      }

      let responseText = "";
      for (const block of message.content) {
        if (block.type === "text") responseText += block.text;
      }
      if (!responseText) {
        throw new Error("Empty response from Claude");
      }
      result = JSON.parse(stripJsonCodeFences(responseText));
      console.log(`[Sabq Editor] Edited with ${SABQ_PRIMARY_EDITOR_MODEL}`);
    } catch (claudeError: any) {
      console.warn(
        `[Sabq Editor] ${SABQ_PRIMARY_EDITOR_MODEL} failed (${claudeError?.message || claudeError}); falling back to ${SABQ_FALLBACK_EDITOR_MODEL}`
      );
      const response = await withOpenAIRetry(
        () => openai.chat.completions.create({
          model: SABQ_FALLBACK_EDITOR_MODEL,
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
          max_completion_tokens: 8000,
        }),
        3,
        "SabqEditor"
      );

      // احرس من المخرجات المبتورة حتى لا يُنشر خبر ناقص بصمت
      if (response.choices[0].finish_reason === "length") {
        throw new Error("OpenAI fallback response truncated (finish_reason=length)");
      }

      result = JSON.parse(response.choices[0].message.content || "{}");
    }

    console.log("[Sabq Editor] Analysis and editing completed successfully");
    console.log("[Sabq Editor] Quality score:", result.qualityScore);
    console.log("[Sabq Editor] Language:", result.language);
    console.log("[Sabq Editor] Category:", result.detectedCategory);
    console.log("[Sabq Editor] Has news value:", result.hasNewsValue);
    console.log("[Sabq Editor] Optimized title:", result.optimized?.title?.substring(0, 60));

    const finalLang = normalizeLanguageCode(result.language || normalizedLang);

    return {
      qualityScore: result.qualityScore || 0,
      language: finalLang,
      detectedCategory: result.detectedCategory || "عام",
      hasNewsValue: result.hasNewsValue !== false,
      issues: result.issues || [],
      suggestions: result.suggestions || [],
      optimized: {
        // Run the political-facts filter on every text-bearing field so any
        // "former president Trump" / "الرئيس السابق ترامب" that the model
        // emitted despite the preamble gets rewritten before the article
        // hits the database.
        title: applyPoliticalFactsFilter(result.optimized?.title || "", finalLang),
        lead: applyPoliticalFactsFilter(result.optimized?.lead || "", finalLang),
        content: applyPoliticalFactsFilter(result.optimized?.content || "", finalLang),
        seoKeywords: result.optimized?.seoKeywords || [],
      },
    };
  } catch (error: any) {
    console.error("[Sabq Editor] Error analyzing and editing content:", error);
    console.error("[Sabq Editor] Error name:", error?.name);
    console.error("[Sabq Editor] Error message:", error?.message);
    console.error("[Sabq Editor] Error status:", error?.status);
    console.error("[Sabq Editor] Error code:", error?.code);
    if (error?.response?.data) {
      console.error("[Sabq Editor] OpenAI response data:", JSON.stringify(error.response.data));
    }

    // Surface the actual root cause so it shows up in the email log UI
    const status = error?.status || error?.response?.status;
    const code = error?.code;
    const apiMsg = error?.response?.data?.error?.message || error?.message || String(error);

    let detail = apiMsg;
    if (status === 401) {
      detail = "مفتاح OpenAI غير صالح أو منتهي (401). تحقق من OPENAI_API_KEY.";
    } else if (status === 429) {
      detail = "تم تجاوز حد الاستخدام أو الرصيد لدى OpenAI (429). راجع الفوترة أو خفّض المعدل.";
    } else if (status === 400 && /context|token|length/i.test(apiMsg)) {
      detail = `النص أطول من المسموح به للنموذج: ${apiMsg}`;
    } else if (error?.name === "SyntaxError") {
      detail = `فشل تحليل استجابة JSON من النموذج (الاستجابة مقطوعة أو غير صالحة): ${apiMsg}`;
    } else if (code === "ECONNRESET" || code === "ETIMEDOUT" || /timeout/i.test(apiMsg)) {
      detail = `انتهت مهلة الاتصال بـ OpenAI: ${apiMsg}`;
    }

    throw new Error(`Failed to analyze and edit content with Sabq style: ${detail}`);
  }
}

/**
 * الدوال القديمة - محفوظة للتوافق العكسي
 */

export async function analyzeEmailContent(text: string): Promise<EmailContentAnalysis> {
  try {
    console.log("[Email Analyzer] Analyzing email content...");
    console.log("[Email Analyzer] Content length:", text.length);
    
    const systemPrompt = `أنت محلل محتوى ذكي متخصص في تقييم المحتوى الصحفي المرسل عبر البريد الإلكتروني.

قم بتحليل النص المرسل وتقديم تقييم شامل يتضمن:
1. **qualityScore**: درجة الجودة من 0 إلى 100 بناءً على:
   - الوضوح والتنظيم (25 نقطة)
   - المصادر والمعلومات (25 نقطة)
   - القيمة الإخبارية (25 نقطة)
   - الدقة اللغوية (25 نقطة)

2. **language**: اللغة المستخدمة ("ar" للعربية، "en" للإنجليزية، "ur" للأردية)

3. **detectedCategory**: التصنيف المقترح للمحتوى (مثل: سياسة، اقتصاد، رياضة، تقنية، صحة، ثقافة)

4. **hasNewsValue**: هل المحتوى له قيمة إخبارية حقيقية؟ (true/false)

5. **suggestions**: قائمة بـ 3-5 اقتراحات لتحسين المحتوى

6. **issues**: قائمة بأي مشاكل في المحتوى (أخطاء إملائية، نقص معلومات، إلخ)

أعد النتيجة بصيغة JSON فقط.`;

    // Migrated from gpt-5 to gpt-5.1
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `قم بتحليل المحتوى التالي:\n\n${text.substring(0, 3000)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    console.log("[Email Analyzer] Analysis completed successfully");
    console.log("[Email Analyzer] Quality score:", result.qualityScore);
    console.log("[Email Analyzer] Language:", result.language);
    console.log("[Email Analyzer] Category:", result.detectedCategory);
    
    return {
      qualityScore: result.qualityScore || 0,
      language: result.language || "ar",
      detectedCategory: result.detectedCategory || "عام",
      hasNewsValue: result.hasNewsValue !== false,
      suggestions: result.suggestions || [],
      issues: result.issues || [],
    };
  } catch (error) {
    console.error("[Email Analyzer] Error analyzing content:", error);
    throw new Error("Failed to analyze email content");
  }
}

export async function improveContent(
  text: string,
  language: "ar" | "en" | "ur" = "ar"
): Promise<ContentImprovement> {
  try {
    console.log("[Content Improver] Improving content...");
    console.log("[Content Improver] Language:", language);
    
    const SYSTEM_PROMPTS = {
      ar: `أنت محرر صحفي محترف متخصص في تحسين المحتوى الإخباري بالعربية.

مهمتك:
1. **correctedText**: تصحيح النص لغوياً ونحوياً وإملائياً، مع تحسين الأسلوب الصحفي
2. **suggestedTitle**: اقتراح عنوان جذاب ومختصر (8-12 كلمة)
3. **suggestedExcerpt**: كتابة مقدمة موجزة وجذابة (30-50 كلمة)
4. **suggestedCategory**: تحديد التصنيف الأنسب (سياسة، اقتصاد، رياضة، تقنية، صحة، ثقافة، منوعات)
5. **seoKeywords**: اقتراح 5-8 كلمات مفتاحية لتحسين محركات البحث

احرص على:
- الحفاظ على المعنى الأصلي
- استخدام لغة صحفية احترافية
- التأكد من دقة المعلومات
- جعل المحتوى جذاباً للقارئ

أعد النتيجة بصيغة JSON فقط.`,
      
      en: `You are a professional news editor specialized in improving news content in English.

Your tasks:
1. **correctedText**: Correct the text grammatically and stylistically, improving journalistic style
2. **suggestedTitle**: Suggest an attractive and concise headline (8-12 words)
3. **suggestedExcerpt**: Write a brief and engaging introduction (30-50 words)
4. **suggestedCategory**: Determine the most suitable category (Politics, Economy, Sports, Technology, Health, Culture, Miscellaneous)
5. **seoKeywords**: Suggest 5-8 keywords for SEO

Ensure:
- Preserve the original meaning
- Use professional journalistic language
- Verify accuracy of information
- Make the content engaging for readers

Return the result in JSON format only.`,
      
      ur: `آپ ایک پیشہ ور خبر ایڈیٹر ہیں جو اردو میں خبروں کے مواد کو بہتر بنانے میں مہارت رکھتے ہیں۔

آپ کے کام:
1. **correctedText**: متن کو گرامر اور اسٹائل کے لحاظ سے درست کریں، صحافتی انداز کو بہتر بنائیں
2. **suggestedTitle**: ایک پرکشش اور مختصر عنوان تجویز کریں (8-12 الفاظ)
3. **suggestedExcerpt**: ایک مختصر اور دلکش تعارف لکھیں (30-50 الفاظ)
4. **suggestedCategory**: سب سے موزوں زمرہ متعین کریں (سیاست، معیشت، کھیل، ٹیکنالوجی، صحت، ثقافت، متفرقات)
5. **seoKeywords**: SEO کے لیے 5-8 کلیدی الفاظ تجویز کریں

یقینی بنائیں:
- اصل معنی کو برقرار رکھیں
- پیشہ ورانہ صحافتی زبان استعمال کریں
- معلومات کی درستگی کی تصدیق کریں
- مواد کو قارئین کے لیے دلچسپ بنائیں

نتیجہ صرف JSON فارمیٹ میں واپس کریں۔`,
    };

    // Migrated from gpt-5 to gpt-5.1
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPTS[language],
        },
        {
          role: "user",
          content: text.substring(0, 4000),
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    console.log("[Content Improver] Content improved successfully");
    console.log("[Content Improver] Suggested title:", result.suggestedTitle?.substring(0, 50));
    
    return {
      correctedText: result.correctedText || text,
      suggestedTitle: result.suggestedTitle || "",
      suggestedExcerpt: result.suggestedExcerpt || "",
      suggestedCategory: result.suggestedCategory || "عام",
      seoKeywords: result.seoKeywords || [],
    };
  } catch (error) {
    console.error("[Content Improver] Error improving content:", error);
    throw new Error("Failed to improve content");
  }
}

export async function detectLanguage(text: string): Promise<"ar" | "en" | "ur"> {
  try {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const urduChars = (text.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    // Return proper language codes
    if (arabicChars > englishChars && arabicChars > urduChars) {
      console.log("[Language Detector] Detected: Arabic (ar)");
      return "ar";
    }
    if (urduChars > arabicChars && urduChars > englishChars) {
      console.log("[Language Detector] Detected: Urdu (ur)");
      return "ur";
    }
    console.log("[Language Detector] Detected: English (en)");
    return "en";
  } catch (error) {
    console.error("[Language Detector] Error detecting language:", error);
    return "ar"; // Default to Arabic
  }
}

/**
 * Normalize language code to ensure it's one of the supported values
 */
export function normalizeLanguageCode(lang: string): "ar" | "en" | "ur" {
  const normalized = lang.toLowerCase().trim();
  
  if (normalized === "ar" || normalized === "arabic" || normalized === "ara") {
    return "ar";
  }
  if (normalized === "en" || normalized === "english" || normalized === "eng") {
    return "en";
  }
  if (normalized === "ur" || normalized === "urdu" || normalized === "urd") {
    return "ur";
  }
  
  console.warn("[Language Normalizer] Unknown language code:", lang, "- defaulting to 'ar'");
  return "ar"; // Default to Arabic
}

/**
 * Generate SEO-optimized alt text for WhatsApp images
 * @param articleTitle - The title of the article
 * @param articleLead - The lead/excerpt of the article
 * @param imageIndex - The index of the image (0 for first, 1 for second, etc.)
 * @param language - The language of the article
 * @returns altText (max 125 chars) and captionHtml
 */
export async function generateImageAltText(
  articleTitle: string,
  articleLead: string,
  imageIndex: number = 0,
  language: "ar" | "en" | "ur" = "ar"
): Promise<{ altText: string; captionHtml: string }> {
  try {
    console.log(`[AI Image Alt] Generating alt text for image #${imageIndex + 1}, language: ${language}`);
    
    const PROMPTS = {
      ar: `أنت خبير في SEO وإمكانية الوصول (Accessibility) للمواقع الإخبارية.

المهمة: إنشاء نص بديل (Alt Text) ووصف مختصر للصورة المرفقة مع الخبر التالي:

📰 **عنوان الخبر:**
${articleTitle}

📝 **مقدمة الخبر:**
${articleLead}

🖼️ **رقم الصورة:** ${imageIndex === 0 ? 'الأولى (الرئيسية)' : `الصورة رقم ${imageIndex + 1}`}

✅ **المطلوب:**
1. **Alt Text** (نص بديل للصورة):
   - يجب ألا يتجاوز 125 حرفاً (WCAG AA)
   - يصف محتوى الصورة بدقة
   - يتضمن كلمات مفتاحية من العنوان
   - مناسب لقارئات الشاشة
   - بدون "صورة لـ" أو "تظهر" (ابدأ مباشرة بالوصف)

2. **Caption** (تعليق على الصورة):
   - جملة واحدة أو جملتين قصيرتين (max 200 حرف)
   - تُضيف سياقاً للصورة
   - مرتبطة بموضوع الخبر

🎯 **أمثلة:**
- إذا كان الخبر عن حادث مروري → Alt: "سيارة متضررة بعد حادث مروري على طريق الرياض جدة"
- إذا كان عن افتتاح مشروع → Alt: "ولي العهد يقص شريط افتتاح مشروع نيوم"
- إذا كان عن مؤتمر صحفي → Alt: "وزير الخارجية خلال مؤتمر صحفي بالرياض"

⚠️ **قواعد إلزامية:**
- لا تذكر "صورة" أو "تظهر" في بداية Alt Text
- استخدم لغة عربية فصيحة واضحة
- ركز على المحتوى البصري المتوقع
- لا تكرر العنوان حرفياً

📤 **الإخراج (JSON فقط):**
\`\`\`json
{
  "altText": "نص بديل مختصر (max 125 حرف)",
  "captionHtml": "تعليق قصير على الصورة"
}
\`\`\``,
      en: `You are an SEO and Accessibility expert for news websites.

Task: Create alt text and a brief caption for the image attached to this news article:

📰 **Article Title:**
${articleTitle}

📝 **Article Lead:**
${articleLead}

🖼️ **Image Number:** ${imageIndex === 0 ? 'First (Main)' : `Image #${imageIndex + 1}`}

✅ **Requirements:**
1. **Alt Text**:
   - Max 125 characters (WCAG AA)
   - Accurately describes the image content
   - Includes keywords from the title
   - Suitable for screen readers
   - Don't start with "Image of" or "Shows" (start directly with description)

2. **Caption**:
   - One or two short sentences (max 200 chars)
   - Adds context to the image
   - Related to the news topic

🎯 **Examples:**
- Traffic accident news → Alt: "Damaged car after accident on Riyadh-Jeddah highway"
- Project opening → Alt: "Crown Prince cuts ribbon at NEOM project opening"
- Press conference → Alt: "Foreign Minister during press conference in Riyadh"

⚠️ **Mandatory Rules:**
- Don't start with "Image" or "Shows"
- Use clear, professional language
- Focus on expected visual content
- Don't repeat the title verbatim

📤 **Output (JSON only):**
\`\`\`json
{
  "altText": "brief alt text (max 125 chars)",
  "captionHtml": "short image caption"
}
\`\`\``,
      ur: `آپ خبروں کی ویب سائٹس کے لیے SEO اور رسائی (Accessibility) کے ماہر ہیں۔

کام: اس خبر کے ساتھ منسلک تصویر کے لیے Alt Text اور مختصر تفصیل بنائیں:

📰 **خبر کا عنوان:**
${articleTitle}

📝 **خبر کا تعارف:**
${articleLead}

🖼️ **تصویر نمبر:** ${imageIndex === 0 ? 'پہلی (مرکزی)' : `تصویر #${imageIndex + 1}`}

✅ **ضروریات:**
1. **Alt Text**:
   - زیادہ سے زیادہ 125 حروف (WCAG AA)
   - تصویر کے مواد کی درست وضاحت
   - عنوان سے کلیدی الفاظ شامل کریں
   - اسکرین ریڈرز کے لیے موزوں
   - "تصویر" یا "ظاہر" سے شروع نہ کریں

2. **Caption**:
   - ایک یا دو مختصر جملے (زیادہ سے زیادہ 200 حروف)
   - تصویر کا سیاق و سباق
   - خبر کے موضوع سے متعلق

📤 **آؤٹ پٹ (صرف JSON):**
\`\`\`json
{
  "altText": "مختصر alt text (max 125 chars)",
  "captionHtml": "تصویر کی مختصر تفصیل"
}
\`\`\``
    };

    const prompt = PROMPTS[language];
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert in generating SEO-optimized, accessible alt text for news images." },
        { role: "user", content: prompt }
      ],
      max_completion_tokens: 300,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const result = JSON.parse(content);
    
    // Validate alt text length (max 125 chars for WCAG AA)
    let altText = result.altText || "صورة توضيحية للخبر";
    if (altText.length > 125) {
      altText = altText.substring(0, 122) + "...";
    }
    
    const captionHtml = result.captionHtml || "";
    
    console.log(`[AI Image Alt] Generated alt text (${altText.length} chars): ${altText}`);
    
    return { altText, captionHtml };
  } catch (error) {
    console.error("[AI Image Alt] Error generating alt text:", error);
    
    // Fallback to generic alt text based on language
    const fallbacks = {
      ar: { altText: "صورة توضيحية للخبر", captionHtml: "" },
      en: { altText: "Illustrative image for the news", captionHtml: "" },
      ur: { altText: "خبر کی وضاحتی تصویر", captionHtml: "" }
    };
    
    return fallbacks[language];
  }
}
