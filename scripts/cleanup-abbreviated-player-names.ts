/**
 * تنظيف تعريبات أسماء اللاعبين المختصرة الملوَّثة (اختراع اسمٍ أوّل خاطئ).
 *
 * الخلفية: حين لا يوفّر المزوّد اسم اللاعب الكامل، يصل اسمٌ مختصر ("H. Hassan")
 * إلى مترجم الأسماء، فكان الـAI يخترع اسمًا أوّل كاملًا ("هيثم حسن")؛ والكاش
 * المشترك يجعل لاعبًا آخر بنفس الاختصار يرث الاسم الخطأ → تُنسب بطاقته للاعب آخر.
 * صُحّح الـprompt ليُبقي الاختصار، لكن الصفوف الآلية المخزّنة سابقًا تبقى ملوَّثة.
 *
 * هذا السكربت يعيد كل صفّ لاعبٍ **آليّ (status=auto, origin=ai)** مصدره مختصر إلى
 * حالة pending (arabic=source) — فيُعاد ترجمته بالـprompt الجديد عند أول عرضٍ
 * لاحق. لا يحذف شيئًا، ولا يمسّ التصحيحات اليدوية (origin=manual) أو المعتمدة.
 *
 * الأمان:
 *   - افتراضيًّا DRY-RUN: يَعرض المرشّحين فقط بلا أيّ تعديل.
 *   - التعديل الفعلي يتطلّب العلم --apply صراحةً.
 *   - يحترم DB_DRIVER (pg للإنتاج/Railway، neon الافتراضي) — مثل بقية السكربتات.
 *
 * الاستخدام:
 *   DB_DRIVER=pg DATABASE_URL=<prod> tsx scripts/cleanup-abbreviated-player-names.ts          # عرض فقط
 *   DB_DRIVER=pg DATABASE_URL=<prod> tsx scripts/cleanup-abbreviated-player-names.ts --apply   # تنفيذ
 */
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema.js";
import { sportsNameTranslations } from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();
const APPLY = process.argv.includes("--apply");

// مصدرٌ مختصر: أيّ مقطعٍ من حرفٍ لاتينيّ واحد متبوعٍ بنقطة ("H." في "H. Hassan").
const ABBREV_SQL = sql`${sportsNameTranslations.source} ~ '(^| )[A-Za-z]\\.'`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL غير مضبوط في البيئة");
    process.exit(1);
  }

  let pool: NeonPool | PgPool;
  let db: ReturnType<typeof drizzlePg> | ReturnType<typeof drizzleNeon>;
  console.log(`🔗 اتصال بقاعدة البيانات (driver=${DB_DRIVER}) — الوضع: ${APPLY ? "تنفيذ ⚠️" : "عرض فقط (dry-run)"}`);
  if (DB_DRIVER === "pg") {
    pool = new PgPool({ connectionString: databaseUrl, max: 1 });
    db = drizzlePg(pool as PgPool, { schema });
  } else {
    pool = new NeonPool({ connectionString: databaseUrl, max: 1 });
    db = drizzleNeon({ client: pool as NeonPool, schema });
  }

  const where = and(
    eq(sportsNameTranslations.entityType, "player"),
    eq(sportsNameTranslations.status, "auto"),
    eq(sportsNameTranslations.origin, "ai"),
    ABBREV_SQL,
  );

  const candidates = await db
    .select({
      id: sportsNameTranslations.id,
      provider: sportsNameTranslations.provider,
      source: sportsNameTranslations.source,
      arabic: sportsNameTranslations.arabic,
      hits: sportsNameTranslations.hits,
    })
    .from(sportsNameTranslations)
    .where(where);

  console.log(`\n📋 المرشّحون (لاعب · آليّ · مصدر مختصر): ${candidates.length} صفّ\n`);
  for (const c of candidates.slice(0, 60)) {
    console.log(`  [${c.provider}] "${c.source}"  →  "${c.arabic}"  (ظهور: ${c.hits})`);
  }
  if (candidates.length > 60) console.log(`  … و${candidates.length - 60} صفًّا آخر`);

  if (candidates.length === 0) {
    console.log("\n✅ لا شيء لتنظيفه.");
  } else if (!APPLY) {
    console.log(`\n🔎 عرض فقط — لم يُعدَّل شيء. للتنفيذ أعد التشغيل مع --apply`);
  } else {
    const res = await db
      .update(sportsNameTranslations)
      .set({ status: "pending", arabic: sql`${sportsNameTranslations.source}`, updatedAt: new Date() })
      .where(where);
    const affected = (res as any)?.rowCount ?? candidates.length;
    console.log(`\n✅ أُعيد ${affected} صفًّا إلى pending — ستُعاد ترجمتها بالـprompt الجديد عند أوّل عرض.`);
  }

  await (pool as PgPool | NeonPool).end();
}

main().catch((err) => {
  console.error("❌ فشل السكربت:", err);
  process.exit(1);
});
