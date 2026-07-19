-- زراعة جداول توقّعات الكؤوس المحلية (محرّك المونديال المُعمّم) — موحّد ومُوسَّم
-- بالبطولة، يخدم كأس الملك (kings-cup) وكأس السوبر (super-cup) بجدول واحد لكل
-- منهما (competition_slug). سلوكه مطابق لجداول rsl_* لدوري روشن.
--
-- التشغيل عبر محرر SQL على قاعدة الإنتاج (Neon) — كل الأوامر idempotent
-- (IF NOT EXISTS) فإعادة تشغيل الملف آمنة. البديل: npm run db:push.
--
-- ملاحظة: جدول التوقّعات طويلة المدى (البطل/الهدّاف) الموحّد sports_pool_long
-- مزروع مسبقًا (يخدم كأس الملك حاليًا) — لا يحتاج إنشاءً هنا.
--
-- بعد الزراعة: اضبط على Railway
--   SAUDI_LEAGUE_ENABLED=true          (بيانات الدوري/الكؤوس نفسها)
--   KINGS_CUP_PREDICTIONS_ENABLED=true (توقّعات كأس الملك: مباريات + بطل/هدّاف + كرون)
--   SUPER_CUP_PREDICTIONS_ENABLED=true (توقّعات كأس السوبر: مباريات + كرون)

-- ── 1) توقّعات مباريات الكؤوس: توقّع واحد لكل (مباراة، مستخدم) ────────────────
CREATE TABLE IF NOT EXISTS cup_predictions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_slug text NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_cup_pred_fixture_user ON cup_predictions (fixture_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cup_pred_comp_user ON cup_predictions (competition_slug, user_id);
CREATE INDEX IF NOT EXISTS idx_cup_pred_fixture ON cup_predictions (fixture_id);

-- ── 2) لقطة تسوية كل مباراة (مرساة idempotency + سجلّ العرض + اللوحة) ───────
CREATE TABLE IF NOT EXISTS cup_prediction_matches (
  fixture_id varchar PRIMARY KEY,
  competition_slug text NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_cup_pred_match_comp_status ON cup_prediction_matches (competition_slug, status);

-- ── 3) (احتياطًا) التوقّعات طويلة المدى الموحّدة إن لم تكن مزروعة ────────────
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
