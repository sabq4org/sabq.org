-- =====================================================================
-- Claude أولًا في مركز الذكاء — 2026-11-09
-- يُشغَّل في محرر Neon SQL بعد دمج طلب الدمج ونشره فقط.
-- يغيّر 4 ميزات لها صفوف في الإنتاج (الصفوف تتقدم على الكود):
--   article-classification : gpt-5.1      → Claude Haiku 5.5  (بديل: gpt-5.1 ثم Gemini Flash)
--   comment-moderation     : gpt-4o-mini  → Claude Haiku 5.5  (بديل: gpt-4o-mini ثم Gemini Flash)
--   reply-polish           : gpt-4o-mini  → Claude Haiku 5.5  (بديل: gpt-4o-mini ثم Gemini Flash)
--   infographic-ai         : gpt-5.1      → Claude Sonnet 5.5 (بديل: gpt-5.1 ثم Gemini Flash)
-- ويضيف نموذجين ناقصين إلى ai_models (إضافة فقط، لا حذف).
-- لا يلمس: max_tokens / temperature / is_enabled / بقية الميزات.
-- شغّل كل خطوة على حدة بالترتيب.
-- =====================================================================

-- ---------- 1) نسخة احتياطية (اقرأها واحفظ النتيجة) ----------
SELECT f.feature_key, f.primary_model_id, m.model_id AS primary_model, f.fallback_chain, f.updated_at
FROM ai_feature_configs f
LEFT JOIN ai_models m ON m.id = f.primary_model_id
WHERE f.feature_key IN ('article-classification','comment-moderation','reply-polish','infographic-ai')
ORDER BY f.feature_key;
-- المتوقع (2026-11-09):
--   article-classification  gpt-5.1      ["60952427-957b-484b-909a-678373327379","d31260aa-64d4-48c8-90e1-1a54744d2860"]
--   comment-moderation      gpt-4o-mini  ["60952427-957b-484b-909a-678373327379","d31260aa-64d4-48c8-90e1-1a54744d2860"]
--   infographic-ai          gpt-5.1      ["a1e83ba5-a731-43e4-b9b3-e6598cf16c4e","ee1efb32-72b6-4105-9efc-bcb0cb0e759a"]
--   reply-polish            gpt-4o-mini  ["60952427-957b-484b-909a-678373327379","d31260aa-64d4-48c8-90e1-1a54744d2860"]

-- ---------- 2) إضافة النموذجين إن لم يكونا موجودين ----------
BEGIN;
INSERT INTO ai_models (provider, model_id, display_name, capabilities, pricing_unit, cost_per_1m_input, cost_per_1m_output, priority, notes)
SELECT 'anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', '["complete"]'::jsonb, 'tokens', 2, 10, 5, 'أُضيف 2026-11-09 (Claude أولًا في التحرير)'
WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE provider = 'anthropic' AND model_id = 'claude-sonnet-5-5');

INSERT INTO ai_models (provider, model_id, display_name, capabilities, pricing_unit, cost_per_1m_input, cost_per_1m_output, priority, notes)
SELECT 'anthropic', 'claude-haiku-5-5', 'Claude Haiku 5.5', '["complete"]'::jsonb, 'tokens', 0.1, 0.5, 15, 'أُضيف 2026-11-09 (Claude أولًا في التحرير)'
WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE provider = 'anthropic' AND model_id = 'claude-haiku-5-5');
COMMIT;

-- ---------- 3) معاينة ما سيتغير (لا يكتب شيئًا) ----------
SELECT f.feature_key,
       m.model_id AS before_primary,
       CASE WHEN f.feature_key = 'infographic-ai' THEN 'claude-sonnet-5-5' ELSE 'claude-haiku-5-5' END AS after_primary
FROM ai_feature_configs f
LEFT JOIN ai_models m ON m.id = f.primary_model_id
WHERE f.feature_key IN ('article-classification','comment-moderation','reply-polish','infographic-ai');
-- يجب أن يعيد 4 صفوف، ويجب أن يعيد الاستعلام التالي صفين (النموذجين):
SELECT id, model_id, is_active FROM ai_models WHERE provider = 'anthropic' AND model_id IN ('claude-sonnet-5-5','claude-haiku-5-5');

-- ---------- 4) التحديث بالمفتاح ----------
BEGIN;
UPDATE ai_feature_configs SET
  primary_model_id = (SELECT id FROM ai_models WHERE provider='anthropic' AND model_id='claude-haiku-5-5'),
  fallback_chain = jsonb_build_array(
    (SELECT id FROM ai_models WHERE provider='openai' AND model_id='gpt-5.1'),
    'd31260aa-64d4-48c8-90e1-1a54744d2860'),
  updated_at = now()
WHERE feature_key = 'article-classification';

UPDATE ai_feature_configs SET
  primary_model_id = (SELECT id FROM ai_models WHERE provider='anthropic' AND model_id='claude-haiku-5-5'),
  fallback_chain = jsonb_build_array(
    (SELECT id FROM ai_models WHERE provider='openai' AND model_id='gpt-4o-mini'),
    'd31260aa-64d4-48c8-90e1-1a54744d2860'),
  updated_at = now()
WHERE feature_key IN ('comment-moderation','reply-polish');

UPDATE ai_feature_configs SET
  primary_model_id = (SELECT id FROM ai_models WHERE provider='anthropic' AND model_id='claude-sonnet-5-5'),
  fallback_chain = jsonb_build_array(
    (SELECT id FROM ai_models WHERE provider='openai' AND model_id='gpt-5.1'),
    'd31260aa-64d4-48c8-90e1-1a54744d2860'),
  updated_at = now()
WHERE feature_key = 'infographic-ai';
-- المتوقع: UPDATE 1، UPDATE 2، UPDATE 1. إن اختلف شيء: ROLLBACK; بدل COMMIT.
COMMIT;

-- ---------- 5) تحقق ----------
SELECT f.feature_key, m.model_id AS primary_model,
       (SELECT string_agg(mm.model_id, ' → ' ORDER BY ord) FROM jsonb_array_elements_text(f.fallback_chain) WITH ORDINALITY AS c(mid, ord) JOIN ai_models mm ON mm.id = c.mid) AS fallbacks
FROM ai_feature_configs f
LEFT JOIN ai_models m ON m.id = f.primary_model_id
WHERE f.feature_key IN ('article-classification','comment-moderation','reply-polish','infographic-ai')
ORDER BY 1;
-- الإعدادات تُقرأ من جديد خلال دقيقة تقريبًا (كاش 45 ثانية)، بلا إعادة نشر.

-- ---------- تراجع (عند الحاجة فقط) ----------
-- BEGIN;
-- UPDATE ai_feature_configs SET primary_model_id='3d52f79a-8d8c-454d-a2bd-81591d7d435c',
--   fallback_chain='["60952427-957b-484b-909a-678373327379","d31260aa-64d4-48c8-90e1-1a54744d2860"]'::jsonb, updated_at=now()
--   WHERE feature_key='article-classification';
-- UPDATE ai_feature_configs SET primary_model_id='221a37ff-cf62-4d27-a37e-67b7c2f677c8',
--   fallback_chain='["60952427-957b-484b-909a-678373327379","d31260aa-64d4-48c8-90e1-1a54744d2860"]'::jsonb, updated_at=now()
--   WHERE feature_key IN ('comment-moderation','reply-polish');
-- UPDATE ai_feature_configs SET primary_model_id='3d52f79a-8d8c-454d-a2bd-81591d7d435c',
--   fallback_chain='["a1e83ba5-a731-43e4-b9b3-e6598cf16c4e","ee1efb32-72b6-4105-9efc-bcb0cb0e759a"]'::jsonb, updated_at=now()
--   WHERE feature_key='infographic-ai';
-- COMMIT;
-- النموذجان المضافان يبقيان (غير مستخدمين بعد التراجع ولا يضران).
