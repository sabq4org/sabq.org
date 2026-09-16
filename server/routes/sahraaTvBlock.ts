/**
 * بلوك قناة الصحراء — API عام + إدارة.
 * ملتزم بـ ADR-001: لا استيراد db.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import {
  getPublicSahraaTvBlock,
  getSahraaTvBlockConfig,
  saveSahraaTvBlockConfig,
} from "../services/sahraaTvBlockService";
import { proxySahraaTvMedia } from "../services/sahraaTvMediaProxy";

const router = Router();

const adminPutSchema = z.object({
  isActive: z.boolean().optional(),
  title: z.string().max(80).optional(),
  description: z.string().max(500).optional(),
  xPostUrl: z.string().max(500).optional(),
});

// PUBLIC: GET /api/sahraa-tv-block
router.get("/", async (_req: Request, res: Response) => {
  try {
    const payload = await getPublicSahraaTvBlock();
    res.json(payload);
  } catch (err) {
    console.error("[SahraaTvBlock] GET error:", err);
    res.json({ isVisible: false });
  }
});

// PUBLIC: GET /api/sahraa-tv-block/media — بث MP4 (يتجاوز حظر Referer لإكس)
router.get("/media", async (req: Request, res: Response) => {
  await proxySahraaTvMedia(req, res);
});

// ADMIN: GET /api/sahraa-tv-block/admin
router.get(
  "/admin",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (_req: Request, res: Response) => {
    try {
      const config = await getSahraaTvBlockConfig();
      res.json({ config });
    } catch (err) {
      console.error("[SahraaTvBlock] GET admin error:", err);
      res.status(500).json({ message: "تعذر تحميل إعدادات بلوك الصحراء" });
    }
  },
);

// ADMIN: PUT /api/sahraa-tv-block/admin
router.put(
  "/admin",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req: Request, res: Response) => {
    try {
      const parsed = adminPutSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: "بيانات غير صالحة",
          errors: parsed.error.flatten(),
        });
      }
      const config = await saveSahraaTvBlockConfig(parsed.data);
      res.json({ success: true, config });
    } catch (err: any) {
      if (err?.code === "INVALID_X_POST_URL" || err?.message === "INVALID_X_POST_URL") {
        return res.status(400).json({
          message: "رابط منشور إكس غير صالح — استخدم رابطاً مثل https://x.com/user/status/123/video/1",
        });
      }
      if (err?.code === "VIDEO_NOT_FOUND" || err?.message === "VIDEO_NOT_FOUND") {
        return res.status(400).json({
          message:
            "تعذر استخراج فيديو من هذا المنشور — تأكد أنه يحتوي فيديو وأن الرابط صحيح",
          details: err?.details,
        });
      }
      console.error("[SahraaTvBlock] PUT admin error:", err);
      res.status(500).json({ message: "تعذر حفظ إعدادات بلوك الصحراء" });
    }
  },
);

export default router;
