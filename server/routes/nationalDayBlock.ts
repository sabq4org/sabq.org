// ----------------------------------------------------------------------------
// بلوك «اليوم الوطني الـ96» — المسارات
//
// عام:  GET /api/national-day-block          → حمولة الرئيسية أو isVisible=false
// إدارة: GET /api/national-day-block/admin    → الإعدادات الحالية
//        PUT /api/national-day-block/admin    → upsert (admin/system_admin فقط)
//
// كل الوصول للبيانات في server/services/nationalDayBlockService.ts (ADR-001).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import {
  getNationalDayBlockPublic,
  isNationalDayBlockAdmin,
  loadNationalDayBlockConfig,
  upsertNationalDayBlockConfig,
} from "../services/nationalDayBlockService";

const router = Router();

async function requireBlockAdmin(req: Request, res: Response, next: () => void) {
  const user = req.user as { id: string; role?: string | null } | undefined;
  if (!user) {
    return res.status(401).json({ message: "غير مصرح" });
  }
  if (await isNationalDayBlockAdmin(user)) return next();
  return res.status(403).json({ message: "للمسؤولين فقط" });
}

router.get("/api/national-day-block", async (_req: Request, res: Response) => {
  try {
    res.json(await getNationalDayBlockPublic());
  } catch (err) {
    console.error("[NationalDayBlock] GET error:", err);
    res.status(500).json({ isVisible: false, message: "تعذر جلب بلوك اليوم الوطني" });
  }
});

router.get(
  "/api/national-day-block/admin",
  isAuthenticated,
  requireBlockAdmin,
  async (_req: Request, res: Response) => {
    try {
      res.json({ config: await loadNationalDayBlockConfig() });
    } catch (err) {
      console.error("[NationalDayBlock] GET admin error:", err);
      res.status(500).json({ message: "تعذر جلب الإعدادات" });
    }
  },
);

router.put(
  "/api/national-day-block/admin",
  isAuthenticated,
  requireBlockAdmin,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id?: string } | undefined)?.id ?? null;
      const body = req.body ?? {};

      const updates: Record<string, unknown> = {
        updatedBy: userId,
        updatedAt: new Date(),
      };
      if (body.isActive !== undefined) updates.isActive = !!body.isActive;
      if (typeof body.title === "string") updates.title = body.title.trim().slice(0, 80);
      if (typeof body.subtitle === "string" || body.subtitle === null) {
        updates.subtitle = body.subtitle ? String(body.subtitle).trim().slice(0, 160) : null;
      }
      if (Array.isArray(body.keywords)) {
        updates.keywords = body.keywords
          .map((k: unknown) => String(k).trim())
          .filter((k: string) => k.length > 0 && k.length <= 50);
      }
      if (typeof body.articleLimit === "number") {
        updates.articleLimit = Math.max(1, Math.min(12, body.articleLimit));
      }
      if (typeof body.lookbackHours === "number") {
        updates.lookbackHours = Math.max(1, Math.min(720, body.lookbackHours));
      }
      if (body.seasonStartDate !== undefined) {
        updates.seasonStartDate = body.seasonStartDate ? new Date(body.seasonStartDate) : null;
      }
      if (body.seasonEndDate !== undefined) {
        updates.seasonEndDate = body.seasonEndDate ? new Date(body.seasonEndDate) : null;
      }
      if (Array.isArray(body.pinnedArticleIds)) {
        updates.pinnedArticleIds = body.pinnedArticleIds
          .map((id: unknown) => String(id))
          .filter((id: string) => id.length > 0);
      }

      const config = await upsertNationalDayBlockConfig(updates);
      res.json({ success: true, config });
    } catch (err) {
      console.error("[NationalDayBlock] PUT error:", err);
      res.status(500).json({ message: "تعذر تحديث الإعدادات" });
    }
  },
);

export default router;
