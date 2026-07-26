-- الخطابات الرسمية — إنشاء الجداول (additive فقط، وفق Workflow C)
-- يُنفَّذ على الإنتاج قبل نشر الكود. آمن لإعادة التشغيل.
--
-- محلياً يكفي: npm run db:push:local
-- على الإنتاج: نفّذ هذا الملف يدوياً — لا تشغّل db:push ضد Neon.

BEGIN;

CREATE TABLE IF NOT EXISTS official_letters (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code   varchar(32) NOT NULL UNIQUE,
  letter_type      varchar(32) NOT NULL,
  subject_user_id  varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_entity text,
  purpose_note     text,
  snapshot         jsonb,
  file_key         text,
  status           varchar(16) NOT NULL DEFAULT 'issued',
  source           varchar(16) NOT NULL DEFAULT 'admin',
  ticket_id        varchar REFERENCES opinion_tickets(id) ON DELETE SET NULL,
  issued_by_user_id varchar REFERENCES users(id),
  issued_at        timestamp NOT NULL DEFAULT now(),
  revoked_at       timestamp,
  revoked_by_user_id varchar REFERENCES users(id),
  revoke_reason    text,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS official_letters_subject_idx   ON official_letters (subject_user_id);
CREATE INDEX IF NOT EXISTS official_letters_issued_at_idx ON official_letters (issued_at);
CREATE INDEX IF NOT EXISTS official_letters_status_idx    ON official_letters (status);

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

CREATE INDEX IF NOT EXISTS official_letter_requests_requester_idx ON official_letter_requests (requester_user_id);
CREATE INDEX IF NOT EXISTS official_letter_requests_status_idx    ON official_letter_requests (status);

COMMIT;
