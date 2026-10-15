/**
 * غرفة عمليات سبق الذكية — واجهة الخدمة (ما تستهلكه المسارات والكرون).
 * المحرك واحد لكل عملية فوق مخزن Drizzle؛ الإعدادات (إيقاف الغرفة، الوكلاء
 * الموقوفون) في system_settings كي تشترك فيها كل النسخ والكرون.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { db } from "../../db";
import { aiUsageLogs, opsTaskEvents, opsTasks, type OpsTaskEventRow, type OpsTaskRow } from "@shared/schema";
import { storage } from "../../storage";
import { memoryCache } from "../../memoryCache";
import {
  OPS_ACTIVE_STATUSES,
  OPS_AGENTS,
  OPS_AGENT_SLUGS,
  OPS_ROUTES,
  type OpsAgentSlug,
  type OpsHumanAction,
  type OpsTaskStatus,
} from "@shared/opsRoom";
import { OpsRoomEngine, type CreateTaskInput } from "./engine";
import { DrizzleOpsStore } from "./store";
import { OPS_AGENT_HANDLERS } from "./agents";
import { OpsError, type HumanActor } from "./types";
import { redactSecrets } from "./sanitize";

export { OpsError };

const SETTING_PAUSED = "ops_room.paused";
const SETTING_DISABLED_AGENTS = "ops_room.disabled_agents";
const SETTINGS_CACHE_MS = 10_000;

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const cacheKey = `ops-room:setting:${key}`;
  const cached = memoryCache.get<{ v: T }>(cacheKey);
  if (cached) return cached.v;
  let value: T = fallback;
  try {
    const raw = await storage.getSystemSetting(key);
    if (raw !== undefined && raw !== null) value = raw as T;
  } catch {
    value = fallback;
  }
  memoryCache.set(cacheKey, { v: value }, SETTINGS_CACHE_MS);
  return value;
}

async function writeSetting(key: string, value: unknown) {
  await storage.upsertSystemSetting(key, value, "ops_room", false);
  memoryCache.delete(`ops-room:setting:${key}`);
}

export async function isOpsRoomPaused(): Promise<boolean> {
  return Boolean(await readSetting<boolean>(SETTING_PAUSED, false));
}

export async function getDisabledAgents(): Promise<string[]> {
  const v = await readSetting<unknown>(SETTING_DISABLED_AGENTS, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

let engineSingleton: OpsRoomEngine | null = null;
export function getOpsRoomEngine(): OpsRoomEngine {
  if (!engineSingleton) {
    engineSingleton = new OpsRoomEngine({
      store: new DrizzleOpsStore(),
      agents: OPS_AGENT_HANDLERS,
      isPaused: isOpsRoomPaused,
      disabledAgents: getDisabledAgents,
    });
  }
  return engineSingleton;
}

// ── الإعدادات (بصلاحيات مستقلة في المسارات) ──

export async function setOpsRoomPaused(paused: boolean, actor: HumanActor): Promise<void> {
  await writeSetting(SETTING_PAUSED, paused);
  await new DrizzleOpsStore().insertEvent({
    taskId: "room",
    stepId: null,
    actorType: "human",
    actor: actor.id,
    eventType: paused ? "stopped" : "resumed",
    messageAr: paused ? `أوقف ${actor.name} غرفة العمليات عن استقبال وتوزيع المهام` : `أعاد ${actor.name} تشغيل غرفة العمليات`,
    data: {},
  });
}

export async function setAgentEnabled(slug: OpsAgentSlug, enabled: boolean, actor: HumanActor): Promise<string[]> {
  if (!OPS_AGENT_SLUGS.includes(slug)) throw new OpsError(400, "وكيل غير معروف");
  const current = new Set(await getDisabledAgents());
  if (enabled) current.delete(slug);
  else current.add(slug);
  const next = [...current];
  await writeSetting(SETTING_DISABLED_AGENTS, next);
  await new DrizzleOpsStore().insertEvent({
    taskId: "room",
    stepId: null,
    actorType: "human",
    actor: actor.id,
    eventType: enabled ? "resumed" : "stopped",
    messageAr: `${enabled ? "شغّل" : "أوقف"} ${actor.name} الوكيل ${OPS_AGENTS[slug].nameAr}`,
    data: { agent: slug },
  });
  return next;
}

// ── الإنشاء والتدخل ──

export async function createOpsTask(input: CreateTaskInput, actor: HumanActor): Promise<OpsTaskRow> {
  const engine = getOpsRoomEngine();
  const main = await engine.createTask(input, actor);
  // دفعة فورية بلا انتظار الكرون؛ الأخطاء تُسجَّل في المهمة نفسها
  void engine.pump(main.id).catch((err) => console.error("[ops-room] pump failed:", err));
  return main;
}

export async function applyHumanAction(mainId: string, stepId: string | null, action: OpsHumanAction, actor: HumanActor): Promise<OpsTaskRow> {
  const engine = getOpsRoomEngine();
  switch (action.action) {
    case "approve":
      if (!stepId) throw new OpsError(400, "الاعتماد يتطلب خطوة");
      return engine.approve(stepId, actor, action.note, action.editedResult);
    case "request_changes":
      if (!stepId) throw new OpsError(400, "طلب التعديل يتطلب خطوة");
      if (!action.note?.trim()) throw new OpsError(400, "اكتب ملاحظة التعديل");
      return engine.requestChanges(stepId, actor, action.note.trim());
    case "reassign":
      if (!action.stepKey) throw new OpsError(400, "حدد الخطوة المراد الإعادة منها");
      return engine.reassign(mainId, actor, action.stepKey, action.note);
    case "request_info":
      if (!action.note?.trim()) throw new OpsError(400, "اكتب المعلومات المطلوبة");
      return engine.requestInfo(mainId, actor, action.note.trim());
    case "provide_info":
      if (!action.note?.trim()) throw new OpsError(400, "اكتب المعلومات الإضافية");
      return engine.provideInfo(mainId, actor, action.note.trim(), action.editedResult);
    case "stop":
      return engine.stop(mainId, actor, action.note);
    case "resume":
      return engine.resume(mainId, actor);
    case "cancel":
      return engine.cancel(mainId, actor, action.note);
    case "retry":
      return engine.retry(mainId, actor);
    default:
      throw new OpsError(400, "إجراء غير معروف");
  }
}

// ── نماذج القراءة للواجهة ──

export interface OpsTaskSummary {
  id: string;
  title: string;
  taskType: string;
  priority: string;
  status: OpsTaskStatus;
  riskLevel: string;
  origin: string;
  currentAgentSlug: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stepsTotal: number;
  stepsCompleted: number;
  awaitingStep: { id: string; title: string; agentSlug: string | null } | null;
  lastError: string | null;
  failedAtAgent: string | null;
  reassignCount: number;
}

export interface OpsAgentCard {
  slug: OpsAgentSlug;
  nameAr: string;
  roleAr: string;
  avatarUrl: string;
  status: "available" | "working" | "waiting" | "stuck" | "paused";
  currentTask: { id: string; title: string; stepTitle: string; runningSinceMs: number } | null;
  lastActivityAt: string | null;
  successRate: number | null; // من خطوات آخر 7 أيام؛ null = لا بيانات
  completed7d: number;
  failed7d: number;
}

export interface OpsRoomOverview {
  generatedAt: string;
  paused: boolean;
  disabledAgents: string[];
  stats: { active: number; stuck: number; awaitingApproval: number; avgDurationMs: number | null; completed7d: number };
  tasks: OpsTaskSummary[];
  agents: OpsAgentCard[];
  activity: OpsEventView[];
}

export interface OpsEventView {
  id: string;
  taskId: string;
  stepId: string | null;
  actorType: string;
  actor: string;
  actorNameAr: string;
  eventType: string;
  messageAr: string;
  statusFrom: string | null;
  statusTo: string | null;
  durationMs: number | null;
  createdAt: string;
}

function actorName(actorType: string, actor: string): string {
  if (actorType === "agent" && actor in OPS_AGENTS) return OPS_AGENTS[actor as OpsAgentSlug].nameAr;
  if (actorType === "system") return "المنسق";
  return "محرر";
}

function toEventView(e: OpsTaskEventRow): OpsEventView {
  return {
    id: e.id,
    taskId: e.taskId,
    stepId: e.stepId,
    actorType: e.actorType,
    actor: e.actor,
    actorNameAr: actorName(e.actorType, e.actor),
    eventType: e.eventType,
    messageAr: e.messageAr,
    statusFrom: e.statusFrom,
    statusTo: e.statusTo,
    durationMs: e.durationMs,
    createdAt: e.createdAt.toISOString(),
  };
}

function summarize(main: OpsTaskRow, steps: OpsTaskRow[]): OpsTaskSummary {
  const awaiting = steps.find((s) => s.status === "awaiting_approval" || s.status === "needs_info");
  return {
    id: main.id,
    title: main.title,
    taskType: main.taskType,
    priority: main.priority,
    status: main.status as OpsTaskStatus,
    riskLevel: main.riskLevel,
    origin: main.origin,
    currentAgentSlug: main.currentAgentSlug,
    createdAt: main.createdAt.toISOString(),
    updatedAt: main.updatedAt.toISOString(),
    startedAt: main.startedAt?.toISOString() ?? null,
    finishedAt: main.finishedAt?.toISOString() ?? null,
    stepsTotal: steps.length,
    stepsCompleted: steps.filter((s) => s.status === "completed").length,
    awaitingStep: awaiting ? { id: awaiting.id, title: awaiting.title, agentSlug: awaiting.agentSlug } : null,
    lastError: main.lastError,
    failedAtAgent: main.failedAtAgent,
    reassignCount: main.reassignCount,
  };
}

export async function getOpsRoomOverview(): Promise<OpsRoomOverview> {
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [mains, paused, disabled] = await Promise.all([
    db.select().from(opsTasks).where(isNull(opsTasks.parentId)).orderBy(desc(opsTasks.createdAt)).limit(100),
    isOpsRoomPaused(),
    getDisabledAgents(),
  ]);
  const mainIds = mains.map((m) => m.id);
  const steps = mainIds.length ? await db.select().from(opsTasks).where(inArray(opsTasks.parentId, mainIds)).orderBy(opsTasks.stepIndex) : [];
  const stepsByMain = new Map<string, OpsTaskRow[]>();
  for (const s of steps) {
    const list = stepsByMain.get(s.parentId!) ?? [];
    list.push(s);
    stepsByMain.set(s.parentId!, list);
  }
  const tasks = mains.map((m) => summarize(m, stepsByMain.get(m.id) ?? []));

  // إحصاءات الوكلاء من خطوات آخر 7 أيام (بيانات حقيقية)
  const recentSteps = await db
    .select({ agentSlug: opsTasks.agentSlug, status: opsTasks.status, n: sql<number>`count(*)`, last: sql<Date>`max(${opsTasks.updatedAt})` })
    .from(opsTasks)
    .where(and(isNotNull(opsTasks.parentId), gte(opsTasks.updatedAt, since7d)))
    .groupBy(opsTasks.agentSlug, opsTasks.status);
  const perAgent = new Map<string, { completed: number; failed: number; last: Date | null }>();
  for (const r of recentSteps) {
    const a = perAgent.get(r.agentSlug ?? "") ?? { completed: 0, failed: 0, last: null };
    if (r.status === "completed") a.completed += Number(r.n);
    if (r.status === "failed") a.failed += Number(r.n);
    const last = r.last ? new Date(r.last) : null;
    if (last && (!a.last || last > a.last)) a.last = last;
    perAgent.set(r.agentSlug ?? "", a);
  }
  const mainById = new Map(mains.map((m) => [m.id, m]));
  const now = Date.now();
  const agents: OpsAgentCard[] = OPS_AGENT_SLUGS.map((slug) => {
    const meta = OPS_AGENTS[slug];
    const running = steps.find((s) => s.agentSlug === slug && s.status === "running");
    const stuck = steps.find((s) => s.agentSlug === slug && (s.status === "failed" || s.status === "needs_info") && OPS_ACTIVE_STATUSES.concat(["failed"]).includes((mainById.get(s.parentId!)?.status ?? "") as OpsTaskStatus));
    const waiting = steps.find((s) => s.agentSlug === slug && (s.status === "ready" || s.status === "waiting" || s.status === "awaiting_approval") && OPS_ACTIVE_STATUSES.includes((mainById.get(s.parentId!)?.status ?? "") as OpsTaskStatus));
    const stat = perAgent.get(slug);
    const total = (stat?.completed ?? 0) + (stat?.failed ?? 0);
    const status: OpsAgentCard["status"] = disabled.includes(slug) ? "paused" : running ? "working" : stuck ? "stuck" : waiting ? "waiting" : "available";
    const focus = running ?? stuck ?? waiting;
    return {
      slug,
      nameAr: meta.nameAr,
      roleAr: meta.roleAr,
      avatarUrl: meta.avatarUrl,
      status,
      currentTask: focus
        ? { id: focus.parentId!, title: mainById.get(focus.parentId!)?.title ?? "", stepTitle: focus.title, runningSinceMs: focus.startedAt && running ? now - focus.startedAt.getTime() : 0 }
        : null,
      lastActivityAt: stat?.last?.toISOString() ?? null,
      successRate: total > 0 ? Math.round(((stat?.completed ?? 0) / total) * 100) : null,
      completed7d: stat?.completed ?? 0,
      failed7d: stat?.failed ?? 0,
    };
  });

  const completed7d = mains.filter((m) => m.status === "completed" && m.finishedAt && m.finishedAt >= since7d);
  const durations = completed7d.map((m) => m.finishedAt!.getTime() - m.createdAt.getTime());
  const activity = (await db.select().from(opsTaskEvents).orderBy(desc(opsTaskEvents.createdAt)).limit(60)).map(toEventView);

  return {
    generatedAt: new Date().toISOString(),
    paused,
    disabledAgents: disabled,
    stats: {
      active: tasks.filter((t) => OPS_ACTIVE_STATUSES.includes(t.status)).length,
      stuck: tasks.filter((t) => t.status === "failed" || t.status === "needs_info").length,
      awaitingApproval: tasks.filter((t) => t.status === "awaiting_approval").length,
      avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      completed7d: completed7d.length,
    },
    tasks,
    agents,
    activity,
  };
}

export interface OpsStepView {
  id: string;
  stepKey: string;
  title: string;
  agentSlug: OpsAgentSlug;
  agentNameAr: string;
  status: OpsTaskStatus;
  dependsOn: string[];
  approvalGate: boolean;
  attempts: number;
  maxAttempts: number;
  confidence: number | null;
  riskLevel: string;
  output: Record<string, unknown> | null;
  sources: { title: string; url: string }[];
  lastError: string | null;
  humanNote: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  humanEdited: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface OpsTaskDetail {
  task: OpsTaskSummary & { description: string; input: Record<string, unknown>; participants: string[]; routeTitleAr: string; humanNote: string | null; autoReturnCount: number; createdById: string | null };
  steps: OpsStepView[];
  events: OpsEventView[];
}

export async function getOpsTaskDetail(id: string): Promise<OpsTaskDetail | null> {
  const [main] = await db.select().from(opsTasks).where(and(eq(opsTasks.id, id), isNull(opsTasks.parentId))).limit(1);
  if (!main) return null;
  const steps = await db.select().from(opsTasks).where(eq(opsTasks.parentId, id)).orderBy(opsTasks.stepIndex);
  const events = await db.select().from(opsTaskEvents).where(eq(opsTaskEvents.taskId, id)).orderBy(opsTaskEvents.createdAt).limit(300);
  const input = redactSecrets({ ...(main.input as Record<string, unknown>) });
  return {
    task: {
      ...summarize(main, steps),
      description: main.description,
      input,
      participants: main.participants,
      routeTitleAr: OPS_ROUTES[main.taskType as keyof typeof OPS_ROUTES]?.titleAr ?? main.taskType,
      humanNote: main.humanNote,
      autoReturnCount: main.autoReturnCount,
      createdById: main.createdById,
    },
    steps: steps.map((s) => ({
      id: s.id,
      stepKey: s.stepKey!,
      title: s.title,
      agentSlug: s.agentSlug as OpsAgentSlug,
      agentNameAr: OPS_AGENTS[s.agentSlug as OpsAgentSlug]?.nameAr ?? s.agentSlug ?? "",
      status: s.status as OpsTaskStatus,
      dependsOn: s.dependsOn,
      approvalGate: s.approvalGate,
      attempts: s.attempts,
      maxAttempts: s.maxAttempts,
      confidence: s.confidence,
      riskLevel: s.riskLevel,
      output: s.output,
      sources: s.sources,
      lastError: s.lastError,
      humanNote: s.humanNote,
      approvedById: s.approvedById,
      approvedAt: s.approvedAt?.toISOString() ?? null,
      approvalNote: s.approvalNote,
      humanEdited: s.humanEdited,
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
    })),
    events: events.map(toEventView),
  };
}

// ── مقاييس حقيقية ──

export interface OpsRoomMetrics {
  generatedAt: string;
  window: "30d";
  tasksByStatus: Record<string, number>;
  avgStepDurationMsByAgent: Record<string, number>;
  avgApprovalWaitMs: number | null;
  retries: number;
  failuresByAgent: Record<string, number>;
  humanInterventionRate: number | null; // نسبة المهام التي شهدت إعادة تكليف/طلب تعديل/معلومات
  firstPassAcceptanceRate: number | null; // اعتماد بلا تعديل بشري وبلا إعادة
  aiCostUsd30d: number;
  aiCalls30d: number;
}

export async function getOpsRoomMetrics(): Promise<OpsRoomMetrics> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const mains = await db.select().from(opsTasks).where(and(isNull(opsTasks.parentId), gte(opsTasks.createdAt, since)));
  const mainIds = mains.map((m) => m.id);
  const steps = mainIds.length ? await db.select().from(opsTasks).where(inArray(opsTasks.parentId, mainIds)) : [];
  const events = mainIds.length ? await db.select().from(opsTaskEvents).where(inArray(opsTaskEvents.taskId, mainIds)) : [];

  const tasksByStatus: Record<string, number> = {};
  for (const m of mains) tasksByStatus[m.status] = (tasksByStatus[m.status] ?? 0) + 1;

  const durAgg = new Map<string, { total: number; n: number }>();
  for (const s of steps) {
    if (s.startedAt && s.finishedAt && s.agentSlug) {
      const a = durAgg.get(s.agentSlug) ?? { total: 0, n: 0 };
      a.total += s.finishedAt.getTime() - s.startedAt.getTime();
      a.n += 1;
      durAgg.set(s.agentSlug, a);
    }
  }
  const avgStepDurationMsByAgent: Record<string, number> = {};
  for (const [k, v] of durAgg) avgStepDurationMsByAgent[k] = Math.round(v.total / v.n);

  const approvalWaits: number[] = [];
  for (const s of steps) {
    if (s.approvedAt && s.finishedAt) approvalWaits.push(s.approvedAt.getTime() - s.finishedAt.getTime());
  }
  const retries = events.filter((e) => e.eventType === "retry").length;
  const failuresByAgent: Record<string, number> = {};
  for (const e of events) if (e.eventType === "failed" && e.actorType === "agent") failuresByAgent[e.actor] = (failuresByAgent[e.actor] ?? 0) + 1;

  const intervened = new Set(events.filter((e) => ["reassigned", "changes_requested", "info_provided"].includes(e.eventType)).map((e) => e.taskId));
  const approvedSteps = steps.filter((s) => s.approvedAt);
  const firstPass = approvedSteps.filter((s) => !s.humanEdited && (mains.find((m) => m.id === s.parentId)?.reassignCount ?? 0) === 0);

  const [cost] = await db
    .select({ cost: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)`, calls: sql<number>`count(*)` })
    .from(aiUsageLogs)
    .where(and(like(aiUsageLogs.featureKey, "ops-room-%"), gte(aiUsageLogs.createdAt, since)));

  return {
    generatedAt: new Date().toISOString(),
    window: "30d",
    tasksByStatus,
    avgStepDurationMsByAgent,
    avgApprovalWaitMs: approvalWaits.length ? Math.round(approvalWaits.reduce((a, b) => a + b, 0) / approvalWaits.length) : null,
    retries,
    failuresByAgent,
    humanInterventionRate: mains.length ? Math.round((intervened.size / mains.length) * 100) : null,
    firstPassAcceptanceRate: approvedSteps.length ? Math.round((firstPass.length / approvedSteps.length) * 100) : null,
    aiCostUsd30d: Math.round(Number(cost?.cost ?? 0) * 100) / 100,
    aiCalls30d: Number(cost?.calls ?? 0),
  };
}
