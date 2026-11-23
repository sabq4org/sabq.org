// مسارات استبيان كتّاب الرأي (الاهتمامات + مقترحات التطوير):
//   GET /api/opinion-writer-feedback/me     هوية الكاتب (اسم وبريد من حسابه) ورده الحالي إن وجد
//   PUT /api/opinion-writer-feedback/me     حفظ الرد أو تحديثه (كاتب رأي فقط)
//   GET /api/admin/opinion-writer-feedback  كل الردود مع عدّ كل اهتمام (صلاحية opinion.review أو *)
// ADR-001: لا وصول مباشر لقاعدة البيانات هنا — الاستعلامات في opinionWriterFeedbackService.

import { Router, type Request, type Response } from "express";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { countInterests, validateOpinionWriterFeedback } from "@shared/opinionWriterFeedback";
import { logActivity, requireAuth, requirePermission, userHasAnyRole } from "../rbac";
import {
  getMyOpinionWriterFeedback,
  getWriterIdentity,
  listOpinionWriterFeedback,
  saveMyOpinionWriterFeedback,
} from "../services/opinionWriterFeedbackService";

const router = Router();

const requestUserId = (req: Request) => (req.user as { id: string }).id;

router.get("/api/opinion-writer-feedback/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req);
    const [isWriter, identity, feedback] = await Promise.all([
      userHasAnyRole(userId, ["opinion_author"]),
      getWriterIdentity(userId),
      getMyOpinionWriterFeedback(userId),
    ]);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ isWriter, identity, feedback });
  } catch (error) {
    console.error("[opinion-writer-feedback] read failed:", error);
    return res.status(500).json({ message: "تعذر جلب النموذج" });
  }
});

router.put("/api/opinion-writer-feedback/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req);
    if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
      return res.status(403).json({ message: "هذا النموذج مخصص لكتّاب الرأي" });
    }
    const parsed = validateOpinionWriterFeedback(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }
    const feedback = await saveMyOpinionWriterFeedback(userId, parsed.value);
    await logActivity({
      userId,
      action: "opinion_writer_feedback_save",
      entityType: "opinion_writer_feedback",
      entityId: userId,
      newValue: { interests: feedback.interests },
      metadata: { ip: req.ip, userAgent: req.get("user-agent") },
    }).catch(() => {});
    return res.json({ feedback });
  } catch (error) {
    console.error("[opinion-writer-feedback] save failed:", error);
    return res.status(500).json({ message: "تعذر حفظ ردك، حاول مرة أخرى" });
  }
});

router.get(
  "/api/admin/opinion-writer-feedback",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (_req: Request, res: Response) => {
    try {
      const responses = await listOpinionWriterFeedback();
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ responses, counts: countInterests(responses) });
    } catch (error) {
      console.error("[opinion-writer-feedback] admin list failed:", error);
      return res.status(500).json({ message: "تعذر جلب الردود" });
    }
  },
);

export default router;
