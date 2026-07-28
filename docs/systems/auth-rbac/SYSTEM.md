# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-07-28 | المالك: platform

## الغرض
مصادقة الويب (Passport) وموبايل (Bearer member session) + طبقتا RBAC (DB + constants).

## الحدود
- **داخل النطاق:** `auth.ts`, `rbac.ts`, `csrf.ts`, `twoFactor`, `memberSessionService`, `sessionFailoverStore`, `shared/rbac-constants.ts`, `services/phoneAuth.ts`.
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
- **دخول الجوال (OTP):** `findOrCreatePhoneUser` يفضّل حساب المنسوب على القارئ لنفس الرقم، ويُلغي عضوية القارئ المكررة (`status=deleted` + تفريغ `phoneNumber`). عند قبول مراسل/كاتب رأي يُنسخ الجوال إلى `users.phoneNumber` بصيغة E.164؛ وإلا يفشل OTP في إيجاد المنسوب وينشئ قارئاً جديداً. التسجيل/التحديث يرفض الجوال الموجود مسبقاً عبر `assertPhoneAvailable` (كل الصيغ).
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
