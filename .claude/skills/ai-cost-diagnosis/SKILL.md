---
name: ai-cost-diagnosis
description: تشخيص استهلاك رصيد OpenAI/الذكاء في سبق عبر ai_usage_logs وRailway CLI، ونمط علاج المستهلكين داخل cron. استخدمها عند قفزة صرف AI أو سؤال «وين يروح الرصيد؟».
---

# تشخيص صرف الذكاء الاصطناعي في سبق

## مصدر البيانات الوحيد الصالح

واجهة OpenAI الرسمية **لا تنفع**: `OPENAI_API_KEY` المحلي مفتاح مشروع بلا صلاحية `api.usage.read`. البديل المجرَّب: جدول **`ai_usage_logs`** في قاعدة الإنتاج (يغذّيه `server/ai/gateway/usageLogger.ts`).

الوصول — قراءة فقط عبر Railway CLI المرتبط بالمشروع:

```bash
railway variables --json   # التقط DATABASE_URL الإنتاجي
psql "<URL>" -c "SELECT feature, model, date_trunc('day', created_at) d,
  count(*), sum(total_tokens) FROM ai_usage_logs
  WHERE created_at > now() - interval '7 days'
  GROUP BY 1,2,3 ORDER BY 5 DESC LIMIT 30;"
```

تحذير: `DATABASE_URL` في `.env.local` فرع Neon قديم وليس الإنتاج — لا تستنتج منه شيئًا ولا تكتب على أي قاعدة.

## نمط العلاج المجرَّب (لا تخترع غيره)

أي مستهلك AI داخل حلقة cron قصيرة الوتيرة يحتاج **throttle خاصًا به + كاش**:

- **تخطي بالـ hash**: لا تعِد التوليد إن لم تتغير الحقائق المدخلة (PR \u200E#947 — لقطات VARA كانت 59% من الصرف لأن الجوب الساعي يولّد لكل فريق بلا تغيّر).
- **حد أدنى زمني للمحفّز** + كاش متجهات/نتائج بسقف (PR \u200E#1018 — رادار الفجوات كان يعيد تضمين ~360 نصًا كل دقيقة).
- إن بقي الصرف بلا قيمة واضحة: بوّبه خلف علم بيئة معطّل افتراضيًا مع زر تشغيل يدوي (PR \u200E#1020 — `COVERAGE_GAP_AUTO_REFRESH`).

## حقائق ثابتة

- `pickModel` في `sportsIntelligence/aiClient.ts` يرجع gpt-5.1 دائمًا ويتجاهل cheap/strong — **قرار مقصود** (cooldown نموذج Gemini Flash في البوابة)، لا «تصلحه».
- طبقة «mini» (gpt-4o-mini) معتمدة للقطات الرياضية فقط.
