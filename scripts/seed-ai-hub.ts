/**
 * Seed the AI Hub tables (ai_models + ai_feature_configs) from the built-in
 * defaults in server/ai/gateway/defaults.ts.
 *
 * Idempotent and additive: existing rows are NEVER overwritten, so re-running
 * after dashboard edits is safe. Run after `npm run db:push`.
 *
 * Usage (dev):   tsx scripts/seed-ai-hub.ts
 * Usage (prod):  DB_DRIVER=pg DATABASE_URL='postgresql://...' tsx scripts/seed-ai-hub.ts
 */

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema";
import { DEFAULT_FEATURES, DEFAULT_MODELS } from "../server/ai/gateway/defaults";

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
  console.log("AI Hub seed — models & feature configs");
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
    // 1. Models — insert missing, never touch existing (pricing is
    //    dashboard-editable and must survive re-seeding).
    let modelsInserted = 0;
    for (const m of DEFAULT_MODELS) {
      const inserted = await db
        .insert(schema.aiModels)
        .values({
          provider: m.provider,
          modelId: m.modelId,
          displayName: m.displayName,
          capabilities: m.capabilities,
          pricingUnit: m.pricingUnit,
          costPer1MInput: m.costPer1MInput,
          costPer1MOutput: m.costPer1MOutput,
          costPerUnit: m.costPerUnit,
          priority: m.priority,
        })
        .onConflictDoNothing()
        .returning({ id: schema.aiModels.id });
      if (inserted.length > 0) modelsInserted++;
    }
    console.log(`✅ ai_models: ${modelsInserted} inserted, ${DEFAULT_MODELS.length - modelsInserted} already present`);

    // Build (provider, modelId) → id map for chain resolution.
    const allModels = await db.select().from(schema.aiModels);
    const idByRef = new Map<string, string>(
      allModels.map((row: any) => [`${row.provider}:${row.modelId}`, row.id]),
    );

    // 2. Feature configs — insert missing only (admins own existing rows).
    let featuresInserted = 0;
    let featuresSkipped = 0;
    for (const f of DEFAULT_FEATURES) {
      const primaryId = idByRef.get(`${f.primary.provider}:${f.primary.modelId}`);
      if (!primaryId) {
        console.warn(`⚠️  ${f.featureKey}: primary model ${f.primary.provider}/${f.primary.modelId} missing — skipped`);
        featuresSkipped++;
        continue;
      }
      const chainIds = f.fallbackChain
        .map((ref) => idByRef.get(`${ref.provider}:${ref.modelId}`))
        .filter((id): id is string => Boolean(id));

      const inserted = await db
        .insert(schema.aiFeatureConfigs)
        .values({
          featureKey: f.featureKey,
          displayName: f.displayName,
          category: f.category,
          primaryModelId: primaryId,
          fallbackChain: chainIds,
          maxTokens: f.maxTokens ?? null,
          temperature: f.temperature ?? null,
          allowFailover: f.allowFailover ?? true,
        })
        .onConflictDoNothing()
        .returning({ id: schema.aiFeatureConfigs.id });
      if (inserted.length > 0) featuresInserted++;
    }
    console.log(
      `✅ ai_feature_configs: ${featuresInserted} inserted, ${DEFAULT_FEATURES.length - featuresInserted - featuresSkipped} already present, ${featuresSkipped} skipped`,
    );

    // 3. RBAC permission codes for the dashboard (superusers pass without
    //    these; rows exist so they can be granted to non-superuser roles).
    const aiHubPermissions = [
      { code: "ai_hub.view", label: "View AI Hub", labelAr: "عرض مركز الذكاء الاصطناعي", module: "ai_hub" },
      { code: "ai_hub.manage", label: "Manage AI Hub", labelAr: "إدارة مركز الذكاء الاصطناعي", module: "ai_hub" },
    ];
    for (const p of aiHubPermissions) {
      await db.insert(schema.permissions).values(p).onConflictDoNothing();
    }
    console.log("✅ permissions: ai_hub.view / ai_hub.manage ensured");

    // 4. Sanity check: embeddings must stay pinned.
    const [embeddings] = await db
      .select()
      .from(schema.aiFeatureConfigs)
      .where(and(eq(schema.aiFeatureConfigs.featureKey, "embeddings"), eq(schema.aiFeatureConfigs.allowFailover, true)));
    if (embeddings) {
      console.warn("⚠️  WARNING: 'embeddings' has allowFailover=true — vectors are incompatible across models. Fix from the dashboard.");
    }

    console.log("\nDone.");
  } catch (err: any) {
    console.error("❌ Seed failed:", err.message);
    if (err.cause) console.error("   cause:", err.cause);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

main();
