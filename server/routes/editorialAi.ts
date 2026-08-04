import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../rbac";
import {
  runEditorialTask,
} from "../services/editorialAiService";
import {
  SABQ_TASK_PROMPTS_AR,
  TASKS_WANTING_VERIFICATION,
  type EditorialTaskType,
} from "../ai/prompts/tasks";

const router = Router();

const TASK_TYPES = Object.keys(SABQ_TASK_PROMPTS_AR) as [
  EditorialTaskType,
  ...EditorialTaskType[],
];

const taskBodySchema = z.object({
  type: z.enum(TASK_TYPES),
  material: z.string().trim().min(20, "المادة أقصر من أن تُحرر").max(60_000),
  material2: z.string().trim().max(60_000).optional().nullable(),
  instructions: z.string().trim().max(2_000).optional().nullable(),
  verificationContext: z.string().trim().max(30_000).optional().nullable(),
});

/**
 * GET /api/editorial-ai/tasks
 * قائمة مهام التحرير الموحد المتاحة — تستهلكها واجهة شريط الأدوات في المحرر.
 */
router.get(
  "/api/editorial-ai/tasks",
  requireAuth,
  requireRole("admin", "editor", "system_admin"),
  (_req, res) => {
    res.json({
      tasks: TASK_TYPES.map((type) => ({
        type,
        wantsVerification: TASKS_WANTING_VERIFICATION.has(type),
      })),
    });
  },
);

/**
 * POST /api/editorial-ai/task
 * ينفّذ مهمة تحرير موحدة (حرر/طور/ادمج/راجع/تقرير/بروفايل/نسخة التطبيق/فحص).
 * المخرج دائماً مسودة بانتظار محرر بشري — لا مسار نشر مباشر من هنا (خط أحمر).
 */
router.post(
  "/api/editorial-ai/task",
  requireAuth,
  requireRole("admin", "editor", "system_admin"),
  async (req, res) => {
    const parsed = taskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة",
      });
    }
    if (parsed.data.type === "merge" && !parsed.data.material2?.trim()) {
      return res.status(400).json({ message: "مهمة الدمج تتطلب مادتين" });
    }

    try {
      const result = await runEditorialTask({
        type: parsed.data.type,
        material: parsed.data.material,
        material2: parsed.data.material2 ?? undefined,
        instructions: parsed.data.instructions ?? undefined,
        verificationContext: parsed.data.verificationContext ?? undefined,
        userId: (req.user as any)?.id,
      });
      res.json(result);
    } catch (error: any) {
      console.error("[editorial-unified] task failed:", error);
      res.status(500).json({
        message: error?.message || "تعذر تنفيذ مهمة التحرير",
      });
    }
  },
);

export default router;
