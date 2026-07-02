// Loads model + feature routing config from the DB with a short cache, so a
// dashboard change applies within ~45s without a deploy. Falls back to the
// built-in defaults when the DB row is missing or the DB is unreachable —
// a broken hub must never take content generation down.

import { inArray } from "drizzle-orm";
import { db } from "../../db";
import { memoryCache, withCache } from "../../memoryCache";
import { aiFeatureConfigs, aiModels } from "../../../shared/schema";
import { getDefaultFeatureConfig, getDefaultModel } from "./defaults";
import type {
  AIHubProvider,
  AIOperation,
  AiPricingUnit,
  ModelRef,
  ResolvedFeatureConfig,
  ResolvedModel,
} from "./types";

const CACHE_KEY = "ai-hub:config";
const CACHE_TTL_MS = 45 * 1000;

interface ConfigSnapshot {
  /** ai_models.id → resolved model */
  modelsById: Map<string, ResolvedModel>;
  /** "provider:modelId" → resolved model */
  modelsByRef: Map<string, ResolvedModel>;
  /** featureKey → resolved feature config */
  features: Map<string, ResolvedFeatureConfig>;
}

function refKey(m: ModelRef): string {
  return `${m.provider}:${m.modelId}`;
}

function toResolvedModel(row: typeof aiModels.$inferSelect): ResolvedModel {
  return {
    provider: row.provider as AIHubProvider,
    modelId: row.modelId,
    displayName: row.displayName,
    capabilities: (row.capabilities ?? []) as AIOperation[],
    pricingUnit: row.pricingUnit as AiPricingUnit,
    costPer1MInput: row.costPer1MInput,
    costPer1MOutput: row.costPer1MOutput,
    costPerUnit: row.costPerUnit,
    isActive: row.isActive,
  };
}

async function loadSnapshot(): Promise<ConfigSnapshot> {
  const [modelRows, featureRows] = await Promise.all([
    db.select().from(aiModels),
    db.select().from(aiFeatureConfigs),
  ]);

  const modelsById = new Map<string, ResolvedModel>();
  const modelsByRef = new Map<string, ResolvedModel>();
  for (const row of modelRows) {
    const resolved = toResolvedModel(row);
    modelsById.set(row.id, resolved);
    modelsByRef.set(refKey(resolved), resolved);
  }

  const features = new Map<string, ResolvedFeatureConfig>();
  for (const row of featureRows) {
    const primary = row.primaryModelId ? modelsById.get(row.primaryModelId) : undefined;
    const chain: ModelRef[] = [];
    for (const id of row.fallbackChain ?? []) {
      const m = modelsById.get(id);
      // Skip dangling/inactive entries instead of failing the whole feature.
      if (m && m.isActive) chain.push({ provider: m.provider, modelId: m.modelId });
    }
    features.set(row.featureKey, {
      featureKey: row.featureKey,
      displayName: row.displayName,
      category: row.category,
      primary: primary ? { provider: primary.provider, modelId: primary.modelId } : null,
      fallbackChain: chain,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
      isEnabled: row.isEnabled,
      allowFailover: row.allowFailover,
      source: "db",
    });
  }

  return { modelsById, modelsByRef, features };
}

async function getSnapshot(): Promise<ConfigSnapshot | null> {
  try {
    return await withCache(CACHE_KEY, CACHE_TTL_MS, loadSnapshot);
  } catch (err) {
    console.error("[AI Hub] config load failed — using built-in defaults:", (err as Error).message);
    return null;
  }
}

export async function getFeatureConfig(featureKey: string): Promise<ResolvedFeatureConfig> {
  const snapshot = await getSnapshot();
  const fromDb = snapshot?.features.get(featureKey);
  if (fromDb && fromDb.primary) return fromDb;
  if (fromDb && !fromDb.primary) {
    // Row exists but points at a deleted model — merge defaults for routing,
    // keep the admin's enabled/failover switches.
    const defaults = getDefaultFeatureConfig(featureKey);
    return { ...defaults, isEnabled: fromDb.isEnabled, allowFailover: fromDb.allowFailover };
  }
  return getDefaultFeatureConfig(featureKey);
}

export async function getModel(ref: ModelRef): Promise<ResolvedModel | undefined> {
  const snapshot = await getSnapshot();
  return snapshot?.modelsByRef.get(refKey(ref)) ?? getDefaultModel(ref.provider, ref.modelId);
}

/** Call after any dashboard config write so changes apply immediately in-process. */
export function invalidateAiHubConfigCache(): void {
  memoryCache.invalidateByPrefix(CACHE_KEY);
}

/** Resolve ai_models.id values for provider/model refs (used by seed + routes). */
export async function resolveModelIds(refs: ModelRef[]): Promise<Map<string, string>> {
  if (refs.length === 0) return new Map();
  const rows = await db
    .select({ id: aiModels.id, provider: aiModels.provider, modelId: aiModels.modelId })
    .from(aiModels)
    .where(inArray(aiModels.modelId, refs.map((r) => r.modelId)));
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(`${row.provider}:${row.modelId}`, row.id);
  }
  return map;
}
