# أمين المحضر — عامل تفريغ اجتماعات سبق

خدمة Node.js مستقلة تعمل على Railway بجانب الخادم الرئيسي. تسجَّل لدى LiveKit
Cloud بالاسم المحدد في `LIVEKIT_AGENT_NAME` (افتراضياً
`sabq-minutes-agent` للإنتاج) ولا تدخل أي غرفة إلا باستدعاء صريح (Agent
Dispatch) من خادم سبق عند بدء اجتماع مفعَّل «أمين المحضر».

## كيف تعمل

1. الخادم الرئيسي يستدعي `AgentDispatchClient.createDispatch(roomName, "sabq-minutes-agent", { metadata: { meetingId } })`.
2. العامل ينضم للغرفة كمشارك ظاهر، ويشترك في مسار صوت كل متحدث على حدة
   (هوية المتحدث من المسار — بلا نماذج فصل متحدثين).
3. التفريغ بثّي عبر OpenAI `gpt-4o-transcribe` (عربي)، والمقاطع النهائية
   تُرفع دفعات كل ٥ ثوانٍ إلى:
   `POST {SABQ_API_URL}/api/internal/meetings-agent/:meetingId/transcripts`
   بترويسة `x-agent-secret`.
4. عند إغلاق الغرفة (إنهاء الاجتماع) يفرغ العامل ما تبقى ويخرج، والخادم
   الرئيسي يتولى توليد المحضر.

## النشر على Railway (خدمة جديدة)

1. أنشئ خدمة جديدة من نفس المستودع، Root Directory = `meetings-agent`،
   Builder = Dockerfile.
2. المتغيرات:
   - `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — نفس قيم الخادم الرئيسي
   - `LIVEKIT_AGENT_NAME=sabq-minutes-agent` في الإنتاج، واستخدم اسماً مستقلاً
     مثل `sabq-minutes-agent-staging` في بيئة الاختبار
   - `OPENAI_API_KEY`
   - `SABQ_API_URL=https://api.sabq.org`
   - `MEETINGS_AGENT_SECRET` — سر عشوائي طويل (وأضف نفسه للخادم الرئيسي)
3. لا يحتاج منفذاً عاماً — worker يتصل خارجياً فقط (عطّل healthcheck HTTP
   أو اضبط Railway على النوع worker).

> حاجز أمان: يرفض العامل الإقلاع داخل بيئة Railway المسماة `staging` إذا
> كان `LIVEKIT_AGENT_NAME` مفقوداً أو مساوياً لاسم الإنتاج.

## على الخادم الرئيسي

أضف `MEETINGS_AGENT_SECRET` (نفس القيمة) — بدونه لا يُستدعى العامل ولا
تُقبل دفعات التفريغ.

مسار الاستقبال `/api/internal/meetings-agent/*` مُعفى من CSRF (مصادقة
بالسر المشترك فقط). إن ظهرت في لوجات العامل `upload failed 403` فتحقّق
أن نسخة الـ API المنشورة تتضمن هذا الإعفاء وأن السر متطابق.

## ملاحظات

- SDK حزم `@livekit/agents` يتطور بسرعة — عند أول بناء تحقق من توافق
  الأنواع (`npm run build`) واضبط الاستدعاءات إن تغيرت أسماء الواجهات.
- التفريغ الخام يُحذف من قاعدة البيانات بعد ٣٠ يوماً (سياسة معتمدة)؛
  المحضر المعتمد يبقى في `meetings.minutes`.
