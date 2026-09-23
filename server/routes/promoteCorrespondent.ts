// ترقية قارئ إلى مراسل من لوحة المستخدمين — يزامن الطبقتين.
import { Router, type Request, type Response } from "express";
import { requireAuth, requireAnyPermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { promoteUserToReporter } from "../services/promoteCorrespondentService";

const router = Router();

router.post(
  "/api/admin/users/:id/promote-reporter",
  requireAuth,
  requireAnyPermission(PERMISSION_CODES.USERS_CHANGE_ROLE, PERMISSION_CODES.USERS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const actorId = (req.user as { id: string } | undefined)?.id;
      if (!actorId) return res.status(401).json({ message: "غير مصرح" });
      if (req.params.id === actorId) {
        return res.status(403).json({ message: "لا يمكنك تعديل دورك بنفسك" });
      }
      const result = await promoteUserToReporter(req.params.id, actorId);
      res.json({
        message: result.alreadyReporter
          ? "العضوية مراسل مسبقاً — تمت مزامنة الدور وسجل الصفحة"
          : "تمت ترقية العضوية إلى مراسل",
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر ترقية العضوية";
      const status = message.includes("غير موجود") ? 404 : 400;
      console.error("[promote-reporter]", error);
      res.status(status).json({ message });
    }
  },
);

export default router;
