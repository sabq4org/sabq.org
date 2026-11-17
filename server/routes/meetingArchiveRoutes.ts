// ----------------------------------------------------------------------------
// أرشيف المحاضر والمهام — مسارات اللوحة (ADR-001: البيانات في الخدمة)
//
// المسار /api/meetings-archive (لا /api/meetings/archive) حتى لا يلتقطه
// /api/meetings/:id كمعرّف مهما كان ترتيب تسجيل الموجّهات.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { userHasPermission } from "../rbac";
import { getMeeting } from "../services/meetingsService";
import { parseLimit } from "../utils/pagination";
import {
  ARCHIVE_PAGE_SIZE,
  listMinutesArchive,
  listOpenTasksForHost,
  setMinutesTaskDone,
} from "../services/meetingArchiveService";

const router = Router();

const userIdOf = (req: Request) => (req.user as { id: string }).id;

async function requireMeetingsView(req: Request, res: Response): Promise<boolean> {
  const userId = userIdOf(req);
  if (
    (await userHasPermission(userId, "meetings.view")) ||
    (await userHasPermission(userId, "meetings.manage"))
  ) {
    return true;
  }
  res.status(403).json({ message: "لا تملك صلاحية الاجتماعات" });
  return false;
}

const archiveQuerySchema = z.object({
  q: z.string().max(200).optional(),
  before: z.string().datetime().optional(),
});

// أرشيف المحاضر — دائم، بالبحث في العنوان ونص المحضر
router.get("/api/meetings-archive", isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!(await requireMeetingsView(req, res))) return;
    const parsed = archiveQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "استعلام غير صالح" });
    const userId = userIdOf(req);
    const canManage = await userHasPermission(userId, "meetings.manage");
    const result = await listMinutesArchive(userId, canManage, {
      q: parsed.data.q,
      before: parsed.data.before ? new Date(parsed.data.before) : null,
      limit: parseLimit(req.query.limit, ARCHIVE_PAGE_SIZE, 50),
    });
    // محتوى خاص بالمستخدم — لا يُخزَّن في أي كاش وسيط
    res.setHeader("Cache-Control", "private, no-store");
    res.json(result);
  } catch (error) {
    console.error("[MeetingArchive] list error:", error);
    res.status(500).json({ message: "تعذر جلب أرشيف المحاضر" });
  }
});

// المهام المفتوحة من اجتماعات استضافها المستخدم
router.get(
  "/api/meetings-archive/open-tasks",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      if (!(await requireMeetingsView(req, res))) return;
      const tasks = await listOpenTasksForHost(userIdOf(req));
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ tasks });
    } catch (error) {
      console.error("[MeetingArchive] open tasks error:", error);
      res.status(500).json({ message: "تعذر جلب المهام" });
    }
  },
);

// task: نص المهمة كما يراه المستخدم — يثبت أن الفهرس ما زال يشير إليها
const taskBodySchema = z.object({ done: z.boolean(), task: z.string().min(1).max(1000) }).strict();

// إنجاز مهمة أو إعادة فتحها — للمضيف، في المسودة والمعتمد
router.patch(
  "/api/meetings/:id/minutes/tasks/:index",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = userIdOf(req);
      const meeting = await getMeeting(req.params.id);
      if (!meeting) return res.status(404).json({ message: "الاجتماع غير موجود" });
      if (
        meeting.hostUserId !== userId &&
        !(await userHasPermission(userId, "meetings.manage"))
      ) {
        return res.status(403).json({ message: "هذا الإجراء للمضيف فقط" });
      }
      const body = taskBodySchema.safeParse(req.body);
      const index = Number(req.params.index);
      if (!body.success || !Number.isInteger(index) || index < 0) {
        return res.status(400).json({ message: "طلب غير صالح" });
      }
      const result = await setMinutesTaskDone(meeting, index, body.data.done, userId, body.data.task);
      if (result === "not_found") return res.status(404).json({ message: "المهمة غير موجودة" });
      if (result === "changed") {
        return res.status(409).json({ message: "تغيّرت قائمة المهام — حدّث الصفحة ثم أعد المحاولة" });
      }
      if (result === "not_editable") {
        return res.status(409).json({ message: "لا يوجد محضر قابل للتحديث" });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("[MeetingArchive] task update error:", error);
      res.status(500).json({ message: "تعذر تحديث المهمة" });
    }
  },
);

export default router;
