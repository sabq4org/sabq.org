# مواعيدك (`mawaeed`)

> آخر مراجعة: 2026-09-27 | المالك: التحرير (البيانات) / المنصة (الصفحة والحافة)

## الغرض
صفحة عامة على `/mawaeed` تعرض مواعيد الخدمات العامة القادمة في السعودية: الرواتب، حساب المواطن، الضمان الاجتماعي، التقاعد، وإجازات التقويم الدراسي 1448. الصفحة HTML خفيف من حافة Pages، والبيانات من JSON على الـ API.

## الحدود (In / Out of scope)
- داخل النطاق: السلاسل والمواعيد وسجل التغيير، صلاحية `mawaeed.edit`، لوحة `/dashboard/mawaeed`، الصفحة العامة وأقسامها، خريطة `sitemap-mawaeed.xml`.
- خارج النطاق: ملف `.ics`، صور المشاركة وواتساب، واجهة سجل التغيير للجمهور، وربط الأخبار بالوسوم. التقويم التحريري (`calendar`) ليس مصدر هذه الصفحة.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/mawaeedService.ts`, `server/routes/mawaeed.ts` |
| Web | `functions/mawaeedPage.js`, `functions/_middleware.js`, `client/src/pages/dashboard/MawaeedManagement.tsx` |
| Shared | `shared/mawaeed/*` |
| Schema | `mawaeed_series`, `mawaeed_occurrences`, `mawaeed_changes` في `shared/schema.ts` و`migrations/20260927_mawaeed.sql` |
| Seed | `scripts/seed-mawaeed.ts`, `migrations/20260927_mawaeed_seed.sql`, `data/mawaeed/2026-09-27-mawaeed-dates.csv` |

## التوثيق المرتبط
- [`docs/systems/seo-ssr/SYSTEM.md`](../seo-ssr/SYSTEM.md) — فرع HTML المبكر والكاش.
- [`docs/systems/auth-rbac/SYSTEM.md`](../auth-rbac/SYSTEM.md) — صلاحية التحرير.
- [`docs/systems/calendar/SYSTEM.md`](../calendar/SYSTEM.md) — نظام مختلف، لا يُستخدم هنا.

## عقود مهمة / Gotchas
- `dateModified` و`article:modified_time` من `content_updated_at` لآخر تغيير عام، لا من ساعة الطلب. تعديل الملاحظة الداخلية `rule_note` يُسجَّل في `mawaeed_changes` دون تحريك الختم.
- صف «يحتاج تحقق» يُزرع `published=false` و`certainty=unverified` ولا يظهر للجمهور. «محسوب» مع ثقة «مؤكد» يظهر بشارة «متوقع».
- بعد مرور اليوم المدني في الرياض: الرواتب وحساب المواطن والضمان والتقاعد تعرض «صُرفت»، والإجازة المدرسية تعرض «انتهت». يوم الموعد نفسه: «تُصرف اليوم» أو «تبدأ اليوم». العدّاد الحي أيام/ساعات في المتصفح؛ بلا جافاسكربت يبقى «بعد X يوماً» المحسوب على الخادم.
- المنطقة الافتراضية الرياض. مكة والمدينة وجدة والطائف مجموعة «غربية». الاختيار في `?region=` وفي `localStorage` بمفتاح `mawaeed-region`. الـ canonical بلا الاستعلام. مفتاح كاش الحافة يضم المنطقة حتى لا تختلط نسخة مكة بنسخة الرياض.
- إجازة 25 أكتوبر 2026 الإضافية للغرب مسودة؛ زيارة مكة ترى إجازة الخريف التالية إلى أن يؤكدها محرر.
- فشل الـ API يعيد 503 مع `noindex` و`no-store` ولا يسقط إلى قشرة SPA.
- كاش الحافة 60 ثانية. مفاتيح Workers لا تُمسح بمسح Cloudflare العادي. العدّاد قد يتأخر حتى دقيقة ثم يصححه السكربت.
- الهجري للعرض عبر `Intl` وتقويم أم القرى عند ظهر الرياض. المصدر المخزّن هو التاريخ الميلادي الذي يكتبه المحرر.
- إعادة البذر بالسكربت تتخطى الصف الذي لمسه مستخدم (`actor_user_id` غير فارغ) ولا تستبدل عناوين السلاسل التي عدّلها المحرر. ملف `migrations/20260927_mawaeed_seed.sql` يدرج الإدخال الأول فقط: `ON CONFLICT DO NOTHING`، و`hijri_label` و`public_note` فارغان كما يكتبهما السكربت، وختم السلاسل `2026-09-27T00:00:00.000+03:00`.
- ملف الهجرة مؤرخ `20260927_mawaeed.sql` ويمكن إعادة تسميته إن تعارض مع هجرة أخرى. الجداول جديدة فقط.
- حساب التشغيل `sabq_runtime` لا يرث صلاحية الجداول التي ينشئها `neondb_owner`. `migrations/20260927_mawaeed_runtime_grants.sql` يمنح `SELECT, INSERT, UPDATE, DELETE` على الجداول الثلاثة داخل `DO` يفحص `pg_roles`، فيُتخطى حيث لا يوجد الدور. يُشغَّل بمالك الجداول ولا يُنفَّذ مع نشر الكود. غيابه يعيد `42501 permission denied for table mawaeed_series` و500. الخطأ يُسجَّل في الطرفية ويُرسل إلى Sentry مع رمز Postgres.
- لا تُضاف حقائق هوية عن سبق (سنة التأسيس وغيرها) إلى الصفحة أو المخطط. `FAQPage` للقراءة الآلية بعد توقف نتائج الأسئلة الغنية في 7 مايو 2026.

## صحة وتشغيل
- `GET /api/mawaeed` و`GET /api/mawaeed/:slug` بكاش `public, max-age=30, s-maxage=60`.
- التحرير: `GET/POST/PUT /api/mawaeed/admin/...` بصلاحية `mawaeed.edit`. الأدمن يمر عبر اختصار المسؤول في `userHasPermission`.
- الاختبارات: `tests/unit/mawaeedDates.test.ts`, `mawaeedPage.test.ts`, `mawaeedApi.test.ts`, `mawaeedEdge.test.ts`.
- لا مفاتيح ذكاء اصطناعي.

## عند التعديل
- لا تضف مسار `/mawaeed` إلى `spaTopLevelRoutes`؛ الصفحة ليست SPA.
- لا تستورد `db` من ملف المسار.
- إن تغيّر العقد أو الكاش أو الصلاحية: حدّث هذا الملف و`lastReviewed` في السجل.
