# البوابة الرياضية والبطولات (`sports-tournaments`)

> آخر مراجعة: 2026-07-19 | المالك: sports

## الغرض
تغطية البطولات، المجالس، الفانتازي، أخبار Sportmonks، Snaps، والاستخبارات الرياضية.

## تقرير كأس العالم 2026 بالأرقام (منشور على الرئيسية)
- **الرئيسية:** تحت الهيرو مباشرة — `WorldCupHomeSection` → `Wc2026NumbersReportPanel` (بدل شريط المباراة + أخبار المونديال).
- **لوحة:** `/dashboard/wc-2026-numbers-report` — نفس اللوحة (`variant=admin`).
- **API عام:** `GET /api/world-cup/numbers-report` — بدون auth · كاش CDN `s-maxage=900`. واجهة التحميل تعرض «جاري جلب البيانات». لا خلفية سوداء ممتدة على الصفحة — بطاقة داخل الحاوية فقط.
- **API أدمن:** `GET /api/admin/wc-2026-numbers-report` — `requireAuth` + `system.manage_settings` · `private, no-store`.
- **كاش خدمة:** SWR `blocks:wc:numbers-report:v5` — ساعة طازج + ساعة SWR.
- **عدّاد المواد (مضيّق على 2026):** `wc26-*` + تحريري رياضة منذ 2026-01-01 مع استبعاد أندية/مونديالات قديمة.
- **التوقعات:** `wc_predictions` → `totalPredictions` + `pointsAwarded` (ولاء بعد التسوية).
- **الهيدر:** لوقو المونديال أُزيل من `Header.tsx` بعد انتهاء البطولة.

## مفاتيح AI (حصرية)
`world-cup-news`, `sportmonks-news`, `kings-cup-news`, `saudi-league-story`, `saudi-league-preview`, `sports-names`, `sports-snaps`, `sports-intel-trends`, `sports-intel-prediction`, `sports-intel-scene`, `sports-intel-digest`, `sports-intel-copilot`, `sports-intel-match-pre`, `sports-intel-match-live`, `sports-intel-match-post`

## تكلفة النماذج (2026-07-19)
- تقارير/معاينات الدوري السعودي ولقطات VARA ومشهد/توجّهات الاستخبارات: **GPT-4o mini**.
- أخبار البطولات (مونديال / SportMonks / كأس الملك) و digest/copilot وبطاقات live/post: تبقى سلسلة تحريرية أقوى (Sonnet → GPT-5.1).
- يمكن تغيير النموذج من `/dashboard/ai-hub` لكل feature بعد seed الصفوف الجديدة.

## الحدود
- توقعات البطولات الجديدة عبر `predictions-core` — لا محركات جديدة.
- كأس العالم 2026 يبقى على `wc*` legacy حتى نهاية البطولة.

## أداء مركز المباراة
- مهلة SportMonks الافتراضية `SPORTMONKS_HTTP_TIMEOUT_MS` ≈ 3500ms (فشل سريع بدل 15ث).
- TheSports: لا إعادة محاولة بعد timeout (كانت تضاعف الانتظار إلى ~8ث).
- تسخين دقيقة للمباريات الساخنة يشمل إثراء SM (facts/xg/momentum/…).
- تطبيق SabqSports: إثراء ثقيل حسب التبويب لا دفعة واحدة عند الفتح.

## أداء VARA (SabqSports) — 2026-07-18
- روشن `HomeView`: كشف تدريجي — مباريات+ترتيب يفتحان اللوحة، ثم إثراء (هدافون/انتقالات/…).
- مركز المباريات: `defer { loading = false }` حتى لا يبقى الدوران بعد إلغاء/اختيار يتيم.
- انتقالات عالمية: `loadedGlobal` يُرفع عند الفشل أيضًا + قائمة Lazy مسطّحة.
- `ignoreCache` للاستطلاع فقط أثناء مباراة جارية؛ SSE/فريقي لا يكسران الكاش بلا داعٍ.
- عالمية/بطولات: لا شاشة دوران كاملة إن وُجدت بيانات سابقة/مفضّلات.

## بطولات الجدول (VARA)
- ديفولت أول تثبيت: `pro-league`, `world-cup`, `kings-cup`, `uefa-super-cup`, `la-liga`, `premier-league`.
- ورقة الإعداد: زر «إلغاء التحديد» يفرّغ المفضّلة؛ لا إعادة إلحاق تلقائي بعد الإلغاء.

## مركز الانتقالات (سعودية مؤكّدة)
- مصدر أساسي: API-Football عبر `getLeagueTransfers` — افتراضي `since=4` أشهر (لا 18).
- احتياطي فوري: SportMonks `transfers/teams/{id}` لكل فرق روشن (لا الفيد العالمي `/transfers` — تغطيته السعودية شبه معدومة).
- الدمج في `GET /api/sports/transfers`. تبويب «مؤكّدة» يستبعد الإعارات من العرض.
- VARA/الويب: ترقيم عرض (Lazy + «عرض المزيد») لتقليل ثقل التمرير.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] إن لمس التوقعات: اقرأ أيضاً `predictions-core/SYSTEM.md`
