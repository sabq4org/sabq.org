# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-09-08 | المالك: platform

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
- تقارير CSP المجهولة مستثناة من CSRF فقط للطريقة `POST` والمسار الدقيق
  `/api/security/csp-report`، مع حد body ‏16KB ومحدد معدل مستقل؛ المسارات
  الشقيقة تظل محمية.

## تمهيد توقيع البوابات — 2026-09-07
- طلبات Pages/Worker لا تُرسل `X-Sabq-Client-IP` كقيمة موثوقة إلا مع `EDGE_PROXY_SHARED_SECRET` وتوقيع HMAC حديث مربوط بالطريقة والمسار والاستعلام والعنوان، وبعد تفعيل `EDGE_PROXY_IP_ACCEPT=on` في التشغيل. غياب السر يتجاهل الترويسة المخصصة لكنه قد يسبب انهيار buckets خلف Pages؛ ليس عزلًا للأصل.
- في API، `EDGE_PROXY_GATE_REQUIRED=on` يرفض طلبات API غير الموقعة قبل محددات المعدل (403)، ويعيد503 عند غياب إعدادات التوقيع. في Pages يحرس تهيئة السر. تبقى health والموارد غير API خارج هذا القيد؛ هذا تقييد على مستوى التطبيق وليس جدار شبكة Railway.
- الترويسات المخصصة غير الموقعة، و`cf-connecting-ip`، و`X-Forwarded-For` القادمة من العميل لا تُستخدم كمفتاح rate-limit. لا يُستخدم Bearer غير متحقق لتوليد bucket جديد قبل تنفيذ المصادقة داخل المسار.
- مسار `api.sabq.org` المباشر ومسار Railway generated hostname يعتمدان على سلسلة البروكسي المهيأة في Express عند غياب التوقيع. تفاصيل التهيئة والتراجع في `docs/ratelimit-edge-ip-rollout-2026-09-07.md`.
- utility التحقق مفعلة الآن في backend عند `EDGE_PROXY_IP_ACCEPT=on`، بينما رفض الأصل يتطلب `EDGE_PROXY_GATE_REQUIRED=on` كعلم مستقل.
- لا يُفعّل رفض الأصل حتى اكتمال نشر المرسلين واختبارهم، وفق `docs/ratelimit-edge-ip-rollout-2026-09-07.md`.

## تحميل بيانات تعديل المنسوب — 2026-09-08
- `EditUserDialog` ينتظر بيانات المستخدم والموظف قبل تعبئة النموذج، ويستخدم `staff.bioAr` ثم `users.bio` للسيرة العربية. خطأ قراءة الموظف لا يُعامل كسيرة فارغة ويمنع الحفظ مع إتاحة إعادة المحاولة.
- تُعبّأ الحقول مرة واحدة عند فتح التعديل؛ إعادة الجلب الخلفية لا تمحو تعديلات المستخدم غير المحفوظة. إعادة فتح النافذة تجلب البيانات الحالية.
- عند حفظ السيرة أو بيانات أخرى، لا يُرسل `phoneNumber` إذا طابق قيمة بداية جلسة التعديل. تغيير الرقم أو مسحه يُرسل صراحةً ويخضع لتحقق الخادم؛ تكرار رقم تاريخي لا يمنع حفظ تعديل لا يمس الجوال.
