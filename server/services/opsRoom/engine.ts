/**
 * غرفة عمليات سبق الذكية — المنسق (المحرك).
 *
 * نقي: لا db ولا شبكة هنا؛ كل شيء عبر OpsStore وسجل الوكلاء المحقونين.
 * المنسق ينظّم ويوزّع فقط — لا يملك أي صلاحية نشر أو إرسال.
 *
 * الدورة: createTask → (analyzing → planning) تُنشأ الخطوات من المسار التعريفي
 * → pump: تفعيل الخطوات التي اكتملت تبعياتها → مطالبة ذرية → تنفيذ الوكيل
 * بمهلة → تحقق المخرج بالمخطط → حفظ → بوابة اعتماد بشري أو الخطوة التالية.
 */
import {
  OPS_AGENTS,
  OPS_MAX_AUTO_RETURNS,
  OPS_MAX_REASSIGNMENTS,
  OPS_ROUTES,
  OPS_TERMINAL_STATUSES,
  canTransition,
  type OpsAgentSlug,
  type OpsEventType,
  type OpsPriority,
  type OpsRiskLevel,
  type OpsTaskStatus,
  type OpsTaskType,
} from "@shared/opsRoom";
import type { OpsTaskRow } from "@shared/schema";
import type { AgentOutput, AgentRunContext, EngineDeps, HumanActor, OpsStore, TaskPatch } from "./types";
import { OpsError } from "./types";
import { redactSecrets } from "./sanitize";

export interface CreateTaskInput {
  title: string;
  description?: string;
  taskType: OpsTaskType;
  priority?: OpsPriority;
  origin?: "manual" | "radar" | "system";
  input?: Record<string, unknown>;
  createdById?: string | null;
  articleId?: string | null;
  radarItemId?: string | null;
}

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export class OpsRoomEngine {
  private readonly store: OpsStore;
  private readonly now: () => Date;
  private readonly retryDelayMs: number;
  private pumping = new Set<string>();

  constructor(private readonly deps: EngineDeps) {
    this.store = deps.store;
    this.now = deps.now ?? (() => new Date());
    this.retryDelayMs = deps.retryDelayMs ?? 15_000;
  }

  // ── أدوات داخلية ──

  private async event(
    taskId: string,
    stepId: string | null,
    actorType: "agent" | "human" | "system",
    actor: string,
    eventType: OpsEventType,
    messageAr: string,
    extra: { statusFrom?: string | null; statusTo?: string | null; data?: Record<string, unknown>; durationMs?: number } = {},
  ) {
    await this.store.insertEvent({
      taskId,
      stepId,
      actorType,
      actor,
      eventType,
      statusFrom: extra.statusFrom ?? null,
      statusTo: extra.statusTo ?? null,
      messageAr,
      data: redactSecrets(extra.data ?? {}),
      durationMs: extra.durationMs ?? null,
      createdAt: this.now(),
    });
  }

  /** انتقال حالة مضبوط — أي قفزة خارج الجدول تُرفض ولا تُحفظ. */
  private async transition(
    row: OpsTaskRow,
    to: OpsTaskStatus,
    actor: { type: "agent" | "human" | "system"; id: string },
    messageAr: string,
    patch: TaskPatch = {},
    eventType: OpsEventType = "status_changed",
    data?: Record<string, unknown>,
  ): Promise<OpsTaskRow> {
    const from = row.status as OpsTaskStatus;
    if (from === to) {
      const same = await this.store.updateTask(row.id, { ...patch, updatedAt: this.now() });
      return same ?? row;
    }
    if (!canTransition(from, to)) {
      throw new OpsError(409, `انتقال غير مسموح: ${from} → ${to} (${row.stepKey ?? "main"})`);
    }
    const updated = await this.store.updateTask(row.id, { ...patch, status: to, updatedAt: this.now() });
    if (!updated) throw new OpsError(404, "المهمة غير موجودة");
    await this.event(row.parentId ?? row.id, row.parentId ? row.id : null, actor.type, actor.id, eventType, messageAr, {
      statusFrom: from,
      statusTo: to,
      data,
    });
    return updated;
  }

  private agentName(slug: string | null | undefined): string {
    return slug && slug in OPS_AGENTS ? OPS_AGENTS[slug as OpsAgentSlug].nameAr : slug ?? "—";
  }

  private riskFor(taskType: OpsTaskType, priority: OpsPriority): OpsRiskLevel {
    if (taskType === "breaking" || priority === "critical") return "high";
    if (taskType === "factcheck" || taskType === "comments" || priority === "high") return "medium";
    return "low";
  }

  // ── الإنشاء والتخطيط ──

  async createTask(inputRaw: CreateTaskInput, actor: HumanActor | { id: string; name: string; system?: true }): Promise<OpsTaskRow> {
    if (await this.deps.isPaused()) {
      throw new OpsError(423, "غرفة العمليات متوقفة عن استقبال مهام جديدة");
    }
    const route = OPS_ROUTES[inputRaw.taskType];
    if (!route) throw new OpsError(400, "نوع مهمة غير معروف");
    const title = inputRaw.title.trim();
    if (title.length < 4) throw new OpsError(400, "عنوان المهمة قصير جدًا");

    const dup = await this.store.findRecentDuplicate(inputRaw.taskType, normalizeTitle(title), DUPLICATE_WINDOW_MS);
    if (dup) throw new OpsError(409, `مهمة مطابقة نشطة بالفعل (${dup.id.slice(0, 8)}) — لا تكرار`);

    const priority = inputRaw.priority ?? "normal";
    const riskLevel = this.riskFor(inputRaw.taskType, priority);
    const actorType = "system" in actor && actor.system ? "system" : "human";

    let main = await this.store.insertTask({
      title,
      description: inputRaw.description?.trim() ?? "",
      taskType: inputRaw.taskType,
      priority,
      status: "new",
      origin: inputRaw.origin ?? "manual",
      createdById: inputRaw.createdById ?? actor.id,
      articleId: inputRaw.articleId ?? null,
      radarItemId: inputRaw.radarItemId ?? null,
      routeType: route.type,
      input: inputRaw.input ?? {},
      riskLevel,
      participants: [],
      createdAt: this.now(),
      updatedAt: this.now(),
    });
    await this.event(main.id, null, actorType, actor.id, "created", `أنشأ ${actor.name} مهمة «${title}» (${route.titleAr})`, {
      statusTo: "new",
      data: { priority, origin: main.origin },
    });

    // التحليل: نوع + مخاطر + مسار
    main = await this.transition(main, "analyzing", { type: "system", id: "coordinator" }, "بدأ المنسق تحليل المهمة");
    main = await this.transition(
      main,
      "planning",
      { type: "system", id: "coordinator" },
      `حدد المنسق المسار «${route.titleAr}» بمستوى مخاطر ${riskLevel} و${route.steps.length} خطوات`,
      {},
      "analyzed",
      { riskLevel, route: route.type, steps: route.steps.map((s) => s.key) },
    );

    // إنشاء الخطوات — بلا تبعيات = جاهزة، وإلا في انتظار
    for (const [index, step] of route.steps.entries()) {
      const meta = OPS_AGENTS[step.agent];
      await this.store.insertTask({
        parentId: main.id,
        title: step.titleAr,
        description: meta.roleAr,
        taskType: main.taskType,
        priority,
        status: step.dependsOn.length === 0 ? "ready" : "waiting",
        origin: main.origin,
        createdById: main.createdById,
        agentSlug: step.agent,
        stepKey: step.key,
        stepIndex: index,
        dependsOn: step.dependsOn,
        approvalGate: Boolean(step.approvalGate),
        input: {},
        riskLevel,
        maxAttempts: meta.maxAttempts,
        timeoutMs: meta.timeoutMs,
        createdAt: this.now(),
        updatedAt: this.now(),
      });
    }
    main = await this.transition(
      main,
      "ready",
      { type: "system", id: "coordinator" },
      `وزّع المنسق ${route.steps.length} مهام فرعية على: ${[...new Set(route.steps.map((s) => this.agentName(s.agent)))].join("، ")}`,
      { participants: [...new Set(route.steps.map((s) => s.agent))] },
      "planned",
    );
    return main;
  }

  // ── الضخ (التوزيع والتنفيذ) ──

  /** يدفع المهمة قدر الإمكان: يفعّل الخطوات المستحقة وينفذها حتى تتوقف عند بوابة أو نهاية. */
  async pump(mainId: string): Promise<void> {
    if (this.pumping.has(mainId)) return;
    this.pumping.add(mainId);
    try {
      for (let guard = 0; guard < 50; guard++) {
        const progressed = await this.pumpOnce(mainId);
        if (!progressed) break;
      }
    } finally {
      this.pumping.delete(mainId);
    }
  }

  private async pumpOnce(mainId: string): Promise<boolean> {
    const main = await this.store.getTask(mainId);
    if (!main || main.parentId) return false;
    const status = main.status as OpsTaskStatus;
    if (!["ready", "running", "waiting"].includes(status)) return false;
    if (await this.deps.isPaused()) return false;

    const steps = await this.store.listSteps(mainId);
    const byKey = new Map(steps.map((s) => [s.stepKey!, s]));
    const completedKeys = new Set(steps.filter((s) => s.status === "completed").map((s) => s.stepKey!));

    // كل الخطوات مكتملة → المهمة مكتملة
    if (steps.length > 0 && steps.every((s) => s.status === "completed")) {
      await this.transition(main, "completed", { type: "system", id: "coordinator" }, "اكتملت كل خطوات المهمة", {
        finishedAt: this.now(),
        currentAgentSlug: null,
      }, "completed");
      return false;
    }

    let progressed = false;
    // تفعيل الخطوات التي اكتملت تبعياتها
    for (const step of steps) {
      if (step.status !== "waiting") continue;
      const deps = step.dependsOn ?? [];
      if (deps.every((k) => completedKeys.has(k))) {
        await this.transition(step, "ready", { type: "system", id: "coordinator" }, `أصبحت خطوة «${step.title}» جاهزة (اكتملت تبعياتها)`);
        progressed = true;
      }
    }
    const fresh = progressed ? await this.store.listSteps(mainId) : steps;
    const disabled = new Set(await this.deps.disabledAgents());
    const now = this.now();
    const ready = fresh.filter(
      (s) => s.status === "ready" && (!s.retryAfter || s.retryAfter.getTime() <= now.getTime()),
    );
    if (ready.length === 0) return progressed;

    // مطالبة ذرية بكل الخطوات الجاهزة (المتوازية تعمل معًا)
    const claimed: OpsTaskRow[] = [];
    for (const step of ready) {
      if (disabled.has(step.agentSlug!)) {
        if (step.lastError !== "agent_disabled") {
          await this.store.updateTask(step.id, { lastError: "agent_disabled", updatedAt: now });
          await this.event(mainId, step.id, "system", "coordinator", "blocked", `الوكيل ${this.agentName(step.agentSlug)} موقوف — الخطوة معلقة حتى تشغيله`);
        }
        continue;
      }
      const row = await this.store.claimStep(step.id, {
        status: "running",
        startedAt: now,
        attempts: step.attempts + 1,
        lastError: null,
        updatedAt: now,
      });
      if (row) claimed.push(row);
    }
    if (claimed.length === 0) return progressed;

    const mainNow = (await this.store.getTask(mainId))!;
    if (mainNow.status === "ready" || mainNow.status === "waiting") {
      await this.transition(mainNow, "running", { type: "system", id: "coordinator" }, "بدأ التنفيذ", {
        startedAt: mainNow.startedAt ?? now,
        currentAgentSlug: claimed[0].agentSlug,
      });
    } else {
      await this.store.updateTask(mainId, { currentAgentSlug: claimed[0].agentSlug, updatedAt: now });
    }

    await Promise.all(claimed.map((step) => this.executeStep(mainId, step, byKey)));
    return true;
  }

  private async executeStep(mainId: string, step: OpsTaskRow, byKey: Map<string, OpsTaskRow>): Promise<void> {
    const slug = step.agentSlug as OpsAgentSlug;
    const handler = this.deps.agents[slug];
    const startedAt = this.now().getTime();
    await this.event(mainId, step.id, "agent", slug, "started", `استلم ${this.agentName(slug)} خطوة «${step.title}» (المحاولة ${step.attempts}/${step.maxAttempts})`);

    if (!handler) {
      await this.failStep(mainId, step, `لا يوجد منفّذ للوكيل ${slug}`, startedAt);
      return;
    }

    const main = (await this.store.getTask(mainId))!;
    const priorOutputs: Record<string, Record<string, unknown>> = {};
    for (const [key, s] of byKey) {
      if (s.output && s.status === "completed") priorOutputs[key] = s.output;
    }
    const humanNotes: string[] = [];
    if (step.humanNote) humanNotes.push(step.humanNote);
    const mainNotes = (main.input as Record<string, unknown>).humanNotes;
    if (Array.isArray(mainNotes)) humanNotes.push(...mainNotes.filter((n): n is string => typeof n === "string"));

    const ctx: AgentRunContext = {
      main,
      step,
      priorOutputs,
      humanNotes,
      logTool: async (tool, data) => {
        await this.event(mainId, step.id, "agent", slug, "tool_call", `استخدم ${this.agentName(slug)} أداة ${tool}`, { data });
      },
      isCancelled: async () => {
        const cur = await this.store.getTask(step.id);
        return !cur || cur.status !== "running";
      },
    };

    // حارس الأدوات: الوكيل لا يستطيع توسيع صلاحياته — الأدوات المسموحة ثابتة في التعريف
    const allowedTools = new Set(OPS_AGENTS[slug].tools);
    const guardedCtx: AgentRunContext = {
      ...ctx,
      logTool: async (tool, data) => {
        if (!allowedTools.has(tool)) {
          throw new OpsError(403, `أداة «${tool}» غير مسموحة للوكيل ${this.agentName(slug)}`);
        }
        await ctx.logTool(tool, data);
      },
    };

    let result: Awaited<ReturnType<typeof handler.run>>;
    try {
      result = await Promise.race([
        handler.run(guardedCtx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new OpsError(504, `تجاوز الوكيل مهلة التنفيذ (${Math.round(step.timeoutMs / 1000)} ث)`)), step.timeoutMs),
        ),
      ]);
    } catch (err) {
      await this.failStep(mainId, step, err instanceof Error ? err.message : String(err), startedAt);
      return;
    }

    // أوقف الإنسان المهمة أثناء التنفيذ، أو انتهت مهلتها وبدأت محاولة أحدث؟
    // نتجاهل هذا المخرج ولا نحفظه (رقم المحاولة هو رمز الجيل)
    const current = await this.store.getTask(step.id);
    if (!current || current.status !== "running" || current.attempts !== step.attempts) {
      await this.event(mainId, step.id, "system", "coordinator", "stopped", `تجاهل المنسق مخرج ${this.agentName(slug)} لأن المهمة أُوقفت أثناء التنفيذ`);
      return;
    }
    const durationMs = this.now().getTime() - startedAt;

    if (!result.ok) {
      const patch: TaskPatch = {
        output: result.partialOutput ? (result.partialOutput as Record<string, unknown>) : null,
        lastError: result.reasonAr,
        finishedAt: this.now(),
      };
      await this.transition(current, "needs_info", { type: "agent", id: slug }, `أوقف ${this.agentName(slug)} المسار: ${result.reasonAr}`, patch, "needs_info", { escalate: result.escalate, durationMs });
      const m = (await this.store.getTask(mainId))!;
      await this.transition(m, "needs_info", { type: "system", id: "coordinator" }, `المهمة بانتظار المحرر — ${result.reasonAr}`, { currentAgentSlug: slug });
      return;
    }

    // التحقق من مطابقة المخرج للعقد
    const parsed = handler.resultSchema.safeParse(result.output.result);
    if (!parsed.success) {
      const reason = `مخرج لا يطابق العقد: ${parsed.error.errors[0]?.path.join(".") ?? ""} ${parsed.error.errors[0]?.message ?? ""}`.trim();
      await this.event(mainId, step.id, "system", "coordinator", "output_rejected", `رفض المنسق مخرج ${this.agentName(slug)} — ${reason}`);
      await this.failStep(mainId, step, reason, startedAt);
      return;
    }

    const output: AgentOutput = { ...result.output, result: parsed.data as Record<string, unknown> };
    const basePatch: TaskPatch = {
      output: output as unknown as Record<string, unknown>,
      sources: output.sources ?? [],
      confidence: output.confidence,
      riskLevel: result.riskLevel ?? current.riskLevel,
      finishedAt: this.now(),
      lastError: null,
    };

    // طلب عودة لخطوة سابقة (مثل ميزان → قلم) ضمن حد صارم لمنع الدوران
    if (result.returnToStepKey) {
      const target = byKey.get(result.returnToStepKey);
      const mainRow = (await this.store.getTask(mainId))!;
      if (target && mainRow.autoReturnCount < OPS_MAX_AUTO_RETURNS) {
        // الخطوة العائدة تبدأ بعدّاد محاولات جديد — العودة قرار لا تعثر
        await this.transition(current, "waiting", { type: "agent", id: slug }, `أعاد ${this.agentName(slug)} المادة إلى ${this.agentName(target.agentSlug)}: ${result.returnReasonAr ?? ""}`, { ...basePatch, attempts: 0 }, "needs_changes", { durationMs });
        await this.store.updateTask(target.id, {
          status: "ready",
          output: null,
          humanNote: `ملاحظات ${this.agentName(slug)}: ${result.returnReasonAr ?? ""}`,
          attempts: 0,
          updatedAt: this.now(),
        });
        await this.event(mainId, target.id, "system", "coordinator", "reassigned", `أعاد المنسق خطوة «${target.title}» للتنفيذ بملاحظات ${this.agentName(slug)}`);
        await this.store.updateTask(mainId, { autoReturnCount: mainRow.autoReturnCount + 1, updatedAt: this.now() });
        return;
      }
      // تجاوز حد العودة → للبشر بدل الدوران
      output.warnings = [...(output.warnings ?? []), `تجاوز حد العودة التلقائية (${OPS_MAX_AUTO_RETURNS}) — القرار للمحرر`];
      basePatch.output = output as unknown as Record<string, unknown>;
    }

    if (current.approvalGate) {
      await this.transition(current, "awaiting_approval", { type: "agent", id: slug }, `أنهى ${this.agentName(slug)} «${step.title}» — بانتظار اعتماد بشري`, basePatch, "awaiting_approval", { durationMs, confidence: output.confidence });
      const m = (await this.store.getTask(mainId))!;
      if (m.status === "running") {
        await this.transition(m, "awaiting_approval", { type: "system", id: "coordinator" }, `المهمة بانتظار الاعتماد البشري (${step.title})`, { currentAgentSlug: slug });
      }
      return;
    }

    await this.transition(current, "completed", { type: "agent", id: slug }, `أكمل ${this.agentName(slug)} «${step.title}»: ${output.summaryAr.slice(0, 160)}`, basePatch, "completed", { durationMs, confidence: output.confidence });
  }

  private async failStep(mainId: string, step: OpsTaskRow, reason: string, startedAt: number): Promise<void> {
    const durationMs = this.now().getTime() - startedAt;
    const current = await this.store.getTask(step.id);
    // محاولة أحدث قائمة؟ فشل هذه المحاولة القديمة لا يخصها
    if (!current || current.status !== "running" || current.attempts !== step.attempts) return;
    const slug = step.agentSlug as OpsAgentSlug;
    if (current.attempts < current.maxAttempts) {
      await this.transition(
        current,
        "ready",
        { type: "system", id: "coordinator" },
        `تعثر ${this.agentName(slug)} (${reason.slice(0, 200)}) — إعادة المحاولة ${current.attempts + 1}/${current.maxAttempts} بعد ${Math.round(this.retryDelayMs / 1000)} ث`,
        { lastError: reason, retryAfter: new Date(this.now().getTime() + this.retryDelayMs) },
        "retry",
        { durationMs },
      );
      // إعادة الدفع بعد المهلة دون انتظار الكرون (يبقى الكرون احتياطًا عند تعدد النسخ)
      const timer = setTimeout(() => void this.pump(mainId).catch(() => undefined), this.retryDelayMs + 50);
      if (typeof timer === "object" && "unref" in timer) timer.unref();
      return;
    }
    await this.transition(current, "failed", { type: "agent", id: slug }, `فشل ${this.agentName(slug)} نهائيًا: ${reason.slice(0, 200)}`, { lastError: reason, finishedAt: this.now() }, "failed", { durationMs });
    const main = (await this.store.getTask(mainId))!;
    if (!OPS_TERMINAL_STATUSES.includes(main.status as OpsTaskStatus)) {
      await this.transition(main, "failed", { type: "system", id: "coordinator" }, `توقفت المهمة عند ${this.agentName(slug)}`, { failedAtAgent: slug, lastError: reason, finishedAt: this.now() }, "failed");
    }
  }

  /** كل المهام الرئيسية النشطة التي قد تملك خطوات مستحقة — للكرون. */
  async pumpAll(): Promise<number> {
    const mains = await this.store.listMainTasks({ statuses: ["ready", "running", "waiting"], limit: 50 });
    for (const m of mains) await this.pump(m.id);
    return mains.length;
  }

  // ── التدخل البشري ──

  private async requireMain(id: string): Promise<OpsTaskRow> {
    const row = await this.store.getTask(id);
    if (!row || row.parentId) throw new OpsError(404, "المهمة غير موجودة");
    return row;
  }

  private async requireStep(id: string): Promise<OpsTaskRow> {
    const row = await this.store.getTask(id);
    if (!row || !row.parentId) throw new OpsError(404, "الخطوة غير موجودة");
    return row;
  }

  /** الاعتماد (مع تعديل بشري اختياري يحل محل نتيجة الوكيل ويُوسم). */
  async approve(stepId: string, actor: HumanActor, note?: string, editedResult?: Record<string, unknown>): Promise<OpsTaskRow> {
    const step = await this.requireStep(stepId);
    if (step.status !== "awaiting_approval") throw new OpsError(409, "الخطوة ليست بانتظار اعتماد");
    const output = (step.output ?? {}) as Record<string, unknown>;
    const patch: TaskPatch = {
      approvedById: actor.id,
      approvedAt: this.now(),
      approvalNote: note ?? null,
    };
    if (editedResult && Object.keys(editedResult).length > 0) {
      patch.output = { ...output, result: { ...((output.result as Record<string, unknown>) ?? {}), ...editedResult } };
      patch.humanEdited = true;
    }
    await this.transition(step, "completed", { type: "human", id: actor.id }, `اعتمد ${actor.name} «${step.title}»${editedResult ? " بعد تعديل بشري" : ""}${note ? ` — ${note}` : ""}`, patch, "approved", { humanEdited: Boolean(editedResult) });
    const main = await this.requireMain(step.parentId!);
    if (main.status === "awaiting_approval") {
      const steps = await this.store.listSteps(main.id);
      const allDone = steps.every((s) => s.status === "completed");
      await this.transition(main, allDone ? "completed" : "running", { type: "human", id: actor.id }, allDone ? "اكتملت المهمة باعتماد بشري نهائي" : "استؤنف المسار بعد الاعتماد", allDone ? { finishedAt: this.now(), currentAgentSlug: null } : {});
    }
    await this.pump(main.id);
    return (await this.store.getTask(main.id))!;
  }

  /** طلب تعديل: تعاد الخطوة لنفس الوكيل بملاحظة المحرر. */
  async requestChanges(stepId: string, actor: HumanActor, note: string): Promise<OpsTaskRow> {
    const step = await this.requireStep(stepId);
    if (step.status !== "awaiting_approval") throw new OpsError(409, "الخطوة ليست بانتظار اعتماد");
    const main = await this.requireMain(step.parentId!);
    this.assertReassignBudget(main);
    await this.transition(step, "needs_changes", { type: "human", id: actor.id }, `طلب ${actor.name} تعديلًا على «${step.title}»: ${note}`, { humanNote: note }, "changes_requested");
    await this.store.updateTask(step.id, { status: "ready", attempts: 0, retryAfter: null, updatedAt: this.now() });
    await this.transition(main, "running", { type: "human", id: actor.id }, "أُعيدت الخطوة للوكيل بملاحظات المحرر", { reassignCount: main.reassignCount + 1 });
    await this.pump(main.id);
    return (await this.store.getTask(main.id))!;
  }

  /** إعادة التكليف من خطوة محددة: تُعاد هي وما يعتمد عليها. */
  async reassign(mainId: string, actor: HumanActor, stepKey: string, note?: string): Promise<OpsTaskRow> {
    const main = await this.requireMain(mainId);
    if (!["awaiting_approval", "needs_info", "needs_changes", "completed", "failed", "stopped"].includes(main.status)) {
      throw new OpsError(409, "لا يمكن إعادة التكليف والمهمة قيد التنفيذ — أوقفها أولًا");
    }
    this.assertReassignBudget(main);
    const steps = await this.store.listSteps(mainId);
    const target = steps.find((s) => s.stepKey === stepKey);
    if (!target) throw new OpsError(404, "الخطوة غير موجودة في مسار هذه المهمة");

    // الخطوات المتأثرة: الهدف + كل ما يعتمد عليه تعديًا
    const affected = new Set<string>([stepKey]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of steps) {
        if (!affected.has(s.stepKey!) && (s.dependsOn ?? []).some((d) => affected.has(d))) {
          affected.add(s.stepKey!);
          grew = true;
        }
      }
    }
    for (const s of steps) {
      if (!affected.has(s.stepKey!)) continue;
      const isTarget = s.stepKey === stepKey;
      await this.store.updateTask(s.id, {
        status: isTarget ? "ready" : "waiting",
        output: null,
        sources: [],
        confidence: null,
        attempts: 0,
        retryAfter: null,
        lastError: null,
        approvedById: null,
        approvedAt: null,
        approvalNote: null,
        humanEdited: false,
        humanNote: isTarget ? note ?? null : null,
        finishedAt: null,
        updatedAt: this.now(),
      });
    }
    await this.event(mainId, target.id, "human", actor.id, "reassigned", `أعاد ${actor.name} المهمة إلى ${this.agentName(target.agentSlug)} من خطوة «${target.title}»${note ? ` — ${note}` : ""}`, {
      data: { affected: [...affected] },
    });
    await this.transition(main, "ready", { type: "human", id: actor.id }, "أُعيد تكليف المسار", {
      reassignCount: main.reassignCount + 1,
      failedAtAgent: null,
      lastError: null,
      finishedAt: null,
    });
    await this.pump(mainId);
    return (await this.store.getTask(mainId))!;
  }

  private assertReassignBudget(main: OpsTaskRow) {
    if (main.reassignCount >= OPS_MAX_REASSIGNMENTS) {
      throw new OpsError(429, `بلغت المهمة حد إعادة التكليف (${OPS_MAX_REASSIGNMENTS}) — أنشئ مهمة جديدة أو ألغِها`);
    }
  }

  /** المحرر يطلب معلومات إضافية قبل القرار. */
  async requestInfo(mainId: string, actor: HumanActor, note: string): Promise<OpsTaskRow> {
    const main = await this.requireMain(mainId);
    const from = main.status as OpsTaskStatus;
    if (!canTransition(from, "needs_info") && from !== "awaiting_approval") {
      throw new OpsError(409, "لا يمكن طلب معلومات في هذه الحالة");
    }
    // من awaiting_approval نمر عبر running ثم needs_info (انتقالان مسجلان)
    let row = main;
    if (from === "awaiting_approval") {
      row = await this.transition(row, "running", { type: "human", id: actor.id }, "علّق المحرر الاعتماد");
    }
    return this.transition(row, "needs_info", { type: "human", id: actor.id }, `طلب ${actor.name} معلومات إضافية: ${note}`, { humanNote: note }, "needs_info");
  }

  /** المحرر يزوّد المعلومات → تُستأنف الخطوة المتوقفة. */
  async provideInfo(mainId: string, actor: HumanActor, note: string, extraInput?: Record<string, unknown>): Promise<OpsTaskRow> {
    const main = await this.requireMain(mainId);
    if (main.status !== "needs_info") throw new OpsError(409, "المهمة ليست بانتظار معلومات");
    const input = { ...(main.input as Record<string, unknown>) };
    const notes = Array.isArray(input.humanNotes) ? [...(input.humanNotes as string[])] : [];
    notes.push(note);
    input.humanNotes = notes;
    if (extraInput) Object.assign(input, extraInput);

    const steps = await this.store.listSteps(mainId);
    for (const s of steps) {
      if (s.status === "needs_info") {
        await this.store.updateTask(s.id, { status: "ready", attempts: 0, retryAfter: null, humanNote: note, updatedAt: this.now() });
      }
    }
    await this.event(mainId, null, "human", actor.id, "info_provided", `زوّد ${actor.name} المهمة بمعلومات: ${note}`);
    await this.transition(main, "ready", { type: "human", id: actor.id }, "استؤنف المسار بعد توفير المعلومات", { input, humanNote: null });
    await this.pump(mainId);
    return (await this.store.getTask(mainId))!;
  }

  /** إيقاف فوري: المهمة وكل خطواتها غير المكتملة. مخرجات الوكلاء الجارية تُهمل. */
  async stop(mainId: string, actor: HumanActor, reason?: string): Promise<OpsTaskRow> {
    const main = await this.requireMain(mainId);
    const steps = await this.store.listSteps(mainId);
    for (const s of steps) {
      if (["ready", "running", "waiting", "awaiting_approval", "needs_info", "needs_changes"].includes(s.status)) {
        await this.store.updateTask(s.id, { status: "stopped", updatedAt: this.now() });
      }
    }
    return this.transition(main, "stopped", { type: "human", id: actor.id }, `أوقف ${actor.name} المهمة${reason ? `: ${reason}` : ""}`, { currentAgentSlug: null }, "stopped");
  }

  async resume(mainId: string, actor: HumanActor): Promise<OpsTaskRow> {
    const main = await this.requireMain(mainId);
    if (main.status !== "stopped") throw new OpsError(409, "المهمة ليست موقوفة");
    const steps = await this.store.listSteps(mainId);
    const completed = new Set(steps.filter((s) => s.status === "completed").map((s) => s.stepKey!));
    for (const s of steps) {
      if (s.status !== "stopped") continue;
      const depsOk = (s.dependsOn ?? []).every((k) => completed.has(k));
      await this.store.updateTask(s.id, { status: depsOk ? "ready" : "waiting", attempts: 0, retryAfter: null, updatedAt: this.now() });
    }
    await this.transition(main, "ready", { type: "human", id: actor.id }, `استأنف ${actor.name} المهمة`, {}, "resumed");
    await this.pump(mainId);
    return (await this.store.getTask(mainId))!;
  }

  async cancel(mainId: string, actor: HumanActor, reason?: string): Promise<OpsTaskRow> {
    const main = await this.requireMain(mainId);
    const steps = await this.store.listSteps(mainId);
    for (const s of steps) {
      if (!OPS_TERMINAL_STATUSES.includes(s.status as OpsTaskStatus)) {
        await this.store.updateTask(s.id, { status: "cancelled", updatedAt: this.now() });
      }
    }
    return this.transition(main, "cancelled", { type: "human", id: actor.id }, `ألغى ${actor.name} المهمة${reason ? `: ${reason}` : ""}`, { finishedAt: this.now(), currentAgentSlug: null }, "cancelled");
  }

  /** إعادة محاولة مهمة فشلت: الخطوة الفاشلة تعود جاهزة بعدّاد صفري. */
  async retry(mainId: string, actor: HumanActor): Promise<OpsTaskRow> {
    const main = await this.requireMain(mainId);
    if (main.status !== "failed") throw new OpsError(409, "المهمة ليست في حالة فشل");
    const steps = await this.store.listSteps(mainId);
    for (const s of steps) {
      if (s.status === "failed") {
        await this.store.updateTask(s.id, { status: "ready", attempts: 0, retryAfter: null, lastError: null, updatedAt: this.now() });
      }
    }
    await this.transition(main, "ready", { type: "human", id: actor.id }, `أعاد ${actor.name} المحاولة`, { failedAtAgent: null, lastError: null, finishedAt: null }, "retry");
    await this.pump(mainId);
    return (await this.store.getTask(mainId))!;
  }
}
