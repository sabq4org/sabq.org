-- كأس آسيا 2027 — جدولا مسابقة التوقّعات الذكية.
-- مطابقان حرفيًّا لتعريف shared/schema.ts (acPredictions + acPredictionMatches).
-- آمن للتكرار: IF NOT EXISTS على كل جدول وفهرس — تشغيله مرتين لا يضرّ.
-- بديل مستهدف عن `npm run db:push` (الذي يفحص الـ251 جدولًا كلها).

BEGIN;

-- صفّ لكل (مباراة، مستخدم): توقّع النتيجة + تفصيل التسوية.
CREATE TABLE IF NOT EXISTS ac_predictions (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id     varchar NOT NULL,
  user_id        varchar NOT NULL REFERENCES users(id),
  pred_home      integer NOT NULL,
  pred_away      integer NOT NULL,
  status         text    NOT NULL DEFAULT 'pending',
  outcome_hit    boolean NOT NULL DEFAULT false,
  margin_hit     boolean NOT NULL DEFAULT false,
  exact_hit      boolean NOT NULL DEFAULT false,
  boldness_mult  integer NOT NULL DEFAULT 100,
  streak_mult    integer NOT NULL DEFAULT 100,
  points_awarded integer NOT NULL DEFAULT 0,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  settled_at     timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_pred_fixture_user ON ac_predictions (fixture_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ac_pred_user          ON ac_predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_ac_pred_fixture       ON ac_predictions (fixture_id);
CREATE INDEX IF NOT EXISTS idx_ac_pred_user_settled  ON ac_predictions (user_id, settled_at);

-- حالة كل مباراة: لقطة احتمالات ما قبل الصافرة (لتسعير الجرأة) + مرساة التسوية.
CREATE TABLE IF NOT EXISTS ac_prediction_matches (
  fixture_id        varchar PRIMARY KEY,
  kickoff_at        timestamp NOT NULL,
  home_team_id      integer NOT NULL DEFAULT 0,
  away_team_id      integer NOT NULL DEFAULT 0,
  home_team_name    text    NOT NULL,
  home_team_logo    text    NOT NULL DEFAULT '',
  away_team_name    text    NOT NULL,
  away_team_logo    text    NOT NULL DEFAULT '',
  prob_home         integer NOT NULL DEFAULT 33,
  prob_draw         integer NOT NULL DEFAULT 34,
  prob_away         integer NOT NULL DEFAULT 33,
  final_home        integer,
  final_away        integer,
  status            text    NOT NULL DEFAULT 'open',
  predictions_count integer NOT NULL DEFAULT 0,
  outcome_winners   integer NOT NULL DEFAULT 0,
  exact_winners     integer NOT NULL DEFAULT 0,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  settled_at        timestamp
);

CREATE INDEX IF NOT EXISTS idx_ac_pred_match_status ON ac_prediction_matches (status);

COMMIT;
