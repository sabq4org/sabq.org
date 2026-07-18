# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-07-18 | المالك: platform

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
| Web | `client/src/hooks/useAuth.ts` |
| Docs | `docs/architecture/AUTHENTICATION_FLOW.md` |

## عقود مهمة / Gotchas
- Mobile auth ≠ Web auth — لا تخلط `/api/v1` مع Passport.
- `ROLE_PERMISSIONS_MAP` للأدمن يحمل `"*"` حرفياً — لا تستبدله بتوسيع `PERMISSION_CODES`.
- فلاتر التنقل يجب أن short-circuit على `permissions.includes("*")`.
- جلسات الويب: Redis أساسي + Postgres failover عبر `SessionFailoverStore`. عمليات `get`/`set`/`touch`/`destroy` تنتقل لـ PG عند فشل Redis — **لا تُرجع خطأ Redis إذا نجح الـ fallback** (خصوصاً `destroy` أثناء `req.logIn` / regenerate؛ وإلا يظهر «خطأ في إنشاء الجلسة» بعد `LocalStrategy: Success`).

## صحة وتشغيل
- راجع CLAUDE.md § RBAC قبل أي تغيير
- عند 500 على `/api/login` مع `Command timed out` من ioredis: تحقق من Upstash ثم من أن الفايل أوفر يكتب على جدول `sessions`.

## عند التعديل
- [ ] قرأت هذا الملف + قسم RBAC في `CLAUDE.md`
