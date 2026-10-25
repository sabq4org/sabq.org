// صحة منظومة الذكاء الاصطناعي لتطبيق الديسك — GET /api/v1/staff/system/health
// يعيد استخدام aiHubService (النماذج + صحتها، الميزانيات) ويضيف عدّادات
// آخر 24 ساعة لكل نموذج من ai_usage_logs. لا يعرض أي مفتاح أو سر: الأخطاء
// تُنظف وتُختصر إلى 140 حرفاً.
import { gte, sql } from "drizzle-orm";
import { db } from "../db";
import { aiUsageLogs } from "@shared/schema";
import { listBudgets, listModels } from "./aiHubService";
import { aiProviderLabel, budgetLabel, budgetPercent, shortenAiError } from "./staffAiAlertPush";

export type StaffModelStatus = "up" | "degraded" | "down";
export type StaffHealthSummaryStatus = "ok" | "partial" | "down";

export interface StaffHealthModel {
  provider: string;
  providerLabel: string;
  modelId: string;
  status: StaffModelStatus;
  rawStatus: string;
  lastCheckAt: string | null;
  since: string | null;
  cooldownUntil: string | null;
  lastError: { code: string | null; message: string | null } | null;
  requests24h: number;
  failures24h: number;
}

export interface StaffHealthBudget {
  id: string;
  label: string;
  limitUsd: number;
  spentUsd: number;
  percent: number;
  period: "monthly";
}

export interface StaffSystemHealth {
  generatedAt: string;
  lastCheckAt: string | null;
  summary: { status: StaffHealthSummaryStatus; title: string; detail: string };
  aiAlertsEnabled: boolean;
  models: StaffHealthModel[];
  budgets: StaffHealthBudget[];
}

export function mapAiModelStatus(raw: string | null | undefined): StaffModelStatus {
  if (!raw || raw === "healthy") return "up";
  if (raw === "degraded") return "degraded";
  return "down";
}

const SUMMARY_TITLES: Record<StaffHealthSummaryStatus, string> = {
  ok: "كل النماذج تعمل",
  partial: "تعطّل جزئي",
  down: "النماذج متوقفة",
};

/** ok: الكل يعمل (أو لا نماذج)؛ down: الكل متوقف؛ وإلا partial. */
export function summarizeAiHealth(
  models: Array<Pick<StaffHealthModel, "status">>,
): StaffSystemHealth["summary"] {
  const total = models.length;
  const down = models.filter((m) => m.status === "down").length;
  const degraded = models.filter((m) => m.status === "degraded").length;
  const up = total - down - degraded;

  let status: StaffHealthSummaryStatus;
  if (total === 0 || (down === 0 && degraded === 0)) status = "ok";
  else if (down === total) status = "down";
  else status = "partial";

  let detail: string;
  if (total === 0) detail = "لا توجد نماذج مفعّلة";
  else if (status === "ok") detail = `${total} من ${total} نماذج تعمل`;
  else {
    const parts = [`${up} من ${total} تعمل`];
    if (down > 0) parts.push(`${down} متوقف`);
    if (degraded > 0) parts.push(`${degraded} متدهور`);
    detail = parts.join(" · ");
  }
  return { status, title: SUMMARY_TITLES[status], detail };
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const STATUS_RANK: Record<StaffModelStatus, number> = { down: 0, degraded: 1, up: 2 };

async function usage24hByModel(): Promise<Map<string, { requests: number; failures: number }>> {
  const since = new Date(Date.now() - 86_400_000);
  const rows = await db
    .select({
      provider: aiUsageLogs.provider,
      modelId: aiUsageLogs.modelId,
      requests: sql<number>`count(*)::int`,
      failures: sql<number>`(count(*) filter (where ${aiUsageLogs.status} = 'failed'))::int`,
    })
    .from(aiUsageLogs)
    .where(gte(aiUsageLogs.createdAt, since))
    .groupBy(aiUsageLogs.provider, aiUsageLogs.modelId);
  return new Map(
    rows.map((r) => [`${r.provider}:${r.modelId}`, { requests: Number(r.requests) || 0, failures: Number(r.failures) || 0 }]),
  );
}

type ListedModel = Awaited<ReturnType<typeof listModels>>[number];

export function toStaffHealthModel(
  m: Pick<ListedModel, "provider" | "modelId" | "health">,
  usage: { requests: number; failures: number } | undefined,
): StaffHealthModel {
  const h = m.health;
  const rawStatus = h?.status ?? "healthy";
  const status = mapAiModelStatus(rawStatus);
  const message = status === "up" ? null : shortenAiError(h?.lastError);
  const code = status === "up" ? null : (h?.lastErrorCode ?? null);
  return {
    provider: m.provider,
    providerLabel: aiProviderLabel(m.provider),
    modelId: m.modelId,
    status,
    rawStatus,
    lastCheckAt: iso(h?.lastCheckedAt ?? h?.updatedAt),
    since: status === "up" ? null : iso(h?.updatedAt),
    cooldownUntil: iso(h?.cooldownUntil),
    lastError: code || message ? { code, message } : null,
    requests24h: usage?.requests ?? 0,
    failures24h: usage?.failures ?? 0,
  };
}

/** النماذج المعروضة: المفعّلة، أو أي نموذج غير سليم حالياً. الأسوأ أولاً. */
export async function listStaffHealthModels(): Promise<StaffHealthModel[]> {
  const [models, usage] = await Promise.all([listModels(), usage24hByModel()]);
  return models
    .filter((m) => m.isActive || (m.health && m.health.status !== "healthy"))
    .map((m) => toStaffHealthModel(m, usage.get(`${m.provider}:${m.modelId}`)))
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        a.provider.localeCompare(b.provider) ||
        a.modelId.localeCompare(b.modelId),
    );
}

export async function listStaffHealthBudgets(): Promise<StaffHealthBudget[]> {
  const budgets = await listBudgets();
  return budgets
    .filter((b) => b.isEnabled && b.monthlyLimitUsd > 0)
    .map((b) => ({
      id: b.id,
      label: budgetLabel(b),
      limitUsd: b.monthlyLimitUsd,
      spentUsd: Math.round(b.spentThisMonthUsd * 100) / 100,
      percent: budgetPercent(b.spentThisMonthUsd, b.monthlyLimitUsd),
      period: "monthly" as const,
    }));
}

export async function getStaffSystemHealth(options: {
  aiAlertsEnabled: boolean;
}): Promise<StaffSystemHealth> {
  const [models, budgets] = await Promise.all([listStaffHealthModels(), listStaffHealthBudgets()]);
  const lastCheckAt = models.reduce<string | null>(
    (acc, m) => (m.lastCheckAt && (!acc || m.lastCheckAt > acc) ? m.lastCheckAt : acc),
    null,
  );
  return {
    generatedAt: new Date().toISOString(),
    lastCheckAt,
    summary: summarizeAiHealth(models),
    aiAlertsEnabled: options.aiAlertsEnabled,
    models,
    budgets,
  };
}
