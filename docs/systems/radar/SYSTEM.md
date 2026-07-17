# المِرقَب / الرادار (`radar`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
رصد إخباري كثيف (RSS + حسابات X) وتنبيهات للمحررين — شبكة أمريكية/عالمية/خليجية مع فورية تشغيلية للحسابات الأولوية.

## الحدود
- **داخل النطاق:** `server/services/radar/**`, `server/routes/radar.ts`, `SmartRadar`, حزم البذر `scripts/seed-packs/**`, `scripts/seed-radar-pack.ts`.
- **خارج النطاق:** SEO crawlers وSSR — نظام `seo-ssr`. تجميع القصص/الزخم/الصلة (المرحلة 1 من خطة التطور) — قيد التنفيذ لاحقاً.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/radar/`, `server/routes/radar.ts` |
| Web | `client/src/pages/dashboard/SmartRadar.tsx` |
| بذر | `npx tsx scripts/seed-radar-pack.ts --all` |
| صحة | `GET /api/radar/health` · `npx tsx scripts/radar-coverage-report.ts` |
| Docs | `docs/RADAR_X_WATCHES.md`, `docs/radar-source-licensing.md`, `docs/proposals/2026-07-17-radar-evolution-plan.md` |

## عقود مهمة / Gotchas
- التنبيهات والمصدّرات (alerts/exporter) جزء من الحلقة — اختبرها عند تغيير المستودعات.
- **رادار الفجوات التحريرية** (نظام `editorial`، `coverage-gap-matcher`) يستهلك مواد الرادار النشطة (الحالات `new/analyzed/ready`) ويعيد استخدام `transformItem` و`exportItemToArticle` لإنشاء مسودات التغطية؛ يعمل بعد كل دورة رادار من `cycle.ts`. أي تغيير في حالات المواد أو عقد التصدير (`RADAR_DRAFT_MISSING`) يؤثر عليه.
- رصدة X = صف في `radar_sources` بـ `type=x` و`url` اصطناعي `x:{type}:{value}`.
- حسابات X الأولوية: `fetchIntervalMinutes=1` + `since_id` (SLA ≤ دقيقتين). السقف: `RADAR_X_MAX_ACTIVE_WATCHES` (افتراضي 80).
- أعمدة تشغيلية additive: `tier`, `region`, `weight`, `pack_id`.
- وكالات AP/Reuters/AFP بلا RSS عام موثوق — الرصد عبر حزمة `x-news-accounts`.
- التفعيل التشغيلي: `RADAR_ENABLED=true` + مفتاح X (`X_API_BEARER_TOKEN` و/أو `TWITTERAPI_IO_API_KEY`).

## صحة وتشغيل
- لوحة: `/dashboard/radar` — أزرار «المصادر» و«رصدات X».
- بعد `db:push`: بذر staging ثم قياس تكلفة X قبل توسيع كل حسابات Tier A على الإنتاج.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت `docs/RADAR_X_WATCHES.md` إن تغيّرت فترات الجلب أو سقف الرصدات
- [ ] حدّثت `docs/radar-source-licensing.md` عند إضافة مصدر جديد بلا/مع RSS
