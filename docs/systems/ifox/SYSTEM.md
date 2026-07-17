# نظام iFox (`ifox`)

> آخر مراجعة: 2026-07-17 | المالك: ai

## الغرض
منصة توليد وإدارة محتوى بالذكاء الاصطناعي داخل سبق: مقالات، تقويم، ميزانية، جودة، وسائط.

## الحدود
- **داخل النطاق:** `server/services/ifox/**`, `server/routes/ifox/**`, صفحات `/dashboard/admin/ifox/*`.
- **خارج النطاق:** AI Hub (البوابة والميزانيات العامة) — تكامل عبر Gateway/feature keys.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/ifox/`, `server/routes/ifox/` |
| Web | `client/src/pages/admin/ifox/`, Image Studio |
| مرجع معماري | `docs/architecture/SYSTEM_DOCUMENTATION.md` § iFox |

## عقود مهمة / Gotchas
- الميزانية والجودة جزء من دورة النشر — لا تتجاوز فحوص الجودة بصمت في الإنتاج.
- سجّل استهلاك AI عبر AI Gateway بمفاتيح واضحة.

## صحة وتشغيل
- لوحة: `/dashboard/admin/ifox`
- AI: راقب AiHub + `aiFeatureKeys` في السجل

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] أي استدعاء نموذج جديد يمر من AI Gateway ويُسجَّل usage
