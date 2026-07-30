# بلوك قناة الصحراء (`sahraa-tv-block`)

> آخر مراجعة: 2026-07-30 | المالك: فريق التحرير / المنصة

## الغرض

بلوك يومي على الصفحة الرئيسية (عربي) يعرض **فيديو فقط** مستخرجاً من رابط منشور إكس لقناة الصحراء، مع **وصف تحريري** نضعه نحن — **بدون واجهة التغريدة** — مباشرة **أسفل أخبار الهيرو**.

## الحدود (In / Out of scope)

- داخل النطاق:
  - إعدادات البلوك عبر `system_settings` بمفتاح `sahraa_tv_block`
  - استخراج رابط MP4 من منشور إكس (رسمي إن توفّر `X_API_BEARER_TOKEN`، وإلا FxTwitter)
  - API عام + لوحة إدارة
  - مكوّن العرض `SahraaTvBlock` بمشغّل `<video>` أصلي
  - موضع العرض أسفل `HeroCarousel` في `Home.tsx`
- خارج النطاق:
  - تضمين widget تغريدة إكس / `widgets.js`
  - تطبيقات الموبايل (iOS/Android) — parity لاحق إن طُلب
  - `web-next` SSR homepage (هيكل SEO مبسّط؛ البلوك في SPA فقط)
  - البلوكات الذكية / مسرح الصفحة (`smart-blocks`)
  - أرشفة تاريخية للمنشورات السابقة (نسخة واحدة حالية فقط)

## نقاط الدخول

| الطبقة | المسار |
|--------|--------|
| Backend service | `server/services/sahraaTvBlockService.ts` + `sahraaTvBlockUtils.ts` + `sahraaTvVideoResolver.ts` |
| Backend routes | `server/routes/sahraaTvBlock.ts` (عبر `splitRoutesIndex.ts`) |
| إعدادات | `system_settings.key = sahraa_tv_block` |
| Web home | `client/src/components/SahraaTvBlock.tsx` + `client/src/pages/Home.tsx` |
| Web dashboard | `client/src/pages/dashboard/SahraaTvBlockSettings.tsx` |
| شعار | `attached_assets/al-sahraa-channel-logo.png` |

## عقود مهمة / Gotchas

1. **الظهور:** `isVisible` فقط عندما `isActive === true` و`videoUrl` (MP4) جاهز.
2. **لا تغريدة:** الواجهة العامة لا تعرض نص المنشور ولا widget إكس — فيديو + وصف تحريري فقط.
3. **المصدر:** المحرر يلصق رابط `x.com/.../status/{id}` أو `.../video/1`؛ الخادم يستخرج MP4 ويخزّن `videoUrl`/`posterUrl`.
4. **الاستخراج:** `X_API_BEARER_TOKEN` أولاً، ثم `api.fxtwitter.com` كاحتياط. عند الحفظ المفعّل يفشل الطلب إن لم يُعثر على فيديو.
5. **الإطلاق:** إن لم تُحفظ إعدادات بعد، يُستخدم رابط `@Sahraachannel` الافتراضي ويُستخرج الفيديو عند أول طلب عام.
6. **لا جدول جديد:** القيمة JSON في `system_settings` — لا يلزم `db:push`.
7. **ADR-001:** المنطق في الـ service؛ المسارات لا تستورد `db`.
8. **الصلاحية:** الكتابة تتطلب `system.manage_settings`.
9. **إخفاء نظيف:** إن كان البلوك غير ظاهر لا يترك DOM على الرئيسية.

## صحة وتشغيل

- عام: `GET /api/sahraa-tv-block` → `{ isVisible, title?, description?, videoUrl?, posterUrl?, updatedAt? }`
- إدارة: `GET|PUT /api/sahraa-tv-block/admin`
- لوحة: `/dashboard/sahraa-tv-block`

## عند التعديل

- [ ] حدّث هذا الملف و`lastReviewed` في `registry.json` إن تغيّر العقد
- [ ] لا تُرجع تضمين تغريدة — الفيديو فقط
- [ ] لا توسّع إلى موبايل/SSR دون Issue منفصل
- [ ] اختبر: رابط `/video/1`، إخفاء البلوك عند الإيقاف، ورفض منشور بلا فيديو
