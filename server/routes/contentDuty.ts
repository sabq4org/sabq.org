// «غرفة المناوبة» — مناوبات إدارة المحتوى (docs/systems/editorial/SYSTEM.md).
// البطاقة لكل الموظفين؛ الأرقام للمسؤول (الكل) ولمدير المحتوى (أرقامه فقط)؛ تعديل الجدول للمسؤول.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import {
  ContentDutyInputError,
  ContentDutyNotReadyError,
  cancelException,
  createException,
  createShift,
  saveThresholds,
  updateShift,
} from "../services/contentDuty/dutyRosterStore";
import {
  getDutyCard,
  getDutyRoom,
  getDutyRoster,
  getDutyTeam,
  resolveDutyViewer,
  rosteredIdsNow,
  type DutyViewer,
} from "../services/contentDuty/dutyMetricsService";

const router = Router();

async function viewerFor(req: Request, res: Response): Promise<DutyViewer | null> {
  const userId = (req.user as { id?: string } | undefined)?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const viewer = await resolveDutyViewer(userId, await rosteredIdsNow());
  if (!viewer) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return viewer;
}

function fail(res: Response, error: unknown, label: string) {
  if (error instanceof ContentDutyNotReadyError) {
    return res.status(503).json({ error: error.code, message: "جدول المناوبات غير مفعّل بعد" });
  }
  if (error instanceof ContentDutyInputError) {
    return res.status(400).json({ error: "CONTENT_DUTY_INVALID", message: error.message });
  }
  console.error(`[ContentDuty] ${label} failed`);
  return res.status(500).json({ message: "تعذر تحميل المناوبات" });
}

function noStore(_req: Request, res: Response, next: () => void) {
  res.set("Cache-Control", "private, no-store");
  next();
}

router.get("/api/admin/dashboard/content-duty", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await viewerFor(req, res);
    if (!viewer) return;
    return res.json(await getDutyCard(viewer));
  } catch (error) {
    return fail(res, error, "card");
  }
});

router.get("/api/admin/content-duty/room", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await viewerFor(req, res);
    if (!viewer) return;
    if (viewer.access === "staff") return res.status(403).json({ message: "Forbidden" });
    const key = typeof req.query.shift === "string" ? req.query.shift.slice(0, 200) : null;
    return res.json(await getDutyRoom(viewer, key));
  } catch (error) {
    return fail(res, error, "room");
  }
});

router.get("/api/admin/content-duty/team", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await viewerFor(req, res);
    if (!viewer) return;
    if (viewer.access === "staff") return res.status(403).json({ message: "Forbidden" });
    return res.json(await getDutyTeam(viewer));
  } catch (error) {
    return fail(res, error, "team");
  }
});

router.get("/api/admin/content-duty/roster", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await viewerFor(req, res);
    if (!viewer) return;
    const week = typeof req.query.week === "string" ? req.query.week : null;
    return res.json(await getDutyRoster(viewer, week));
  } catch (error) {
    return fail(res, error, "roster");
  }
});

// ---------- التعديل: المسؤول فقط ----------

async function leadOnly(req: Request, res: Response): Promise<DutyViewer | null> {
  const viewer = await viewerFor(req, res);
  if (!viewer) return null;
  if (viewer.access !== "lead") {
    res.status(403).json({ message: "تعديل الجدول للمسؤول فقط" });
    return null;
  }
  return viewer;
}

const shiftBody = z.object({
  userId: z.string().min(1).max(160),
  days: z.array(z.number().int()).min(1).max(7),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
}).strict();

router.post("/api/admin/content-duty/shifts", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await leadOnly(req, res);
    if (!viewer) return;
    const body = shiftBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "CONTENT_DUTY_INVALID", message: "بيانات الوردية غير مكتملة" });
    return res.status(201).json(await createShift(body.data, viewer.userId));
  } catch (error) {
    return fail(res, error, "create shift");
  }
});

router.patch("/api/admin/content-duty/shifts/:id", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await leadOnly(req, res);
    if (!viewer) return;
    const body = shiftBody.partial().extend({ active: z.literal(false).optional() }).strict().safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "CONTENT_DUTY_INVALID", message: "بيانات الوردية غير صالحة" });
    const ok = await updateShift(String(req.params.id), body.data);
    return ok ? res.json({ ok: true }) : res.status(404).json({ message: "الوردية غير موجودة" });
  } catch (error) {
    return fail(res, error, "update shift");
  }
});

const exceptionBody = z.object({
  dutyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(1).max(160),
  coverUserId: z.string().min(1).max(160).nullable(),
  note: z.string().max(300).nullable().optional(),
}).strict();

router.post("/api/admin/content-duty/exceptions", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await leadOnly(req, res);
    if (!viewer) return;
    const body = exceptionBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "CONTENT_DUTY_INVALID", message: "بيانات الاستثناء غير صالحة" });
    return res.status(201).json(await createException({ ...body.data, note: body.data.note ?? null }, viewer.userId));
  } catch (error) {
    return fail(res, error, "create exception");
  }
});

router.post("/api/admin/content-duty/exceptions/:id/cancel", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await leadOnly(req, res);
    if (!viewer) return;
    const ok = await cancelException(String(req.params.id));
    return ok ? res.json({ ok: true }) : res.status(404).json({ message: "الاستثناء غير موجود" });
  } catch (error) {
    return fail(res, error, "cancel exception");
  }
});

router.put("/api/admin/content-duty/settings", isAuthenticated, noStore, async (req, res) => {
  try {
    const viewer = await leadOnly(req, res);
    if (!viewer) return;
    return res.json({ thresholds: await saveThresholds(req.body?.thresholds) });
  } catch (error) {
    return fail(res, error, "settings");
  }
});

export default router;
