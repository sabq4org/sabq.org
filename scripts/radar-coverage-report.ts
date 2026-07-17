/**
 * تقرير صحة شبكة الرادار — مصادر حمراء + إحصاء الطبقات.
 *
 *   npx tsx scripts/radar-coverage-report.ts
 *   npx tsx scripts/radar-coverage-report.ts --json
 */
import dotenv from "dotenv";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { count, desc, sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema.js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

neonConfig.webSocketConstructor = ws;
const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();

async function main() {
  const asJson = process.argv.includes("--json");
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found");
    process.exit(1);
  }

  let pool: { end: () => Promise<void> };
  let db: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePg>;
  if (DB_DRIVER === "pg") {
    const pg = new PgPool({ connectionString: databaseUrl, max: 1 });
    pool = pg;
    db = drizzlePg(pg, { schema });
  } else {
    const neon = new NeonPool({ connectionString: databaseUrl, max: 1 });
    pool = neon;
    db = drizzleNeon({ client: neon, schema });
  }

  try {
    const sources = await db.select().from(schema.radarSources).orderBy(desc(schema.radarSources.createdAt));
    const active = sources.filter((s) => s.isActive);
    const withError = active.filter((s) => s.lastError);
    const neverFetched = active.filter((s) => !s.lastFetchedAt);
    const xWatches = active.filter((s) => s.type === "x");
    const rss = active.filter((s) => s.type !== "x");

    const byTier: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    const byPack: Record<string, number> = {};
    for (const s of active) {
      const tier = s.tier ?? "unset";
      const region = s.region ?? "unset";
      const pack = s.packId ?? "unset";
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      byRegion[region] = (byRegion[region] ?? 0) + 1;
      byPack[pack] = (byPack[pack] ?? 0) + 1;
    }

    const itemCounts = await db
      .select({
        sourceId: schema.radarItems.sourceId,
        n: count(),
      })
      .from(schema.radarItems)
      .where(sql`${schema.radarItems.fetchedAt} > now() - interval '24 hours'`)
      .groupBy(schema.radarItems.sourceId);
    const itemsBySource = new Map(itemCounts.map((r) => [r.sourceId, Number(r.n)]));

    const silent = active.filter((s) => (itemsBySource.get(s.id) ?? 0) === 0 && !s.lastError);

    const report = {
      generatedAt: new Date().toISOString(),
      totals: {
        active: active.length,
        rss: rss.length,
        xWatches: xWatches.length,
        withError: withError.length,
        neverFetched: neverFetched.length,
        silent24h: silent.length,
      },
      byTier,
      byRegion,
      byPack,
      errors: withError.map((s) => ({
        name: s.name,
        type: s.type,
        tier: s.tier,
        lastError: s.lastError,
        lastFetchedAt: s.lastFetchedAt,
      })),
      neverFetched: neverFetched.map((s) => ({ name: s.name, type: s.type, url: s.url })),
      silent24h: silent.slice(0, 40).map((s) => ({
        name: s.name,
        type: s.type,
        tier: s.tier,
        lastFetchedAt: s.lastFetchedAt,
      })),
    };

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("📡 تقرير صحة رادار سبق");
      console.log(`   نشط: ${report.totals.active} (RSS ${report.totals.rss} · X ${report.totals.xWatches})`);
      console.log(`   بخطأ: ${report.totals.withError} · لم يُجلب: ${report.totals.neverFetched} · صامت 24س: ${report.totals.silent24h}`);
      console.log("   الطبقات:", JSON.stringify(byTier));
      console.log("   المناطق:", JSON.stringify(byRegion));
      if (withError.length) {
        console.log("\n🔴 مصادر بخطأ:");
        for (const e of report.errors) {
          console.log(`   - ${e.name}: ${e.lastError}`);
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("❌ Report failed:", error);
  process.exit(1);
});
