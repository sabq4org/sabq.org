# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-08-16 | المالك: platform

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
- دمج الصلاحيات عبر `resolveEffectivePermissions(roles, dbPerms)` = اتحاد DB ∪ خريطة الكود ثم طرح `ROLE_PERMISSION_DENY_MAP` (مثال: مدير المحتوى بلا `meetings.create` ولا `staff.view_productivity` حتى لو بقيت في DB).
- مدير المحتوى قد يملك `users.view` (لاختيار المراسلين في المحرر) فيظهر قسم «الفريق والصلاحيات» إن لم يُستبعد بـ `excludeRoles` على حاوية `users` في `nav.config.ts` — الإخفاء هناك UX فقط ولا يسحب الصلاحية.
- جلسات الويب: Redis أساسي + Postgres failover عبر `SessionFailoverStore`. عمليات `get`/`set`/`touch`/`destroy` تنتقل لـ PG عند فشل Redis — **لا تُرجع خطأ Redis إذا نجح الـ fallback** (خصوصاً `destroy` أثناء `req.logIn` / regenerate؛ وإلا يظهر «خطأ في إنشاء الجلسة» بعد `LocalStrategy: Success`).
- Postgres الخاص بالجلسات يستخدم pool مستقلاً صغيراً (`SESSION_FALLBACK_POOL_MAX`، الافتراضي 4، والسقف 10) بمهلات قصيرة؛ لا تعيده إلى pool المحتوى لأن انقطاع Redis قد يستنزف كل اتصالات الأخبار.

## صحة وتشغيل
- راجع CLAUDE.md § RBAC قبل أي تغيير
- عند 500 على `/api/login` مع `Command timed out` من ioredis: تحقق من Upstash ثم من سجل `[Session Pool]` ومن أن الفايل أوفر يكتب على جدول `sessions`.

## عند التعديل
- [ ] قرأت هذا الملف + قسم RBAC في `CLAUDE.md`
