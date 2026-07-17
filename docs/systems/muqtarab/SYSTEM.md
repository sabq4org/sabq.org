# المُقترَب (`muqtarab`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
منصة مشاركة القرّاء والزوايا الإخبارية مع مراجعة تحريرية وتجهيز حسابات الكتّاب.

## الحدود
- **داخل النطاق:** خدمات/مسارات `muqtarab*`, لوحات المراجعة، صلاحيات `muqtarab.*`.
- **خارج النطاق:** التعليقات العامة على المقالات (`comments`).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/muqtarab*.ts`, `server/routes/muqtarab*.ts` |
| Web | `DashboardMuqtarab`, `MuqtarabReview` |
| Docs | `docs/MUQTARAB.md`, `docs/MUQTARAB_IOS_PLAN.md` |

## عقود مهمة / Gotchas
- فرّق بين `muqtarab.own.view` (كاتب) و`muqtarab.manage` (تحرير).
- إشعارات البريد/التطبيق جزء من التجهيز — لا تكسرها بصمت.

## صحة وتشغيل
- لوحة: `/dashboard/muqtarab`
- AI اختياري عبر `muqtarab.ai`

## عند التعديل
- [ ] قرأت هذا الملف + `docs/MUQTARAB.md` عند تغيير المنتج
