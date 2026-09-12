# تجربة البحث التحريري — Agents API

تتبع [#1626](https://github.com/sabq4org/sabq.org/issues/1626). يكتب المحرر موضوعًا، يجمع وكيل واحد أدلة عامة ويفتح مصادرها، ثم يجهّز محرر سبق تقريرًا للمراجعة. النطاق المعتمد هو التنفيذ المحلي والتقييم؛ النشر/DDL الإنتاجي خطوة تسليم مستقلة.

## العقود

- **Web:** «محرر سبق» → «بحث وإعداد تقرير»، موضوع، سجل مهام خاص، حالة، ملخص بحث، مصادر، نقاط غير محسومة، مراجعة التقرير، إدراج يدوي. متجاوب وRTL، استعادة من قاعدة البيانات بعد إغلاق الصفحة.
- **API:** `GET /api/editorial-research/capabilities` و`GET/POST /api/editorial-research/jobs` و`GET /api/editorial-research/jobs/:id` و`POST .../:id/cancel`. Passport + `articles.ai_generate`؛ POST يمر عبر CSRF الحالي. جسم الإنشاء `{requestId: UUID, topic: string(20..2000)}` فقط.
- **Schema:** جدول إضافي `editorial_research_jobs` كما في `shared/schema.ts`؛ SQL المخصص لا يحذف بيانات أو يعدل جداول أخرى.
- **Mobile:** `status:deferred-to-v2`؛ اختبار الاستخدام التحريري أولًا، لا تعديل مستهلكي API الحاليين.

## تشغيل محلي وتحقق

1. طبّق `scripts/sql/add-editorial-research-jobs-2026-09-12.sql` على قاعدة التطوير المحلية فقط؛ يجب أن يوجد جدول users.
2. في بيئة الخادم، استخدم `OPENAI_API_KEY` المجهز بصلاحيات agents read/write وresponses write. لا تضف المفتاح إلى sandbox أو VITE أو ملفات المشروع.
3. فعّل `EDITORIAL_RESEARCH_ENABLED=true` و`EDITORIAL_RESEARCH_WORKER_ENABLED=true`، وتأكد أن إعداد الخادم يسمح بالـbackground jobs. كلا المفتاحين مطفأ افتراضيًا.
4. افتح محرر الويب بحساب يملك `articles.ai_generate`، ثم «محرر سبق» → «بحث وإعداد تقرير».
5. اختبر مصدرًا عامًا معلومًا أولًا؛ راجع الادعاءات والمصادر يدويًا، ثم أدرج النتيجة عند قبولها. لا حفظ/نشر مقال تلقائي.

```bash
EDITORIAL_RESEARCH_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:5432/postgres \
  npx vitest run tests/unit/editorialResearchProvider.test.ts tests/unit/editorialResearch.integration.test.ts
PW_BASE_URL=http://127.0.0.1:5196 npx playwright test e2e/editorial-research.spec.ts --workers=1
npx tsc --noEmit
npm run build
```

الاختبار SQL ينشئ schema عشوائيًا ويحذفه، ويرفض أي host خارج localhost؛ لا يستخدم DATABASE_URL العام. اختبار المتصفح يستخدم Vite ومكوّن المحرر الحقيقي باستجابات اختبار. التقييم الحي يتطلب `EDITORIAL_RESEARCH_LIVE_EVAL=1` وملف evidence عام ووجهة output صريحين، وهو مدفوع.

## حدود التشغيل والاسترداد

- مهمة واحدة لكل محرر، مهمتان متزامنتان عالميًا، 5 طلبات خلال 24 ساعة. UUID ثابت عند إعادة محاولة اتصال غير محسوم.
- لا عقد idempotency مفترض لإنشاء session؛ حالة starting تستعيد session بالـmetadata دون تكرار POST. بعد 5 دقائق ومراجعة خالية لدى المزوّد تُغلق محاولة غير موجودة. عند تعذر الوصول تبقى المحاولة معلقة لحين عودة الاتصال، ولا تُفتح سعة مدفوعة جديدة على افتراض الفشل.
- العامل يراجع كل 10 ثوانٍ. مهلة البحث 5 دقائق وعتبة usage مقدارها 100000 توكن إشارتان للإلغاء أثناء التنفيذ، وليستا سقف تكلفة صارمًا. غياب التشغيل/تعطل API يؤخر الإلغاء. الإنشاء القديم في الطابور ينتهي قبل تشغيله.
- التحقق لا يقبل idle بدل completed turn، ولا مصادر من بحث لم يثبت فتحها. فتح الرابط لا يثبت صحة إسناد كل جملة؛ المراجعة البشرية لازمة.
- مرحلة التحرير تُستدعى مرة بعد claim ذري، ويمنع الإلغاء تطبيق نتيجة وصلت متأخرة. lease التحرير 15 دقيقة، وبعدها تُغلق المرحلة المنقطعة دون إعادة استدعاء مدفوع. ملف البحث يبقى متاحًا.
- بعد حفظ النتائج أو تأكيد الإلغاء تُحذف جلسة المزوّد، بينما يبقى السجل المحلي. لذلك المتابعة الحالية تعني استرجاع نتيجة المهمة وليست محادثة متعددة الأدوار مع جلسة مكتملة. لا تُحذف جلسات أخرى بالحساب.
- usage المدون أفضل جهد وقد يتأخر؛ لا يتضمن فاتورة الأدوات أو sandbox أو مرحلة التحرير. سجل التحرير المالي يبقى في مساره الحالي. لا مقارنة تكلفة شاملة قبل الاطلاع على فاتورة/استعمال المزوّد.
- تعطيل `EDITORIAL_RESEARCH_ENABLED` يوقف الطلبات الجديدة؛ اترك WORKER مفعّلًا لتفريغ المهام وتنظيف الجلسات قبل إيقافه.

## النشر اللاحق

يلزم تطبيق DDL الإضافي والتحقق منه، ثم نشر API/الواجهة، ثم تفعيل المفاتيح في بيئة الخادم وتجربة حساب محرر في المسار الفعلي. لا يكفي نجاح اختبار API أو لقطة الواجهة وحدهما لإثبات التشغيل الإنتاجي. تظل التجربة قابلة للإيقاف بمفتاح القبول.

المراجع: [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)، [حالات الجلسات](https://developers.openai.com/api/docs/guides/agents-api/sessions)، [الاستهلاك](https://developers.openai.com/api/docs/guides/agents-api/observability)، [بحث الويب](https://developers.openai.com/api/docs/guides/agents-api/tools/web-search).
