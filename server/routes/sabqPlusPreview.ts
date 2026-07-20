// ----------------------------------------------------------------------------
// سبق بلس — مسارات المعاينة الداخلية /api/plus-preview/*
//
// Admin-only simulation surface for the سبق بلس × ولاء ون experience.
// All data access lives in server/services/sabqPlusPreviewService.ts (ADR-001).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import {
  getPlusCatalog,
  getPlusRedemptions,
  getPlusSummary,
  isPlusPreviewAdmin,
  redeemPreviewReward,
} from "../services/sabqPlusPreviewService";

const router = Router();

async function requirePlusAdmin(req: Request, res: Response, next: () => void) {
  const user = req.user as { id: string; role?: string | null } | undefined;
  if (!user) {
    return res.status(401).json({ message: "غير مصرح" });
  }
  if (await isPlusPreviewAdmin(user)) return next();
  // 404 (not 403) so the preview surface doesn't reveal its existence.
  return res.status(404).json({ message: "غير موجود" });
}

router.use("/api/plus-preview", isAuthenticated, requirePlusAdmin);

router.get("/api/plus-preview/summary", async (req: Request, res: Response) => {
  try {
    res.json(await getPlusSummary((req.user as any).id));
  } catch (error) {
    console.error("[SabqPlusPreview] summary error:", error);
    res.status(500).json({ message: "تعذر جلب الملخص" });
  }
});

router.get("/api/plus-preview/catalog", async (req: Request, res: Response) => {
  try {
    res.json(await getPlusCatalog((req.user as any).id));
  } catch (error) {
    console.error("[SabqPlusPreview] catalog error:", error);
    res.status(500).json({ message: "تعذر جلب الكتالوج" });
  }
});

router.post("/api/plus-preview/redeem/:id", async (req: Request, res: Response) => {
  try {
    if (req.body?.termsAccepted !== true) {
      return res.status(400).json({ message: "يجب الموافقة على شروط الاستخدام وشروط ولاء ون قبل الاستبدال" });
    }
    const result = await redeemPreviewReward((req.user as any).id, req.params.id);
    if (!result.success) {
      const statusByCode: Record<string, number> = {
        NOT_FOUND: 404,
        INACTIVE: 404,
        EXPIRED: 410,
        OUT_OF_STOCK: 409,
        MAX_REDEMPTIONS: 409,
        INSUFFICIENT_POINTS: 402,
      };
      return res.status(statusByCode[result.code] ?? 400).json({ message: result.message });
    }
    res.json(result);
  } catch (error) {
    console.error("[SabqPlusPreview] redeem error:", error);
    res.status(500).json({ message: "تعذر إتمام الاستبدال" });
  }
});

router.get("/api/plus-preview/redemptions", async (req: Request, res: Response) => {
  try {
    res.json(await getPlusRedemptions((req.user as any).id));
  } catch (error) {
    console.error("[SabqPlusPreview] redemptions error:", error);
    res.status(500).json({ message: "تعذر جلب السجل" });
  }
});

export default router;
