/**
 * مسارات مختبر DeepSeek (تجريبي — لا يمس مسار النشر)
 *
 * GET  /api/deepseek-lab/status          — هل المفتاح مضبوط + الرصيد المتبقي
 * GET  /api/deepseek-lab/default-prompt  — البرومبت الافتراضي لمهمة (?task=edit)
 * POST /api/deepseek-lab/run             — تشغيل تجربة (+ مقارنة اختيارية بمحرر سبق)
 *
 * نفس حارس محرر سبق الموحد: admin/editor/system_admin.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../rbac";
import {
  DEEPSEEK_MODELS,
  EDITORIAL_TASK_LABELS_AR,
  EDITORIAL_TASK_TYPES,
  buildDefaultSystemPrompt,
  getDeepSeekBalance,
  getSabqPrimaryModel,
  isDeepSeekConfigured,
  runDeepSeekLab,
  runSabqBaseline,
} from "../services/deepseekLabService";

const router = Router();
const guard = [requireAuth, requireRole("admin", "editor", "system_admin")] as const;

const TASK_ENUM = z.enum(EDITORIAL_TASK_TYPES as [string, ...string[]]);

router.get("/api/deepseek-lab/status", ...guard, async (_req, res) => {
  const configured = isDeepSeekConfigured();
  let balance: Awaited<ReturnType<typeof getDeepSeekBalance>> | null = null;
  let balanceError: string | null = null;
  if (configured) {
    try {
      balance = await getDeepSeekBalance();
    } catch (error: any) {
      balanceError = error?.message || "تعذر جلب الرصيد";
    }
  }
  res.json({
    configured,
    balance,
    balanceError,
    models: DEEPSEEK_MODELS,
    tasks: EDITORIAL_TASK_TYPES.map((type) => ({
      type,
      label: EDITORIAL_TASK_LABELS_AR[type],
    })),
    sabqModel: getSabqPrimaryModel(),
  });
});

router.get("/api/deepseek-lab/default-prompt", ...guard, (req, res) => {
  const parsed = TASK_ENUM.safeParse(req.query.task ?? "edit");
  if (!parsed.success) {
    return res.status(400).json({ message: "مهمة غير معروفة" });
  }
  const task = parsed.data as (typeof EDITORIAL_TASK_TYPES)[number];
  res.json({ task, systemPrompt: buildDefaultSystemPrompt(task) });
});

const runBodySchema = z.object({
  task: TASK_ENUM.default("edit"),
  model: z.enum(DEEPSEEK_MODELS).default("deepseek-flash"),
  material: z.string().trim().min(20, "المادة أقصر من أن تُحرر").max(120_000),
  material2: z.string().trim().max(60_000).optional().nullable(),
  instructions: z.string().trim().max(4_000).optional().nullable(),
  systemPrompt: z.string().trim().max(60_000).optional().nullable(),
  thinking: z.boolean().default(false),
  jsonMode: z.boolean().default(true),
  compareWithSabq: z.boolean().default(false),
  maxTokens: z.number().int().min(256).max(64_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

router.post("/api/deepseek-lab/run", ...guard, async (req, res) => {
  const parsed = runBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة",
    });
  }
  if (!isDeepSeekConfigured()) {
    return res.status(503).json({
      message: "DEEPSEEK_API_KEY غير مضبوط — أضفه إلى متغيرات البيئة ثم أعد التشغيل",
    });
  }
  const data = parsed.data;
  const task = data.task as (typeof EDITORIAL_TASK_TYPES)[number];
  if (task === "merge" && !data.material2?.trim()) {
    return res.status(400).json({ message: "مهمة الدمج تتطلب مادتين" });
  }

  const userId = (req.user as any)?.id as string | undefined;
  const common = {
    task,
    material: data.material,
    material2: data.material2 ?? undefined,
    instructions: data.instructions ?? undefined,
  };

  const deepseekPromise = runDeepSeekLab({
    ...common,
    systemPrompt: data.systemPrompt ?? undefined,
    model: data.model,
    thinking: data.thinking,
    jsonMode: data.jsonMode,
    maxTokens: data.maxTokens,
    temperature: data.temperature,
  });
  const baselinePromise = data.compareWithSabq
    ? runSabqBaseline({ ...common, userId })
    : Promise.resolve(null);

  const [deepseekOutcome, baseline] = await Promise.all([
    deepseekPromise.then(
      (result) => ({ ok: true as const, result }),
      (error: any) => ({
        ok: false as const,
        error: error?.message || "تعذر الاتصال بـ DeepSeek",
      }),
    ),
    baselinePromise,
  ]);

  if (!deepseekOutcome.ok && !baseline) {
    console.error("[deepseek-lab] run failed:", deepseekOutcome.error);
    return res.status(502).json({ message: deepseekOutcome.error });
  }

  res.json({
    deepseek: deepseekOutcome.ok
      ? deepseekOutcome.result
      : { error: deepseekOutcome.error },
    sabq: baseline,
    sabqModel: getSabqPrimaryModel(),
  });
});

export default router;
