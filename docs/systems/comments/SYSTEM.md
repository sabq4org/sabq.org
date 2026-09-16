# التعليقات والتفاعل (`comments`)

> آخر مراجعة: 2026-08-01 | المالك: engagement

## الغرض
تعليقات المقالات/المواضيع، تفاعلات، إشراف آلي، وتحليل مشاعر التعليقات.

## مفاتيح AI (حصرية)
`comment-moderation`, `sentiment-analysis`

## نقاط الدخول
- AI: `server/ai/commentModeration.ts`, `server/sentiment-analyzer.ts`, `server/services/commentInsightsService.ts`
- API: `server/routes/commentModeration.ts` → `/api/moderation/*` (مُقفل كاملاً بـ `requireModeratorAuth`)
- لوحات: `/dashboard/ai-moderation` (`AIModerationDashboard`), `/dashboard/sentiment-insights` (`SentimentInsights`)
- بحث متقدم: `client/src/components/ModerationAdvancedSearch.tsx`

## عقود مهمة
- المفتاح الحقيقي هو `comment-moderation` (وليس `comments.moderation`).
- Rate limit للكتابة المجهولة — احترم `X-Sabq-Client-IP`.
- **صلاحية الوصول للوحة/API:** `comments.view` عبر `userHasPermission` (يشمل اختصار SUPERUSER بما فيه `system_admin`)، مع سقوط خلفي على أدوار المحرر/مشرف التعليقات. لا تعتمد قائمة أدوار ناقصة بدون `system_admin` — كانت تسبب 403 صامت والواجهة تبدو فارغة رغم ظهور العنصر في الشريط الجانبي.

## Gotchas
- `SelectItem value=""` ممنوع في Radix — استخدم `all` ثم حوّله لفلتر فارغ.
- استعلامات النتائج المخصّصة يجب أن تستخدم `apiUrl()` + `credentials: "include"` و`Array.isArray`.
- عند فشل `/api/moderation/*` اعرض خطأ عربي + إعادة محاولة؛ لا تترك هيكل عظمي إلى الأبد.

## عند التعديل
- [x] قرأت هذا الملف
