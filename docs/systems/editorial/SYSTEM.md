# نظام التحرير وغرف الأخبار (`editorial`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
غرفة الأخبار اليومية + أدوات التحرير بالذكاء الاصطناعي التي يستخدمها المحررون: عناوين، مقالات، تصنيف، SEO، روابط ذكية، صور، وكلاء بريد/واتساب، ومساعد كاتب الرأي.

## الحدود
- **داخل النطاق:** أقفال/حضور/تنبيهات/نبض + مفاتيح AI المدرجة في السجل لهذا النظام.
- **خارج النطاق (لها أنظمة):** iFox، المقترب، الرادار، عُمق، أخبار البطولات، النشرات الصوتية، إشراف التعليقات، المتجهات/البرومبت (ai-hub).

## مفاتيح AI (حصرية)
`content-tools`, `journalist-agent`, `data-story`, `ai-article-generator`, `article-classification`, `content-analyzer`, `smart-categories`, `smart-category-classifier`, `story-matcher`, `smart-insights`, `geo-extraction`, `smart-links`, `story-cards`, `seo-generator`, `mobile-article-enrichment`, `image-generation`, `nano-banana-images`, `smart-thumbnail`, `visual-ai`, `infographic-ai`, `whatsapp-agent`, `email-agent`, `opinion-writer-*`

## نقاط الدخول
| الطبقة | أمثلة |
|--------|--------|
| غرفة الأخبار | `articleEditLocks`, `editorAlerts`, `dashboardPulse` |
| AI تحريري | `ai-content-tools`, `journalist-agent-ai`, `aiArticleGenerator`, `seo-generator` |
| Web | `/dashboard`, SmartJournalist, Communications, DataStory |

## عقود مهمة
- أي أداة AI جديدة من المحرر → أضف `featureKey` هنا وفي `defaults.ts`، ولا تكرره بنظام آخر.
- جزء كبير من الاستدعاءات القديمة ما زال يُحسب تحت `legacy-ai-manager` في `ai-hub` حتى تُهاجر.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت `aiFeatureKeys` في السجل إن لزم
