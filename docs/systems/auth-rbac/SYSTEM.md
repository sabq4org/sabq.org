# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-09-24 (تمرير حالة توثيق البريد في جلسة الويب) | المالك: platform

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
- إسقاط بيانات مستخدم Passport في `deserializeUser` يحتفظ بـ`emailVerified` كقيمة boolean مشتقة من حالة قاعدة البيانات فقط؛ تتطلبه بوابات ملكية اشتراك النشرة. تسجيل الدخول لا يثبت توثيق البريد، والقيم المفقودة أو null تبقى false. كاش المستخدم والإبطال يحتفظان بالعقد نفسه، دون تغيير جلسات Bearer.
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
- نوع رسالة Bevatel يترك افتراضيًا بحذف `msgClass` من الطلب وفق توجيه الدعم بعد رفض `transactional` بالخطأ 6208 (Issue #1665). تبقى حماية النص والمرسل والصلاحية كما هي.
- OTP: توليد وتحقق في `server/services/otpService.ts`، وإرسال عبر `server/services/sms/`؛ اسم Bevatel الافتراضي المعتمد `SABQ News`. قوالب الدخول/توثيق الجوال/2FA لا تتجاوز 70 وحدة UTF-16 حتى تلائم `maxParts: 1`، وصلاحية طابور الإرسال 5 دقائق. تفاصيل الإعداد والاختبار في [دليل Bevatel](../../SMS_OTP_BEVATEL.md)؛ قبول الطلب لا يثبت التسليم. Issue #1663؛ لا تغيير لعقود الويب أو الموبايل.
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

## أحداث نجاح المصادقة للويب — 2026-09-13
- Issue #1646: نتيجة Google/Apple strategy تميّز الحساب المنشأ الآن عن القائم بـisNewUser دون تغيير serialization أو APIs الموبايل. callback الناجح بعد Passport يرفق sabq_auth_event/method/nonce بلا بيانات هوية؛ failureRedirect لا يرفق نجاحًا، ووجهة onboarding تبقى حسب اكتمال الملف.
- AuthAnalyticsMarker ينظف الرابط ويتحقق من جلسة الويب قبل إرسال conversion؛ الأحداث مؤجلة عند صفحات الحساب الحساسة، ومحدودة بعمر وبصمة لمنع العد المكرر. login نجاح حساب قائم، sign_up إنشاء جديد. لا تتغير RBAC أو Schema.

## توثيق جوال الحساب المسجّل — 2026-09-18
> الدليل الكامل (التدفّق، الكتابة الخام، التعارض، الاختبارات): [`docs/architecture/PHONE_VERIFICATION_AND_MEMBERSHIP.md`](../../architecture/PHONE_VERIFICATION_AND_MEMBERSHIP.md).
- مسار جديد للعضو/المنسوب المسجّل: `POST /api/account/phone/send` ثم `POST /api/account/phone/verify` (Passport + CSRF، محدِّد `registrationLimiter`، وغرض OTP مستقل `phone_verify` — أول استخدام فعلي له). لا يُحفظ الرقم إلا بعد التحقق، ويُطبّع إلى E.164 عبر `normalizePhone`.
- `classifyPhoneConflict` و`claimVerifiedAccountPhone` في `services/phoneAuth.ts`: قفل استشاري على الرقم + إعادة فحص داخل معاملة. تعارض مع **منسوب آخر** → رفض؛ تعارض مع **عضوية قارئ سابقة** → رفض برسالة توجيه للدعم. **لا حذف ولا دمج تلقائي** (يختلف عن `retireDuplicateReaderPhoneAccounts` المستخدم في اعتماد المنسوبين/الدخول).
- `PATCH /api/auth/user` لم يعد يكتب `phoneNumber` خامًا (يُسقطه صراحةً)؛ الواجهة (إعدادات → الحساب) توثّق الرقم بالـOTP. وفي ملف المنسوب: `upsertStaffProfile` في **الوضع الذاتي** يرفض أي تغيير لرقم الجوال (409) ويوجّه لتوثيق OTP، وفي الوضع الإداري يمنع ربط رقم يملكه حساب آخر (`classifyPhoneConflict` → 409). تغيير الرقم يُسقط `phoneVerified`. واجهة ملف المنسوب (self) تعرض الرقم للقراءة فقط مع زر توثيق SMS عبر `/api/account/phone/*`.
- الدخول بالجوال كما هو (`findExistingPhoneUser` يفضّل المنسوب). الموبايل v1 (`findOrCreatePhoneUser`) لم يتغير في هذا التحديث.

## حماية القراءات العامة عند وسيط API — 2026-09-19
- وسيط `api.sabq.org` يستخدم سياسة الكاش المحدودة المشتركة مع Pages للمسارات العامة المصرح بها فقط. تفعيلها لا يغير مسارات تطبيق iOS الحالي ولا يحتاج إصدار تطبيق.
- يبقى توقيع HMAC وتمرير IP الموثوق والتحقق من وجود السر ومنع حلقة البروكسي كما هو. Cookie وAuthorization وx-session-id تتجاوز المشاركة، وكذلك الكتابات وSSE. الرد المشترك يحتاج علامة صريحة من الأصل وعقدًا عامًا؛ مفاتيح الكاش تفصل Origin واللغة ومعاملات الطلب.
- هذه الحماية لا تشمل مصادقة الحساب ولا الردود الشخصية ولا تغيّر عقد حداثة متن الخبر. نشر API Worker مستقل عن نشر Pages وعن حزمة Railway؛ نجاح بناء الخادم وحده لا يفعّلها.
