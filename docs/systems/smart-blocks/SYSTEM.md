# البلوكات الذكية / مسرح الصفحة (`smart-blocks`)

> آخر مراجعة: 2026-07-19 | المالك: فريق التحرير / المنصة

## الغرض

إدارة **مشاهد تحريرية حية** على الصفحة الرئيسية (عربي / إنجليزي / أردو): مصدر محتوى، موضع، شكل عرض، جدولة، ترتيب، وسيناريوهات صفحة — بدل قائمة CRUD بكلمة مفتاحية فقط.

## الحدود (In / Out of scope)

- داخل النطاق:
  - جداول `smart_blocks` / `en_smart_blocks` / `ur_smart_blocks`
  - API تحت `/api/smart-blocks` و`/api/en|ur/smart-blocks`
  - مكوّنات العرض `SmartNewsBlock` (+ EN/UR)
  - لوحة `/dashboard/smart-blocks` (مسرح الصفحة)
  - ربط الصفحة الرئيسية العربية `Home.tsx`
- خارج النطاق:
  - بلوك الحج `hajj_block_config` (نظام موسمي منفصل)
  - Quad Categories / PersonalizedFeed
  - تطبيقات الموبايل (لا تستهلك البلوكات حالياً)

## نقاط الدخول

| الطبقة | المسار |
|--------|--------|
| Backend service | `server/services/smartBlocksService.ts` |
| Backend routes | `server/routes/smartBlocks.ts` (مسجّل في `splitRoutesIndex.ts` قبل معالجات `routes.ts` القديمة) |
| Schema | `shared/schema.ts` → `smartBlocks` / `enSmartBlocks` / `urSmartBlocks` |
| Web dashboard | `client/src/pages/dashboard/SmartBlocksPage.tsx` |
| Web home (AR) | `client/src/pages/Home.tsx` + `client/src/components/SmartNewsBlock.tsx` |
| Web home (EN/UR) | `EnglishHome.tsx` / `ur/Home.tsx` + مكوّنات EN/UR |

## عقود مهمة / Gotchas

1. **الأعمدة الجديدة additive**: `sortOrder`, `sourceType`, `subtitle`, `keywords`, `pinnedArticleIds`, `scheduleStartAt/EndAt`, `lookbackHours`, `minArticles`, `playbook` (+ `backgroundColor` على EN/UR). يلزم `db:push` على staging/prod عبر المسار الآمن.
2. **أداء DB (حرج):** الصفحة الرئيسية تستخدم **`GET /api/smart-blocks/homepage`** فقط (حزمة واحدة + مقالات مضمّنة). ممنوع إعادة نمط N+1 (قائمة لكل موضع + طلب مقالات لكل بلوك).
3. **كاش SWR** تحت مفاتيح `blocks:smart:*` (TTL = `CACHE_TTL.SMART_BLOCKS` = دقيقتان + stale). يُبطَل عند CRUD البلوكات، وعند نشر المقالات عبر `invalidatePattern('^blocks:')`.
4. **بحث رخيص:** `seo.keywords @>` + `title ILIKE` فقط، مع **lookback افتراضي** (14 يوماً للكلمة، 48س للترند، …) وسقف 8 بلوكات / 3 لكل موضع. لا تُعِد `EXISTS` على الوسوم أو `ILIKE` على المقتطف في المسار العام.
5. **الكلمة المفتاحية داخلية**: لا تُعرض للقارئ؛ استخدم `subtitle` للوصف الظاهر.
6. **الجدولة + `minArticles`**: المشهد يختفي من الواجهة إن خارج النافذة أو قلّت المقالات عن الحد.
7. **المسار `/:id/articles`**: مُكاشَة (SWR)؛ `/homepage` للواجهة العامة؛ `/preview` للوحة فقط بلا كاش.
8. **المخرج الذكي**: اقتراحات هيوريستية من نشاط 24 ساعة — ليست استدعاء LLM؛ موافقة بشرية قبل النشر.
9. **معالجات `routes.ts` القديمة** لنفس المسارات ما زالت موجودة لكن لا تُنفَّذ لأن `registerSplitRoutes` يسبقها.

## مصادر المحتوى (`sourceType`)

| قيمة | السلوك |
|------|--------|
| `keyword` | بحث بكلمة/كلمات |
| `topic_cluster` | عدة كلمات (`keywords[]`) |
| `category_feed` | أحدث مقالات الأقسام في `filters.categories` |
| `curated` | مثبتات أولاً ثم تعبئة اختيارية من القسم |
| `trending` | ترتيب بالمشاهدات + نافذة حداثة |
| `event_window` | كلمات + `lookbackHours` (تعميم نمط الحج) |

## صحة وتشغيل

- لوحة: `/dashboard/smart-blocks` (صلاحية `system.manage_settings` للكتابة)
- حزمة الصفحة: `GET /api/smart-blocks/homepage` (و`/api/en|ur/smart-blocks/homepage`)
- ملخص المسرح: `GET /api/smart-blocks/stage/summary`
- اقتراحات المخرج: `GET /api/smart-blocks/director/suggest`
- راقب Neon: يجب ألا يتضاعف عدد استعلامات `articles` مع عدد زوار الصفحة الرئيسية بفضل SWR

## عند التعديل

- [ ] حدّث هذا الملف و`lastReviewed` في `registry.json` إن تغيّر العقد
- [ ] أي عمود جديد: additive فقط + push آمن
- [ ] لا تضف منطق DB داخل `server/routes/smartBlocks.ts` (ADR-001)
- [ ] إن لمست العرض العام: اختبر إخفاء المشهد الفارغ وعدم ظهور الكلمة المفتاحية
- [ ] لا تُرجع نمط N+1 على الصفحة الرئيسية؛ أبقِ `/homepage` + كاش `blocks:smart:*`
)
