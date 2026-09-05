# النشرات الصوتية (`audio-newsletter`)

> آخر مراجعة: 2026-09-05 | المالك: content

## الغرض
موجز المقالات والأخبار الصوتي وإعدادات أصواته، والنشرة البريدية المجدولة الباقية بعد إيقاف منتج النشرات الصوتية وتوليد ملفاته في 2026-07-25.

## الحدود
- **داخل النطاق:** موجز المقال الصوتي، إعدادات ومعاينة الأصوات، خدمات الجدولة والتحليلات وسجل المزودين.
- **خارج النطاق:** البودكاست الخارجي غير المدار من سبق.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `newsletterScheduler`, `newsletterDeliveryQueue`, `newsletterWorker`, `ttsProviderRegistry`, `audioNewsletterCompatibility` |
| Web | `/dashboard/system-settings` → `SummaryAudioSettings`؛ لا توجد واجهة منتج النشرات الصوتية المتوقف |
| Backend / summary | `/api/articles/:slug/summary-audio` → `summaryAudioService`؛ `/api/system/summary-audio-settings` و`/preview` → `summaryAudioSettings` |
| Docs | `docs/AUDIO_NEWSLETTER_SYSTEM.md` |

## عقود مهمة / Gotchas
- الويب يعرض «الصوت عبر HUMAIN» بحجم 11px وأخضر غامق بجوار الاستماع، بناءً على `X-TTS-Provider` الفعلي بعد نجاح التشغيل. يستعمل نفس GET للصوت والنسبة مع Blob URL؛ لا طلب توليد إضافي ولا استنتاج من إعداد المزود الافتراضي. الترويسة مكشوفة لـCORS لتشغيل DIRECT mode.
- منتج الصوت ومسارات الإنشاء والإدارة محذوفة عمداً منذ PR #1216. مسارا القائمة القديمان `/api/audio-newsletters` و`/api/audio-newsletters/public` يعيدان قائمة فارغة متوافقة لعملاء الويب المخزنين، وروابط الحلقات القديمة تعيد 410.
- HUMAIN هو الأساسي الافتراضي (عبدالله)، ثم ElevenLabs (علي)، ثم Google عند تعطل الاثنين. يمكن اختيار HUMAIN/ElevenLabs وصوتيهما من إعدادات النظام. غياب المفتاح يتخطّى المزود؛ لا تُحفظ المفاتيح في الواجهة أو قاعدة البيانات.
- الإعداد `summary_audio_settings` خاص في جدول الإعدادات الحالي، ومستقل عن `tts_settings` لمنتج النشرات المتوقف. إعداد الموجز الجديد يتقدم على متغير `TTS_PROVIDER` القديم في مسار المقال فقط.
- GET/PUT إعدادات ومعاينة POST تحتاج Passport + `system.manage_settings`. المعاينة نص ثابت، 6 طلبات/دقيقة لكل IP، ولا تستخدم fallback أو تحفظ الاختيار.
- HUMAIN يعيد WAV/PCM16/24kHz/mono؛ ElevenLabs/Google يعيدان MP3. مسار المقال يعيد بايتات ومحتوى MIME صحيحاً، وليس JSON. مستهلكو الويب وAVPlayer وExoPlayer يظلون على نفس URL.
- كاش الذاكرة محدود 64 MiB ويشمل بصمة النص والمزود والصوتين. الاستجابة `private, no-store` لإظهار الإعداد الجديد عند الطلب التالي؛ الكاش الداخلي يوم للنجاح الأساسي ودقيقة للاحتياط. لا يُستبدل التسجيل الجاري تشغيله عند الحفظ.
- **نفاد رصيد ElevenLabs:** يبقى cooldown القائم 15 دقيقة. HUMAIN يُتخطى دقيقة بعد الفشل التقني. لا fallback لرفض المحتوى. HUMAIN مهلة كلية 25 ثانية تشمل الاتصال وجميع الأجزاء، ويُنهى Worker عند انتهائها. تُدمج الأجزاء المكتملة فقط؛ أي فشل يعيد توليد النص الكامل عبر ElevenLabs.
- تفاصيل التفعيل والتحقق وحدود التشغيل: [`HUMAIN.md`](HUMAIN.md).
- الجدولة والتسليم لا يعملان داخل عملية API؛ كلاهما في Railway Worker مستقل.
- الإيقاف الكامل يحتاج `ENABLE_NEWSLETTER_SCHEDULER=false` و`ENABLE_NEWSLETTER_DELIVERY_WORKER=false`.
- التسليم دائم في Postgres ومقسّم إلى دفعات؛ لا تحذف سجلات الطابور لمعالجة تعثر.

## صحة وتشغيل
- لوحة اختيار الأصوات: `/dashboard/system-settings`
- AI/TTS: عبر `aiFeatureKeys` في السجل
- تشغيل/إيقاف واستعادة الطابور: [`OPERATIONS.md`](OPERATIONS.md)

## عند التعديل
- [ ] قرأت هذا الملف + `docs/AUDIO_NEWSLETTER_SYSTEM.md`
- [ ] قرأت `OPERATIONS.md` قبل تغيير أعلام الإنتاج أو تشغيل Worker
