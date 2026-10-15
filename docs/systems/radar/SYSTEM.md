# المِرقَب / الرادار (`radar`)

> آخر مراجعة: 2026-10-08 | المالك: editorial

## الغرض
رصد إخباري كثيف (RSS + حسابات X) + إشارات كمية (قصص/زخم/صلة) وتنبيهات للمحررين.

## الحدود
- **داخل النطاق:** `server/services/radar/**`, `server/routes/radar.ts`, `server/jobs/radarJob.ts`, `SmartRadar`, حزم البذر، تقارير القبول.
- **خارج النطاق:** SEO/SSR. فجوات التغطية — نظام `editorial` (`coverageGapMatcher`) يستهلك قصص/مواد الرادار.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/radar/` (cycle, triage, gates, clusterer, momentum, relevance, topicFilter) |
| تشغيل | `GET /api/radar/status` و`PATCH /api/radar/status` (`{ enabled: boolean }`) — مسؤول النظام فقط |
| Web | `client/src/pages/dashboard/SmartRadar.tsx` |
| بذر | `npx tsx scripts/seed-radar-pack.ts --all` |
| قبول المرحلة أ | `npx tsx scripts/radar-phase1-acceptance.ts` |
| Docs | `docs/RADAR_X_WATCHES.md`, `docs/proposals/2026-07-17-radar-evolution-plan.md` |

## مفاتيح AI
`radar-clustering` · `radar-relevance` (عبر ai-hub؛ الفجوات تبقى `coverage-gap-matcher` تحت editorial)

## عقود مهمة / Gotchas
- **مفتاح التشغيل الشامل (2026-10-08):** زر في رأس لوحة الرادار يغيّر `system_settings.radar_runtime_enabled` (قيمة JSON boolean، غير عامة). القيمة المحفوظة تتغلب على `RADAR_ENABLED` دون إعادة نشر؛ عند غيابها فقط يؤخذ متغير البيئة. الحالة تُقرأ من قاعدة البيانات دون cache بين نسخ الخادم، وفشل القراءة أو قيمة غير صالحة يوقف التنفيذ احترازيًا.
- **عقد الحالة:** `GET /api/radar/status` و`PATCH /api/radar/status` يعيدان `enabled` الفعلية و`reason` و`runtimeSettingSource` مع معلومات التحليل والأعلام القائمة. PATCH يقبل boolean فقط وبصلاحية مسؤول النظام نفسها. نبض الجدولة يبقى مسجلاً لإتاحة إعادة التشغيل، لكنه لا يبدأ دورة حين `enabled=false`.
- **حدود الإيقاف:** يمنع الجلب الآلي واليدوي (RSS/JSON/X)، التحليل والتجميع بالذكاء الاصطناعي، التحويل والتطوير والتصدير والتنبيهات. المسارات اليدوية التنفيذية تعيد 503 عند الإيقاف؛ العرض والإعدادات والبيانات السابقة محفوظة. تُفحص الحالة بين المراحل وقبل نداءات المزوّدين والبدائل. قد يكتمل طلب خارجي بدأ قبل الإيقاف؛ المفتاح لا يضمن إلغاءه لدى المزوّد.
- **قفل طارئ مستقل:** الثابت البرمجي `RADAR_FORCE_DISABLED` في `flags.ts` يتغلب على مفتاح التشغيل ولا يستطيع الزر رفعه. قيمته الحالية `false`.
- **الحالة التشغيلية المطلوبة:** أوقف المالك الرادار مؤقتًا في 2026-10-08؛ ضُبط `RADAR_ENABLED=false` في الإنتاج كإيقاف فوري للجدولة وحُفظ `radar_runtime_enabled=false` في قاعدة البيانات. لا تعِد تفعيله تلقائيًا عند النشر أو الاختبار.
- **الوصول (منذ 2026-07-19):** واجهة `/dashboard/radar` وواجهات `/api/radar/*` لمسؤول النظام فقط (`system_admin` / `system.admin` / `superadmin`). لا تُفتح لـ `admin` العادي ولا للمحررين — القائمة تستخدم `requireRoles` لتفادي تحويل الدور وwildcard الصلاحيات.
- **قصص:** `radar_stories` + `radar_items.story_id` خلف `RADAR_CLUSTERING_ENABLED` (افتراضي false). عتبة cosine `RADAR_CLUSTER_THRESHOLD` (0.85) مع سقوط كلمات ≥ 0.7.
- **زخم:** `radar_story_snapshots` + `radar_items.metrics` خلف `RADAR_MOMENTUM_ENABLED`.
- **صلة:** `saudi_relevance` خلف `RADAR_RELEVANCE_ENABLED` — قواميس `server/services/radar/relevanceTerms.ts` (مضمّنة في الحزمة؛ ملفات `data/*.json` السابقة لم تكن تُنسخ لصورة Railway فكانت تُحمَّل فارغة).
- **فجوات v2:** `RADAR_GAP_V2_ENABLED` في editorial matcher — وحدة القصة لا المادة؛ لا تُفعَّل قبل ثبات المرحلة أ.
- فلتر اهتمام سبق على المصادر الأجنبية: `RADAR_TOPIC_FILTER_ENABLED` (افتراضي مفعّل).
- إعادة التفعيل التشغيلي: زر «تشغيل الرادار» يحفظ `true`؛ تبقى مفاتيح المزوّدين والأعلام الفرعية مطلوبة لخدماتها.
- **حماية المزوّدين:** الجلب محدود افتراضياً إلى 4 مصادر متزامنة (`RADAR_FETCH_CONCURRENCY`، من 1 إلى 12). المصدر الذي يعيد HTTP 429 يدخل تبريداً افتراضياً 15 دقيقة (`RADAR_RATE_LIMIT_BACKOFF_MINUTES`، من 5 إلى 1440) بدل إعادة طلبه كل دقيقة.

## فرز الدقة (2026-09-28)
الخط: جلب → **فرز حتمي عند الإدراج** (`triage.ts`) → **تجميع قبل التحليل** → تحليل ضمن سقف يومي → **بوابات** (`gates.ts`) → تنبيهات.
- **الناشر الفعلي** (`publisher_key/publisher_type`) من نطاق الرابط أو اسم الناشر عبر `publisherRegistry.ts` (official/wire/major/press_release/aggregator/social/unknown)، و**أصل النقل** `wire_origin` من عبارات العزو. عدد مصادر القصة `radar_stories.source_count` = مفاتيح استقلال مميزة (وكالة الأصل ثم الناشر ثم المصدر)، لا الممرات.
- **حالات جديدة:** `filtered` (استبعاد آلي قبل التحليل مع `screen_reason`: بيان صحفي، تاريخ مستقبلي > 24س) و`merged` (نسخة شبه مطابقة/نفس الناشر أو الوكالة ضُمّت شاهدًا عبر `duplicate_of_id` بلا تحليل). المكرر بالبصمة لم يعد يُسقط بل يُحفظ أثره.
- **بطاقة واحدة لكل قصة:** تبويب «فرص» (`sort=priority`) يعرض أعلى مادة أولوية في كل قصة فقط (`collapseStories` في `repo.ts`) مع شارة «+N تغطية». وكل 5 دقائق يوحّد `consolidateStories` (gates.ts + `storyMerge.ts`) القصص التي انقسمت عبر اللغات بمقارنة العناوين العربية المترجمة (≥ 4 كلمات مشتركة و≥ `RADAR_STORY_MERGE_THRESHOLD`=0.75)، فتنتقل المواد للقصة الأكبر وتُؤرشف البقية.
- **العاجل صفة مؤقتة:** التحليل أو قاعدة التنبيه «يطلب» (`score_breakdown.breakingRequested`)، و`decideBreaking` يقرر بشروط مجتمعة (توقيت غير قديم، زمن موثوق ≤ `RADAR_BREAKING_MAX_AGE_HOURS`=2، قيمة ≥ `RADAR_BREAKING_MIN_VALUE`=70، ناشر قوي أو مصدران مستقلان) مع `breaking_until` (`RADAR_BREAKING_TTL_HOURS`=3). المواد السابقة بلا صلاحية تُعد نشطة 3 ساعات من رصدها فقط.
- **محاور منفصلة:** `evidence_score` و`freshness_score` و`priority_score` (بسقوف: قديم ≤ 25، ترويجي ≤ 20، غير مؤيد ≤ 70) و`lane` (opportunity/watch/background). التحليل يعيد `event_timing` + `timing_evidence` + `content_type`، والعنوان وحده (`text_basis=title_only`) لا يُلخَّص.
- **كلفة:** `RADAR_DAILY_ANALYZE_CAP` (افتراضي 2000 مادة/يوم بتوقيت الرياض)، والطابور لا يحلل ما رُصد قبل أكثر من 24 ساعة. النسخ القريبة: `RADAR_NEAR_COPY_THRESHOLD` (0.92).
- **حالة التشغيل:** `GET /api/radar/status` (بدل نص «متوقف» الثابت). المعاملات الجديدة لـ `/api/radar/items`: `lane`، `sort=priority|recent`.
- **SQL:** `migrations/20260928_radar_accuracy.sql` — يجب تطبيقه قبل نشر الـ API.

## SQL additive (يدوي إن لزم)
انظر `docs/radar-phase1-sql.md` — يفضّل `npm run db:push` على staging.

## أسبوع ثبات المرحلة أ
قبل `RADAR_GAP_V2_ENABLED`: فعّل clustering/momentum/relevance أسبوعاً + `scripts/radar-phase1-acceptance.ts` يومياً (تعدد مصادر ≥ 3، إيران ≤ 1 قصة).

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت flags/docs عند تغيير العقد
