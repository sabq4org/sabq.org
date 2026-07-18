# المِرقَب / الرادار (`radar`)

> آخر مراجعة: 2026-07-18 | المالك: editorial

## الغرض
رصد إخباري كثيف (RSS + حسابات X) + إشارات كمية (قصص/زخم/صلة) وتنبيهات للمحررين.

## الحدود
- **داخل النطاق:** `server/services/radar/**`, `server/routes/radar.ts`, `SmartRadar`, حزم البذر، تقارير القبول.
- **خارج النطاق:** SEO/SSR. فجوات التغطية — نظام `editorial` (`coverageGapMatcher`) يستهلك قصص/مواد الرادار.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/radar/` (cycle, clusterer, momentum, relevance, topicFilter) |
| Web | `client/src/pages/dashboard/SmartRadar.tsx` |
| بذر | `npx tsx scripts/seed-radar-pack.ts --all` |
| قبول المرحلة أ | `npx tsx scripts/radar-phase1-acceptance.ts` |
| Docs | `docs/RADAR_X_WATCHES.md`, `docs/proposals/2026-07-17-radar-evolution-plan.md` |

## مفاتيح AI
`radar-clustering` · `radar-relevance` (عبر ai-hub؛ الفجوات تبقى `coverage-gap-matcher` تحت editorial)

## عقود مهمة / Gotchas
- **إيقاف إجباري (منذ 2026-07-18):** `RADAR_FORCE_DISABLED=true` في `server/services/radar/flags.ts` يوقف الكرون والجلب اليدوي ودورة الرصد حتى لو `RADAR_ENABLED=true`. مسارات `/api/radar/run` و`/api/radar/sources/:id/fetch` ترجع 503. أزرار الجلب مخفية في الواجهة. لإعادة التشغيل: غيّر الثابت إلى `false` في الكود.
- **الوصول (منذ 2026-07-19):** واجهة `/dashboard/radar` وواجهات `/api/radar/*` لمسؤول النظام فقط (`system_admin` / `system.admin` / `superadmin`). لا تُفتح لـ `admin` العادي ولا للمحررين — القائمة تستخدم `requireRoles` لتفادي تحويل الدور وwildcard الصلاحيات.
- **قصص:** `radar_stories` + `radar_items.story_id` خلف `RADAR_CLUSTERING_ENABLED` (افتراضي false). عتبة cosine `RADAR_CLUSTER_THRESHOLD` (0.85) مع سقوط كلمات ≥ 0.7.
- **زخم:** `radar_story_snapshots` + `radar_items.metrics` خلف `RADAR_MOMENTUM_ENABLED`.
- **صلة:** `saudi_relevance` خلف `RADAR_RELEVANCE_ENABLED` — قواميس `server/services/radar/data/*.json`.
- **فجوات v2:** `RADAR_GAP_V2_ENABLED` في editorial matcher — وحدة القصة لا المادة؛ لا تُفعَّل قبل ثبات المرحلة أ.
- فلتر اهتمام سبق على المصادر الأجنبية: `RADAR_TOPIC_FILTER_ENABLED` (افتراضي مفعّل).
- التفعيل التشغيلي (عند رفع القفل): `RADAR_ENABLED=true` + مفاتيح X.

## SQL additive (يدوي إن لزم)
انظر `docs/radar-phase1-sql.md` — يفضّل `npm run db:push` على staging.

## أسبوع ثبات المرحلة أ
قبل `RADAR_GAP_V2_ENABLED`: فعّل clustering/momentum/relevance أسبوعاً + `scripts/radar-phase1-acceptance.ts` يومياً (تعدد مصادر ≥ 3، إيران ≤ 1 قصة).

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت flags/docs عند تغيير العقد
