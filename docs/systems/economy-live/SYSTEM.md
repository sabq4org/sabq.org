# اقتصاد سبق الحي (`economy-live`)

> آخر مراجعة: 2026-08-28 | المالك: فريق التحرير التقني | **الحالة: نشط (المرحلة 0+1+2 من الخطة)**

## الغرض
تحويل قسم الاقتصاد من قائمة أخبار ثابتة إلى قسم حي يتحدث فور تغيّر بيانات **البنك المركزي السعودي (ساما)**، ويولّد «أرقام الأسبوع» بعناوين صحفية جاهزة من تقرير نقاط البيع الأسبوعي، إلى جانب الأخبار التحريرية المعتادة.

## المصادر (ساما)
| القناة | المسار | الاستخدام |
|---|---|---|
| JSON حي (غير موثّق رسميًا — ما تستدعيه صفحة ساما نفسها) | `PortalHandler.ashx?op=getMultiListItems / LoadItems / exchangeRates / exchangeHistoryByCode` | الريبو، الريبو العكسي، التضخم، الناتج، عرض النقود، أسعار الصرف (~30 عملة) وتاريخها، إعلانات ساما |
| فهارس الملفات (`WPQ1ListData` مُصيَّرة في HTML) | `/ar-sa/Statistics/Indices/Pages/POS.aspx` وغيرها | اكتشاف ملف PDF/Excel جديد بتاريخ نشره (لا نخمّن الاسم) |
| PDF | نقاط البيع الأسبوعي (الثلاثاء)، عرض النقود الأسبوعي (الخميس) | تحليل بـ`pdfjs-dist` → جداول منظّمة |
| API رسمي (`GetStatistcalById`) | مرحلة لاحقة — يحتاج ID يُولَّد من منصة البيانات | توسّع (مدى، التحويلات، سايبور…) |

**فخ موثّق:** ساما تُسقط IPv6 → العميل يفرض `family: 4` (`server/services/sama/samaClient.ts`).

## المعمارية
```
ساما ──▶ services/sama/ (client, indicators, fx, news, reports, parsers/) ──▶ services/economy/
        samaWatch.ts (الدورة)  ← watchCadence.ts (الإيقاع الذكي)  ← jobs/samaWatchJob.ts (كل دقيقة، القائد فقط)
        economyStore.ts (Drizzle: economy_observations, economy_reports)
        weeklyStory.ts (محرك أرقام الأسبوع + العناوين — دالة صرفة)
        economyNewsGenerator.ts (مسودة خبر بالنموذج + حارس أرقام — ECONOMY_AUTO_DRAFTS=true)
        economyStream.ts (SSE عبر sseConnectionManager + Redis) · economySnapshot.ts (لقطة الواجهة، كاش 60s)
routes/economyRoutes.ts ──▶ client/src/components/economy/ (EconomyLiveHeader في CategoryPage[economy]، EconomyNumbersBlock في Home)
```

## الحداثة («فور تغيّره»)
لا Webhook في ساما؛ الحل استطلاع بإيقاع يناسب كل مصدر (`watchCadence.ts`): المؤشرات كل 30 د عادةً، **كل 60 ث ليلة قرار الفيدرالي** (`FOMC_DECISION_DATES`)، 10 د في نافذتي منتصف الشهر ونهايته؛ الصرف كل 10 د صباح أيام العمل؛ التقارير كل 15 د يوم صدورها. عند التغيّر: صف في `economy_observations` (فقط عند التغيّر) → إبطال كاش `economy:*` → حدث SSE `economy:update` لكل النسخ → مهمة في غرفة العمليات (الريبو = `breaking/critical`).

## نقاط الدخول
| الطبقة | المسار |
|---|---|
| الواجهة | `/category/economy` (رأس حي) · بلوك «الاقتصاد بالأرقام» في الرئيسية |
| API عام | `GET /api/economy/snapshot`، `/weekly-story`، `/series/:key`، `/fx`، `/fx/:code/history?days=`، `/reports/:kind`، `/observations/:source/:key`، `/stream` (SSE) |
| API إداري | `GET /api/economy/admin/status`، `POST /api/economy/admin/refresh {sources?}` (موظفون) |
| الجداول | `economy_observations`، `economy_reports` (تحتاج `db:push` في الإنتاج) |
| البيئة | `SAMA_ENABLED` (افتراضي on)، `ECONOMY_AUTO_DRAFTS`، `FOMC_DECISION_DATES`، `SAMA_HTTP_TIMEOUT_MS`، `SAMA_FILE_TIMEOUT_MS` |

## الحوكمة التحريرية
- كل رقم في العناوين والبطاقات من الحمولة المحسوبة (`weeklyStory.ts`) — لا نموذج لغوي في هذه الطبقة.
- مسودة الخبر: النموذج يصوغ فقط؛ `findForeignNumbers` يرفض أي رقم غير موجود في الحمولة (محاولتان ثم يلزم تحرير يدوي). المسودة `draft` دائمًا؛ الاعتماد بشري.
- سطر المصدر ثابت: «المصدر: البنك المركزي السعودي — …».
- عند اختلال شكل استجابة ساما: الواجهة تعرض آخر قيمة سليمة بوقتها (لا أصفار)، وتنبيه في غرفة العمليات.

## الاختبارات
`tests/unit/samaParsers.test.ts` (ملفان حقيقيان في `tests/fixtures/sama/`)، `economyWeeklyStory.test.ts`، `economyWatchCadence.test.ts`، `economyNumberGuard.test.ts`.

## مؤجل
- صفحة أسعار الصرف `/economy/exchange-rates` (+ صفحة لكل عملة، edgeMeta/sitemap).
- تحليل Excel الأصول الاحتياطية والنشرة الشهرية (يُحفظ الملف الآن دون تحليل).
- واجهة الشريط في iOS/Android فوق `/api/economy/snapshot`.
- مفتاح إطفاء بلوك الرئيسية من اللوحة (الآن: يختفي ذاتيًا بلا بيانات فقط).
- ممر إعلانات ساما في الرادار (تُعرض الآن في القسم فقط).
