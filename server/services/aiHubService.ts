// AI Hub dashboard service — all Drizzle queries for /api/admin/ai-hub/*
// (ADR-001: route modules stay db-free; data access lives here).
//
// Chart data comes from the ai_usage_daily rollup; only "today" and 24h
// windows read the raw ai_usage_logs (indexed by created_at).

import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  aiBudgets,
  aiConfigAudit,
  aiFeatureConfigs,
  aiModels,
  aiProviderHealth,
  aiUsageDaily,
  aiUsageLogs,
} from "../../shared/schema";
import { aiGateway, invalidateAiHubConfigCache } from "../ai/gateway";
import type { AIHubProvider } from "../ai/gateway";

export interface Actor {
  id: string;
  name: string;
}

// ── helpers ──

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStartString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function daysAgoString(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function writeAudit(
  actor: Actor,
  entityType: string,
  entityKey: string,
  action: string,
  changes: Record<string, { from: unknown; to: unknown }>,
): Promise<void> {
  try {
    await db.insert(aiConfigAudit).values({
      entityType,
      entityKey,
      action,
      changes,
      userId: actor.id,
      userName: actor.name,
    });
  } catch (err) {
    console.warn("[AI Hub] audit write failed:", (err as Error).message);
  }
}

function diffChanges<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch)) {
    const from = before[key];
    const to = patch[key as keyof T];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key] = { from, to };
    }
  }
  return changes;
}

// ── Overview ──

export async function getOverviewStats() {
  const todayStart = startOfToday();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const yesterdaySameTime = new Date(now.getTime() - 86_400_000);
  const monthStart = monthStartString();

  const [[today], [yesterdaySameWindow], [last24h], monthRows, healthRows, providerLatency] =
    await Promise.all([
      db
        .select({
          requests: sql<number>`count(*)::int`,
          costUsd: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)::float8`,
          inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)::float8`,
          outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)::float8`,
        })
        .from(aiUsageLogs)
        .where(gte(aiUsageLogs.createdAt, todayStart)),
      db
        .select({
          requests: sql<number>`count(*)::int`,
          costUsd: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)::float8`,
        })
        .from(aiUsageLogs)
        .where(and(gte(aiUsageLogs.createdAt, yesterdayStart), lte(aiUsageLogs.createdAt, yesterdaySameTime))),
      db
        .select({
          total: sql<number>`count(*)::int`,
          success: sql<number>`(count(*) filter (where ${aiUsageLogs.status} = 'success'))::int`,
          fallback: sql<number>`(count(*) filter (where ${aiUsageLogs.status} = 'fallback'))::int`,
          failed: sql<number>`(count(*) filter (where ${aiUsageLogs.status} = 'failed'))::int`,
          p50LatencyMs: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${aiUsageLogs.latencyMs}) filter (where ${aiUsageLogs.status} <> 'failed'), 0)::float8`,
          p95LatencyMs: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${aiUsageLogs.latencyMs}) filter (where ${aiUsageLogs.status} <> 'failed'), 0)::float8`,
        })
        .from(aiUsageLogs)
        .where(gte(aiUsageLogs.createdAt, dayAgo)),
      db
        .select({ costUsd: sql<number>`coalesce(sum(${aiUsageDaily.estimatedCostUsd}), 0)::float8` })
        .from(aiUsageDaily)
        .where(gte(aiUsageDaily.date, monthStart)),
      db.select().from(aiProviderHealth).orderBy(aiProviderHealth.provider),
      db
        .select({
          provider: aiUsageLogs.provider,
          p95LatencyMs: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${aiUsageLogs.latencyMs}) filter (where ${aiUsageLogs.status} <> 'failed'), 0)::float8`,
          requests: sql<number>`count(*)::int`,
        })
        .from(aiUsageLogs)
        .where(gte(aiUsageLogs.createdAt, dayAgo))
        .groupBy(aiUsageLogs.provider),
    ]);

  // Month cost = rolled-up past days + today's raw logs (today isn't rolled yet).
  const monthCostUsd = (monthRows[0]?.costUsd ?? 0) + (today?.costUsd ?? 0);

  // Straight-line burn-rate projection to end of month.
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonthCostUsd = dayOfMonth > 0 ? (monthCostUsd / dayOfMonth) * daysInMonth : monthCostUsd;

  // Provider status strip: model-level health collapsed per provider (worst wins).
  const severity: Record<string, number> = { healthy: 0, degraded: 1, quota_exceeded: 2, down: 2 };
  const providers: Record<string, { status: string; failCount: number; cooldownUntil: Date | null; lastErrorCode: string | null; p95LatencyMs: number; requests24h: number }> = {};
  for (const p of ["openai", "anthropic", "gemini", "elevenlabs"]) {
    providers[p] = { status: "healthy", failCount: 0, cooldownUntil: null, lastErrorCode: null, p95LatencyMs: 0, requests24h: 0 };
  }
  for (const row of healthRows) {
    const agg = providers[row.provider];
    if (!agg) continue;
    if ((severity[row.status] ?? 0) > (severity[agg.status] ?? 0)) {
      agg.status = row.status;
      agg.cooldownUntil = row.cooldownUntil;
      agg.lastErrorCode = row.lastErrorCode;
    }
    agg.failCount += row.failCount;
  }
  for (const row of providerLatency) {
    const agg = providers[row.provider];
    if (agg) {
      agg.p95LatencyMs = row.p95LatencyMs;
      agg.requests24h = row.requests;
    }
  }

  const globalBudget = await db
    .select()
    .from(aiBudgets)
    .where(and(eq(aiBudgets.scope, "global"), eq(aiBudgets.isEnabled, true)))
    .limit(1);

  return {
    today: {
      requests: today?.requests ?? 0,
      costUsd: today?.costUsd ?? 0,
      inputTokens: today?.inputTokens ?? 0,
      outputTokens: today?.outputTokens ?? 0,
    },
    yesterdaySameWindow: {
      requests: yesterdaySameWindow?.requests ?? 0,
      costUsd: yesterdaySameWindow?.costUsd ?? 0,
    },
    last24h: {
      total: last24h?.total ?? 0,
      success: last24h?.success ?? 0,
      fallback: last24h?.fallback ?? 0,
      failed: last24h?.failed ?? 0,
      successRate: last24h?.total ? ((last24h.success + last24h.fallback) / last24h.total) * 100 : 100,
      p50LatencyMs: last24h?.p50LatencyMs ?? 0,
      p95LatencyMs: last24h?.p95LatencyMs ?? 0,
    },
    month: {
      costUsd: monthCostUsd,
      projectedCostUsd: projectedMonthCostUsd,
      budgetUsd: globalBudget[0]?.monthlyLimitUsd ?? null,
    },
    providers,
    modelHealth: healthRows,
  };
}

export async function getDailySeries(days: number) {
  const since = daysAgoString(Math.min(Math.max(days, 7), 120));
  const rows = await db
    .select({
      date: aiUsageDaily.date,
      costUsd: sql<number>`coalesce(sum(${aiUsageDaily.estimatedCostUsd}), 0)::float8`,
      requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageDaily.inputTokens} + ${aiUsageDaily.outputTokens}), 0)::float8`,
    })
    .from(aiUsageDaily)
    .where(gte(aiUsageDaily.date, since))
    .groupBy(aiUsageDaily.date)
    .orderBy(aiUsageDaily.date);

  // Append today (not rolled up yet) from raw logs.
  const [today] = await db
    .select({
      costUsd: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)::float8`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens} + ${aiUsageLogs.outputTokens}), 0)::float8`,
    })
    .from(aiUsageLogs)
    .where(gte(aiUsageLogs.createdAt, startOfToday()));

  const todayKey = new Date().toISOString().slice(0, 10);
  const series = rows.filter((r) => r.date !== todayKey);
  series.push({ date: todayKey, costUsd: today?.costUsd ?? 0, requests: today?.requests ?? 0, tokens: today?.tokens ?? 0 });
  return series;
}

export async function getProviderDistribution(days: number) {
  const since = daysAgoString(days);
  return db
    .select({
      provider: aiUsageDaily.provider,
      costUsd: sql<number>`coalesce(sum(${aiUsageDaily.estimatedCostUsd}), 0)::float8`,
      requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)::int`,
    })
    .from(aiUsageDaily)
    .where(gte(aiUsageDaily.date, since))
    .groupBy(aiUsageDaily.provider)
    .orderBy(desc(sql`sum(${aiUsageDaily.estimatedCostUsd})`));
}

export async function getTopFeatures(days: number, limit: number) {
  const since = daysAgoString(days);
  const rows = await db
    .select({
      featureKey: aiUsageDaily.featureKey,
      costUsd: sql<number>`coalesce(sum(${aiUsageDaily.estimatedCostUsd}), 0)::float8`,
      requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)::int`,
      fallbacks: sql<number>`coalesce(sum(${aiUsageDaily.fallbackCount}), 0)::int`,
    })
    .from(aiUsageDaily)
    .where(gte(aiUsageDaily.date, since))
    .groupBy(aiUsageDaily.featureKey)
    .orderBy(desc(sql`sum(${aiUsageDaily.estimatedCostUsd})`))
    .limit(limit);

  const names = await db
    .select({ featureKey: aiFeatureConfigs.featureKey, displayName: aiFeatureConfigs.displayName })
    .from(aiFeatureConfigs);
  const nameMap = new Map(names.map((n) => [n.featureKey, n.displayName]));
  return rows.map((r) => ({ ...r, displayName: nameMap.get(r.featureKey) ?? r.featureKey }));
}

export async function getIncidents(limit: number) {
  return db
    .select()
    .from(aiUsageLogs)
    .where(ne(aiUsageLogs.status, "success"))
    .orderBy(desc(aiUsageLogs.createdAt))
    .limit(limit);
}

// ── Features tab ──

export async function listFeatures() {
  const [configs, models, usage] = await Promise.all([
    db.select().from(aiFeatureConfigs).orderBy(aiFeatureConfigs.category, aiFeatureConfigs.featureKey),
    db.select().from(aiModels),
    db
      .select({
        featureKey: aiUsageDaily.featureKey,
        costUsd: sql<number>`coalesce(sum(${aiUsageDaily.estimatedCostUsd}), 0)::float8`,
        requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)::int`,
        fallbacks: sql<number>`coalesce(sum(${aiUsageDaily.fallbackCount}), 0)::int`,
      })
      .from(aiUsageDaily)
      .where(gte(aiUsageDaily.date, daysAgoString(30)))
      .groupBy(aiUsageDaily.featureKey),
  ]);

  const modelMap = new Map(models.map((m) => [m.id, m]));
  const usageMap = new Map(usage.map((u) => [u.featureKey, u]));

  return configs.map((c) => ({
    featureKey: c.featureKey,
    displayName: c.displayName,
    category: c.category,
    primaryModel: c.primaryModelId ? modelMap.get(c.primaryModelId) ?? null : null,
    fallbackChain: (c.fallbackChain ?? [])
      .map((id) => modelMap.get(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    maxTokens: c.maxTokens,
    temperature: c.temperature,
    isEnabled: c.isEnabled,
    allowFailover: c.allowFailover,
    updatedAt: c.updatedAt,
    usage30d: usageMap.get(c.featureKey) ?? { costUsd: 0, requests: 0, fallbacks: 0 },
  }));
}

export interface FeaturePatch {
  primaryModelId?: string;
  fallbackChain?: string[];
  maxTokens?: number | null;
  temperature?: number | null;
  isEnabled?: boolean;
  allowFailover?: boolean;
}

export async function updateFeature(featureKey: string, patch: FeaturePatch, actor: Actor) {
  const [existing] = await db
    .select()
    .from(aiFeatureConfigs)
    .where(eq(aiFeatureConfigs.featureKey, featureKey))
    .limit(1);
  if (!existing) {
    return { ok: false as const, error: "الميزة غير موجودة" };
  }

  // Embeddings stay pinned — vectors are incompatible across models.
  if (featureKey === "embeddings" && (patch.allowFailover === true || (patch.fallbackChain?.length ?? 0) > 0)) {
    return { ok: false as const, error: "ميزة المتجهات مثبّتة على نموذج واحد — المتجهات غير متوافقة بين النماذج" };
  }

  if (patch.primaryModelId) {
    const [model] = await db.select().from(aiModels).where(eq(aiModels.id, patch.primaryModelId)).limit(1);
    if (!model) return { ok: false as const, error: "النموذج الأساسي غير موجود" };
  }

  const changes = diffChanges(existing as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  await db
    .update(aiFeatureConfigs)
    .set({ ...patch, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(aiFeatureConfigs.featureKey, featureKey));

  invalidateAiHubConfigCache();
  if (Object.keys(changes).length > 0) {
    await writeAudit(actor, "feature", featureKey, "update", changes);
  }
  return { ok: true as const };
}

export async function testFeature(featureKey: string) {
  const [config] = await db
    .select()
    .from(aiFeatureConfigs)
    .where(eq(aiFeatureConfigs.featureKey, featureKey))
    .limit(1);
  const [model] = config?.primaryModelId
    ? await db.select().from(aiModels).where(eq(aiModels.id, config.primaryModelId)).limit(1)
    : [undefined];

  const capabilities = (model?.capabilities ?? ["complete"]) as string[];

  try {
    if (capabilities.includes("embed")) {
      const res = await aiGateway.embed({ feature: featureKey, input: "اختبار الاتصال", timeoutMs: 30_000 });
      return {
        ok: true as const,
        kind: "embed" as const,
        provider: res.provider,
        modelId: res.modelId,
        latencyMs: res.latencyMs,
        estimatedCostUsd: res.estimatedCostUsd,
        preview: `متجه بطول ${res.embeddings[0]?.length ?? 0}`,
      };
    }
    if (capabilities.includes("image") || capabilities.includes("tts")) {
      return { ok: false as const, error: "اختبار الصور/الصوت معطّل لتجنّب التكلفة — استخدم الميزة نفسها" };
    }
    const res = await aiGateway.complete({
      feature: featureKey,
      prompt: "أجب بجملة واحدة قصيرة: ما عاصمة السعودية؟",
      options: { maxTokens: 60 },
      timeoutMs: 30_000,
    });
    return {
      ok: true as const,
      kind: "complete" as const,
      provider: res.provider,
      modelId: res.modelId,
      latencyMs: res.latencyMs,
      estimatedCostUsd: res.estimatedCostUsd,
      fallbackUsed: res.fallbackUsed,
      preview: res.content.slice(0, 280),
    };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}

// ── Models tab ──

export async function listModels() {
  const [models, health, usage] = await Promise.all([
    db.select().from(aiModels).orderBy(aiModels.provider, aiModels.priority),
    db.select().from(aiProviderHealth),
    db
      .select({
        provider: aiUsageDaily.provider,
        modelId: aiUsageDaily.modelId,
        costUsd: sql<number>`coalesce(sum(${aiUsageDaily.estimatedCostUsd}), 0)::float8`,
        requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)::int`,
      })
      .from(aiUsageDaily)
      .where(gte(aiUsageDaily.date, daysAgoString(30)))
      .groupBy(aiUsageDaily.provider, aiUsageDaily.modelId),
  ]);

  const healthMap = new Map(health.map((h) => [`${h.provider}:${h.modelId}`, h]));
  const usageMap = new Map(usage.map((u) => [`${u.provider}:${u.modelId}`, u]));

  return models.map((m) => ({
    ...m,
    health: healthMap.get(`${m.provider}:${m.modelId}`) ?? null,
    usage30d: usageMap.get(`${m.provider}:${m.modelId}`) ?? { costUsd: 0, requests: 0 },
  }));
}

export interface ModelPatch {
  displayName?: string;
  costPer1MInput?: number;
  costPer1MOutput?: number;
  costPerUnit?: number;
  isActive?: boolean;
  priority?: number;
}

export async function updateModel(id: string, patch: ModelPatch, actor: Actor) {
  const [existing] = await db.select().from(aiModels).where(eq(aiModels.id, id)).limit(1);
  if (!existing) return { ok: false as const, error: "النموذج غير موجود" };

  const changes = diffChanges(existing as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  await db.update(aiModels).set({ ...patch, updatedAt: new Date() }).where(eq(aiModels.id, id));
  invalidateAiHubConfigCache();
  if (Object.keys(changes).length > 0) {
    await writeAudit(actor, "model", `${existing.provider}/${existing.modelId}`, "update", changes);
  }
  return { ok: true as const };
}

export interface NewModel {
  provider: string;
  modelId: string;
  displayName: string;
  capabilities: string[];
  pricingUnit: string;
  costPer1MInput: number;
  costPer1MOutput: number;
  costPerUnit: number;
}

export async function createModel(data: NewModel, actor: Actor) {
  const inserted = await db
    .insert(aiModels)
    .values(data)
    .onConflictDoNothing()
    .returning({ id: aiModels.id });
  if (inserted.length === 0) return { ok: false as const, error: "النموذج موجود مسبقًا" };
  invalidateAiHubConfigCache();
  await writeAudit(actor, "model", `${data.provider}/${data.modelId}`, "create", {
    model: { from: null, to: data.modelId },
  });
  return { ok: true as const, id: inserted[0].id };
}

/** Connectivity check per provider — probes the cheapest active text/embed model. */
export async function testProviders() {
  const models = await db.select().from(aiModels).where(eq(aiModels.isActive, true));
  const providers: AIHubProvider[] = ["openai", "anthropic", "gemini", "elevenlabs"];
  const results: Record<string, { ok: boolean; latencyMs: number; errorCode?: string; skipped?: boolean; modelId?: string }> = {};

  for (const provider of providers) {
    const candidates = models
      .filter((m) => m.provider === provider)
      .filter((m) => {
        const caps = (m.capabilities ?? []) as string[];
        return caps.includes("complete") || caps.includes("embed");
      })
      .sort((a, b) => a.costPer1MInput - b.costPer1MInput);
    const target = candidates[0];
    if (!target) {
      results[provider] = { ok: false, latencyMs: 0, skipped: true };
      continue;
    }
    const probe = await aiGateway.probeModel({ provider, modelId: target.modelId });
    results[provider] = { ...probe, modelId: target.modelId };
  }
  return results;
}

// ── Logs tab ──

export interface LogFilters {
  featureKey?: string;
  provider?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export async function listUsageLogs(filters: LogFilters) {
  const conditions = [] as ReturnType<typeof eq>[];
  if (filters.featureKey) conditions.push(eq(aiUsageLogs.featureKey, filters.featureKey));
  if (filters.provider) conditions.push(eq(aiUsageLogs.provider, filters.provider));
  if (filters.status) conditions.push(eq(aiUsageLogs.status, filters.status));
  if (filters.from) conditions.push(gte(aiUsageLogs.createdAt, filters.from) as ReturnType<typeof eq>);
  if (filters.to) conditions.push(lte(aiUsageLogs.createdAt, filters.to) as ReturnType<typeof eq>);

  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(aiUsageLogs)
      .where(where)
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(filters.pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(aiUsageLogs).where(where),
  ]);

  return { rows, total: count?.total ?? 0 };
}

export async function listAudit(limit: number) {
  return db.select().from(aiConfigAudit).orderBy(desc(aiConfigAudit.createdAt)).limit(limit);
}

// ── Budgets ──

export async function listBudgets() {
  const monthStart = monthStartString();
  const [budgets, todayByProvider, monthByProvider, [todayTotal]] = await Promise.all([
    db.select().from(aiBudgets).orderBy(aiBudgets.scope, aiBudgets.scopeKey),
    db
      .select({
        provider: aiUsageLogs.provider,
        costUsd: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)::float8`,
      })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, startOfToday()))
      .groupBy(aiUsageLogs.provider),
    db
      .select({
        provider: aiUsageDaily.provider,
        costUsd: sql<number>`coalesce(sum(${aiUsageDaily.estimatedCostUsd}), 0)::float8`,
      })
      .from(aiUsageDaily)
      .where(gte(aiUsageDaily.date, monthStart))
      .groupBy(aiUsageDaily.provider),
    db
      .select({ costUsd: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)::float8` })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, startOfToday())),
  ]);

  const spendByProvider = new Map<string, number>();
  for (const row of monthByProvider) spendByProvider.set(row.provider, row.costUsd);
  for (const row of todayByProvider) {
    spendByProvider.set(row.provider, (spendByProvider.get(row.provider) ?? 0) + row.costUsd);
  }
  const globalSpend = Array.from(spendByProvider.values()).reduce((a, b) => a + b, 0) || (todayTotal?.costUsd ?? 0);

  return budgets.map((b) => ({
    ...b,
    spentThisMonthUsd:
      b.scope === "global" ? globalSpend : b.scope === "provider" ? spendByProvider.get(b.scopeKey) ?? 0 : 0,
  }));
}

export interface BudgetInput {
  scope: "global" | "provider" | "feature";
  scopeKey: string;
  monthlyLimitUsd: number;
  alertAt80: boolean;
  alertAt100: boolean;
  isEnabled: boolean;
}

export async function upsertBudget(input: BudgetInput, actor: Actor) {
  await db
    .insert(aiBudgets)
    .values({ ...input, updatedBy: actor.id })
    .onConflictDoUpdate({
      target: [aiBudgets.scope, aiBudgets.scopeKey],
      set: {
        monthlyLimitUsd: input.monthlyLimitUsd,
        alertAt80: input.alertAt80,
        alertAt100: input.alertAt100,
        isEnabled: input.isEnabled,
        updatedBy: actor.id,
        updatedAt: new Date(),
      },
    });
  await writeAudit(actor, "budget", `${input.scope}:${input.scopeKey || "all"}`, "upsert", {
    monthlyLimitUsd: { from: null, to: input.monthlyLimitUsd },
  });
  return { ok: true as const };
}
