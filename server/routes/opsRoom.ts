/**
 * غرفة عمليات سبق الذكية — مسارات اللوحة (/api/admin/ops-room/*).
 * تجريبية ومعزولة. كل مسار خلف requireAuth + صلاحية محددة (المشرفون يمرون
 * بالـwildcard). لا يوجد أي مسار نشر أو إرسال — ops_room.publish محجوزة فقط.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import { OPS_AGENT_SLUGS, OPS_PERMISSIONS, OPS_PRIORITIES, OPS_TASK_TYPES } from "@shared/opsRoom";
import {
  OpsError,
  applyHumanAction,
  createOpsTask,
  getOpsRoomMetrics,
  getOpsRoomOverview,
  getOpsTaskDetail,
  setAgentEnabled,
  setOpsRoomPaused,
} from "../services/opsRoom";

const router: Router = Router();
router.use("/api/admin/ops-room", requireAuth);

function actorFrom(req: { user?: unknown }) {
  const u = (req.user ?? {}) as { id?: string; firstName?: string; lastName?: string; email?: string };
  return { id: u.id ?? "unknown", name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "محرر" };
}

function fail(res: { status: (n: number) => { json: (b: unknown) => void } }, err: unknown, fallback: string) {
  if (err instanceof OpsError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  console.error("[ops-room]", err);
  res.status(500).json({ message: fallback });
}

router.get("/api/admin/ops-room/overview", requirePermission(OPS_PERMISSIONS.view), async (_req, res) => {
  try {
    res.json(await getOpsRoomOverview());
  } catch (err) {
    fail(res, err, "تعذر تحميل غرفة العمليات");
  }
});

router.get("/api/admin/ops-room/metrics", requirePermission(OPS_PERMISSIONS.view), async (_req, res) => {
  try {
    res.json(await getOpsRoomMetrics());
  } catch (err) {
    fail(res, err, "تعذر تحميل المقاييس");
  }
});

const createSchema = z.object({
  title: z.string().trim().min(4).max(300),
  description: z.string().trim().max(5000).optional().default(""),
  taskType: z.enum(OPS_TASK_TYPES),
  priority: z.enum(OPS_PRIORITIES).optional(),
  material: z.string().trim().max(20_000).optional(),
  sourceUrls: z.array(z.string().url().max(2000)).max(10).optional(),
  imageUrl: z.string().url().max(2000).optional().or(z.literal("")),
  radarItemId: z.string().max(64).optional(),
  articleId: z.string().max(64).optional(),
  generateImage: z.boolean().optional(),
});

router.post("/api/admin/ops-room/tasks", requirePermission(OPS_PERMISSIONS.create), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const b = parsed.data;
  try {
    const main = await createOpsTask(
      {
        title: b.title,
        description: b.description,
        taskType: b.taskType,
        priority: b.priority,
        origin: b.radarItemId ? "radar" : "manual",
        radarItemId: b.radarItemId ?? null,
        articleId: b.articleId ?? null,
        input: {
          material: b.material ?? "",
          sourceUrls: b.sourceUrls ?? [],
          imageUrl: b.imageUrl || undefined,
          generateImage: b.generateImage === true,
        },
      },
      actorFrom(req),
    );
    res.status(201).json({ id: main.id, status: main.status });
  } catch (err) {
    fail(res, err, "تعذر إنشاء المهمة");
  }
});

router.get("/api/admin/ops-room/tasks/:id", requirePermission(OPS_PERMISSIONS.view), async (req, res) => {
  try {
    const detail = await getOpsTaskDetail(String(req.params.id));
    if (!detail) {
      res.status(404).json({ message: "المهمة غير موجودة" });
      return;
    }
    res.json(detail);
  } catch (err) {
    fail(res, err, "تعذر تحميل المهمة");
  }
});

const actionSchema = z.object({
  action: z.enum(["approve", "request_changes", "reassign", "request_info", "provide_info", "stop", "cancel", "resume", "retry"]),
  stepId: z.string().max(64).optional(),
  stepKey: z.string().max(64).optional(),
  note: z.string().trim().max(4000).optional(),
  editedResult: z.record(z.unknown()).optional(),
});

/** صلاحية كل إجراء — الفصل الذي يطلبه دستور الغرفة */
const ACTION_PERMISSION: Record<z.infer<typeof actionSchema>["action"], string> = {
  approve: OPS_PERMISSIONS.approve,
  request_changes: OPS_PERMISSIONS.approve,
  reassign: OPS_PERMISSIONS.reassign,
  request_info: OPS_PERMISSIONS.edit,
  provide_info: OPS_PERMISSIONS.edit,
  stop: OPS_PERMISSIONS.stop,
  cancel: OPS_PERMISSIONS.stop,
  resume: OPS_PERMISSIONS.stop,
  retry: OPS_PERMISSIONS.reassign,
};

router.post("/api/admin/ops-room/tasks/:id/actions", async (req, res, next) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? "إجراء غير صالح" });
    return;
  }
  // الصلاحية تُختار حسب الإجراء ثم يُنفَّذ
  const guard = requirePermission(ACTION_PERMISSION[parsed.data.action]);
  guard(req, res, async () => {
    try {
      const main = await applyHumanAction(String(req.params.id), parsed.data.stepId ?? null, parsed.data, actorFrom(req));
      res.json({ id: main.id, status: main.status });
    } catch (err) {
      fail(res, err, "تعذر تنفيذ الإجراء");
    }
  });
  void next;
});

router.post("/api/admin/ops-room/pause", requirePermission(OPS_PERMISSIONS.settings), async (req, res) => {
  const paused = z.object({ paused: z.boolean() }).safeParse(req.body);
  if (!paused.success) {
    res.status(400).json({ message: "قيمة غير صالحة" });
    return;
  }
  try {
    await setOpsRoomPaused(paused.data.paused, actorFrom(req));
    res.json({ paused: paused.data.paused });
  } catch (err) {
    fail(res, err, "تعذر تغيير حالة الغرفة");
  }
});

router.post("/api/admin/ops-room/agents/:slug", requirePermission(OPS_PERMISSIONS.agentsManage), async (req, res) => {
  const slug = String(req.params.slug) as (typeof OPS_AGENT_SLUGS)[number];
  const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!OPS_AGENT_SLUGS.includes(slug) || !body.success) {
    res.status(400).json({ message: "وكيل أو قيمة غير صالحة" });
    return;
  }
  try {
    res.json({ disabledAgents: await setAgentEnabled(slug, body.data.enabled, actorFrom(req)) });
  } catch (err) {
    fail(res, err, "تعذر تغيير حالة الوكيل");
  }
});

export default router;
