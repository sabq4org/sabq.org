-- «طلب تعديل»: طلب مفتوح واحد فقط لكل (مادة، صاحب طلب).
-- إضافي فقط: فهرس فريد جزئي على جدول قائم. لا يحذف ولا يعدّل أي صف.
--
-- الكود (server/services/articleEditRequestsService.ts → createEditRequest) يمنع
-- التكرار وحده بقفل استشاري داخل معاملة، ويعامل خرق هذا الفهرس (23505) على أنه
-- 409 EDIT_REQUEST_PENDING. الفهرس حزام ثانٍ ضد أي مسار كتابة آخر.
--
-- خطة التنفيذ (بمالك الجداول في Neon SQL Editor، بعد نسخة احتياطية/فرع Neon):
--   1) شغّل استعلام فحص التكرار (الخطوة 1) وحده.
--      - إن أعاد أي صف: توقّف وأبلغ علي بالنتيجة. لا حذف ولا إلغاء آلي للتكرارات؛
--        قرار أي الطلبين يبقى مفتوحًا تحريري.
--      - إن لم يُعد شيئًا: انتقل للخطوة 2.
--   2) شغّل CREATE UNIQUE INDEX CONCURRENTLY وحده، خارج أي معاملة
--      (لا BEGIN/COMMIT، ولا تشغيل الملف كاملًا داخل معاملة واحدة).
--   3) شغّل استعلامي التحقق (الخطوة 3): يجب أن يظهر الفهرس، وindisvalid = true.
--      إن ظهر indisvalid = false (فشل البناء المتزامن): أبلغ علي؛ العلاج
--      DROP INDEX CONCURRENTLY IF EXISTS idx_article_edit_requests_one_pending
--      ثم إعادة الخطوتين 1 و2 — لا يُنفّذ إلا بقرار صريح.
--   لا GRANT مطلوب: الفهرس يتبع الجدول، وصلاحيات sabq_runtime عليه قائمة.
--   التراجع (بقرار صريح فقط): DROP INDEX CONCURRENTLY IF EXISTS idx_article_edit_requests_one_pending;

-- الخطوة 1 — فحص للقراءة فقط: أزواج لها أكثر من طلب مفتوح.
SELECT article_id, requester_id, count(*) AS pending_count, array_agg(id ORDER BY created_at) AS request_ids
FROM article_edit_requests
WHERE status = 'pending'
GROUP BY article_id, requester_id
HAVING count(*) > 1;

-- الخطوة 2 — بعد التأكد أن الخطوة 1 فارغة.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_article_edit_requests_one_pending
  ON article_edit_requests (article_id, requester_id)
  WHERE status = 'pending';

-- الخطوة 3 — تحقق.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'article_edit_requests'
  AND indexname = 'idx_article_edit_requests_one_pending';

SELECT c.relname, i.indisvalid, i.indisunique
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'idx_article_edit_requests_one_pending';
