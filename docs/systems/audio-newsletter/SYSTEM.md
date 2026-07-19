# النشرات الصوتية (`audio-newsletter`)

> آخر مراجعة: 2026-07-19 | المالك: content

## الغرض
توليد وجدولة ونشر ملخصات أخبار صوتية عبر مزودي TTS.

## الحدود
- **داخل النطاق:** خدمات النشرة الصوتية، الجدولة، التحليلات، سجل المزودين.
- **خارج النطاق:** البودكاست الخارجي غير المدار من سبق.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `audioNewsletterService`, `newsletterScheduler`, `newsletterDeliveryQueue`, `newsletterWorker`, `ttsProviderRegistry`, `audioNewsletterRoutes` |
| Web | `NewsletterAnalytics` + صفحات النشرات |
| Docs | `docs/AUDIO_NEWSLETTER_SYSTEM.md` |

## عقود مهمة / Gotchas
- مسارات `/api/audio-newsletters` تُسجَّل قبل handlers قديمة في `routes.ts` — لا تكسر ترتيب التسجيل.
- ElevenLabs/Google TTS يحتاجان مفاتيح بيئة؛ الغياب = تعطيل لا انهيار.
- الجدولة والتسليم لا يعملان داخل عملية API؛ كلاهما في Railway Worker مستقل.
- الإيقاف الكامل يحتاج `ENABLE_NEWSLETTER_SCHEDULER=false` و`ENABLE_NEWSLETTER_DELIVERY_WORKER=false`.
- التسليم دائم في Postgres ومقسّم إلى دفعات؛ لا تحذف سجلات الطابور لمعالجة تعثر.

## صحة وتشغيل
- لوحة: `/dashboard/audio-newsletters`
- AI/TTS: عبر `aiFeatureKeys` في السجل
- تشغيل/إيقاف واستعادة الطابور: [`OPERATIONS.md`](OPERATIONS.md)

## عند التعديل
- [ ] قرأت هذا الملف + `docs/AUDIO_NEWSLETTER_SYSTEM.md`
- [ ] قرأت `OPERATIONS.md` قبل تغيير أعلام الإنتاج أو تشغيل Worker
