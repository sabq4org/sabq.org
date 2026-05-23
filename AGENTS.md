# AGENTS.md — دليل عمل الذكاء الاصطناعي في مشروع سبق

## نظرة عامة

هذا الملف هو **المرجع الإلزامي** لكل Agent يعمل على مشروع سبق.
اقرأه كاملاً قبل تنفيذ أي مهمة.

---

## هيكل المشروع

```
sabq.org/
├── client/           ← الويب (React + Vite + TailwindCSS)
├── ios/              ← iOS (Swift / SwiftUI)
├── android-native/   ← Android (Kotlin / Jetpack Compose)
├── server/           ← Backend (Node.js + Express + Drizzle)
├── shared/           ← كود مشترك (Schema, Types, RBAC, Models)
└── migrations/       ← Database migrations
```

---

## قاعدة المنصات الثلاث 🔁

عند أي تعديل، اتبع هذه القاعدة دون استثناء:

### الخطوة 1 — تحديد نوع المهمة

| النوع | أمثلة | يأثر على |
|-------|--------|----------|
| **Business Logic** | حساب، قاعدة، منطق عمل | الثلاث + shared/ |
| **UI / تصميم** | لون، خط، مكان عنصر | كل منصة بشكل مستقل |
| **API / Backend** | endpoint، response، auth | server/ + الثلاث |
| **Database** | schema، migration | server/ + shared/ |
| **Platform-specific** | إشعار iOS، widget Android | منصة واحدة |

### الخطوة 2 — Checklist إلزامية قبل أي commit

```
[ ] نفّذت التعديل في المنصة الأصلية
[ ] فحصت client/ — هل يتأثر؟ → نفّذت أو وثّقت السبب
[ ] فحصت ios/ — هل يتأثر؟ → نفّذت أو وثّقت السبب
[ ] فحصت android-native/ — هل يتأثر؟ → نفّذت أو وثّقت السبب
[ ] فحصت shared/ — هل تحتاج تعديل في الكود المشترك؟
[ ] كتبت تقرير التغييرات في الـ PR
```

### الخطوة 3 — تقرير ختامي في كل PR

```markdown
## ملخص التغييرات

### المنصة الأصلية
- [وصف التغيير]

### فحص المنصات الأخرى
- **الويب (client/):** ✅ تم التعديل / ⚪ غير متأثر / ❌ يحتاج متابعة
- **iOS (ios/):** ✅ تم التعديل / ⚪ غير متأثر / ❌ يحتاج متابعة  
- **Android (android-native/):** ✅ تم التعديل / ⚪ غير متأثر / ❌ يحتاج متابعة

### Shared Code
- ✅ تم التعديل / ⚪ لا يحتاج تعديل
```

---

## قواعد الكود

### عام
- لا تغيّر شيئاً خارج نطاق المهمة
- إذا اكتشفت مشكلة جانبية → افتح Issue منفصل، لا تصلحها في نفس الـ PR
- التوثيق باللغة العربية مسموح في التعليقات

### الويب (client/)
- Framework: React + Vite
- Styling: TailwindCSS
- لا تضف dependencies جديدة بدون موافقة

### iOS (ios/)
- Language: Swift
- UI: SwiftUI
- Target: iOS 16+

### Android (android-native/)
- Language: Kotlin
- UI: Jetpack Compose
- Target: Android API 26+

### Backend (server/)
- Language: TypeScript / Node.js
- ORM: Drizzle
- لا تغيّر الـ schema بدون migration

### Shared (shared/)
- أي تغيير هنا يأثر على الثلاث — تأكد دائماً

---

## إدارة المهام عبر GitHub Issues

### Labels المستخدمة
- `platform:web` — الويب
- `platform:ios` — iOS
- `platform:android` — Android
- `platform:all` — الثلاث
- `type:bug` — خطأ
- `type:feature` — ميزة جديدة
- `type:improvement` — تحسين
- `priority:high` — عاجل
- `priority:medium` — عادي
- `priority:low` — منخفض

### تسلسل العمل
1. Issue مفتوح بـ template صحيح
2. Agent يقرأ AGENTS.md
3. Agent يحدد المنصات المتأثرة
4. Agent ينفّذ بالتسلسل
5. Agent يكتب PR بتقرير كامل

---

## الأولويات

```
P1 (Critical)  → أي شيء يوقف المستخدم عن القراءة أو التسجيل
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

---

*آخر تحديث: 2026-05-23 | المسؤول: فريق سبق التقني*
