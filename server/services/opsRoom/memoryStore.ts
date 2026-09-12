/**
 * مخزن ذاكرة لغرفة العمليات — للاختبارات والتشغيل الجاف. نفس عقد OpsStore
 * ونفس دلالات المطالبة الذرية (claimStep ينجح فقط عند status === "ready").
 */
import type { InsertOpsTask, InsertOpsTaskEvent, OpsTaskEventRow, OpsTaskRow } from "@shared/schema";
import type { OpsTaskStatus } from "@shared/opsRoom";
import type { OpsStore, TaskPatch } from "./types";

let seq = 0;
const nextId = () => `mem-${(++seq).toString(36).padStart(4, "0")}`;

function rowFrom(insert: InsertOpsTask): OpsTaskRow {
  const now = new Date();
  return {
    id: insert.id ?? nextId(),
    parentId: insert.parentId ?? null,
    title: insert.title,
    description: insert.description ?? "",
    taskType: insert.taskType,
    priority: insert.priority ?? "normal",
    status: insert.status ?? "new",
    origin: insert.origin ?? "manual",
    createdById: insert.createdById ?? null,
    articleId: insert.articleId ?? null,
    radarItemId: insert.radarItemId ?? null,
    agentSlug: insert.agentSlug ?? null,
    stepKey: insert.stepKey ?? null,
    stepIndex: insert.stepIndex ?? 0,
    dependsOn: (insert.dependsOn as string[]) ?? [],
    approvalGate: insert.approvalGate ?? false,
    routeType: insert.routeType ?? null,
    currentAgentSlug: insert.currentAgentSlug ?? null,
    participants: (insert.participants as string[]) ?? [],
    input: (insert.input as Record<string, unknown>) ?? {},
    output: (insert.output as Record<string, unknown> | null) ?? null,
    sources: (insert.sources as { title: string; url: string }[]) ?? [],
    confidence: insert.confidence ?? null,
    riskLevel: insert.riskLevel ?? "low",
    attempts: insert.attempts ?? 0,
    maxAttempts: insert.maxAttempts ?? 2,
    timeoutMs: insert.timeoutMs ?? 90000,
    retryAfter: insert.retryAfter ?? null,
    lastError: insert.lastError ?? null,
    failedAtAgent: insert.failedAtAgent ?? null,
    reassignCount: insert.reassignCount ?? 0,
    autoReturnCount: insert.autoReturnCount ?? 0,
    humanNote: insert.humanNote ?? null,
    approvedById: insert.approvedById ?? null,
    approvedAt: insert.approvedAt ?? null,
    approvalNote: insert.approvalNote ?? null,
    humanEdited: insert.humanEdited ?? false,
    startedAt: insert.startedAt ?? null,
    finishedAt: insert.finishedAt ?? null,
    dueAt: insert.dueAt ?? null,
    createdAt: insert.createdAt ?? now,
    updatedAt: insert.updatedAt ?? now,
  };
}

export class MemoryOpsStore implements OpsStore {
  tasks = new Map<string, OpsTaskRow>();
  events: OpsTaskEventRow[] = [];

  async insertTask(row: InsertOpsTask): Promise<OpsTaskRow> {
    const full = rowFrom(row);
    this.tasks.set(full.id, full);
    return { ...full };
  }

  async getTask(id: string): Promise<OpsTaskRow | undefined> {
    const row = this.tasks.get(id);
    return row ? { ...row } : undefined;
  }

  async updateTask(id: string, patch: TaskPatch, expected?: { status: string; attempts: number; startedAt: Date | null }): Promise<OpsTaskRow | undefined> {
    const row = this.tasks.get(id);
    if (!row) return undefined;
    if (expected && (row.status !== expected.status || row.attempts !== expected.attempts ||
      row.startedAt?.getTime() !== expected.startedAt?.getTime())) return undefined;
    const next = { ...row, ...(patch as Partial<OpsTaskRow>) } as OpsTaskRow;
    this.tasks.set(id, next);
    return { ...next };
  }

  async claimStep(id: string, patch: TaskPatch): Promise<OpsTaskRow | undefined> {
    const row = this.tasks.get(id);
    if (!row || row.status !== "ready") return undefined;
    return this.updateTask(id, patch);
  }

  async listSteps(parentId: string): Promise<OpsTaskRow[]> {
    return [...this.tasks.values()].filter((t) => t.parentId === parentId).sort((a, b) => a.stepIndex - b.stepIndex).map((t) => ({ ...t }));
  }

  async listMainTasks(opts?: { statuses?: OpsTaskStatus[]; limit?: number; oldestFirst?: boolean }): Promise<OpsTaskRow[]> {
    let rows = [...this.tasks.values()].filter((t) => !t.parentId);
    if (opts?.statuses) rows = rows.filter((t) => opts.statuses!.includes(t.status as OpsTaskStatus));
    rows.sort((a, b) => opts?.oldestFirst
      ? a.updatedAt.getTime() - b.updatedAt.getTime()
      : b.createdAt.getTime() - a.createdAt.getTime());
    return rows.slice(0, opts?.limit ?? 100).map((t) => ({ ...t }));
  }

  async findRecentDuplicate(taskType: string, normalizedTitle: string, sinceMs: number): Promise<OpsTaskRow | undefined> {
    const since = Date.now() - sinceMs;
    const active = new Set(["new", "analyzing", "planning", "ready", "running", "waiting", "awaiting_approval", "needs_info", "needs_changes"]);
    return [...this.tasks.values()].find(
      (t) => !t.parentId && t.taskType === taskType && active.has(t.status) && t.createdAt.getTime() >= since && t.title.trim().replace(/\s+/g, " ").toLowerCase() === normalizedTitle,
    );
  }

  async insertEvent(row: InsertOpsTaskEvent): Promise<void> {
    this.events.push({
      id: nextId(),
      taskId: row.taskId,
      stepId: row.stepId ?? null,
      actorType: row.actorType,
      actor: row.actor,
      eventType: row.eventType,
      statusFrom: row.statusFrom ?? null,
      statusTo: row.statusTo ?? null,
      messageAr: row.messageAr,
      data: (row.data as Record<string, unknown>) ?? {},
      durationMs: row.durationMs ?? null,
      createdAt: row.createdAt ?? new Date(),
    });
  }

  async listEvents(taskId: string, limit = 200): Promise<OpsTaskEventRow[]> {
    return this.events.filter((e) => e.taskId === taskId).slice(-limit);
  }

  async listRecentEvents(limit = 50): Promise<OpsTaskEventRow[]> {
    return this.events.slice(-limit).reverse();
  }
}
