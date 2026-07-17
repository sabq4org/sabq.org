// مسح تجارب التوقعات القديمة تمهيدًا للانتقال إلى المنصة المركزية.
//
// يمسح بيانات التوقعات في كل البطولات **ما عدا كأس العالم 2026** (قرار
// 2026-07-17: المونديال شارف على الانتهاء ولا يُمس — جداول wc_* مستثناة
// صراحة ولا تظهر هنا إطلاقًا).
//
// الاستخدام:
//   tsx scripts/wipe-prediction-experiments.ts                 # معاينة فقط (dry-run)
//   tsx scripts/wipe-prediction-experiments.ts --execute       # التنفيذ الفعلي
//   tsx scripts/wipe-prediction-experiments.ts --execute --include-social
//     (يضيف الفانتسي ورجل المباراة وعضويات المجلس)
//
// ما لا يمسحه هذا السكربت أبدًا:
// - جداول كأس العالم (wc_predictions, wc_prediction_matches, wc_long_predictions).
// - gc_duels: رهانات حركت أرصدة ولاء حقيقية — عكسها قرار تشغيلي منفصل.
// - user_loyalty_events / user_points_total: سجل المحفظة تاريخ مالي يبقى.
// - جداول المنصة المركزية الجديدة (prediction_*).
//
// الإنتاج: يُشغَّل عبر Railway بقيمة DATABASE_URL الإنتاجية صراحة — القيمة
// المحلية في .env.local فرع Neon قديم وليست الإنتاج.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { sql } from "drizzle-orm";
const { db } = await import("../server/db");

const CORE_TABLES = [
  // المحرك الكلاسيكي القديم (3/1/0) — يغذي لوحة /sports الحالية
  "sports_predictions",
  // الدوري السعودي
  "rsl_predictions",
  "rsl_prediction_matches",
  "rsl_long_predictions",
  // كأس آسيا الذكي
  "ac_predictions",
  "ac_prediction_matches",
  // كأس الخليج (خليجي 27)
  "gc_predictions",
  "gc_prediction_matches",
  "gc_long_predictions",
  // الكؤوس (الملك / السوبر)
  "cup_predictions",
  "cup_prediction_matches",
  // المسبح المعمّم وملحقاته
  "sports_pool_predictions",
  "sports_pool_matches",
  "sports_pool_long",
  "sports_pool_badges",
  "sports_pool_player_picks",
  "sports_pool_match_picks",
  "sports_pool_user_divisions",
  "sports_pool_weekly_points",
] as const;

const SOCIAL_TABLES = [
  "gc_fantasy_squads",
  "gc_motm_votes",
  "gc_majlis_members",
] as const;

async function tableExists(table: string): Promise<boolean> {
  const result = await db.execute(
    sql`select to_regclass(${`public.${table}`}) is not null as exists`,
  );
  return Boolean((result.rows[0] as { exists?: boolean } | undefined)?.exists);
}

async function countRows(table: string): Promise<number> {
  const result = await db.execute(sql.raw(`select count(*)::int as count from "${table}"`));
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const includeSocial = process.argv.includes("--include-social");
  const tables = includeSocial ? [...CORE_TABLES, ...SOCIAL_TABLES] : [...CORE_TABLES];

  const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
  const host = dbUrl.match(/@([^/:]+)/)?.[1] ?? "غير معروف";
  console.log(`\n🎯 مسح تجارب التوقعات (ما عدا كأس العالم) — المضيف: ${host}`);
  console.log(execute ? "⚠️  وضع التنفيذ الفعلي" : "🔍 وضع المعاينة (dry-run) — لا حذف");
  console.log(`المجموعة: ${includeSocial ? "التوقعات + الاجتماعية (فانتسي/مجلس/رجل المباراة)" : "التوقعات فقط"}\n`);

  const existing: Array<{ table: string; rows: number }> = [];
  for (const table of tables) {
    if (!(await tableExists(table))) {
      console.log(`  ⏭️  ${table} — غير موجود، تخطٍّ`);
      continue;
    }
    const rows = await countRows(table);
    existing.push({ table, rows });
    console.log(`  📋 ${table} — ${rows} صف`);
  }

  const total = existing.reduce((sum, t) => sum + t.rows, 0);
  console.log(`\nالإجمالي: ${total} صف في ${existing.length} جدول`);
  console.log("مستثنى دائمًا: wc_* (المونديال)، gc_duels (أرصدة ولاء)، سجل المحفظة.\n");

  if (!execute) {
    console.log("لم يُحذف شيء. أعد التشغيل مع --execute للتنفيذ.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const { table, rows } of existing) {
      if (rows === 0) continue;
      await tx.execute(sql.raw(`delete from "${table}"`));
      console.log(`  🗑️  ${table} — حُذف ${rows} صف`);
    }
  });

  console.log(`\n✅ اكتمل المسح: ${total} صف من ${existing.length} جدول.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ فشل المسح:", error);
  process.exit(1);
});
