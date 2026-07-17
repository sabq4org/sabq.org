/**
 * إنشاء جداول المنصة المركزية للتوقعات (prediction_*) على قاعدة البيانات
 * الهدف — إضافي وidempotent، مطابق لتعريفات Drizzle في shared/schema.ts.
 * DDL عبر SQL لا عبر db:push، وفق عرف المشروع (db:push لا يعمل على الإنتاج).
 *
 * آمن افتراضيًا: يطبع الخطة ولا يكتب شيئًا دون --apply. كل العبارات
 * CREATE … IF NOT EXISTS فإعادة التشغيل بلا أثر.
 *
 * الاستخدام: railway run npx tsx scripts/apply-prediction-core-tables.ts [--apply]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
const { pool } = await import("../server/db");

const apply = process.argv.includes("--apply");

const DDL = [
  `CREATE TABLE IF NOT EXISTS prediction_competitions (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     slug varchar(64) NOT NULL,
     name_ar text NOT NULL,
     name_en text,
     season_key varchar(32) NOT NULL,
     status text NOT NULL DEFAULT 'draft',
     leaderboard_mode text NOT NULL DEFAULT 'competition',
     source_provider text,
     timezone text NOT NULL DEFAULT 'Asia/Riyadh',
     metadata jsonb,
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_comp_slug ON prediction_competitions (slug)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_comp_status ON prediction_competitions (status)`,

  `CREATE TABLE IF NOT EXISTS prediction_scoring_profiles (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     competition_id varchar REFERENCES prediction_competitions(id),
     contest_type text NOT NULL,
     strategy_key text NOT NULL,
     version integer NOT NULL,
     params jsonb NOT NULL,
     status text NOT NULL DEFAULT 'draft',
     effective_from timestamp,
     created_by varchar,
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_profile_version ON prediction_scoring_profiles (competition_id, contest_type, version)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_profile_lookup ON prediction_scoring_profiles (competition_id, contest_type, status)`,

  `CREATE TABLE IF NOT EXISTS prediction_contests (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     competition_id varchar NOT NULL REFERENCES prediction_competitions(id),
     external_ref varchar(128) NOT NULL,
     contest_type text NOT NULL,
     scoring_profile_id varchar NOT NULL REFERENCES prediction_scoring_profiles(id),
     opens_at timestamp NOT NULL,
     locks_at timestamp NOT NULL,
     status text NOT NULL DEFAULT 'draft',
     result_payload jsonb,
     result_version integer NOT NULL DEFAULT 0,
     settled_at timestamp,
     metadata jsonb,
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_contest_external ON prediction_contests (competition_id, contest_type, external_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_contest_status ON prediction_contests (status, locks_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_contest_competition ON prediction_contests (competition_id, status)`,

  `CREATE TABLE IF NOT EXISTS prediction_entries (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     contest_id varchar NOT NULL REFERENCES prediction_contests(id),
     user_id varchar NOT NULL REFERENCES users(id),
     prediction_payload jsonb NOT NULL,
     scoring_profile_id varchar NOT NULL REFERENCES prediction_scoring_profiles(id),
     submitted_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now(),
     status text NOT NULL DEFAULT 'active',
     source_platform text NOT NULL DEFAULT 'web'
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_entry_contest_user ON prediction_entries (contest_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_entry_user ON prediction_entries (user_id)`,

  `CREATE TABLE IF NOT EXISTS prediction_settlements (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     contest_id varchar NOT NULL REFERENCES prediction_contests(id),
     result_version integer NOT NULL,
     strategy_key text NOT NULL,
     strategy_version integer NOT NULL,
     input_hash varchar(64) NOT NULL,
     status text NOT NULL DEFAULT 'processing',
     summary jsonb,
     error_code text,
     reverses_settlement_id varchar,
     started_at timestamp NOT NULL DEFAULT now(),
     completed_at timestamp
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_settlement_run ON prediction_settlements (contest_id, result_version, strategy_version)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_settlement_status ON prediction_settlements (status)`,

  `CREATE TABLE IF NOT EXISTS prediction_points_ledger (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     settlement_id varchar NOT NULL REFERENCES prediction_settlements(id),
     contest_id varchar NOT NULL REFERENCES prediction_contests(id),
     competition_id varchar NOT NULL REFERENCES prediction_competitions(id),
     entry_id varchar REFERENCES prediction_entries(id),
     user_id varchar NOT NULL REFERENCES users(id),
     points integer NOT NULL,
     point_scope text NOT NULL DEFAULT 'competition',
     reason_code text NOT NULL,
     breakdown jsonb,
     reverses_ledger_id varchar,
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_ledger_award ON prediction_points_ledger (settlement_id, user_id, entry_id, point_scope, reason_code)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_ledger_user_comp ON prediction_points_ledger (user_id, competition_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_ledger_competition ON prediction_points_ledger (competition_id, point_scope)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_ledger_contest ON prediction_points_ledger (contest_id)`,

  `CREATE TABLE IF NOT EXISTS prediction_pool_state (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     competition_id varchar NOT NULL REFERENCES prediction_competitions(id),
     contest_type text NOT NULL,
     carry_balance integer NOT NULL DEFAULT 0,
     last_settlement_id varchar,
     updated_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_pool_state_key ON prediction_pool_state (competition_id, contest_type)`,

  `CREATE TABLE IF NOT EXISTS prediction_award_outbox (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     ledger_id varchar NOT NULL REFERENCES prediction_points_ledger(id),
     user_id varchar NOT NULL REFERENCES users(id),
     base_points integer NOT NULL,
     multiplier_snapshot integer NOT NULL DEFAULT 100,
     wallet_points integer NOT NULL,
     status text NOT NULL DEFAULT 'pending',
     attempts integer NOT NULL DEFAULT 0,
     next_attempt_at timestamp NOT NULL DEFAULT now(),
     last_error text,
     delivered_at timestamp,
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_outbox_ledger ON prediction_award_outbox (ledger_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_outbox_pending ON prediction_award_outbox (status, next_attempt_at)`,
];

async function main(): Promise<void> {
  console.log(`\n🏗️  جداول المنصة المركزية للتوقعات — ${DDL.length} عبارة DDL`);
  if (!apply) {
    console.log("🔍 معاينة فقط — أعد التشغيل مع --apply للتنفيذ.\n");
    for (const stmt of DDL) console.log(stmt.split("\n")[0].trim() + " …");
    process.exit(0);
  }

  for (const stmt of DDL) {
    await pool.query(stmt);
    console.log("  ✅ " + stmt.split("\n")[0].trim() + " …");
  }
  console.log("\n✅ اكتمل إنشاء الجداول.");
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ فشل التنفيذ:", error);
  process.exit(1);
});
