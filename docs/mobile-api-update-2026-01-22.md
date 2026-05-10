# تحديث Mobile API - إصلاح الصور المرفقة للبريد الذكي

**التاريخ:** ٢٢ يناير ٢٠٢٦  
**الأولوية:** متوسطة  
**الإجراء المطلوب:** لا يوجد تغيير في كود التطبيق

---

## المشكلة المُصلحة

المقالات المُنشأة عبر نظام **البريد الذكي (Email Agent)** كانت لا تُظهر الصور المرفقة في التطبيق.

**السبب:** الـ API كان يقرأ فقط من العمود القديم `album_images` الذي يكون فارغاً للمقالات الجديدة.

---

## التغيير التقني

الـ API `/api/v1/articles/:id` الآن يقرأ الصور من **مصدرين**:

| المصدر | الاستخدام |
|--------|-----------|
| `album_images` column | المقالات القديمة (النظام التقليدي) |
| `article_media_assets` table | المقالات الجديدة (البريد الذكي) |

---

## اختبار التغيير

### مقال اختباري من البريد الذكي:
```
GET https://sabq.org/api/v1/articles/rJPBU_KXr4UR10VkEtimV
```

### النتيجة المتوقعة:
```json
{
  "id": "rJPBU_KXr4UR10VkEtimV",
  "title": "مركز الملك سلمان للإغاثة يوفر مأوى وعونًا لعائلة نازحة وسط غزة",
  "albumImages": [
    "https://sabq.org/api/public-media/public/email-attachments/ojjaeYWGxTTdOATrv4fHQ.webp",
    "https://sabq.org/api/public-media/public/email-attachments/OMEKGRSdowT5mDt5t2NZl.webp",
    "https://sabq.org/api/public-media/public/email-attachments/zmLiG3OQ7Zb165vkrZiqZ.webp",
    "https://sabq.org/api/public-media/public/email-attachments/l4KSD-yVrAR3gy3RhmShw.webp"
  ],
  "images": [
    {
      "url": "https://sabq.org/api/public-media/public/email-attachments/ojjaeYWGxTTdOATrv4fHQ.webp",
      "caption": "مركز الملك سلمان للإغاثة يوفر مأوى وعونًا لعائلة نازحة وسط غزة",
      "copyright": "© صحيفة سبق"
    },
    {
      "url": "https://sabq.org/api/public-media/public/email-attachments/ojjaeYWGxTTdOATrv4fHQ.webp",
      "caption": "صورة مركز الملك سلمان للإغاثة يوفر مأوى وعونًا لعائلة",
      "copyright": "© صحيفة سبق"
    },
    {
      "url": "https://sabq.org/api/public-media/public/email-attachments/OMEKGRSdowT5mDt5t2NZl.webp",
      "caption": "لبّى مركز الملك سلمان للإغاثة - صورة 2",
      "copyright": "© صحيفة سبق"
    },
    {
      "url": "https://sabq.org/api/public-media/public/email-attachments/zmLiG3OQ7Zb165vkrZiqZ.webp",
      "caption": "لبّى مركز الملك سلمان للإغاثة - صورة 3",
      "copyright": "© صحيفة سبق"
    },
    {
      "url": "https://sabq.org/api/public-media/public/email-attachments/l4KSD-yVrAR3gy3RhmShw.webp",
      "caption": "لبّى مركز الملك سلمان للإغاثة - صورة 4",
      "copyright": "© صحيفة سبق"
    }
  ]
}
```

---

## الإجراء المطلوب من مبرمج التطبيق

**لا يوجد تغيير مطلوب في كود التطبيق.**

بنية البيانات لم تتغير:
- `albumImages`: مصفوفة روابط الصور (array of strings)
- `images`: مصفوفة كائنات الصور مع التسميات التوضيحية

التطبيق سيعرض الصور المرفقة تلقائياً الآن لجميع المقالات.

---

## ملاحظات إضافية

- التغيير متوافق مع الإصدارات السابقة (backward compatible)
- المقالات القديمة تعمل كما كانت سابقاً
- المقالات الجديدة من البريد الذكي ستعرض صورها بشكل صحيح
- الـ `images` array يتضمن `caption` من حقل `alt_text` للصور الجديدة
