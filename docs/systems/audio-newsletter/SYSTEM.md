# النشرات الصوتية (`audio-newsletter`)

> آخر مراجعة: 2026-07-17 | المالك: content

## الغرض
توليد وجدولة ونشر ملخصات أخبار صوتية عبر مزودي TTS.

## الحدود
- **داخل النطاق:** خدمات النشرة الصوتية، الجدولة، التحليلات، سجل المزودين.
- **خارج النطاق:** البودكاست الخارجي غير المدار من سبق.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `audioNewsletterService`, `newsletterScheduler`, `ttsProviderRegistry`, `audioNewsletterRoutes` |
| Web | `NewsletterAnalytics` + صفحات النشرات |
| Docs | `docs/AUDIO_NEWSLETTER_SYSTEM.md` |

## عقود مهمة / Gotchas
- مسارات `/api/audio-newsletters` تُسجَّل قبل handlers قديمة في `routes.ts` — لا تكسر ترتيب التسجيل.
- ElevenLabs/Google TTS يحتاجان مفاتيح بيئة؛ الغياب = تعطيل لا انهيار.

## صحة وتشغيل
- لوحة: `/dashboard/audio-newsletters`
- AI/TTS: عبر `aiFeatureKeys` في السجل

## عند التعديل
- [ ] قرأت هذا الملف + `docs/AUDIO_NEWSLETTER_SYSTEM.md`
