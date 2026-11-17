# مُدوِّن سبق AI — عامل تفريغ اجتماعات سبق

خدمة Node.js مستقلة تعمل على Railway بجانب الخادم الرئيسي. تسجَّل لدى LiveKit
Cloud باسم `sabq-minutes-agent` ولا تدخل أي غرفة إلا باستدعاء صريح (Agent
Dispatch) من خادم سبق عند بدء اجتماع مفعَّل «مُدوِّن سبق AI».

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
   - `OPENAI_API_KEY`
   - `SABQ_API_URL=https://api.sabq.org`
   - `MEETINGS_AGENT_SECRET` — سر عشوائي طويل (وأضف نفسه للخادم الرئيسي)
3. لا يحتاج منفذاً عاماً — worker يتصل خارجياً فقط (عطّل healthcheck HTTP
   أو اضبط Railway على النوع worker).

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

## إعدادات دقة التفريغ (المرحلة الأولى — 2026-11-17)

مصدرها الوحيد `src/sttConfig.ts` (مختبرة في `tests/unit/meetingsAgentSttConfig.test.ts`):

- `turnDetection`: `server_vad` بسكتة `1000ms` و`prefix_padding_ms: 300` و`threshold: 0.55` بدل افتراضي الإضافة (350ms) الذي كان يقطع الكلام لقطع قصيرة.
- `prompt` عربي: اجتماع عمل في صحيفة سبق بلهجة سعودية + مصطلحات سبق الثابتة + `keyterms` من metadata الاستدعاء (أسماء المشاركين والأقسام والمنسوبين)، بسقف 900 حرف. الأسماء لا تُطبع في السجل.
- `noiseReductionType: "near_field"`.
- `startMs` يُسجَّل عند `START_OF_SPEECH` (طابور FIFO يُزال عند `RECOGNITION_USAGE`)، واحتياطاً أول نص مؤقت.

النشر: Render background worker `sabq-meetings-agent` (autoDeploy من `main` عند تغيّر `meetings-agent/**`).
