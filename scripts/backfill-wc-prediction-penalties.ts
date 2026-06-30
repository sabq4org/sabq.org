// ترميم نتيجة ركلات الترجيح لمباريات توقّعات المونديال المُسوّاة قبل إضافة
// عمودَي final_pen_home/final_pen_away. يقرأ الترجيح من مزوّد المونديال (نفس
// مصدر التسوية) ويملأ العمودين للمباريات المُسوّاة التي ما تزال فارغة.
//
// آمن للتكرار: يحدّث فقط الصفوف status='settled' وpenalties فارغة، ولا يلمس
// النتيجة ولا النقاط ولا التسوية. لا يُعيد منح نقاط.
//
// التشغيل (يحترم DB_DRIVER مثل بقية السكربتات؛ يلزم DATABASE_URL ومفتاح
// API-Football في البيئة):
//   npx tsx scripts/backfill-wc-prediction-penalties.ts
//   railway run npx tsx scripts/backfill-wc-prediction-penalties.ts   # إنتاج
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema.js";
import { wcPredictionMatches } from "../shared/schema.js";
import { getFixtures } from "../server/services/worldCupService.js";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL غير موجود في البيئة");
    process.exit(1);
  }

  console.log(`🔗 الاتصال بقاعدة البيانات (driver=${DB_DRIVER})…`);
  let pool: any;
  let db: any;
  if (DB_DRIVER === "pg") {
    pool = new PgPool({ connectionString: databaseUrl, max: 1 });
    db = drizzlePg(pool, { schema });
  } else {
    pool = new NeonPool({ connectionString: databaseUrl, max: 1 });
    db = drizzleNeon({ client: pool, schema });
  }

  try {
    // المباريات المُسوّاة التي لم تُملأ ركلات ترجيحها بعد.
    const pending = await db
      .select()
      .from(wcPredictionMatches)
      .where(and(eq(wcPredictionMatches.status, "settled"), isNull(wcPredictionMatches.finalPenHome)));

    if (pending.length === 0) {
      console.log("✅ لا مباريات مُسوّاة بحاجة لترميم الترجيح.");
      return;
    }

    console.log(`🔎 ${pending.length} مباراة مُسوّاة بلا ترجيح — أجلب نتائج المزوّد…`);
    const fixtures = await getFixtures({ forceFresh: true });
    const penById = new Map<string, { home: number | null; away: number | null }>();
    for (const f of fixtures) {
      if (f.penalties && (f.penalties.home != null || f.penalties.away != null)) {
        penById.set(String(f.id), f.penalties);
      }
    }

    let updated = 0;
    for (const m of pending) {
      const pen = penById.get(m.fixtureId);
      if (!pen) continue; // ليست مباراة ترجيح (أو لم يرصدها المزوّد)
      await db
        .update(wcPredictionMatches)
        .set({ finalPenHome: pen.home, finalPenAway: pen.away, updatedAt: new Date() })
        .where(eq(wcPredictionMatches.fixtureId, m.fixtureId));
      updated++;
      console.log(
        `  ✓ ${m.homeTeamName} ${pen.home}-${pen.away} ${m.awayTeamName}  (fixture ${m.fixtureId})`,
      );
    }

    console.log(`\n✅ تم ترميم ${updated} مباراة من أصل ${pending.length} مُسوّاة فارغة.`);
    if (updated < pending.length) {
      console.log(`   (${pending.length - updated} ليست مباريات ترجيح — لا إجراء.)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ فشل الترميم:", err);
  process.exit(1);
});
