# الإشعارات الفورية (`push-notifications`)

> آخر مراجعة: 2026-07-17 | المالك: platform

## الغرض
إرسال إشعارات عبر FCM / APNs / Expo مع عامل خلفي وناقل داخلي.

## الحدود
- **داخل النطاق:** خدمات الدفع، `pushWorker`, `notificationBus`, مسارات الإدارة.
- **خارج النطاق:** إشعارات البريد/SMS (قنوات أخرى).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `fcm*`, `apnsService`, `expoService`, `pushWorker`, `notificationBus` |
| Docs | `docs/APPLE_PUSH_SETUP.md` |

## عقود مهمة / Gotchas
- `APNS_KEY_ID` / `APNS_TEAM_ID` env-only — غيابها يعطّل APNs مع تحذير إقلاع.
- Leader election يضمن عامل دفع واحد فقط.

## صحة وتشغيل
- راقب طابور العامل وسجلات الفشل
- لا استهلاك AI

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] لا تضع مفاتيح APNs في الكود
