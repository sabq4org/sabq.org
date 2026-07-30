# بلوك قناة الصحراء (`sahraa-tv-block`)

> آخر مراجعة: 2026-07-30 | المالك: فريق التحرير / المنصة

## الغرض

بلوك يومي على الصفحة الرئيسية (عربي) يعرض **اقتباس فيديو من منشور إكس** لبرنامج/قناة الصحراء، مع وصف تحريري وهوية بصرية للقناة (أحمر عميق + شعار دائري)، مباشرة **أسفل أخبار الهيرو**.

## الحدود (In / Out of scope)

- داخل النطاق:
  - إعدادات البلوك عبر `system_settings` بمفتاح `sahraa_tv_block`
  - API عام + لوحة إدارة
  - مكوّن العرض `SahraaTvBlock` وتضمين منشور إكس (`widgets.js`)
  - موضع العرض أسفل `HeroCarousel` في `Home.tsx`
- خارج النطاق:
  - تطبيقات الموبايل (iOS/Android) — parity لاحق إن طُلب
  - `web-next` SSR homepage (هيكل SEO مبسّط؛ البلوك في SPA فقط)
  - البلوكات الذكية / مسرح الصفحة (`smart-blocks`)
  - أرشفة تاريخية للمنشورات السابقة (نسخة واحدة حالية فقط)

## نقاط الدخول

| الطبقة | المسار |
|--------|--------|
| Backend service | `server/services/sahraaTvBlockService.ts` + `sahraaTvBlockUtils.ts` |
| Backend routes | `server/routes/sahraaTvBlock.ts` (عبر `splitRoutesIndex.ts`) |
| إعدادات | `system_settings.key = sahraa_tv_block` |
| Web home | `client/src/components/SahraaTvBlock.tsx` + `client/src/pages/Home.tsx` |
| Web dashboard | `client/src/pages/dashboard/SahraaTvBlockSettings.tsx` |
| شعار | `attached_assets/al-sahraa-channel-logo.png` |

## عقود مهمة / Gotchas

1. **الظهور:** `isVisible` فقط عندما `isActive === true` ورابط منشور إكس صالح (`/status/{id}` على `x.com` أو `twitter.com`).
2. **التضمين:** يُطبَّع الرابط إلى `https://twitter.com/...` لأن `platform.twitter.com/widgets.js` يعتمد نطاق الإكس القديم.
3. **لا جدول جديد:** القيمة JSON في `system_settings` — لا يلزم `db:push`.
4. **ADR-001:** المنطق في الـ service؛ المسارات لا تستورد `db`.
5. **الصلاحية:** الكتابة تتطلب `system.manage_settings` (أو أدمن عبر `requirePermission`).
6. **إخفاء نظيف:** إن كان البلوك غير ظاهر لا يترك DOM على الرئيسية.

## صحة وتشغيل

- عام: `GET /api/sahraa-tv-block` → `{ isVisible, title?, description?, xPostUrl?, updatedAt? }`
- إدارة: `GET|PUT /api/sahraa-tv-block/admin`
- لوحة: `/dashboard/sahraa-tv-block`

## عند التعديل

- [ ] حدّث هذا الملف و`lastReviewed` في `registry.json` إن تغيّر العقد
- [ ] لا توسّع إلى موبايل/SSR دون Issue منفصل
- [ ] اختبر: رابط `x.com` و`twitter.com`، وإخفاء البلوك عند الإيقاف أو رابط فارغ
