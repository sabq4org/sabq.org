# التقويم التحريري (`calendar`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
أحداث تحريرية وتذكيرات وربط اختياري بتوليد محتوى (iFox/AI).

## الحدود
- **داخل النطاق:** `calendar` routes، `calendarAi`.
- **خارج النطاق:** جدولة نشر iFox التفصيلية (جزء من `ifox`).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/routes/calendar.ts`, `server/services/calendarAi.ts` |
| Docs | `docs/architecture/CALENDAR_SYSTEM.md` |

## عقود مهمة / Gotchas
- التذكيرات تعمل عبر jobs — احترم leader election.

## صحة وتشغيل
- اقرأ `docs/architecture/CALENDAR_SYSTEM.md`

## عند التعديل
- [ ] قرأت هذا الملف + وثيقة التقويم المعمارية
