# مواعيدك (`mawaeed`)

> آخر مراجعة: 2026-10-16 | المالك: التحرير (البيانات) / المنصة (الصفحة والحافة)

## الغرض
صفحة عامة على `/mawaeed` تعرض مواعيد الخدمات العامة القادمة في السعودية: الرواتب، حساب المواطن، الضمان الاجتماعي، التقاعد، وإجازات التقويم الدراسي 1448. الصفحة HTML خفيف من حافة Pages، والبيانات من JSON على الـ API.

## الحدود (In / Out of scope)
- داخل النطاق: السلاسل والمواعيد وسجل التغيير، صلاحية `mawaeed.edit`، لوحة `/dashboard/mawaeed`، الصفحة العامة وأقسامها، خريطة `sitemap-mawaeed.xml`، وصفحات الخدمة الدائمة التي تقرأ هذا السجل (`/services/citizen-account-date` و`/services/government-salaries-date`).
- خارج نطاق صفحة `/mawaeed` نفسها: ملف `.ics` قائم، وصور مشاركة وواتساب خاصة بها، وواجهة سجل التغيير للجمهور، وربط الأخبار بالوسوم. التقويم التحريري (`calendar`) ليس مصدر هذه الصفحة.
- صفحات الخدمة تولّد `.ics` وصورة مشاركة من المواعيد المنشورة فقط، دون تخزين. `/mawaeed` تبقى بلا ملف تقويم قائم.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/mawaeedService.ts`, `server/routes/mawaeed.ts`, `server/routes/servicePages.ts`, `server/services/servicePageOgImage.ts` |
| Web | `functions/mawaeedPage.js`, `functions/_middleware.js`, `client/src/pages/ServiceDatePage.tsx`, `web-next/app/services/[id]/page.tsx`, `client/src/pages/dashboard/MawaeedManagement.tsx` |
| Shared | `shared/mawaeed/*`, `shared/servicePages/*` |
| Schema | `mawaeed_series`, `mawaeed_occurrences`, `mawaeed_changes` في `shared/schema.ts` و`migrations/20260927_mawaeed.sql` |
| Seed | `scripts/seed-mawaeed.ts`, `migrations/20260927_mawaeed_seed.sql`, `data/mawaeed/2026-09-27-mawaeed-dates.csv` |

## التوثيق المرتبط
- [`docs/systems/seo-ssr/SYSTEM.md`](../seo-ssr/SYSTEM.md) — فرع HTML المبكر والكاش.
- [`docs/systems/auth-rbac/SYSTEM.md`](../auth-rbac/SYSTEM.md) — صلاحية التحرير.
- [`docs/systems/calendar/SYSTEM.md`](../calendar/SYSTEM.md) — نظام مختلف، لا يُستخدم هنا.

## عقود مهمة / Gotchas
- هيكل الصفحة: hero واحد للموعد الأقرب عبر كل السلاسل (`nearestCard`)، ثم صفوف الأقسام بخطوط شعرية، ثم المنهجية أو الأسئلة الشائعة. بطاقة الموعد القادم تُعرض في الـhero فقط وتُستثنى من قوائم «المواعيد القادمة» بمطابقة `id`. و`followLine` إذا كانت جملة المصدر وحدها لا تُعرض نصاً لأن المصدر معروض كرابط في البطاقة.
- `view.jsonLd` (WebPage + ItemList + FAQPage + Event) المبني في `shared/mawaeed/present.ts` **يُصدَّر** في `<script type="application/ld+json">` عبر `safeJson`. كان يُبنى ولا يُصدَّر قبل 2026-09-28؛ لا تُعِد حذفه.
- الخطوط: نفس رابط Google Fonts الذي يحمّله موقع سبق (`FONTS_HREF`) لإعادة استخدام كاش المتصفح — Tajawal 700 للعناوين، IBM Plex Sans Arabic 400/700 للنص والأرقام. لا CSP يمنع `fonts.gstatic.com`.
- الوضع الداكن مدعوم عبر `prefers-color-scheme` بمتغيرات CSS في `:root`؛ ألوان السلاسل في `KIND_CLASS` عبر متغير `--kind`.
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
- صفحات الخدمة (`shared/servicePages`) قالب واحد. صفحتا حساب المواطن ورواتب موظفي الدولة تقرآن سلسلة مواعيدك المنشورة عبر `presentMawaeed` ولا تخزّنان تاريخًا. المحسوب يبقى «متوقع». جملة إزاحة الجمعة/السبت تُنسخ من ملخص السلسلة أو سؤالها القائم، ولا تُؤلَّف قاعدة جديدة. الروابط من `/mawaeed` عبر `serviceHref`. خريطة `sitemap-mawaeed.xml` تضم مساريهما بـ`content_updated_at` للسلسلة. لإضافة صفحة لاحقة (إجازة، وقود) يُضاف مدخل في `SERVICE_PAGES` ومصدر يملأ النموذج نفسه.
- زر «أضف إلى التقويم» يبني `GET /api/service-pages/:id/calendar.ics` من الصفوف القادمة غير الماضية فقط (`VALUE=DATE`، نهاية اليوم التالي المدني، و`DTSTAMP` من `dateModified`). لا صفوف قادمة يعني بلا زر و404 على المسار. صورة المشاركة `GET /api/service-pages/:id/og.png` تعرض شعار سبق والعنوان والتاريخ الهجري والميلادي والشارة على أرضية بيضاء بلون العلامة `#087dbb`، بلا عدّاد يومي؛ الفشل يحوّل إلى `/branding/sabq-og-image.png`.
- القارئ يرى الصفحة داخل `Header` و`Footer` وصفحة المقال (`article-detail`). الزاحف، حين يكون `SSR_ROUTES=on`، يأخذ الصفحة من `web-next` كما يأخذ المقال. عند تعذّر SSR تُحقن الميتا والمتن في قشرة SPA عبر `buildServicePageEdgeMeta`. لا وثيقة HTML مستقلة بألوان خارج لوحة سبق.
- أخبار ذات صلة: حساب المواطن من `GET /api/keyword/حساب المواطن` (يحمل `englishSlug`)، والرواتب من `GET /api/search` لأن كلمة «رواتب موظفي الدولة» على مسار الكلمة المفتاحية لا تطابق أخبار الرواتب. الرابط يُقبل فقط إذا كان الـ slug لاتينيًا، وبحد أربعة، وفشل الجلب يحذف القسم ولا يُسقط الصفحة.
- هذا القالب يستبدل الصفحة المنفردة في PR #1882 (`functions/citizenAccountDatePage.js`). لا تُدمَج النسختان معًا.

## صحة وتشغيل
- `GET /api/mawaeed` و`GET /api/mawaeed/:slug` بكاش `public, max-age=30, s-maxage=60`.
- التحرير: `GET/POST/PUT /api/mawaeed/admin/...` بصلاحية `mawaeed.edit`. الأدمن يمر عبر اختصار المسؤول في `userHasPermission`.
- الاختبارات: `tests/unit/mawaeedDates.test.ts`, `mawaeedPage.test.ts`, `mawaeedApi.test.ts`, `mawaeedEdge.test.ts`, `servicePages.test.ts`, `servicePageEdge.test.ts`.
- لا مفاتيح ذكاء اصطناعي.

## عند التعديل
- لا تضف مسار `/mawaeed` إلى `spaTopLevelRoutes`؛ صفحته HTML من الحافة. `/services` مسار SPA، ومقطعه الأول موجود في `spaTopLevelRoutes` حتى لا يُعلن 404.
- لا تستورد `db` من ملف المسار.
- إن تغيّر العقد أو الكاش أو الصلاحية: حدّث هذا الملف و`lastReviewed` في السجل.
