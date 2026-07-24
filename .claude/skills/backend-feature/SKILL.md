---
name: backend-feature
description: إضافة ميزة خلفية جديدة في سبق (جدول + خدمة + مسارات + صلاحيات) — سلسلة ADR-001 الكاملة وفخاخ الصلاحيات والإنتاج. استخدمها عند بناء أي endpoint أو جدول أو نظام جديد في server/.
---

# بناء ميزة خلفية في سبق

## السلسلة القياسية (ADR-001)

1. **الجدول** في `shared/schema.ts` (هو مصدر الحقيقة — لا migrations في سير العمل الاعتيادي). إن كانت الميزة محتوى متعدد اللغات، حدّث العائلات الثلاث معًا (`articles`/`en_articles`/`ur_articles` ونظيراتها).
2. **الخدمة** في `server/services/<feature>Service.ts` — استعلامات Drizzle تعيش هنا فقط.
3. **المسارات** في `server/routes/<feature>Routes.ts` — **ممنوع استيراد `db` في ملفات المسارات** (ESLint يمنعه). `server/storage.ts` مجمَّد: لا تضف إليه شيئًا.
4. **التسجيل** في `server/routes/splitRoutesIndex.ts` — لا تضف إلى `server/routes.ts` المونوليث.

مثال حي مكتمل بهذا النمط: نظام الاجتماعات (`meetingsService.ts` + `meetingsRoutes.ts`، PR \u200E#1133).

## الصلاحيات — الفخ المجرَّب

- أكواد نصية بنمط hr: `feature.view` / `feature.create` / `feature.manage` في `shared/rbac-constants.ts`.
- **درس 403 الاجتماعات (PR \u200E#1134):** الأكواد النصية الجديدة غير مزروعة في جدول `permissions`، لذا `getUserPermissions(userId).includes(code)` يرجع 403 لغير الأدمن. تحقق دائمًا عبر `userHasPermission(userId, code)` — هو الذي يفهم الأكواد النصية.
- أي فلتر تنقّل جديد في الواجهة يجب أن يختصر على `permissions.includes("*")` وإلا رأى الأدمن قائمة فارغة.

## الوصول لقاعدة الإنتاج

- **لا `db:push` على الإنتاج أبدًا.** `DATABASE_URL` في `.env.local` فرع Neon قديم (لقطة) وليس قاعدة الإنتاج — أي كتابة عليه تضيع بصمت.
- الجداول/الأعمدة الجديدة تصل الإنتاج عبر **SQL يدوي idempotent** (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) يوضع في وصف الـ PR لينفذه المالك في Neon، أو مهمة one-shot عند الإقلاع (نمط `server/jobs/oneShotStoriesArchive.ts`).
- قراءة بيانات الإنتاج للتشخيص: Railway CLI (`railway variables --json` ثم psql) — قراءة فقط.

## الواجهة

- اتفاقية TanStack: الاستعلام يرجع `null` لا `undefined` — كل مستهلك مصفوفة يحرس: `const data = Array.isArray(dataRaw) ? dataRaw : [];`
- صفحات اللوحة الجديدة: راجع مهارة `sabq-visual-identity`.
