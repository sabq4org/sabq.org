/**
 * زراعة صلاحيات غرفة عمليات سبق الذكية في جدول permissions.
 * Idempotent: onConflictDoNothing — المشرفون (superuser) يمرون بالـwildcard بلا زراعة.
 *
 * Usage (dev):   tsx scripts/seed-ops-room.ts
 * Usage (prod):  DB_DRIVER=pg DATABASE_URL='postgresql://...' tsx scripts/seed-ops-room.ts
 */
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import ws from "ws";
import * as schema from "../shared/schema";
import { OPS_PERMISSION_SEED } from "../shared/opsRoom";

neonConfig.webSocketConstructor = ws;
const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL is required");
    process.exit(1);
  }
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
    for (const p of OPS_PERMISSION_SEED) {
      const rows = await db
        .insert(schema.permissions)
        .values(p)
        .onConflictDoNothing()
        .returning({ id: schema.permissions.id });
      if (rows.length > 0) inserted++;
    }
    console.log(`✅ permissions(ops_room): ${inserted} inserted, ${OPS_PERMISSION_SEED.length - inserted} already present`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ seed failed:", err);
  process.exit(1);
});
