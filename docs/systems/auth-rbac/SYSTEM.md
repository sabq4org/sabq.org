# المصادقة والصلاحيات (`auth-rbac`)

> آخر مراجعة: 2026-07-17 | المالك: platform

## الغرض
مصادقة الويب (Passport) وموبايل (Bearer member session) + طبقتا RBAC (DB + constants).

## الحدود
- **داخل النطاق:** `auth.ts`, `rbac.ts`, `csrf.ts`, `twoFactor`, `memberSessionService`, `shared/rbac-constants.ts`.
- **خارج النطاق:** منطق المنتج خلف الصلاحيات.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/auth.ts`, `server/rbac.ts` |
| Shared | `shared/rbac-constants.ts` |
| Web | `client/src/hooks/useAuth.ts` |
| Docs | `docs/architecture/AUTHENTICATION_FLOW.md` |

## عقود مهمة / Gotchas
- Mobile auth ≠ Web auth — لا تخلط `/api/v1` مع Passport.
- `ROLE_PERMISSIONS_MAP` للأدمن يحمل `"*"` حرفياً — لا تستبدله بتوسيع `PERMISSION_CODES`.
- فلاتر التنقل يجب أن short-circuit على `permissions.includes("*")`.

## صحة وتشغيل
- راجع CLAUDE.md § RBAC قبل أي تغيير

## عند التعديل
- [ ] قرأت هذا الملف + قسم RBAC في `CLAUDE.md`
