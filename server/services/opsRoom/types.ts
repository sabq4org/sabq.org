/**
 * غرفة العمليات — عقود المحرك: التخزين، الوكلاء، نتائج التنفيذ.
 * المحرك نقي: يعمل فوق أي OpsStore (Drizzle في الإنتاج، ذاكرة في الاختبارات).
 */
import type { ZodType } from "zod";
import type { InsertOpsTask, InsertOpsTaskEvent, OpsTaskEventRow, OpsTaskRow } from "@shared/schema";
import type { OpsAgentOutputBase, OpsAgentSlug, OpsRiskLevel, OpsTaskStatus } from "@shared/opsRoom";

export type TaskPatch = Partial<Omit<InsertOpsTask, "id">>;

export interface OpsStore {
  insertTask(row: InsertOpsTask): Promise<OpsTaskRow>;
  getTask(id: string): Promise<OpsTaskRow | undefined>;
  updateTask(id: string, patch: TaskPatch): Promise<OpsTaskRow | undefined>;
  /** مطالبة ذرية بخطوة: تنجح فقط إن كانت حالتها `ready` لحظة التحديث (تمنع التنفيذ المزدوج). */
  claimStep(id: string, patch: TaskPatch): Promise<OpsTaskRow | undefined>;
  listSteps(parentId: string): Promise<OpsTaskRow[]>;
  listMainTasks(opts?: { statuses?: OpsTaskStatus[]; limit?: number }): Promise<OpsTaskRow[]>;
  /** مهام رئيسية نشطة بنفس النوع والعنوان خلال نافذة زمنية — لمنع التكرار */
  findRecentDuplicate(taskType: string, normalizedTitle: string, sinceMs: number): Promise<OpsTaskRow | undefined>;
  insertEvent(row: InsertOpsTaskEvent): Promise<void>;
  listEvents(taskId: string, limit?: number): Promise<OpsTaskEventRow[]>;
  listRecentEvents(limit?: number): Promise<OpsTaskEventRow[]>;
}

/** ما يصل للوكيل: لا يرى إلا مهمته والمخرجات السابقة المعتمدة في مساره. */
export interface AgentRunContext {
  main: OpsTaskRow;
  step: OpsTaskRow;
  /** مخرجات الخطوات السابقة بمفاتيحها (result فقط + الملخص) */
  priorOutputs: Record<string, Record<string, unknown>>;
  /** ملاحظات المحرر البشري (إعادة تكليف / معلومات إضافية) */
  humanNotes: string[];
  /** يسجّل استدعاء أداة في سجل الأحداث (بلا أسرار) */
  logTool(tool: string, data?: Record<string, unknown>): Promise<void>;
  /** يفحص إن أوقف الإنسان المهمة أثناء التنفيذ */
  isCancelled(): Promise<boolean>;
}

export type AgentOutput = OpsAgentOutputBase & { result: Record<string, unknown> };

export type AgentRunResult =
  | {
      ok: true;
      output: AgentOutput;
      riskLevel?: OpsRiskLevel;
      /** طلب إعادة خطوة سابقة (مثل ميزان → قلم) — المحرك يحدّه بـ OPS_MAX_AUTO_RETURNS */
      returnToStepKey?: string;
      returnReasonAr?: string;
    }
  | {
      ok: false;
      /** needs_info: الأدلة ناقصة/متعارضة والقرار للبشر. blocked: محظور بالسياسة. */
      escalate: "needs_info" | "blocked";
      reasonAr: string;
      partialOutput?: Partial<AgentOutput>;
    };

export interface OpsAgentHandler {
  slug: OpsAgentSlug;
  /** مخطط result الخاص بالوكيل — أي مخرج لا يطابقه يُرفض ويُعاد المحاولة ضمن الحد */
  resultSchema: ZodType;
  run(ctx: AgentRunContext): Promise<AgentRunResult>;
}

export interface EngineDeps {
  store: OpsStore;
  agents: Partial<Record<OpsAgentSlug, OpsAgentHandler>>;
  /** إيقاف الغرفة عن استقبال/توزيع مهام جديدة */
  isPaused(): Promise<boolean>;
  /** وكلاء أوقفهم المشرف — لا يُوزَّع عليهم شيء */
  disabledAgents(): Promise<string[]>;
  now?: () => Date;
  /** تأخير إعادة المحاولة (ms) — يُصغَّر في الاختبارات */
  retryDelayMs?: number;
}

export class OpsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface HumanActor {
  id: string;
  name: string;
}
