# إصلاح 429 على تسجيل الدخول — انهيار IP الزائر عبر طبقة الـ edge

**التاريخ:** 2026-06-03  
**الـ commit:** `0baa1c2` (`fix(ratelimit): تمرير IP الزائر الحقيقي عبر طبقة الـ edge`)  
**الأولوية:** P1 — يمنع تسجيل الدخول في تطبيق iOS والويب عبر `sabq.org/api/*`

---

## الأعراض

- تطبيق **iOS**: رسالة **«تم تجاوز حد الطلبات. يرجى المحاولة مرة أخرى بعد قليل»** عند الدخول بـ Apple / Google / البريد.
- الدخول بالبريد قد يظهر **«حدث خطأ في تسجيل الدخول»** (لأن `AuthStore` يخفي أخطاء غير `APIError` — الـ 429 أحياناً لا يُفكّ بشكل صريح).
- **الويب** عبر `sabq.org` (طلبات POST على `/api/*`): نفس الـ 429 على تسجيل الدخول والتعليقات والتفاعلات.

---

## السبب الجذري

### آلية الـ rate limit في الـ backend

في `server/index.ts` يُطبَّق `writeLimiter` على كل طلبات **الكتابة** تحت `/api/*`:

- **السقف:** 1000 طلب / 15 دقيقة لكل مفتاح (`rateLimitKey`).
- **المفتاح:** `cf-connecting-ip` (أو Bearer token / `req.user.id` عند توفرهما).
- مسارات المصادقة (`POST /api/v1/auth/login`, `/auth/google`, `/auth/apple`) **لا** تملك `authLimiter` خاصاً — تمر عبر هذا الـ limiter العام.

عندما يصل الطلب إلى Express، الدالة `rateLimitKey()` تقرأ IP الزائر بهذا الترتيب (بعد الإصلاح):

1. `x-sabq-client-ip` / `true-client-ip` (IP حقيقي من طبقة الـ edge)
2. `cf-connecting-ip`
3. أول قيمة في `X-Forwarded-For`
4. `req.ip`

### ماذا يفعل الـ proxy في Cloudflare؟

عندما **Cloudflare Pages** (`functions/_middleware.js`) أو **Worker** (`frontend-edge-worker.js`) يعيد إرسال الطلب بـ:

```js
fetch(targetUrl, { headers: request.headers, body: ... })
```

تستبدل Cloudflare قيمة **`cf-connecting-ip`** في الطلب الصادر إلى `api.sabq.org` / Railway بـ **IP خروج واحد** للطبقة الوسيطة (Pages Function أو Worker). النتيجة:

```
كل زوار sabq.org  →  نفس cf-connecting-ip  →  bucket واحد  →  1000/15د ينفد فوراً  →  429 للجميع
```

### لماذا `api.sabq.org` كان يعمل؟

بعد إزالة `api.sabq.org` من routes الـ worker `sabq-frontend-edge` (2026-05-31)، الطلبات إلى `api.sabq.org` تصل **مباشرة** إلى Railway دون proxy وسيط → `cf-connecting-ip` = IP الجهاز الحقيقي → bucket منفصل لكل زائر.

### علاقة حذف routes من `sabq-frontend-edge`

| الإجراء | النتيجة |
|---------|---------|
| حذف `api.sabq.org` من الـ worker | ✅ صحيح — API مباشر، rate limit سليم |
| حذف `sabq.org` من الـ worker | ✅ صحيح — لكن المسار انتقل إلى **Cloudflare Pages** (`functions/_middleware.js`) الذي يعيد نفس مشكلة `fetch()` |
| `sabq.org` اليوم | Pages يعمل `proxyToApi()` → `https://api.sabq.org` + نفس انهيار IP |

الـ worker القديم موثّق كـ «متقاعد» في `cloudflare-worker/wrangler.frontend.toml` (routes فارغة من 2026-05-31). المشكلة الفعلية على الإنتاج كانت في **Pages middleware** وليس في الـ worker المنشور حالياً.

---

## الدليل التشخيصي (قبل الإصلاح)

```bash
# عبر sabq.org (proxy) — bucket ممتلئ من أول طلب
curl -s -D - -o /dev/null -X POST https://sabq.org/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"x@x.com","password":"y"}' \
  | grep -E "HTTP|ratelimit-remaining"
# HTTP/2 429
# ratelimit-remaining: 0
# ratelimit-limit: 1000

# عبر api.sabq.org (مباشر) — سليم
curl -s -D - -o /dev/null -X POST https://api.sabq.org/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"x@x.com","password":"y"}' \
  | grep -E "HTTP|ratelimit-remaining"
# HTTP/2 401  (بيانات خاطئة = وصل للخادم)
# ratelimit-remaining: 992
```

رسالة الـ 429 في JSON:

```json
{"message":"تم تجاوز حد الطلبات. يرجى المحاولة مرة أخرى بعد قليل"}
```

تُولَّد من `rateLimitHandler` في `server/index.ts` (وليس من `authLimiter` الذي رسالته مختلفة: «تم تجاوز حد محاولات تسجيل الدخول…»).

---

## الحل (ثلاث طبقات)

```
┌─────────────┐     cf-connecting-ip = IP حقيقي      ┌──────────────────┐
│  تطبيق iOS  │ ──────────────────────────────────►│ api.sabq.org     │
│  (بعد TF)   │                                    │ (مباشر → Railway) │
└─────────────┘                                    └────────┬─────────┘
                                                            │
┌─────────────┐     cf-connecting-ip = IP حقيقي            │ rateLimitKey
│  تطبيق iOS  │ ──► sabq.org ──► Pages middleware ────────┤ يقرأ
│  (الحالي)   │         │              │                    │ X-Sabq-Client-IP
└─────────────┘         │              └─ يضيف ────────────►│ أولاً
                        │                 X-Sabq-Client-IP  ▼
                        └──────────────────────────► api.sabq.org → Railway
```

### 1) Cloudflare Pages — `functions/_middleware.js`

في `proxyToApi()` قبل `fetch()` إلى `API_ORIGIN`:

- قراءة `cf-connecting-ip` من الطلب **الوارد** (ما زال IP الزائر الحقيقي داخل الـ Function).
- إضافة ترويسة **`X-Sabq-Client-IP`** إلى الطلب الصادر.

### 2) Backend — `server/index.ts`

في `rateLimitKey()`:

- تفضيل `x-sabq-client-ip` و`true-client-ip` قبل `cf-connecting-ip`.

### 3) Worker (احتياطي) — `cloudflare-worker/frontend-edge-worker.js`

نفس منطق `withClientIp()` لطلبات GET/HEAD/POST — في حال إعادة ربط routes `sabq.org/*` بالـ worker لاحقاً (انظر `wrangler.frontend.toml`).

### 4) تطبيق iOS — `sabq app ios/sabq/Services/URLConstants.swift`

تحويل نقاط API من `https://sabq.org/api/...` إلى `https://api.sabq.org/api/...` مع إبقاء `webOrigin = https://sabq.org` لروابط المشاركة.

- **حماية إضافية** بعد إصدار TestFlight/App Store.
- **ليس شرطاً** للإصلاح الفوري إذا نُشرت الطبقتان 1 و 2.

---

## النشر والتحقق

### متطلبات النشر (للإصلاح الفوري بدون تحديث التطبيق)

| المكوّن | الملف | آلية النشر المعتادة |
|---------|-------|---------------------|
| Railway (API) | `server/index.ts` | push إلى `main` → بناء Docker تلقائي |
| Cloudflare Pages (`sabq-org`) | `functions/_middleware.js` | push إلى `main` (فرع الإنتاج) أو نشر يدوي |

**يجب اكتمال الاثنين.** نشر Railway وحده لا يكفي إذا Pages لم يمرّر الترويسة بعد.

### اختبار ما بعد النشر

```bash
curl -s -D - -o /dev/null -X POST https://sabq.org/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}' \
  | grep -E "HTTP|ratelimit-remaining|ratelimit-limit"
```

**المتوقع بعد الإصلاح:**

- `HTTP/2 401` (أو 400) — وليس 429
- `ratelimit-remaining` > 0

### هل يحتاج المستخدم تحديث التطبيق من أبل؟

| السيناريو | تحديث التطبيق مطلوب؟ |
|-----------|----------------------|
| نُشر Railway + Cloudflare Pages (الإصلاح 1+2) | **لا** — التطبيق الحالي يضرب `sabq.org` والـ proxy يمرّر IP الحقيقي |
| نُشر iOS فقط (`URLConstants` → `api.sabq.org`) | **نعم** — يحتاج بناء TestFlight/App Store |
| الأفضل على المدى البعيد | الاثنان: Pages+backend فوراً، ثم إصدار iOS للمسار المباشر |

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `functions/_middleware.js` | `X-Sabq-Client-IP` في `proxyToApi()` |
| `server/index.ts` | `rateLimitKey()` يقرأ الترويسة الموثوقة أولاً |
| `cloudflare-worker/frontend-edge-worker.js` | `withClientIp()` لكل `fetch` إلى الأصل |
| `sabq app ios/sabq/Services/URLConstants.swift` | `apiOrigin = https://api.sabq.org` |

---

## منع الانتكاس

1. **لا تعيد ربط `sabq.org/*` بالـ worker وPages معاً** — حقن SEO مزدوج (انظر `docs/MIGRATION_CLOUDFLARE_PAGES.md`).
2. أي proxy جديد عبر Worker/Pages يعيد `fetch(request)` **يجب** أن يمرّر `X-Sabq-Client-IP` (أو يستخدم `api.sabq.org` مباشرة للموبايل).
3. عند إضافة rate limiter جديد، لا تعتمد على `cf-connecting-ip` وحده خلف proxy.
4. راقب `ratelimit-remaining: 0` على `POST /api/v1/auth/login` من `sabq.org` كإنذار مبكر.

### مسارات مصادقة مستثناة (اختياري مستقبلي)

إن لزم، يمكن استثناء `POST /api/v1/auth/*` من `writeLimiter` والاعتماد على `authLimiter` (5 محاولات / 15 دقيقة) في `mobileApiRoutes.ts` — **لم يُنفَّذ** في هذا الإصلاح؛ الحل الحالي يعالج السبب الجذري (مفتاح IP) دون تخفيف الأمان العام.

---

## مراجع

- `docs/MIGRATION_CLOUDFLARE_PAGES.md` — بنية Pages + `EDGE_SEO`
- `cloudflare-worker/wrangler.frontend.toml` — إيقاف routes الـ worker 2026-05-31
- `cloudflare-worker/deploy-frontend-edge.sh` — نشر الـ worker إن أُعيدت routes
- `CLAUDE.md` — قسم rate limiting (`cf-connecting-ip`, Bearer keying)
