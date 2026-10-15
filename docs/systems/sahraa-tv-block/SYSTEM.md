# بلوك قناة الصحراء (`sahraa-tv-block`)

> آخر مراجعة: 2026-10-01 | المالك: فريق التحرير / المنصة
> ملاحظة تشغيل: `video.twimg.com` يعيد **403** إذا أرسل المتصفح `Referer: sabq.org` — التشغيل عبر `GET /api/sahraa-tv-block/media`.

## الغرض

بلوك يومي على الصفحة الرئيسية (عربي) يعرض **فيديو فقط** مستخرجاً من رابط منشور إكس لقناة الصحراء، مع **وصف تحريري** نضعه نحن — **بدون واجهة التغريدة** — مباشرة **أسفل بلوك آخر الأخبار** (`PersonalizedFeed` / جميع الأخبار).

## الحدود (In / Out of scope)

- داخل النطاق:
  - إعدادات البلوك عبر `system_settings` بمفتاح `sahraa_tv_block`
  - استخراج رابط MP4 من منشور إكس (رسمي إن توفّر `X_API_BEARER_TOKEN`، وإلا FxTwitter)
  - API عام + لوحة إدارة
  - مكوّن العرض `SahraaTvBlock` بمشغّل `<video>` أصلي
  - موضع العرض أسفل بلوك آخر الأخبار (`PersonalizedFeed`) في `Home.tsx`
- خارج النطاق:
  - تضمين widget تغريدة إكس / `widgets.js`
  - تطبيقات الموبايل (iOS/Android) — parity لاحق إن طُلب
  - `web-next` SSR homepage (هيكل SEO مبسّط؛ البلوك في SPA فقط)
  - البلوكات الذكية / مسرح الصفحة (`smart-blocks`)
  - أرشفة تاريخية للمنشورات السابقة (نسخة واحدة حالية فقط)

## نقاط الدخول

| الطبقة | المسار |
|--------|--------|
| Backend service | `server/services/sahraaTvBlockService.ts` + `sahraaTvBlockPersistence.ts` + `sahraaTvBlockUtils.ts` + `sahraaTvVideoResolver.ts` + `sahraaTvMediaProxy.ts` + `sahraaTvMediaMirror.ts` |
| Backend routes | `server/routes/sahraaTvBlock.ts` (عبر `splitRoutesIndex.ts`) |
| إعدادات | `system_settings.key = sahraa_tv_block` |
| Web home | `client/src/components/SahraaTvBlock.tsx` + `client/src/pages/Home.tsx` |
| Web dashboard | `client/src/pages/dashboard/SahraaTvBlockSettings.tsx` |
| شعار | `attached_assets/al-sahraa-channel-logo.png` |

## عقود مهمة / Gotchas

1. **الظهور:** `isVisible` فقط عندما `isActive === true` و`videoUrl` (MP4) جاهز في الإعدادات.
2. **لا تغريدة:** الواجهة العامة لا تعرض نص المنشور ولا widget إكس — فيديو + وصف تحريري فقط.
3. **التشغيل:** الـ API العام يعيد نسخة R2 المحفوظة إن توفرت، وإلا `videoUrl: "/api/sahraa-tv-block/media"` (بروكسي). الرابط المباشر لـ twimg يُخزَّن داخلياً فقط — المتصفح لا يحمّله مباشرة.
4. **مصدر التحرير:** المحرر يلصق رابط `x.com/.../status/{id}` أو `.../video/1`؛ الخادم يستخرج MP4 ويخزّن `videoUrl`/`posterUrl`.
5. **الاستخراج:** `X_API_BEARER_TOKEN` أولاً، ثم `api.fxtwitter.com` كاحتياط. عند الحفظ المفعّل يفشل الطلب إن لم يُعثر على فيديو.
6. **الإطلاق الآمن:** غياب الإعدادات أو تلفها يعني أن البلوك غير مفعّل. لا يُفعّل إلا بحفظ صريح من لوحة الإدارة؛ رابط `@Sahraachannel` الافتراضي مجرد قيمة مبدئية للنموذج.
7. **لا جدول جديد:** القيمة JSON في `system_settings` — لا يلزم `db:push`.
8. **ADR-001:** المنطق في الـ service؛ المسارات لا تستورد `db`.
9. **الصلاحية:** الكتابة تتطلب `system.manage_settings`.
10. **إخفاء نظيف:** إن كان البلوك غير ظاهر لا يترك DOM على الرئيسية.
11. **طلبات العرض للقراءة فقط:** `GET` البلوك وبروكسي الفيديو لا يستخرجان فيديو جديدًا، ولا ينسخان إلى R2، ولا يكتبان إعدادات. إعداد مفعّل بلا فيديو جاهز يظل مخفيًا حتى الحفظ الصريح.
12. **فشل القراءة:** يخفي الطلب العام البلوك؛ مسار الإدارة يعيد خطأ بدل إرجاع إعدادات افتراضية قابلة للحفظ فوق الإعداد السابق.
13. **حماية حفظ أحدث:** الحفظ يستخدم مقارنة وتحديثًا ذريين للقيمة المخزّنة. إذا حُفظ الإخفاء أثناء تجهيز فيديو لطلب تفعيل سابق، يفشل الطلب السابق بـ `409` ويظل الإخفاء نافذًا. لا نعيد المحاولة تلقائيًا فوق تعديل أحدث.

## صحة وتشغيل

- عام: `GET /api/sahraa-tv-block` → `{ isVisible, title?, description?, videoUrl: "/api/sahraa-tv-block/media", posterUrl?, updatedAt? }`
- بث: `GET /api/sahraa-tv-block/media` (يدعم `Range`)
- إدارة: `GET|PUT /api/sahraa-tv-block/admin`؛ `409` عند حفظ متعارض، ويجب إعادة تحميل الإعدادات قبل إعادة الحفظ.
- لوحة: `/dashboard/sahraa-tv-block`

## عند التعديل

- [ ] حدّث هذا الملف و`lastReviewed` في `registry.json` إن تغيّر العقد
- [ ] لا تُرجع تضمين تغريدة — الفيديو فقط
- [ ] لا توسّع إلى موبايل/SSR دون Issue منفصل
- [ ] اختبر: رابط `/video/1`، إخفاء البلوك عند الإيقاف، ورفض منشور بلا فيديو
- [ ] اختبر: فشل/غياب الإعدادات بلا كتابة من GET؛ وتفعيل بطيء يتعارض مع إخفاء أحدث دون إلغائه
