# Authentication Flow - Sabq Smart Platform

## نظرة عامة (Overview)
نظام هجين للمصادقة مع صفحتي دخول منفصلتين وخدمة مصادقة موحدة.

## معمارية المصادقة (Authentication Architecture)

### 1. نقاط الدخول (Entry Points)

#### `/login` - للمستخدمين العاديين (Readers)
- واجهة بسيطة وسهلة
- تركيز على تجربة المستخدم
- Rate limiting عادي (100 requests/15min)
- بدون 2FA إلزامي
- توجيه بعد الدخول: `/` (الصفحة الرئيسية)

#### `/admin/login` - للإدارة والصحفيين (Staff)
- واجهة احترافية
- تعزيزات أمنية إضافية
- Rate limiting مشدد (20 requests/15min)
- 2FA إلزامي للأدوار الإدارية
- توجيه بعد الدخول: `/dashboard`

### 2. خدمة المصادقة الموحدة (Unified Auth Service)

**Backend Endpoint:** `POST /api/login`
- نفس الـ endpoint لكلا الصفحتين
- Passport.js LocalStrategy
- Session-based authentication
- PostgreSQL session store

**Authentication Flow:**
```
1. User submits credentials → /api/login
2. Passport validates email + password
3. Check user status (active/banned/suspended)
4. Check if 2FA is required
   ├─ Yes → Return { requires2FA: true }
   └─ No → Create session → Login success
5. Frontend handles redirect based on role
```

### 3. أولوية الأدوار وتوجيه المستخدم (Role Priority & Routing)

**Role Hierarchy (من الأعلى إلى الأدنى):**
1. `super_admin` → `/dashboard`
2. `admin` → `/dashboard`
3. `editor` → `/dashboard`
4. `reporter` → `/dashboard`
5. `opinion_author` → `/dashboard` (محرر محتوى رأي)
6. `moderator` → `/dashboard`
7. `content_creator` → `/dashboard`
8. `reader` → `/` (الصفحة الرئيسية)

**Multi-Role Users:**
- يتم استخدام أعلى دور في الأولوية
- يمكن للمستخدم التبديل بين الواجهات إذا كان لديه أكثر من دور
- Session واحدة تدعم جميع الأدوار

### 4. Route Guards (حراس المسارات)

#### Public Routes (لا تحتاج مصادقة)
- `/`
- `/news/:slug`
- `/opinion/:slug`
- `/category/:slug`
- `/login`
- `/admin/login`
- `/register`

#### Protected Routes - User
- `/profile`
- `/bookmarks`
- `/settings`

#### Protected Routes - Staff
- `/dashboard/*` (يتطلب أي دور غير reader)

#### Admin Only Routes
- `/dashboard/users` (admin, super_admin)
- `/dashboard/roles` (super_admin)
- `/dashboard/system` (super_admin)

### 5. Security Enhancements (تعزيزات الأمان)

#### For `/admin/login`:
1. **Stricter Rate Limiting:**
   - 20 requests per 15 minutes (vs 100 for `/login`)
   - IP-based tracking
   - Progressive delay after failed attempts

2. **Mandatory 2FA for Admin Roles:**
   - `admin`, `super_admin`, `editor` → 2FA required
   - Authenticator app (TOTP)
   - Backup codes

3. **Enhanced Monitoring:**
   - Log all admin login attempts
   - Alert on suspicious activity
   - Track login sources (IP, user agent)

4. **Session Security:**
   - Shorter session timeout for admin (4 hours vs 7 days)
   - Require re-authentication for sensitive actions

### 6. Frontend Implementation

#### Login Page (`/login`)
```tsx
- Simple form (email + password)
- Remember me checkbox
- Forgot password link
- Register link
- Social login buttons (future)
```

#### Admin Login Page (`/admin/login`)
```tsx
- Professional dark theme
- Email + password + 2FA code
- Security notice
- Admin branding
- No registration link
```

#### Shared Components
- `useAuth` hook
- Login mutation with error handling
- Redirect logic based on role
- 2FA verification modal

### 7. Role Switching (تبديل الأدوار)

**For Multi-Role Users:**
```tsx
// في الهيدر أو القائمة
{hasRole(user, 'reporter', 'editor', 'admin') && (
  <DropdownMenuItem>
    <Link href="/dashboard">لوحة التحكم</Link>
  </DropdownMenuItem>
)}

{user && (
  <DropdownMenuItem>
    <Link href="/">الصفحة الرئيسية</Link>
  </DropdownMenuItem>
)}
```

### 8. API Endpoints Summary

#### Authentication
- `POST /api/login` - تسجيل دخول موحد
- `POST /api/register` - تسجيل حساب جديد
- `POST /api/logout` - تسجيل خروج
- `GET /api/auth/user` - الحصول على بيانات المستخدم الحالي

#### 2FA
- `POST /api/2fa/verify` - تحقق من رمز 2FA
- `POST /api/2fa/enable` - تفعيل 2FA
- `POST /api/2fa/disable` - تعطيل 2FA
- `GET /api/2fa/qr` - الحصول على QR code

## Implementation Checklist

### Phase 1: Core Setup ✅
- [x] Document authentication flow
- [ ] Create `/login` page component
- [ ] Create `/admin/login` page component
- [ ] Add routes to App.tsx

### Phase 2: Backend Enhancement
- [ ] Add admin-specific rate limiter
- [ ] Implement role-based redirect logic
- [ ] Add admin login attempt logging
- [ ] Setup 2FA mandatory check for admin roles

### Phase 3: Frontend Guards
- [ ] Create `ProtectedRoute` component
- [ ] Create `AdminRoute` component
- [ ] Implement redirect logic in useAuth
- [ ] Add role switcher to navigation

### Phase 4: Security
- [ ] Test rate limiting on both endpoints
- [ ] Verify 2FA enforcement for admin
- [ ] Add session timeout handling
- [ ] Security audit

### Phase 5: Testing
- [ ] Test login flow for readers
- [ ] Test admin login with 2FA
- [ ] Test multi-role user switching
- [ ] Test route guards
- [ ] E2E testing with Playwright

## Notes

- جميع الأرقام تعرض بالإنجليزية: `toLocaleString('en-US')`
- جميع النصوص RTL للعربية
- استخدام Lucide icons فقط (لا emoji)
- تصميم رسمي بألوان أزرق ملكي (#1E3A8A)
