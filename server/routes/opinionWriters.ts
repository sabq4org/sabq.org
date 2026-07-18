// مسارات إدارة كتّاب الرأي: القائمة الإدارية، اليوم المخصص، مقالات الكاتب،
// الموعد المقترح للجدولة، وبانر الكاتب في لوحته.
// ADR-001: لا وصول لقاعدة البيانات هنا — كل الاستعلامات في opinionWritersService.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { upsertOpinionWriterScheduleSchema } from "@shared/schema";
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  userHasAnyRole,
} from "../rbac";
import {
  getNextSlotForWriter,
  getWriterArticlesWithStats,
  getWriterScheduleBanner,
  listOpinionWriters,
  upsertWriterSchedule,
} from "../services/opinionWritersService";

const router = Router();

const requestUserId = (req: Request) => (req.user as { id: string }).id;

// ── الجهة الإدارية ──

router.get(
  "/api/admin/opinion-writers",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (_req: Request, res: Response) => {
    try {
      res.json({ writers: await listOpinionWriters() });
    } catch (error) {
      console.error("[opinion-writers] list failed:", error);
      res.status(500).json({ message: "تعذر جلب قائمة الكتّاب" });
    }
  },
);

router.put(
  "/api/admin/opinion-writers/:writerId/schedule",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (req: Request, res: Response) => {
    try {
      const parsed = upsertOpinionWriterScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.errors[0]?.message || "بيانات غير صالحة" });
      }
      const writerId = req.params.writerId;
      if (!(await userHasAnyRole(writerId, ["opinion_author"]))) {
        return res.status(400).json({ message: "المستخدم المحدد ليس كاتب رأي" });
      }
      const schedule = await upsertWriterSchedule(writerId, parsed.data, requestUserId(req));
      res.json({ schedule });
    } catch (error) {
      console.error("[opinion-writers] upsert schedule failed:", error);
      res.status(500).json({ message: "تعذر حفظ يوم النشر" });
    }
  },
);

router.get(
  "/api/admin/opinion-writers/:writerId/articles",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page)) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
      const result = await getWriterArticlesWithStats(req.params.writerId, page, limit);
      if (!result.writer) return res.status(404).json({ message: "الكاتب غير موجود" });
      res.json(result);
    } catch (error) {
      console.error("[opinion-writers] writer articles failed:", error);
      res.status(500).json({ message: "تعذر جلب مقالات الكاتب" });
    }
  },
);

// الموعد المقترح القادم لكاتب — يستخدمه محرر المراجعة ومحرر المقال لتعبئة الجدولة
router.get(
  "/api/opinion-writers/:writerId/next-slot",
  requireAuth,
  requireAnyPermission(PERMISSION_CODES.OPINION_REVIEW, PERMISSION_CODES.ARTICLES_SCHEDULE),
  async (req: Request, res: Response) => {
    try {
      res.json({ suggestion: await getNextSlotForWriter(req.params.writerId) });
    } catch (error) {
      console.error("[opinion-writers] next-slot failed:", error);
      res.status(500).json({ message: "تعذر حساب الموعد المقترح" });
    }
  },
);

// ── جهة الكاتب ──

router.get(
  "/api/opinion-author/schedule",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = requestUserId(req);
      if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
        return res.status(403).json({ message: "هذه المساحة خاصة بكتّاب الرأي" });
      }
      res.json({ banner: await getWriterScheduleBanner(userId) });
    } catch (error) {
      console.error("[opinion-writers] writer banner failed:", error);
      res.status(500).json({ message: "تعذر جلب موعد النشر" });
    }
  },
);

export default router;
