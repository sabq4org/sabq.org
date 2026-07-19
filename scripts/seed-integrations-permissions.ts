/**
 * زرع صلاحيات صفحة "إعدادات التكاملات" (integrations.view / integrations.manage).
 *
 * الأدمن يمر بدون هذه الصفوف (اختصار الـ superuser في server/rbac.ts) —
 * الصفوف تُزرع كي يمكن منح الصلاحية لأدوار غير superuser من لوحة الأدوار.
 *
 * Idempotent — إعادة التشغيل آمنة (onConflictDoNothing).
 *
 * Usage (dev):   tsx scripts/seed-integrations-permissions.ts
 * Usage (prod):  DB_DRIVER=pg DATABASE_URL='postgresql://...' tsx scripts/seed-integrations-permissions.ts
 */

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import ws from "ws";
import * as schema from "../shared/schema";

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

  console.log("Integrations permissions seed");
  console.log(`  DB:     ${maskUrl(databaseUrl)}`);
  console.log(`  Driver: ${DB_DRIVER}`);

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
    const integrationPermissions = [
      { code: "integrations.view", label: "View Integrations Settings", labelAr: "عرض إعدادات التكاملات", module: "integrations" },
      { code: "integrations.manage", label: "Manage Integrations Settings", labelAr: "إدارة إعدادات التكاملات", module: "integrations" },
    ];
    for (const p of integrationPermissions) {
      await db.insert(schema.permissions).values(p).onConflictDoNothing();
    }
    console.log("✅ permissions: integrations.view / integrations.manage ensured");
  } catch (err: any) {
    console.error("❌ Seed failed:", err.message);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

main();
