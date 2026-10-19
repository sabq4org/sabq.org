# التعليقات والتفاعل (`comments`)

> آخر مراجعة: 2026-10-19 | المالك: engagement

## الغرض
تعليقات المقالات/المواضيع، تفاعلات، إشراف آلي، وتحليل مشاعر التعليقات.

## مفاتيح AI (حصرية)
`comment-moderation`, `sentiment-analysis`

## نقاط الدخول
- AI: `server/ai/commentModeration.ts`, `server/sentiment-analyzer.ts`, `server/services/commentInsightsService.ts`
- API: `server/routes/commentModeration.ts` → `/api/moderation/*` (مُقفل كاملاً بـ `requireModeratorAuth`)
- لوحات: `/dashboard/ai-moderation` (`AIModerationDashboard`), `/dashboard/sentiment-insights` (`SentimentInsights`)
- بحث متقدم: `client/src/components/ModerationAdvancedSearch.tsx`
- إبلاغ وحظر للجوال (بند أبل 1.2): `server/routes/commentSafetyMobile.ts` → `POST /api/v1/comments/:id/report`، `GET|POST /api/v1/members/blocks`، `DELETE /api/v1/members/blocks/:userId`؛ المنطق في `server/services/commentSafetyService.ts`؛ الجدولان `comment_reports` و`user_blocks` (`migrations/20261019_comment_reports_user_blocks.sql`). واجهة iOS: `CommentSafetyStore.swift`، قائمة «⋯» في `CommentRow.swift`، `Settings/BlockedUsersView.swift`.
- فحص الاسم والنبذة قبل حفظ الملف من الجوال: `server/routes/mobileAccountHooks.ts` (يُركَّب قبل `mobileApiRoutes` في `server/index.ts`).

## عقود مهمة
- المفتاح الحقيقي هو `comment-moderation` (وليس `comments.moderation`).
- Rate limit للكتابة المجهولة — احترم `X-Sabq-Client-IP`.
- **صلاحية الوصول للوحة/API:** `comments.view` عبر `userHasPermission` (يشمل اختصار SUPERUSER بما فيه `system_admin`)، مع سقوط خلفي على أدوار المحرر/مشرف التعليقات. لا تعتمد قائمة أدوار ناقصة بدون `system_admin` — كانت تسبب 403 صامت والواجهة تبدو فارغة رغم ظهور العنصر في الشريط الجانبي.

- **البلاغ يسحب التعليق فورًا:** أول بلاغ على تعليق `approved` يحوّله إلى `flagged` فيختفي من العرض العام ويظهر في تبويب «مُبلَّغ عنها» (`CommentsModeration.tsx`)، و`moderationReason` = «بلاغ قارئ: …». المشرف يعيد اعتماده أو يرفضه. حد 20 بلاغًا لكل قارئ في 24 ساعة. شروط الاستخدام في التطبيق تعِد بالمراجعة خلال 24 ساعة.
- **الحظر محلي العرض:** قائمة التعليقات العامة محايدة ومخزّنة 15ث، فالتطبيق يُخفي تعليقات المحظورين بنفسه من قائمة `/members/blocks`. الويب وأندرويد لم يضيفا الإبلاغ والحظر بعد.

## Gotchas
- `SelectItem value=""` ممنوع في Radix — استخدم `all` ثم حوّله لفلتر فارغ.
- استعلامات النتائج المخصّصة يجب أن تستخدم `apiUrl()` + `credentials: "include"` و`Array.isArray`.
- عند فشل `/api/moderation/*` اعرض خطأ عربي + إعادة محاولة؛ لا تترك هيكل عظمي إلى الأبد.

## عند التعديل
- [x] قرأت هذا الملف
