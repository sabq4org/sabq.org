/**
 * بذر اختياري لمصادر رادار سبق الذكي — حزمة انطلاق من خلاصات RSS حقيقية
 * وعاملة لوكالات ومؤسسات عالمية، مع قاعدة تنبيه أولى للمونديال.
 *
 * التشغيل:  npx tsx scripts/seed-radar-sources.ts
 * آمن للإعادة: onConflictDoNothing على رابط المصدر (unique).
 *
 * Dual-driver مثل بقية سكربتات البذر: DB_DRIVER=pg للتشغيل ضد Railway
 * (عبر railway run)، والافتراضي neon.
 */
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import ws from "ws";
import * as schema from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();

// خلاصات حقيقية عامة — عدّل/احذف بحرية من واجهة «المصادر» بعد البذر
const STARTER_SOURCES = [
  {
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    type: "rss",
    language: "en",
    categorySlug: "world",
    fetchIntervalMinutes: 10,
  },
  {
    name: "The Guardian — World",
    url: "https://www.theguardian.com/world/rss",
    type: "rss",
    language: "en",
    categorySlug: "world",
    fetchIntervalMinutes: 15,
  },
  {
    name: "Sky News — World",
    url: "https://feeds.skynews.com/feeds/rss/world.xml",
    type: "rss",
    language: "en",
    categorySlug: "world",
    fetchIntervalMinutes: 15,
  },
  {
    name: "Al Jazeera English",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    type: "rss",
    language: "en",
    categorySlug: "world",
    fetchIntervalMinutes: 15,
  },
  {
    name: "BBC Sport — Football",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    type: "rss",
    language: "en",
    categorySlug: "sports",
    fetchIntervalMinutes: 10,
  },
  {
    name: "BBC Mundo (الإسبانية)",
    url: "https://feeds.bbci.co.uk/mundo/rss.xml",
    type: "rss",
    language: "es",
    categorySlug: "world",
    fetchIntervalMinutes: 30,
  },
] as const;

const STARTER_RULE = {
  label: "المونديال 2026 والمنتخب السعودي",
  keywords: ["World Cup 2026", "World Cup", "Saudi team", "Saudi Arabia", "المنتخب السعودي", "كأس العالم"],
  minNewsValue: 50,
  markBreaking: true,
  notifyTelegram: true,
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found in environment variables");
    process.exit(1);
  }

  console.log(`🔗 Connecting to database (driver=${DB_DRIVER})...`);
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
    const insertedSources = await db
      .insert(schema.radarSources)
      .values(STARTER_SOURCES.map((source) => ({ ...source })))
      .onConflictDoNothing({ target: schema.radarSources.url })
      .returning({ name: schema.radarSources.name });
    console.log(`📡 Sources inserted: ${insertedSources.length}/${STARTER_SOURCES.length} (الباقي موجود مسبقًا)`);

    const existingRules = await db.select({ id: schema.radarAlertRules.id }).from(schema.radarAlertRules);
    if (existingRules.length === 0) {
      await db.insert(schema.radarAlertRules).values(STARTER_RULE);
      console.log(`🔔 Alert rule inserted: ${STARTER_RULE.label}`);
    } else {
      console.log("🔔 Alert rules already exist — skipping starter rule");
    }

    console.log("✅ Done. فعّل RADAR_ENABLED=true على الخادم ليبدأ الرصد.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
