/**
 * بذر حزمة مصادر/رصدات رادار من ملف JSON تحت scripts/seed-packs/.
 *
 * التشغيل:
 *   npx tsx scripts/seed-radar-pack.ts us-nationals
 *   npx tsx scripts/seed-radar-pack.ts us-broadcast us-business global-background saudi-gulf
 *   npx tsx scripts/seed-radar-pack.ts capsulah
 *   npx tsx scripts/seed-radar-pack.ts x-news-accounts
 *   npx tsx scripts/seed-radar-pack.ts --all
 *
 * آمن للإعادة: onConflictDoNothing على url.
 * Dual-driver: DB_DRIVER=pg لـ Railway، والافتراضي neon.
 * لا يشغّل ضد إنتاج بلا ALLOW_PROD_SEED=1.
 */
import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema.js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = join(__dirname, "seed-packs");

interface PackSource {
  name: string;
  url: string;
  type?: "rss" | "json";
  language?: string;
  categorySlug?: string | null;
  tier?: string;
  region?: string;
  fetchIntervalMinutes?: number;
  weight?: number;
  notes?: string;
}

interface PackWatch {
  name: string;
  value: string;
  xType: "keyword" | "hashtag" | "account" | "query" | "trend";
  language?: string;
  categorySlug?: string | null;
  tier?: string;
  region?: string;
  fetchIntervalMinutes?: number;
  weight?: number;
  xProvider?: "auto" | "official" | "twitterapiio";
}

interface SeedPack {
  packId: string;
  title?: string;
  version?: number;
  sources?: PackSource[];
  watches?: PackWatch[];
}

function looksLikeProduction(url: string): boolean {
  return /prod|production|railway\.app|neon\.tech/i.test(url);
}

function loadPack(packId: string): SeedPack {
  const path = join(PACKS_DIR, `${packId}.json`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as SeedPack;
  if (!raw.packId) raw.packId = packId;
  return raw;
}

function listPackIds(): string[] {
  return readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

async function hasOpsColumns(db: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePg>): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'radar_sources'
      AND column_name = 'pack_id'
    LIMIT 1
  `);
  const list = (rows as { rows?: unknown[] }).rows ?? (rows as unknown[]);
  return Array.isArray(list) && list.length > 0;
}

async function seedPack(
  db: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePg>,
  pack: SeedPack,
  withOps: boolean
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const source of pack.sources ?? []) {
    const row: Record<string, unknown> = {
      name: source.name,
      url: source.url,
      type: source.type ?? "rss",
      language: source.language ?? "en",
      categorySlug: source.categorySlug ?? null,
      fetchIntervalMinutes: source.fetchIntervalMinutes ?? 15,
      isActive: true,
    };
    if (withOps) {
      row.tier = source.tier ?? null;
      row.region = source.region ?? null;
      row.weight = source.weight ?? 1;
      row.packId = pack.packId;
    }
    const result = await db
      .insert(schema.radarSources)
      .values(row as typeof schema.radarSources.$inferInsert)
      .onConflictDoNothing({ target: schema.radarSources.url })
      .returning({ name: schema.radarSources.name });
    if (result.length) inserted += 1;
    else skipped += 1;
  }

  for (const watch of pack.watches ?? []) {
    const value = watch.value.trim();
    const xType = watch.xType;
    const url = `x:${xType}:${value.toLowerCase()}`;
    const row: Record<string, unknown> = {
      name: watch.name || value,
      url,
      type: "x",
      language: watch.language ?? "en",
      categorySlug: watch.categorySlug ?? null,
      fetchIntervalMinutes: watch.fetchIntervalMinutes ?? (xType === "trend" ? 15 : 5),
      isActive: true,
      xType,
      xValue: value,
      xProvider: watch.xProvider ?? "auto",
    };
    if (withOps) {
      row.tier = watch.tier ?? null;
      row.region = watch.region ?? null;
      row.weight = watch.weight ?? 1;
      row.packId = pack.packId;
    }
    const result = await db
      .insert(schema.radarSources)
      .values(row as typeof schema.radarSources.$inferInsert)
      .onConflictDoNothing({ target: schema.radarSources.url })
      .returning({ name: schema.radarSources.name });
    if (result.length) inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const all = process.argv.includes("--all");
  const packIds = all ? listPackIds() : args;

  if (packIds.length === 0) {
    console.log("الاستخدام: npx tsx scripts/seed-radar-pack.ts <packId…> | --all");
    console.log("الحزم المتاحة:", listPackIds().join(", "));
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found");
    process.exit(1);
  }
  if (looksLikeProduction(databaseUrl) && process.env.ALLOW_PROD_SEED !== "1") {
    console.error("❌ الرابط يبدو إنتاجيًا. للتشغيل المتعمّد: ALLOW_PROD_SEED=1 npx tsx scripts/seed-radar-pack.ts …");
    process.exit(1);
  }

  console.log(`🔗 Connecting (driver=${DB_DRIVER})…`);
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
    const withOps = await hasOpsColumns(db);
    if (!withOps) {
      console.warn("⚠️ أعمدة tier/region/weight/pack_id غير موجودة بعد — البذر بدونها. شغّل npm run db:push أولاً.");
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    for (const packId of packIds) {
      const pack = loadPack(packId);
      const { inserted, skipped } = await seedPack(db, pack, withOps);
      totalInserted += inserted;
      totalSkipped += skipped;
      const count = (pack.sources?.length ?? 0) + (pack.watches?.length ?? 0);
      console.log(`📦 ${pack.packId}: +${inserted} / تخطّي ${skipped} (من ${count}) — ${pack.title ?? ""}`);
      for (const alt of (pack as { xOnlyAlternatives?: { outlet: string; handle: string; reason: string }[] })
        .xOnlyAlternatives ?? []) {
        console.log(`   ↳ بديل X: ${alt.outlet} → ${alt.handle} (${alt.reason})`);
      }
    }
    console.log(`✅ Done. inserted=${totalInserted} skipped=${totalSkipped}`);
    console.log("فعّل RADAR_ENABLED=true وX_API_BEARER_TOKEN (للحسابات) ليبدأ الرصد.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
