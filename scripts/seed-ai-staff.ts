/**
 * زراعة جدول ai_staff من السجل الافتراضي في shared/aiStaffRoster.ts.
 *
 * Idempotent and additive: الصفوف القائمة لا تُمس أبدًا (تعديلات القاعدة
 * ملك المشرفين وتنجو من إعادة الزراعة). يُشغَّل بعد `npm run db:push`.
 * قبل الزراعة تعمل الواجهة من الثوابت مباشرة — الزراعة تنقل الملكية للقاعدة.
 *
 * Usage (dev):   tsx scripts/seed-ai-staff.ts
 * Usage (prod):  DB_DRIVER=pg DATABASE_URL='postgresql://...' tsx scripts/seed-ai-staff.ts
 */

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import ws from "ws";
import * as schema from "../shared/schema";
import { AI_STAFF_ROSTER } from "../shared/aiStaffRoster";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();

function maskUrl(url: string): string {
  return url.replace(/:[^@/]+@/, ":***@");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL is required");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("AI Staff seed — فريق سبق الذكي");
  console.log("=".repeat(60));
  console.log(`  DB:     ${maskUrl(databaseUrl)}`);
  console.log(`  Driver: ${DB_DRIVER}`);
  console.log("");

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
    let inserted = 0;
    for (const m of AI_STAFF_ROSTER) {
      const rows = await db
        .insert(schema.aiStaff)
        .values({
          slug: m.slug,
          employeeCode: m.employeeCode,
          nameAr: m.nameAr,
          titleAr: m.titleAr,
          bioAr: m.bioAr,
          departmentKey: m.departmentKey,
          managerSlug: m.managerSlug,
          avatarUrl: m.avatarUrl,
          featureKeys: m.featureKeys,
          featureKeyPrefixes: m.featureKeyPrefixes,
          systems: m.systems,
          triggerMode: m.triggerMode,
          scheduleNoteAr: m.scheduleNoteAr,
          metricsSource: m.metricsSource,
          sortOrder: m.sortOrder,
        })
        .onConflictDoNothing()
        .returning({ id: schema.aiStaff.id });
      if (rows.length > 0) inserted++;
    }
    console.log(`✅ ai_staff: ${inserted} inserted, ${AI_STAFF_ROSTER.length - inserted} already present`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ seed failed:", err);
  process.exit(1);
});
