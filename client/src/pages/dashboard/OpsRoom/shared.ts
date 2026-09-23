// غرفة عمليات سبق الذكية — أنواع الواجهة (مطابقة لـ server/services/opsRoom/index.ts) وأدوات العرض.
import {
  OPS_AGENTS,
  OPS_PRIORITY_LABELS_AR,
  OPS_STATUS_LABELS_AR,
  OPS_TASK_TYPE_LABELS_AR,
  type OpsAgentSlug,
  type OpsTaskStatus,
} from "@shared/opsRoom";

export { OPS_AGENTS, OPS_PRIORITY_LABELS_AR, OPS_STATUS_LABELS_AR, OPS_TASK_TYPE_LABELS_AR };

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
  successRate: number | null;
  completed7d: number;
  failed7d: number;
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

export interface OpsRoomOverview {
  generatedAt: string;
  paused: boolean;
  disabledAgents: string[];
  stats: { active: number; stuck: number; awaitingApproval: number; avgDurationMs: number | null; completed7d: number };
  tasks: OpsTaskSummary[];
  agents: OpsAgentCard[];
  activity: OpsEventView[];
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
  task: OpsTaskSummary & { description: string; input: Record<string, unknown>; participants: string[]; routeTitleAr: string; humanNote: string | null; autoReturnCount: number };
  steps: OpsStepView[];
  events: OpsEventView[];
}

export interface OpsRoomMetrics {
  generatedAt: string;
  tasksByStatus: Record<string, number>;
  avgStepDurationMsByAgent: Record<string, number>;
  avgApprovalWaitMs: number | null;
  retries: number;
  failuresByAgent: Record<string, number>;
  humanInterventionRate: number | null;
  firstPassAcceptanceRate: number | null;
  aiCostUsd30d: number;
  aiCalls30d: number;
}

/** أعمدة لوحة سير العمل — الحالات المتقاربة تُجمع في عمود واحد للقراءة */
export const BOARD_COLUMNS: { key: string; labelAr: string; statuses: OpsTaskStatus[]; tone: string }[] = [
  { key: "queue", labelAr: "في الطابور", statuses: ["new", "analyzing", "planning", "ready", "waiting"], tone: "bg-slate-500" },
  { key: "running", labelAr: "قيد التنفيذ", statuses: ["running"], tone: "bg-sky-500" },
  { key: "approval", labelAr: "بانتظار الاعتماد", statuses: ["awaiting_approval"], tone: "bg-amber-500" },
  { key: "attention", labelAr: "تحتاج تدخلًا", statuses: ["needs_info", "needs_changes", "failed"], tone: "bg-red-500" },
  { key: "done", labelAr: "منتهية", statuses: ["completed", "stopped", "cancelled"], tone: "bg-emerald-500" },
];

export const STATUS_BADGE: Record<OpsTaskStatus, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  analyzing: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  planning: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  ready: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  waiting: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  awaiting_approval: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  needs_info: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  needs_changes: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  stopped: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  cancelled: "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

export const AGENT_STATUS_META: Record<OpsAgentCard["status"], { labelAr: string; dot: string }> = {
  available: { labelAr: "متاح", dot: "bg-emerald-500" },
  working: { labelAr: "يعمل", dot: "bg-sky-500 animate-pulse" },
  waiting: { labelAr: "ينتظر", dot: "bg-amber-500" },
  stuck: { labelAr: "متعثر", dot: "bg-red-500" },
  paused: { labelAr: "موقوف", dot: "bg-slate-400" },
};

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}د ${s % 60}ث`;
  return `${Math.floor(m / 60)}س ${m % 60}د`;
}

export function timeAgoAr(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `قبل ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  return `قبل ${Math.floor(hours / 24)} يوم`;
}

export function agentName(slug: string | null | undefined): string {
  return slug && slug in OPS_AGENTS ? OPS_AGENTS[slug as OpsAgentSlug].nameAr : slug ?? "—";
}
