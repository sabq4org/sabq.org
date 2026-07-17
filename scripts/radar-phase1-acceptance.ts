/**
 * تقرير قبول المرحلة أ (قصص/زخم/صلة) — عيّنة تكرار مثل إيران.
 *
 *   npx tsx scripts/radar-phase1-acceptance.ts
 *   npx tsx scripts/radar-phase1-acceptance.ts --json
 */
import dotenv from "dotenv";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
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
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const stories = await db
      .select()
      .from(schema.radarStories)
      .where(and(eq(schema.radarStories.status, "active"), gte(schema.radarStories.lastSeenAt, since)))
      .orderBy(desc(schema.radarStories.sourceCount), desc(schema.radarStories.momentumScore))
      .limit(30);

    const multiSource = stories.filter((s) => s.sourceCount >= 2);
    const iranLike = stories.filter((s) => /ايران|إيران|iran/i.test(s.title));

    const unclustered = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.radarItems)
      .where(
        and(
          isNull(schema.radarItems.storyId),
          gte(schema.radarItems.fetchedAt, since),
          ne(schema.radarItems.status, "dismissed")
        )
      );

    const iranStoryIds = iranLike.map((s) => s.id);
    let iranOpenGaps = 0;
    let iranOpenGapStatuses: string[] = [];
    if (iranStoryIds.length) {
      const gapRows = await db
        .select({
          storyId: schema.coverageGaps.storyId,
          status: schema.coverageGaps.status,
        })
        .from(schema.coverageGaps)
        .where(
          and(
            inArray(schema.coverageGaps.storyId, iranStoryIds),
            ne(schema.coverageGaps.status, "dismissed")
          )
        );
      iranOpenGaps = gapRows.length;
      iranOpenGapStatuses = gapRows.map((g) => String(g.status));
    }

    const withMomentum = stories.filter((s) => s.momentumScore > 0).length;
    const withRelevance = stories.filter((s) => s.saudiRelevance > 0).length;
    const phaseAFlagsOn =
      process.env.RADAR_CLUSTERING_ENABLED === "true" ||
      process.env.RADAR_MOMENTUM_ENABLED === "true" ||
      process.env.RADAR_RELEVANCE_ENABLED === "true";

    const report = {
      generatedAt: new Date().toISOString(),
      flags: {
        clustering: process.env.RADAR_CLUSTERING_ENABLED === "true",
        momentum: process.env.RADAR_MOMENTUM_ENABLED === "true",
        relevance: process.env.RADAR_RELEVANCE_ENABLED === "true",
        gapV2: process.env.RADAR_GAP_V2_ENABLED === "true",
      },
      totals: {
        activeStories72h: stories.length,
        multiSourceStories: multiSource.length,
        iranLikeStories: iranLike.length,
        unclusteredItems72h: Number(unclustered[0]?.n ?? 0),
        storiesWithMomentum: withMomentum,
        storiesWithRelevance: withRelevance,
        iranNonDismissedGaps: iranOpenGaps,
      },
      topStories: stories.slice(0, 10).map((s) => ({
        title: s.title,
        sourceCount: s.sourceCount,
        momentum: s.momentumScore,
        relevance: s.saudiRelevance,
      })),
      iranStories: iranLike.map((s) => ({
        id: s.id,
        title: s.title,
        sourceCount: s.sourceCount,
        momentum: s.momentumScore,
        relevance: s.saudiRelevance,
      })),
      iranGaps: { count: iranOpenGaps, statuses: iranOpenGapStatuses },
      acceptance: {
        hasMultiSourceStory: multiSource.length > 0,
        iranIsSingleStoryOrNone: iranLike.length <= 1,
        signalsMeasurable: !phaseAFlagsOn || withMomentum > 0 || withRelevance > 0,
        iranOneGapOrCovered:
          iranLike.length === 0 ||
          iranOpenGaps <= 1 ||
          iranOpenGapStatuses.every((s) => ["drafting", "scheduled", "covered"].includes(s)),
        notes:
          "أسبوع ثبات: فعّل clustering+momentum+relevance على staging، شغّل هذا السكربت يومياً. بعد القبول فقط: RADAR_GAP_V2_ENABLED. قبول إيران: ≤1 قصة و≤1 فجوة غير مستبعدة (أو covered/drafting).",
      },
    };

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("📡 قبول المرحلة أ — قصص/زخم/صلة");
      console.log("   Flags:", JSON.stringify(report.flags));
      console.log(
        `   قصص نشطة 72س: ${report.totals.activeStories72h} · متعددة المصادر: ${report.totals.multiSourceStories} · إيران-شبيه: ${report.totals.iranLikeStories}`
      );
      console.log(`   مواد بلا قصة: ${report.totals.unclusteredItems72h}`);
      console.log(
        `   زخم>0: ${report.totals.storiesWithMomentum} · صلة>0: ${report.totals.storiesWithRelevance} · فجوات إيران: ${report.totals.iranNonDismissedGaps}`
      );
      console.log(
        `   قبول تعدد المصادر: ${report.acceptance.hasMultiSourceStory ? "✅" : "❌"} · إيران كقصة واحدة: ${report.acceptance.iranIsSingleStoryOrNone ? "✅" : "⚠️ أكثر من قصة"} · فجوة إيران: ${report.acceptance.iranOneGapOrCovered ? "✅" : "❌"}`
      );
      for (const s of report.topStories.slice(0, 5)) {
        console.log(`   · [${s.sourceCount} مصادر | m=${s.momentum} r=${s.relevance}] ${s.title.slice(0, 80)}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
