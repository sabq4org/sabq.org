# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-07-27 | المالك: platform

## الغرض
مصادقة الويب (Passport) وموبايل (Bearer member session) + طبقتا RBAC (DB + constants).

## الحدود
- **داخل النطاق:** `auth.ts`, `rbac.ts`, `csrf.ts`, `twoFactor`, `memberSessionService`, `sessionFailoverStore`, `shared/rbac-constants.ts`.
- **خارج النطاق:** منطق المنتج خلف الصلاحيات.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/auth.ts`, `server/rbac.ts`, `server/sessionFailoverStore.ts` |
| Shared | `shared/rbac-constants.ts` |
| Web | `client/src/hooks/useAuth.ts`, `client/src/hooks/useRoleProtection.ts`, `client/src/components/ProtectedRoute.tsx` |
| Docs | `docs/architecture/AUTHENTICATION_FLOW.md` |

## عقود مهمة / Gotchas
- Mobile auth ≠ Web auth — لا تخلط `/api/v1` مع Passport. جلسات الموبايل `app_member_sessions` لمدة 30 يومًا (Bearer). في VARA: لا تُرفق Bearer على `/api/sports/*` العامة — بعض مساراتها (preview/story) محمية بـPassport وترجع 401 فكانت تُفسَّر خطأً كخروج من العضوية.
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
