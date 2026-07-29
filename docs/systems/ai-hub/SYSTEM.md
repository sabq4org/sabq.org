# مركز التحكم بالذكاء الاصطناعي (`ai-hub`)

> آخر مراجعة: 2026-07-26 | المالك: ai

## الغرض
بوابة موحّدة: نماذج، ميزانيات، سجلات الاستخدام، صحة المزودين، متجهات، استوديو البرومبت، ومظلة الاستدعاءات غير المهاجرة (`legacy-ai-manager`).

## الحدود
- **داخل النطاق:** Gateway، ai-manager، embeddings، prompt studio، AiHub UI، usage rollup.
- **خارج النطاق:** منطق أعمال iFox/التحرير — تلك تستهلك البوابة بمفاتيحها.

## مفاتيح AI (حصرية)
`legacy-ai-manager`, `prompt-studio`, `embeddings`, `entity-extraction`

## عقود مهمة
- لا تعرض مفاتيح المزودين أبداً.
- الاستخدام fire-and-forget عبر `usageLogger`.
- `legacy-ai-manager` يستوعب كل `aiManager.generate()` بلا `feature` صريح — رقمه يتقلّص مع تمرير `feature` من المستدعين.
- واجهة `ai-manager`: OpenAI يُفرَض إلى `gpt-5.1` إلا عند تمرير صريح لـ `gpt-4o-mini` / `gpt-4o` / `o3-mini` (بدون هذا الاستثناء تُحوَّل مسارات «mini» إلى 5.1 في الفوترة).
- التحرير الحساس (عناوين عبر `content-tools`، عُمق `deep-analysis`، مولّد مقالات، رادار) يبقى على GPT-5.1 / سلسلة Sonnet؛ المسارات الرياضية المتكررة على GPT-4o mini (انظر `sports-tournaments`).
- مستهلكو المتجهات عبر البوابة يتوسعون: `coverage-gap-matcher` (نظام `editorial`) يولّد تضميناته بمفتاحه الخاص المثبَّت على `text-embedding-3-large` للمطابقة الدلالية لفجوات التغطية — أي تغيير في نموذج المتجهات يجب أن يراعي توافق الأبعاد.
- **Anthropic prompt caching (افتراضي ON):** محوّل `adapters/anthropic.ts` يضع `cache_control: ephemeral` على كتلة الـ system الثابتة، وفي المحادثات متعددة الجولات يضع breakpoint صريحاً على آخر رسالة. إيقاف طارئ: `ANTHROPIC_PROMPT_CACHE=off` (أو `0`/`false`/`no`). `inputTokens` في السجل = المجموع (read+write+uncached)؛ تقدير التكلفة يحسب أوزان Anthropic (read 0.1×، write 5m 1.25×). المنطق النقي في `anthropicPromptCache.ts`.

## صحة وتشغيل
- لوحة: `/dashboard/ai-hub`
- استوديو البرومبت: `/dashboard/prompt-studio`

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] لم تُسرَّب أسرار مزودين
