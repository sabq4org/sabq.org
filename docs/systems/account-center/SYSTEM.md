# مركز العضوية الموحد (`account-center`)

> آخر مراجعة: 2026-07-25 | المالك: platform

## الغرض
توحيد تجربة عضوية الويب حول جذرين: `/profile` (هوية ومحتوى ونشاط) و`/settings` (مركز إعدادات واحد بأقسام). القائمة المنسدلة مصدر تنقّل مختصر بلا قوائم فرعية.

## الحدود
- **داخل النطاق:** قائمة الحساب، صفحة الملف الشخصي للعضو، مركز الإعدادات (`/settings/*`)، إعادة توجيه المسارات القديمة (`/notification-settings`, `/preferences`, `/recommendation-settings`)، أقسام الحساب/الإشعارات/الأمان/الاهتمامات/المظهر/الخصوصية على الويب.
- **خارج النطاق:** لوحة التحكم `/dashboard/*`، مصادقة Passport/RBAC نفسها (`auth-rbac`)، عقود `/api/v1` للموبايل، نظام الولاء الخلفي (`loyalty`)، عامل الدفع (`push-notifications`).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Web — تنقّل | `client/src/nav/accountMenuItems.ts`, `client/src/components/UserAccountMenu.tsx`, `client/src/components/Header.tsx` |
| Web — ملف | `client/src/pages/Profile.tsx`, `client/src/pages/profile/**` |
| Web — إعدادات | `client/src/pages/settings/**` |
| Web — مسارات | `client/src/App.tsx` (`/profile`, `/settings`, redirects) |
| Backend (أمان اختياري) | `server/routes/accountSecurity.ts`, `server/services/accountSecurityService.ts` |
| SEO / كاش | `server/utils/noindexPaths.ts` (`/settings` prefix) |

## جرد الروابط القديمة (مرحلة 0 — 2026-07-25)

يجب أن تبقى تعمل عبر Redirect داخل SPA:

| المسار القديم | الوجهة الجديدة |
|---------------|----------------|
| `/notification-settings` | `/settings/notifications` |
| `/en/notification-settings` | `/en/settings/notifications` أو `/settings/notifications` |
| `/ur/notification-settings` | `/settings/notifications` (كان مكسورًا) |
| `/preferences` | `/settings/interests` |
| `/recommendation-settings` | `/settings/notifications` |
| `/profile?tab=settings` | `/settings` |
| `/profile?tab=bookmarks` | `/profile/saved` (كان لا يُقرأ) |

روابط داخلية تُحدَّث تدريجيًا (لا تكسر إن بقيت على القديم بفضل Redirect):
- `client/src/pages/PrivacyPage.tsx`, `EnglishPrivacyPage.tsx`
- `client/src/pages/UserNotifications.tsx`, `Notifications.tsx`
- `client/src/components/en/EnglishHeader.tsx`, `ur/UrduHeader.tsx`
- `client/src/components/Header.tsx` (Sheet أدواتي)

الموبايل يستخدم `/api/v1/notifications/preferences` و`/api/v1/members/*` — **لا يعتمد على مسارات SPA**؛ لا تغيير مطلوب في هذه الموجة.

## عقود مهمة / Gotchas
- أضف أي مسار خاص جديد إلى `NOINDEX_PREFIXES` **قبل** تسجيله في `App.tsx` — وإلا يتسرّب `Cache-Control: public` إلى الحافة.
- مصدر تنقّل واحد: `accountMenuItems.ts` — يستهلكه dropdown الأفاتار وSheet الهامبرغر.
- إعدادات الإشعارات مصدر واحد: قسم `/settings/notifications` فقط. لا تُكرَّر مفاتيح التفضيل في `/profile` أو `/preferences`.
- `TwoFactorSettings` يُنقل كغلاف فقط — لا تُعاد كتابة منطق `/api/2fa/*`.
- **`daily_digest` مهجور جزئيًا:** العمود الفعّال الذي يقرأه `digestService` هو `user_recommendation_prefs.daily_digest`. عمود `user_notification_prefs.daily_digest` **مهجور** — لا تكتب إليه من الواجهة، ولا تحذفه (Workflow C: additive only). واجهة الإشعارات تكتب عبر `PATCH /api/recommendations/preferences` (`enableDailyDigest`).
- فحوص RBAC لـ«أدوات العمل» عبر `hasPermission` مع short-circuit على `"*"`.
- «المحفظة» في الملف = بطاقات Apple Wallet (`/profile/cards`)؛ نقاط الولاء = `/loyalty` («نقاطي ومكافآتي»).
- تفريق المسارات: `/profile/saved|activity|network|cards|overview` تبويبات؛ أي `:segment` آخر = ملف عام (`ProfileSegmentRouter`).

## صحة وتشغيل
- `isNoindexPath('/settings')` و`isNoindexPath('/settings/security')` يجب أن ترجعا `true`.
- مسارات Redirect القديمة تنتهي على قسم صحيح بحالة 200 داخل SPA.
- `POST /api/account/change-password` (جلسة Passport) يغيّر كلمة المرور ويُبطل الجلسات الأخرى.
- لوحة الكتالوج: `/dashboard/systems-catalog`

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت `lastReviewed` في `registry.json` إن تغيّر العقد أو نقاط الدخول
- [ ] أضفت المسارات الجديدة إلى `noindexPaths.ts` و`spaRouteMatcher.ts`
- [ ] حافظت على Redirect للمسارات القديمة
- [ ] لم تلمس عقود `/api/v1` إلا بموافقة صريحة
- [ ] تكافؤ iOS/Android يحتاج Issue منفصل (هذه الموجة ويب فقط)
