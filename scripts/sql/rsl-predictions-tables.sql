-- زراعة جداول توقّعات دوري روشن (محرّك المونديال) + جدول التوقّعات طويلة المدى
-- الموحّد الذي يخدم تبويب «البطل والهدّاف» في كأس الملك.
--
-- التشغيل عبر محرر SQL على قاعدة الإنتاج (Neon) — كل الأوامر idempotent
-- (IF NOT EXISTS) فإعادة تشغيل الملف آمنة. البديل: npm run db:push.
--
-- بعد الزراعة: اضبط على Railway
--   RSL_PREDICTIONS_ENABLED=true   (توقّعات روشن: مباريات + بطل/هدّاف + كرون التسوية)
--   SAUDI_LEAGUE_ENABLED=true      (بيانات الدوري نفسها إن لم تكن مفعّلة)

-- ── 1) توقّعات مباريات روشن: توقّع واحد لكل (مباراة، مستخدم) ────────────────
CREATE TABLE IF NOT EXISTS rsl_predictions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id varchar NOT NULL,
  user_id varchar NOT NULL REFERENCES users(id),
  pred_home integer NOT NULL,
  pred_away integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  settled_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsl_pred_fixture_user ON rsl_predictions (fixture_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rsl_pred_user ON rsl_predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_rsl_pred_fixture ON rsl_predictions (fixture_id);

-- ── 2) لقطة تسوية كل مباراة (مرساة idempotency + سجلّ العرض + اللوحة) ───────
CREATE TABLE IF NOT EXISTS rsl_prediction_matches (
  fixture_id varchar PRIMARY KEY,
  kickoff_at timestamp NOT NULL,
  home_team_name text NOT NULL,
  home_team_logo text NOT NULL DEFAULT '',
  away_team_name text NOT NULL,
  away_team_logo text NOT NULL DEFAULT '',
  final_home integer,
  final_away integer,
  status text NOT NULL DEFAULT 'open',
  winners_count integer NOT NULL DEFAULT 0,
  predictions_count integer NOT NULL DEFAULT 0,
  points_pool integer NOT NULL DEFAULT 500,
  points_per_winner integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  settled_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_rsl_pred_match_status ON rsl_prediction_matches (status);

-- ── 3) توقّعات موسم روشن (البطل بوزن المبادر + الهدّاف) ─────────────────────
CREATE TABLE IF NOT EXISTS rsl_long_predictions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  team_id integer,
  team_name text,
  team_logo text,
  player_id integer,
  player_name text,
  player_photo text,
  weight integer NOT NULL DEFAULT 100,
  locked_stage text NOT NULL DEFAULT 'early',
  status text NOT NULL DEFAULT 'pending',
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  settled_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsl_long_user_kind ON rsl_long_predictions (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_rsl_long_kind ON rsl_long_predictions (kind);

-- ── 4) (لكأس الملك) التوقّعات طويلة المدى الموحّدة — تبويب «البطل والهدّاف» ──
CREATE TABLE IF NOT EXISTS sports_pool_long (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_slug text NOT NULL,
  kind text NOT NULL,
  team_id integer,
  team_name text,
  team_logo text,
  player_name text,
  status text NOT NULL DEFAULT 'pending',
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  settled_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_pool_long_user_comp_kind ON sports_pool_long (user_id, competition_slug, kind);
CREATE INDEX IF NOT EXISTS idx_sp_pool_long_comp_kind ON sports_pool_long (competition_slug, kind);
