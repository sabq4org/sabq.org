# الإشعارات الفورية (`push-notifications`)

> آخر مراجعة: 2026-08-21 | المالك: platform

## الغرض
إرسال إشعارات عبر FCM / APNs / Expo مع عامل خلفي وناقل داخلي.

## الحدود
- **داخل النطاق:** خدمات الدفع، `pushWorker`, `notificationBus`, مسارات الإدارة.
- **خارج النطاق:** إشعارات البريد/SMS (قنوات أخرى).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `fcm*`, `apnsService`, `expoService`, `pushWorker`, `notificationBus` |
| Android VARA | `android-native/vara/src/main/kotlin/com/sabq/vara/push/` |
| Docs | `docs/APPLE_PUSH_SETUP.md` |

## عقود مهمة / Gotchas
- `APNS_KEY_ID` / `APNS_TEAM_ID` env-only — غيابها يعطّل APNs مع تحذير إقلاع.
- Leader election يضمن عامل دفع واحد فقط.
- VARA يسجل FCM عبر `/api/v1/devices/register` بعد جلسة Bearer فقط، ويحل `sabqsports://match/:id`. تذكيرات المتابعة المحلية تستخدم `AlarmManager.setAndAllowWhileIdle` بلا صلاحية المنبه الدقيق.
- **استعادة بعد الإقلاع (2026-07-29):** `MatchReminderBootReceiver` يستمع لـ `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED` ويعيد الجدولة من `followed_fixtures`؛ كذلك `VaraApplication.onCreate` يستدعي `rescheduleAll` عند كل إقلاع بارد.
- **التذكير المحلي واحد فقط: «قبل ١٠ دقائق»** — إشعار «انطلقت المباراة» يأتي من الخادم حصريًا (قرار 2026-07-04 في iOS)؛ أُزيل المحلي المزدوج من Android في 2026-07-27 لأنه كان يزدوج ويكذب عند تأخر الصافرة.
- **حزمة debug (2026-07-29):** `sportsAlertsService` يقبل `com.sabq.sports.dev` بجانب الإنتاج — ضروري لاختبار المحاكي يوم المباراة بعد نشر Railway.
- **فلتر الروابط العميقة في Manifest مفصول** (2026-07-27): دمج `sabqsports://` و`sabq://roshn` في `intent-filter` واحد كان يوحّد السمات فيشترط host على كليهما ويعطّل كل روابط `sabqsports://` الخارجية. لا تعد دمجهما.
- **FCM لتطبيق VARA مفعّل (2026-07-27):** مشروع Firebase `sabq-vara` بالحزمتين (`com.sabq.sports` + `.dev`) وبصمات SHA لمفتاحي الرفع وDebug. `google-services.json` موجود محليًا في `vara/` وغير ملتزم (gitignored — أضِفه كسرّ في CI). **البلجن يُطبَّق شرطيًا** عند وجود الملف؛ غيابه = بناء أخضر بتدهور آمن. تحقق: توكن FCM يصدر ويُسجَّل عبر `/api/v1/devices/register`.
- **إشعار «انتهت المباراة» (2026-08-21):** `sportsAlertsService` لا يُعلن النهاية من ومضة FT عند الاستراحة/د47. الحارس في `sportsMatchStatus.ts` — المصدر الحيّ يغلب، والنهاية تتطلب ≥80 دقيقة لعب. Live Activity تستخدم الحارس نفسه حتى لا تُثبَّت شاشة القفل على «انتهت» أثناء الشوط الثاني.

## صحة وتشغيل
- راقب طابور العامل وسجلات الفشل
- لا استهلاك AI

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] لا تضع مفاتيح APNs في الكود
