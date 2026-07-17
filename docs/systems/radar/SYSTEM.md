# المِرقَب / الرادار (`radar`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
رصد إخباري ومؤشرات وتنبيهات للمحررين (الرادار الذكي).

## الحدود
- **داخل النطاق:** `server/services/radar/**`, `server/routes/radar.ts`, `SmartRadar`.
- **خارج النطاق:** SEO crawlers وSSR — نظام `seo-ssr`.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/radar/`, `server/routes/radar.ts` |
| Web | `client/src/pages/dashboard/SmartRadar.tsx` |
| Docs | `docs/RADAR_X_WATCHES.md` |

## عقود مهمة / Gotchas
- التنبيهات والمصدّرات (exporter) جزء من الحلقة — اختبرها عند تغيير المستودعات.

## صحة وتشغيل
- لوحة: `/dashboard/radar`

## عند التعديل
- [ ] قرأت هذا الملف
