# AGENTS.md — دليل عمل الذكاء الاصطناعي في مشروع سبق

## نظرة عامة

هذا الملف هو **المرجع الإلزامي** لكل Agent يعمل على مشروع سبق.
اقرأه كاملاً قبل تنفيذ أي مهمة.

> 📖 **مراجع إلزامية:** [`CLAUDE.md`](CLAUDE.md) (RBAC، Caching، Storage، gotchas) · [`docs/DEPLOYMENT_STATUS.md`](docs/DEPLOYMENT_STATUS.md) (**الإنتاج الحالي:** Cloudflare Pages + Railway — انتقلنا من Replit منتصف مايو 2026).

---

## كتالوج الأنظمة — بوابة قراءة إلزامية 🗂️

المشروع فيه أنظمة منتج مستقلة (ولاء، توقعات، تحرير، iFox، مقترب، …).  
**مصدر الحقيقة:** [`docs/systems/registry.json`](docs/systems/registry.json) + [`docs/systems/<id>/SYSTEM.md`](docs/systems/README.md).

### قاعدة الـ Agent (لا تُتخطى)
1. قبل أي تعديل: طابق المسارات مع `pathGlobs` في السجل → حدّد `id`.
2. اقرأ `docs/systems/<id>/SYSTEM.md` كاملاً.
3. صرّح في أول تنفيذ أنك قرأت الملف.
4. لا توسّع لنظام مجاور دون Issue/موافقة.
5. إن تغيّر العقد أو نقاط الدخول: حدّث `SYSTEM.md` و`lastReviewed` في نفس الـ PR.

التفاصيل: [`docs/systems/README.md`](docs/systems/README.md) · [`docs/systems/GOVERNANCE.md`](docs/systems/GOVERNANCE.md) · [`.cursor/rules/systems-docs-gate.mdc`](.cursor/rules/systems-docs-gate.mdc).

```bash
# جرد محلي + تحديث لقطة الإنتاج
node scripts/systems-inventory.mjs --write-snapshot
```

لوحة الأدمن: `/dashboard/systems-catalog` (صلاحية `system.manage_settings`).

---

## هيكل المشروع

```
sabq.org/
├── client/           ← الويب (React + Vite + TailwindCSS + Wouter)
├── ios/              ← iOS (Swift / SwiftUI)
├── android-native/   ← Android (Kotlin / Jetpack Compose)
├── android/          ← (قديم — Capacitor، في طور الإيقاف؛ لا تطوّر فيه)
├── server/           ← Backend (Node.js + Express + Drizzle)
├── shared/           ← كود مشترك (Schema, Types, RBAC, Models)
└── migrations/       ← Database migrations (تاريخي — استخدم `npm run db:push`)
```

### Path aliases (في `client/`)
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*` (Vite فقط)

---

## فلسفة المنصات 🔁

### القاعدة الذهبية
> **iOS هو المرجع الرسمي للأندرويد** — تصميماً وسلوكاً، 1:1.
> **الويب مستقل بصرياً** — يطابق وظيفياً فقط (الميزة موجودة)، لكن التصميم حر بحكم اختلاف سياق الديسكتوب.

| العلاقة | المستوى المطلوب |
|---------|------------------|
| iOS ↔ Android | **parity صارم** — نفس الشاشة، نفس التوزيع، نفس الألوان والمسافات. اقرأ كود iOS كاملاً قبل أي port إلى Android. |
| Web ↔ iOS/Android | **parity وظيفي فقط** — الميزة متوفرة، الـ API واحد، لكن الـ UI يتبع تصميم الويب |
| Backend ↔ الثلاث | **مصدر واحد** — `/api/v1/*` للموبايل (Bearer)، `/api/*` للويب (Passport) |

### تصنيف المهام

| النوع | يأثر على | الترتيب |
|-------|----------|---------|
| **Schema / Database** | server/ + shared/ + الثلاث | schema → backend → iOS → Android → web |
| **API / Backend** | server/ + الثلاث (مستهلكي API) | backend → iOS → Android → web |
| **Business Logic** | حسب الموقع | حدّد الـ source of truth أولاً |
| **UI iOS** | ios/ → android-native/ يلحق | iOS أولاً، Android يطابق |
| **UI Web** | client/ فقط | لا يلزم Android/iOS |
| **Platform-specific** | منصة واحدة | (مثل widget، إشعار محلي) |

---

## Workflow A — ميزة جديدة

### الخطوة 1: Spec قبل الكود
افتح **Umbrella Issue** بعنوان `[FEATURE] <اسم الميزة>` وحدّد فيها:
- **Spec UI**: سكتشات/وصف من iOS (المرجع البصري لأندرويد)
- **Spec API**: endpoint + payload + auth (Bearer `/api/v1` أم Passport؟)
- **Spec Schema**: هل يحتاج جدول/عمود جديد؟
- **Spec Web**: هل يحتاج تصميماً مستقلاً (الافتراضي نعم)؟

> ❗ لا تبدأ كود قبل اكتمال هذه الأربعة. هذا يمنع 80% من إعادة العمل.

### الخطوة 2: Backend أولاً
PR منفصل يضم schema + endpoint. ينشر على Railway قبل أي عمل منصة.

### الخطوة 3: iOS أولاً (بعد الـ backend)
- يبني بجودة عالية (هو المرجع لأندرويد)
- يرفع TestFlight ثم Apple Review مباشرة
- التطوير على الويب/أندرويد يبدأ بالتوازي بدون انتظار

### الخطوة 4: Android-native (يطابق iOS 1:1)
- اقرأ كود iOS كاملاً قبل أي port
- نفس التخطيط، الألوان، المسافات، المكونات
- لا تبسيط ولا "أول إصدار خفيف"

### الخطوة 5: Web (تصميم مستقل، نفس الميزة)
- يستهلك نفس endpoints
- التصميم يتبع نظام التصميم الحالي للويب

### الخطوة 6: إقفال Umbrella
لا تُقفل إلا لما الثلاث تكون shipped أو محددة بـ `status:deferred-to-vX.Y` مع سبب.

---

## Workflow B — إصلاح خطأ (Bug Fix)

### قاعدة الفلتر السريع
```
البق في UI منصة واحدة؟        → فرع واحد، PR واحد، خلاص
البق في الـ API/Schema؟       → backend fix → فحص استهلاك كل منصة → PRs منفصلة
البق في shared/ ؟             → cross-platform — Umbrella Issue
```

> أكثر الأخطاء منصة واحدة فقط. لا تجبر فحص الثلاث على كل bug fix.

---

## Workflow C — تغيير Schema (الأخطر)

> أي PR يمس `shared/schema.ts` لازم **يضيف عمود ما يحذف**، إلا في تنظيف مخطط له.

### تسلسل آمن
1. **PR 1**: أضف الحقل الجديد (nullable أو default) → `npm run db:push` على staging
2. **PR 2**: backend يكتب فيه ويعيده في الـ response
3. **PR 3-5**: iOS / Android / Web تستهلكه أو تتجاهله
4. **PR 6 (لاحقاً)**: لو فيه عمود قديم بدّلناه، نحذفه بعد تأكيد عدم الاستخدام

---

## قواعد الكود

### عام
- لا تغيّر شيئاً خارج نطاق المهمة
- إذا اكتشفت مشكلة جانبية → افتح Issue منفصل، لا تصلحها في نفس الـ PR
- التوثيق باللغة العربية مسموح في التعليقات
- **تحقق من الفرع قبل أي push:** `git branch --show-current` — الفرع ينقلب أحياناً إلى main بصمت

### الويب (client/)
- Framework: React + Vite + Wouter
- Styling: TailwindCSS
- State: TanStack Query (لاحظ: يعيد `null` لا `undefined` — اضمن guard على المصفوفات)
- لا تضف dependencies جديدة بدون موافقة

### iOS (ios/)
- Language: Swift
- UI: SwiftUI
- **Deployment Target: iOS 17.0** (إجباري — Apple رفضت بناء 26.2-locked سابقاً)
- iOS 18+ APIs خلف `if #available(iOS 18, *)`

### Android (android-native/)
- Language: Kotlin
- UI: Jetpack Compose
- Target: Android API 26+
- **يطابق iOS 1:1** — اقرأ ملف iOS المقابل كاملاً قبل البدء

### Backend (server/)
- Language: TypeScript / Node.js + Express
- ORM: Drizzle (`shared/schema.ts` هو الـ source of truth)
- **Endpoints الموبايل:** `/api/v1/*` فقط + `verifyMemberSession` (Bearer token)
- **Endpoints الويب:** `/api/*` + Passport session
- لا تخلط بين النظامين — Mobile auth ≠ Web auth

### Shared (shared/)
- أي تغيير هنا يأثر على الثلاث — تأكد دائماً
- التغييرات additive only (راجع Workflow C)

---

## إدارة المهام عبر GitHub Issues

### Labels
| Label | المعنى |
|-------|--------|
| `platform:web` `platform:ios` `platform:android` `platform:all` | المنصة المتأثرة |
| `type:bug` `type:feature` `type:improvement` `type:parity` | نوع المهمة |
| `priority:high` `priority:medium` `priority:low` | الأولوية |
| `status:in-review-apple` | في انتظار Apple Review |
| `status:blocked-by-backend` | ينتظر API |
| `status:behind-platform` | متأخر عن منصة ثانية (parity gap) |

### Project Board: "Sabq Roadmap"
الأعمدة: `Backlog → Spec → Backend → iOS → Android → Web → In Apple Review → Shipped`

كل Umbrella Issue تتنقل عبر الأعمدة. الـ sub-PRs تترابط بـ `Tracked by #123`.

### تسلسل العمل
1. Issue مفتوح بـ template صحيح
2. Agent يقرأ AGENTS.md + CLAUDE.md
3. Agent يحدد المنصات المتأثرة والترتيب (Workflow A/B/C)
4. Agent ينفّذ بالتسلسل عبر PRs منفصلة
5. كل PR يقفل sub-issue، Umbrella تُقفل في النهاية

---

## الأولويات

```
P1 (Critical)  → يوقف المستخدم عن القراءة أو التسجيل
P2 (High)      → خطأ واضح يزعج المستخدم
P3 (Medium)    → تحسين مطلوب
P4 (Low)       → تلميع وتجميل
```

---

## ممنوع مطلقاً ❌

- لا ترسل أي بيانات مستخدمين خارج المشروع
- لا تغيّر ملفات `.env` أو `secrets`
- لا تدمج إلى `main` مباشرة — دائماً عبر PR
- لا تحذف migrations موجودة
- **لا تعدّل migration قديم** — أضف migration/تغيير جديد فقط
- **لا تستخدم `--no-verify` أو `--no-gpg-sign`** بدون إذن صريح
- **لا تشغّل `npm run db:push` ضد `DATABASE_URL` يحتوي `prod`/`production`** — استخدم `./push-to-production.sh` التفاعلي
- لا تطوّر داخل `android/` (Capacitor قديم) — كل عمل أندرويد في `android-native/`

---

*آخر تحديث: 2026-05-23 | المسؤول: فريق سبق التقني*
