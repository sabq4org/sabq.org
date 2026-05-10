# توليد صورة الخبر بالذكاء الاصطناعي

## الملفات المصدرية

| الملف | الوظيفة |
|-------|---------|
| `server/services/visualAiService.ts` | الخدمة الرئيسية — توليد وتحليل الصور |
| `server/services/nanoBananaService.ts` | المحرك الفعلي لتوليد الصور (Gemini) |
| `server/services/autoImageGenerationService.ts` | التوليد التلقائي عند حفظ الخبر |
| `server/services/aiSmartThumbnailService.ts` | توليد صورة مصغرة ذكية من صورة موجودة |
| `server/services/aiImageGenerator.ts` | واجهة التوليد للمهام المجدولة |

---

## النموذج المستخدم

| الخدمة | النموذج | مفتاح API |
|--------|---------|-----------|
| توليد الصور | `gemini-3-pro-image-preview` | `GEMINI_API_KEY` أو `AI_INTEGRATIONS_GEMINI_API_KEY` |
| تحليل الصور | `gemini-3-pro-image-preview` | نفس المفتاح |
| وصف الصورة الأصلية (Thumbnail) | `gemini-3-pro` | نفس المفتاح |

**المحاولات عند الفشل:** 5 محاولات تلقائية (backoff أسي: 3s → 6s → 12s → 24s → 30s)
**التكلفة التقديرية:** $0.134 للصورة 2K / $0.24 للصورة 4K

---

## 1. توليد صورة الخبر الرئيسية — `generateNewsImage`

**الملف:** `server/services/visualAiService.ts` (السطر 343)
**يُستدعى من:** `autoImageGenerationService.ts` و `aiImageGenerator.ts`

### البرومبت المُولَّد تلقائياً:

```
Create a professional news image for this article:
Title: {articleTitle}
Summary: {articleSummary}
Category: {category}
Language: {Arabic/Urdu/English} news context

Style: {styleGuide}
Mood: {moodGuide}

CRITICAL REQUIREMENTS:
- ABSOLUTELY NO TEXT, LETTERS, WORDS, NUMBERS, CHARACTERS, OR TYPOGRAPHY
  OF ANY KIND IN THE IMAGE
- NO Arabic text, NO English text, NO text in any language whatsoever
- NO watermarks, NO logos, NO signs with writing, NO banners with text
- NO newspapers, books, or any objects containing visible text
- The image must be 100% text-free and purely visual
- High quality, suitable for news publication
- Culturally appropriate for {languageContext}
- Professional and credible
- 16:9 aspect ratio
- Focus on visual storytelling through imagery only
- Clean, modern composition with no textual elements
```

### خيارات الأسلوب (style):

| القيمة | الوصف |
|--------|-------|
| `photorealistic` | professional photojournalism style, high quality, realistic |
| `illustration` | modern digital illustration, clean and professional |
| `abstract` | abstract artistic representation, contemporary design |
| `infographic` | infographic style, data visualization, modern design |

### خيارات المزاج (mood):

| القيمة | الوصف |
|--------|-------|
| `breaking` | dramatic, urgent, attention-grabbing |
| `neutral` | balanced, professional, informative |
| `positive` | uplifting, bright, optimistic |
| `serious` | serious tone, professional, authoritative |
| `dramatic` | high contrast, dramatic lighting, impactful |

### إعدادات الاستدعاء:

```typescript
generateImage({
  prompt,
  aspectRatio: "16:9",
  imageSize: "2K",
  numImages: 1,
  enableSearchGrounding: true,  // Google Search للدقة الصحفية
  enableThinking: true
})
```

---

## 2. التوليد التلقائي عند حفظ الخبر — `autoGenerateImage`

**الملف:** `server/services/autoImageGenerationService.ts`

### شروط التشغيل التلقائي:

```
✅ يُولَّد تلقائياً إذا:
  - الخيار مفعّل في لوحة الإعدادات (enabled: true)
  - نوع الخبر ضمن القائمة المسموح بها (articleTypes)
  - التصنيف ليس في قائمة الاستثناء (skipCategories)
  - لم يُتجاوز الحد الشهري (maxMonthlyGenerations)
  - الخبر لا يحتوي صورة رئيسية أصلاً
```

### الإعدادات الافتراضية:

```json
{
  "enabled": false,
  "articleTypes": ["news", "analysis"],
  "skipCategories": [],
  "defaultStyle": "photorealistic",
  "provider": "nano-banana",
  "autoPublish": false,
  "generateOnSave": false,
  "maxMonthlyGenerations": 100,
  "currentMonthGenerations": 0
}
```

### برومبت الاحتياطي (عند عدم وجود قالب مخصص):

```
Professional news image for article titled: "{title}"
Category: {category}
Summary: {excerpt}
Key points: {keyPoints}

Style requirements:
- Professional journalism quality
- Culturally appropriate for Arabic/English/Urdu audience
- Modern, clean composition
- No text or watermarks
- Suitable for news publication
- Visually engaging and relevant to the topic
```

> يمكن تخصيص القالب بالكامل من الإعدادات باستخدام متغيرات:
> `{title}` / `{category}` / `{excerpt}`

---

## 3. الصورة المصغرة الذكية — `generateSmartThumbnail`

**الملف:** `server/services/aiSmartThumbnailService.ts`
**يُستدعى عند:** الضغط على زر "صورة مصغرة ذكية" في محرر الخبر

### الخطوة 1 — تحليل الصورة الأصلية (Gemini 3 Pro):

```
Analyze this image and provide a detailed description focusing on:
1. Main subject and composition
2. Key visual elements and colors
3. Mood and atmosphere
4. Important details that should be preserved

Provide only the description, no other text.
```

### الخطوة 2 — توليد الصورة المصغرة (Gemini 3 Pro Image):

```
Create a professional 16:9 news thumbnail based on this description:

{imageDescription}

Article title: {articleTitle}
Context: {articleExcerpt}

Style: {stylePrompt}

Requirements:
- 16:9 aspect ratio optimized for news cards
- Clear focal point and strong composition
- High visual impact suitable for thumbnails
- Professional news photography quality
- Preserve the essence and key elements of the original
- Suitable for Arabic news platform (RTL context)
- No text or watermarks in the image

Create a compelling thumbnail that captures attention while maintaining
journalistic integrity.
```

### خيارات الأسلوب (style):

| القيمة | الوصف |
|--------|-------|
| `professional` | professional news photography, clean, high-quality photojournalism |
| `vibrant` | vibrant colors, dynamic, eye-catching, energetic |
| `minimal` | minimal design, clean lines, focused subject, modern aesthetic |
| `news` *(افتراضي)* | professional news style, clear focal point, informative |
| `modern` | modern editorial, contemporary, sophisticated composition |

---

## 4. تحسين البرومبت — `enhancePrompt`

**الملف:** `server/services/imageGenerationService.ts`
**النموذج:** `gemini-2.5-flash-preview-05-20`

يُستخدم لإثراء البرومبت تلقائياً قبل إرساله لنموذج التوليد:

```
Enhance this image generation prompt to be more detailed and visually
descriptive. Keep it concise but add visual details like style, lighting,
colors, and composition.

Original prompt: {prompt}

Enhanced prompt (max 200 chars):
```

---

## 5. تحليل الصورة الموجودة — `analyzeImage`

**الملف:** `server/services/visualAiService.ts` (السطر 126)
**النموذج:** `gemini-3-pro-image-preview`
**درجة الحرارة:** `0.2` (JSON ثابت ومتسق)

### البرومبت الشامل (يُبنى ديناميكياً حسب الخيارات):

```
قم بتحليل هذه الصورة بشكل شامل واحترافي:

[إذا checkQuality=true]:
تحليل جودة الصورة:
- قيّم الدقة والوضوح: ممتاز/جيد/مقبول/ضعيف
- قيّم الإضاءة: ممتاز/جيد/مقبول/ضعيف
- قيّم التكوين والتأطير: ممتاز/جيد/مقبول/ضعيف
- اذكر أي مشاكل في الجودة
- أعط درجة إجمالية من 0-100

[إذا detectContent=true]:
اكتشاف المحتوى:
- اذكر جميع الأشياء/الأشخاص/الأماكن الظاهرة
- حدد الألوان السائدة (hex codes)
- اقترح tags وصفية للصورة
- حدد إذا كان هناك محتوى حساس

[إذا generateAltText=true]:
توليد Alt Text بثلاث لغات:
- عربي: وصف دقيق ومختصر (25-50 كلمة)
- English: Precise and concise description (25-50 words)
- اردو: ایک درست اور مختصر تفصیل (25-50 الفاظ)

[إذا checkRelevance=true]:
تحليل مطابقة الصورة للمقال:
عنوان المقال: {articleTitle}
- قيّم مدى ملائمة الصورة للمقال (0-100)
- اقترح نوع صور أفضل إن كانت غير مناسبة
```

### Output JSON:

```json
{
  "qualityScore": 85,
  "qualityMetrics": {
    "resolution": "1920x1080",
    "sharpness": "excellent",
    "lighting": "good",
    "composition": "excellent",
    "issues": []
  },
  "contentDescription": {
    "ar": "...",
    "en": "...",
    "ur": "..."
  },
  "detectedObjects": ["person", "building"],
  "dominantColors": ["#FF5733", "#3498DB"],
  "tags": ["technology", "news"],
  "altTextAr": "...",
  "altTextEn": "...",
  "altTextUr": "...",
  "hasAdultContent": false,
  "hasSensitiveContent": false,
  "contentWarnings": [],
  "relevanceScore": 90,
  "matchingSuggestions": []
}
```

---

## تدفق التوليد الكامل

```
[محرر الخبر]
       │
       ├─► زر "توليد صورة AI"  (يدوي)
       │        │
       │        └─► generateNewsImage()
       │                 │
       │                 ├─► بناء البرومبت (عنوان + ملخص + تصنيف + أسلوب + مزاج)
       │                 ├─► Gemini 3 Pro Image (16:9 / 2K / Search Grounding)
       │                 │        5 محاولات تلقائية عند الفشل
       │                 ├─► استخراج base64 من الاستجابة (6 طرق احتياطية)
       │                 ├─► sharp: تحويل WebP + ضغط 85% + thumbnail 640×360
       │                 └─► رفع على Object Storage → /api/public-media/...
       │
       ├─► زر "صورة مصغرة ذكية"  (من صورة موجودة)
       │        │
       │        ├─► analyzeImage() → Gemini 3 Pro (تحليل الصورة الأصلية)
       │        ├─► generateSmartThumbnail() → Gemini 3 Pro Image
       │        └─► رفع على Object Storage → /public-objects/ai-thumbnails/...
       │
       └─► عند الحفظ (تلقائي إذا مفعّل)
                │
                ├─► التحقق من الشروط (enabled / articleType / category / حد شهري)
                ├─► generateSmartPrompt() → برومبت من العنوان والملخص
                └─► generateNewsImage() → نفس التدفق أعلاه
```

---

## معالجة الأخطاء والرسائل العربية

| سبب الفشل | الرسالة |
|-----------|---------|
| `SAFETY` | تم رفض الطلب لأسباب تتعلق بسياسة المحتوى. حاول تعديل الوصف |
| `RECITATION` | تعذر إنشاء الصورة لأن الطلب قد يحتوي على محتوى محمي بحقوق النشر |
| `OTHER / STOP` | لم يتمكن النموذج من إنشاء صورة لهذا الطلب. جرب وصفاً مختلفاً |
| لا محتوى | لم يُرجع النموذج أي محتوى. قد يكون الطلب غير مناسب |

---

## مسار الحفظ في Object Storage

```
الصور المُولَّدة:    /public/ai-generated/{name}_{timestamp}.webp
الصور المصغرة:      /public/ai-generated/{name}_{timestamp}_thumb.webp
Thumbnails ذكية:    /public/ai-thumbnails/smart_thumbnail_{timestamp}.jpg
```

### التحسين التلقائي بـ sharp:

| العملية | التفاصيل |
|---------|----------|
| تحويل الصيغة | PNG أصلي → WebP |
| جودة الصورة الرئيسية | 85% |
| حجم الـ thumbnail | 640×360 (16:9) |
| جودة الـ thumbnail | 80% |
| Blur placeholder | 20px عرض / blur(2) / جودة 20% → base64 data URL |
| التوفير المتوسط | 30-50% من حجم الملف |
