# Nano Banana Pro Integration Guide

## Overview
تكامل **Gemini 3 Pro Image (Nano Banana Pro)** لتوليد صور احترافية عالية الجودة باستخدام الذكاء الاصطناعي داخل منصة سبق الإخبارية الذكية.

## Features
- ✨ توليد صور بجودة 1K/2K/4K
- 🎨 دعم نسب عرض متعددة (16:9, 1:1, 4:3, 9:16, 21:9)
- 🧠 وضع التفكير المتقدم (Thinking Mode)
- 🔍 البحث في Google للحصول على معلومات دقيقة
- 💾 حفظ تلقائي في Google Cloud Storage
- 📊 تتبع التكلفة ووقت التوليد
- 🔄 إعادة المحاولة التلقائية عند فشل الطلب

## Setup

### 1. Environment Variables
يجب إضافة المتغيرات التالية:

```bash
# Gemini API Key (required)
GEMINI_API_KEY=your_gemini_api_key

# Google Cloud Storage Bucket (required)
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your_bucket_name
```

### 2. Get Gemini API Key
1. اذهب إلى https://ai.google.dev/gemini-api/docs/api-key
2. اضغط على "Get API Key"
3. أنشئ مشروع جديد أو اختر مشروع موجود
4. انسخ الـ API Key

⚠️ **Note:** Nano Banana Pro يتطلب Billing Account مفعّل في Google Cloud

### 3. Database Schema
الجدول `ai_image_generations` تم إنشاؤه تلقائياً ويحتوي على:
- معلومات البرومبت والإعدادات
- حالة التوليد (pending, processing, completed, failed)
- رابط الصورة المولدة
- بيانات التكلفة ووقت التوليد
- معلومات الخطأ في حالة الفشل

## API Endpoints

### Generate Image
```http
POST /api/nano-banana/generate
Authorization: Required

Body:
{
  "prompt": "A professional news image showing...",
  "negativePrompt": "low quality, blurry",
  "aspectRatio": "16:9",
  "imageSize": "2K",
  "enableThinking": true,
  "enableSearchGrounding": false,
  "articleId": "optional-article-id"
}

Response:
{
  "message": "تم توليد الصورة بنجاح",
  "generationId": "uuid",
  "imageUrl": "https://storage.googleapis.com/...",
  "thumbnailUrl": "https://storage.googleapis.com/...",
  "generationTime": 15,
  "cost": 0.134
}
```

### List Generations
```http
GET /api/nano-banana/generations?limit=20&offset=0&status=completed
Authorization: Required

Response:
{
  "generations": [...],
  "count": 20
}
```

### Get Statistics
```http
GET /api/nano-banana/stats
Authorization: Required

Response:
{
  "total": 100,
  "completed": 95,
  "failed": 3,
  "processing": 2,
  "totalCost": 13.40,
  "avgGenerationTime": 12
}
```

### Delete Generation
```http
DELETE /api/nano-banana/generations/:id
Authorization: Required
```

## Frontend Usage

### Access Image Studio
الوصول عبر لوحة التحكم iFox Admin:
```
/dashboard/admin/ifox/image-studio
```

### Features
- نموذج توليد تفاعلي مع معاينة فورية
- معرض الصور المولدة مع تحديث تلقائي
- إحصائيات الاستخدام والتكلفة
- تحميل الصور وحذفها
- ربط الصور بالمقالات (قريباً)

## Pricing
حسب أسعار Google (November 2025):
- **1K/2K:** $0.134 per image
- **4K:** $0.24 per image

## Best Practices

### Writing Prompts
```
✅ Good:
"Create a professional news photo of a modern newsroom with journalists working on computers, bright lighting, clean composition, 4K quality"

❌ Bad:
"newsroom"
```

### Using Negative Prompts
```
✅ Good:
"low quality, blurry, distorted, watermark, text overlay"
```

### When to Use Search Grounding
استخدم البحث في Google عند:
- توليد إنفوجرافيك بمعلومات دقيقة
- إنشاء صور لأحداث حالية
- الحاجة لبيانات واقعية محدثة

### When to Use Thinking Mode
يُفعّل افتراضياً ويُنصح به لـ:
- الصور المعقدة متعددة العناصر
- التركيبات الإبداعية
- الحاجة لجودة عالية

## Error Handling
النظام يتعامل تلقائياً مع:
- **Rate Limits:** إعادة محاولة تلقائية مع exponential backoff
- **Network Errors:** 5 محاولات كحد أقصى
- **Invalid Prompts:** رسائل خطأ واضحة

## Limitations
- حد أقصى 4 صور في الطلب الواحد
- حد أقصى 14 صورة مرجعية
- وقت التوليد: 10-30 ثانية للصور عالية الجودة
- البرومبت: 5000 حرف كحد أقصى

## Security
- ✅ جميع الـ endpoints محمية بـ authentication
- ✅ الصور مرتبطة بالمستخدم
- ✅ التحقق من صحة البيانات عبر Zod
- ✅ التحكم في الوصول عبر RBAC

## Troubleshooting

### "GEMINI_API_KEY is not set"
```bash
# تأكد من إضافة المفتاح في Replit Secrets
echo $GEMINI_API_KEY
```

### "Image generation failed"
- تحقق من صحة API Key
- تأكد من تفعيل Billing في Google Cloud
- تحقق من صحة البرومبت

### "Upload failed"
- تأكد من إعداد Google Cloud Storage بشكل صحيح
- تحقق من صلاحيات الـ bucket

## Future Enhancements
- [ ] دعم تعديل الصور (image-to-image)
- [ ] ربط مباشر مع محرر المقالات
- [ ] معرض صور جاهزة للاستخدام
- [ ] توليد thumbnails تلقائياً
- [ ] دعم batch generation
- [ ] تصدير الصور بصيغ متعددة

## Support
للمساعدة أو الإبلاغ عن مشاكل، تواصل مع فريق التطوير.
