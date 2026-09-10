# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-09-05 | المالك: platform

## الغرض
مصادقة الويب (Passport) وموبايل (Bearer member session) + طبقتا RBAC (DB + constants).

## الحدود
- **داخل النطاق:** `auth.ts`, `rbac.ts`, `csrf.ts`, `twoFactor`, `memberSessionService`, `sessionFailoverStore`, `shared/rbac-constants.ts`, `services/phoneAuth.ts`, `services/phoneRegistrationService.ts`, `routes/phoneRegistration.ts`, `shared/authEmail.ts`.
- **خارج النطاق:** منطق المنتج خلف الصلاحيات.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/auth.ts`, `server/rbac.ts`, `server/sessionFailoverStore.ts`, `server/services/phoneAuth.ts` |
| Shared | `shared/rbac-constants.ts` |
| Web | `client/src/hooks/useAuth.ts`, `client/src/hooks/useRoleProtection.ts`, `client/src/components/ProtectedRoute.tsx` |
| Android VARA | `android-native/vara/src/main/kotlin/com/sabq/vara/core/VaraCore.kt`, `VaraViewModel.kt` |
| Docs | `docs/architecture/AUTHENTICATION_FLOW.md` |

## عقود مهمة / Gotchas
- Mobile auth ≠ Web auth — لا تخلط `/api/v1` مع Passport. جلسات الموبايل `app_member_sessions` لمدة 30 يومًا (Bearer). في VARA: لا تُرفق Bearer على `/api/sports/*` العامة — بعض مساراتها (preview/story) محمية بـPassport وترجع 401 فكانت تُفسَّر خطأً كخروج من العضوية.
- عميل Android VARA يخزن Bearer مشفراً بـAndroid Keystore (AES/GCM) مع كاش ذاكرة للتوكن المفكوك، ويدعم البريد/الجوال وOTP (6 أرقام + عداد إعادة إرسال 60ث) وبوابة 2FA برمز احتياطي وزر رجوع، ولا يمسح الجلسة عند فشل شبكة عابر؛ يؤكد 401/403 بطلب ملف ثانٍ قبل الإزالة **أثناء التشغيل كله** (hook `onUnauthorized` في `VaraApi`) لا عند الإقلاع فقط، مستثنيًا مسارات `/auth/` و`/members/account` و`/members/change-password`. البريد الاصطناعي `@phone.sabq.org` لا يُعرض (`Member.displayEmail`) ولا يُعاد إرساله في `PUT /members/profile`.
- **دخول الجوال (OTP) — تدفق 2026-07-31:** لا يُولَّد بريد اصطناعي `p<digits>@phone.sabq.org` بعد الآن، و`users.email` صار nullable (الفرادة عبر `users_email_lower_unique`؛ قاعدة البريد الاصطناعي التاريخي في `shared/authEmail.ts` مشتركة خادمًا وواجهات).
  - **ويب:** `POST /api/auth/phone/verify` يستدعي `findExistingPhoneUser` (بحث فقط). حساب قائم → دخول كالسابق (مع بوابة 2FA). رقم جديد → لا يُنشأ حساب؛ يعيد `registrationRequired + registrationToken` (تذكرة sha256 في `phone_registration_tickets`، صلاحية 15 دقيقة، أحادية الاستخدام) ثم `POST /api/auth/phone/complete-registration` (اسم + بريد حقيقي + كلمة مرور وفق `passwordPolicy`) ينشئ الحساب ذريًا داخل معاملة بقفل استشاري على الرقم، ويرسل تحقق البريد (`emailVerified=false` حتى ينجح الرابط).
  - **موبايل `/api/v1/auth/phone/verify`:** النسخ المنتشرة تتوقع token+user في نفس الاستجابة، فيبقى `findOrCreatePhoneUser` ينشئ سجلًا مبكرًا لكن بحالة onboarding صريحة: `email=null`، `isProfileComplete=false` (قفل استشاري يمنع حسابين لرقم واحد). الإكمال عبر `PUT /api/v1/members/profile` (يستبدل الاصطناعي/الفارغ ببريد حقيقي غير موثق ويرسل رابط التحقق).
  - **الحسابات القديمة ذات البريد الاصطناعي:** لا تُحذف ولا تُعدل آليًا؛ الويب يجبر الاستكمال عبر حارس `needsAccountCompletion` → `/complete-name` (بريد حقيقي + كلمة مرور + الاسم الناقص). لوحة المستخدمين تعرض «لم يُضف بريد» بدل الاصطناعي ولا تُظهر علامة توثيق البريد إلا لبريد حقيقي، والبحث يشمل رقم الجوال (regexp على الأرقام).
  - **استعادة كلمة المرور:** forgot-password (ويب + v1) لا يرسل إلى بريد اصطناعي/مفقود ولا إلى بريد غير موثق إلا لحسابات `authProvider=local` (بريدها هويتها التاريخية)، والاستجابة عامة موحدة. مسارات كلمة المرور في v1 (register/reset/change) توحدت على `validatePassword`.
  - `findOrCreatePhoneUser`/`findExistingPhoneUser` يفضّلان حساب المنسوب على القارئ لنفس الرقم، ويُلغيان عضوية القارئ المكررة (`status=deleted` + تفريغ `phoneNumber`). عند قبول مراسل/كاتب رأي يُنسخ الجوال إلى `users.phoneNumber` بصيغة E.164؛ وإلا يفشل OTP في إيجاد المنسوب وينشئ قارئاً جديداً. التسجيل/التحديث يرفض الجوال الموجود مسبقاً عبر `assertPhoneAvailable` (كل الصيغ).
- **دور العرض والبوابات (`shared/effectiveRoles.ts`):** `getUserRoleNames` و`/api/auth/user` و`buildUserRolePayload` يدمجون `user_roles` مع `users.role` ويسقطون `reader` إن وُجد دور منسوب. سابقاً صف RBAC `reader` كان يحجب عمود `users.role=reporter` فيظهر المراسل «قارئ» ويُرفض `/api/staff-profiles/me`. `updateUserRole` يضيف صف RBAC، و`updateUserRoles`/`createUserWithRoles` يزامنان العمود. ترقية صريحة: `POST /api/admin/users/:id/promote-reporter` (صلاحية `users.change_role` أو `users.update`) + زر في `/dashboard/users` + `scripts/promote-correspondent.ts`. إن بقيت الطبقتان قارئاً يُستنتج المراسل من `staff.staffType` أو وجود خبر بـ`articles.reporter_id`.
- `ROLE_PERMISSIONS_MAP` للأدمن يحمل `"*"` حرفياً — لا تستبدله بتوسيع `PERMISSION_CODES`.
- فلاتر التنقل يجب أن short-circuit على `permissions.includes("*")`.
- `hasRole(..., "admin")` يقبل أيضاً `system_admin` / `system.admin` / `superadmin` / `super_admin`. أي بوابة أدوار في الواجهة (`ProtectedRoute`, `useRoleProtection`) يجب أن تمر عبر `hasRole` — مطابقة نصية لـ `role === "admin"` تطرد مسؤول النظام من صفحات مثل `/dashboard/admin/publishers` وiFox.
- دمج الصلاحيات عبر `resolveEffectivePermissions(roles, dbPerms, deniedPermissionCodes)` = اتحاد DB ∪ خريطة الكود ثم طرح استبعادات الدور والمنع الفردي. المنع الفردي يُطبّق بعد كل المنح، بما فيها منحة الناشر الديناميكية في `/api/auth/user`؛ عقد الأدمن `"*"` مستثنى كالسابق.
- `getUserPermissionData` قراءة صارمة: فشل قراءة الاستثناءات يرمي خطأ، ولا يتحول إلى قائمة منع فارغة يعقبها منح ثابتة. بوابة RBAC ترفض عند الفشل؛ مسار الحساب يعيد خطأ بدل تخزين صلاحيات غير مؤكدة. `storage.getUserPermissions` يفوّض إلى قارئ RBAC نفسه ليحترم المنع الفردي في المسارات القديمة. تغيير الاستثناءات يُبطل كاش `rbac` و`auth-user` المحليين عبر `invalidateUserPermissionCache`. دفعة الصلاحيات لا تغيّر عقود Bearer.
- مدير المحتوى قد يملك `users.view` (لاختيار المراسلين في المحرر) فيظهر قسم «الفريق والصلاحيات» إن لم يُستبعد بـ `excludeRoles` على حاوية `users` في `nav.config.ts` — الإخفاء هناك UX فقط ولا يسحب الصلاحية.
- جلسات الويب: Redis أساسي + Postgres failover عبر `SessionFailoverStore`؛ الوضع PG-only يمر عبر المخزن نفسه. `destroy` يحفظ إبطالًا دائمًا أولًا ثم ينظف النسختين بأفضل جهد. فشل Redis لا يفشل التجديد إذا حُفظ الإبطال؛ فشل حفظ الإبطال يُعاد للمتصل ولا يُعلن نجاح الخروج.
- `sessionRevocations.ts` يستخدم صفوفًا مستقلة في جدول `sessions` الحالي: `revocation:sid:<hash>` لمدة 8 أيام (عمر الجلسة الأقصى 7 أيام)، و`revocation:user:<hash>` برقم إصدار دائم لكل مستخدم أُبطلت جلساته. هذه الصفوف لا تحمل `passport.user` ولا تُستخدم كجلسات، ولا تحتاج migration. تصحيح `connect-pg-simple.ttl`: الوحدة ثوانٍ وليست مللي ثانية.
- Passport يختم `webAuthGeneration` عند تسجيل الدخول فقط؛ `set` و`touch` لا يرفعان إصدار جلسة قديمة. `invalidateAllUserSessions` يحفظ إصدار المستخدم مع `exceptWebSid` قبل التنظيف؛ يحاول تنظيف الموبايل حتى إذا تعذر سجل الويب، ثم يعيد خطأ الإبطال. حذف Bearer يحتفظ بسلوكه القائم، ولا يشمله ضمان سجل الويب.
- قبول جلسة غير فارغة يتطلب استعلام PG مفهرسًا عن SID والمستخدم؛ `set` و`touch` يفحصان الإبطال أيضًا. الطلب المعتاد الذي يقرأ ثم يجدد الجلسة يضيف استعلامين؛ لا يوجد negative cache محلي لأنه يفتح نافذة قبول بعد الإبطال. فشل مرجع الإبطال يرفض المصادقة، وأخطاء البنية التحتية تضيف `X-Session-Degraded` كي تعيد الواجهة المحاولة.
- **النشر/التراجع:** الضمان يتطلب أن تعمل كل نسخ API بكود الإبطال الجديد. النسخ القديمة لا تقرأ السجل؛ الرجوع إليها مع وجود نسخ جلسات قديمة يعيد خطر الاستعادة. أثر الاستعلامات على Neon لم يُقَس إنتاجيًا؛ راقب انتظار pool وp95 ومعدل التدهور قبل تعميم النشر. لا تُحذف سجلات إصدار المستخدم الدائمة ضمن تنظيف الجلسات العادي.
- Postgres الخاص بالجلسات يستخدم pool مستقلاً صغيراً (`SESSION_FALLBACK_POOL_MAX`، الافتراضي 4، والسقف 10) بمهلات قصيرة؛ لا تعيده إلى pool المحتوى لأن انقطاع Redis قد يستنزف كل اتصالات الأخبار.

## صحة وتشغيل
- راجع CLAUDE.md § RBAC قبل أي تغيير
- عند 500 على `/api/login` مع `Command timed out` من ioredis: تحقق من Upstash ثم من سجل `[Session Pool]` ومن أن الفايل أوفر يكتب على جدول `sessions`.

## التحقق المحلي
- `tests/unit/sessionRevocations.integration.test.ts`: اختبارات opt-in على قاعدة PostgreSQL محلية فارغة فقط، بواسطة `SESSION_REVOCATION_TEST_URL`. ينشئ الاختبار جدول الجلسات ثم يحذفه بعد النهاية؛ لا يستعمل `DATABASE_URL` أو Neon.
- تغطية: انقطاع/عودة Redis، مخزن جديد، PG-only، كتابة متأخرة، touch بعد الإبطال، إبطال المستخدم واستثناء جلسته، login بإصدار جديد، وفشل سجل الإبطال. `authSessionRevocation.test.ts` يتحقق من توصيل Passport والتنظيف المستقل للموبايل.

## عند التعديل
- [ ] قرأت هذا الملف + قسم RBAC في `CLAUDE.md`

## تطبيقات الموبايل والثقة بالحافة — مراجعة 2026-09-05
- استجابة requires2FA لا تنشئ جلسة، بما فيها SMS وApple وGoogle في التطبيقات؛ تنتقل إلى واجهة التحدي القائمة.
- VARA يحاول إبطال الجلسة على الخادم قبل إسقاط الاعتماد المحلي؛ فشل الشبكة يظهر للمستخدم ويبقي إمكانية إعادة المحاولة. 401 يؤكد عدم صلاحية الجلسة ويُقبل للخروج.
- أندرويد سبق يخزن ciphertext عبر AES-GCM بمفتاح Android Keystore؛ ترحيل DataStore يزيل النص القديم بعد نجاح التشفير فقط. ملف datastore/auth_prefs.preferences_pb مستبعد من cloud/device backup.
- عنوان IP الممرر من Pages مقبول فقط بتوقيع HMAC حديث مربوط بالطريقة والمسار. انظر بوابة إعداد الإنتاج في platform-runtime.
