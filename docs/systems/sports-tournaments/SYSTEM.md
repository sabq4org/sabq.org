# البوابة الرياضية والبطولات (`sports-tournaments`)

> آخر مراجعة: 2026-07-17 | المالك: sports

## الغرض
تغطية البطولات، المجالس، الفانتازي، أخبار Sportmonks، Snaps، والاستخبارات الرياضية.

## مفاتيح AI (حصرية)
`world-cup-news`, `sportmonks-news`, `sports-names`, `sports-snaps`, `sports-intel-trends`, `sports-intel-prediction`, `sports-intel-scene`, `sports-intel-digest`, `sports-intel-copilot`

## الحدود
- توقعات البطولات الجديدة عبر `predictions-core` — لا محركات جديدة.
- كأس العالم 2026 يبقى على `wc*` legacy حتى نهاية البطولة.

## أداء مركز المباراة
- مهلة SportMonks الافتراضية `SPORTMONKS_HTTP_TIMEOUT_MS` ≈ 3500ms (فشل سريع بدل 15ث).
- TheSports: لا إعادة محاولة بعد timeout (كانت تضاعف الانتظار إلى ~8ث).
- تسخين دقيقة للمباريات الساخنة يشمل إثراء SM (facts/xg/momentum/…).
- تطبيق SabqSports: إثراء ثقيل حسب التبويب لا دفعة واحدة عند الفتح.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] إن لمس التوقعات: اقرأ أيضاً `predictions-core/SYSTEM.md`
