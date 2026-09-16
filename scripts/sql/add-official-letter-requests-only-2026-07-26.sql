-- إنشاء جدول طلبات الخطابات فقط (إن وُجد official_letters مسبقاً).
-- السبب الشائع لخطأ: relation "official_letter_requests" does not exist
-- آمن لإعادة التشغيل.

BEGIN;

CREATE TABLE IF NOT EXISTS official_letter_requests (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id  varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  letter_type        varchar(32) NOT NULL,
  recipient_entity   text,
  note               text,
  status             varchar(16) NOT NULL DEFAULT 'pending',
  reviewed_by_user_id varchar REFERENCES users(id),
  reviewed_at        timestamp,
  review_note        text,
  letter_id          varchar REFERENCES official_letters(id) ON DELETE SET NULL,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS official_letter_requests_requester_idx
  ON official_letter_requests (requester_user_id);
CREATE INDEX IF NOT EXISTS official_letter_requests_status_idx
  ON official_letter_requests (status);

COMMIT;
