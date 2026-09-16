/**
 * مسارات أنماط توليد الصور (نظام editorial)
 *
 * GET  /api/image-styles          — قائمة الأنماط المفعّلة للمحرر (بدون برومبتات)
 * GET  /api/admin/image-styles    — الإعدادات الكاملة للإدارة
 * PUT  /api/admin/image-styles    — حفظ الإعدادات (تحقق Zod كامل)
 *
 * الإدارة خلف system.manage_settings — نفس حارس بقية إعدادات النظام.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import {
  getImageStyleSettings,
  saveImageStyleSettings,
  listEditorImageStyles,
} from "../services/imageStyleService";

const router = Router();

router.get("/api/image-styles", requireAuth, async (_req: Request, res: Response) => {
  try {
    const result = await listEditorImageStyles();
    res.json(result);
  } catch (error: any) {
    console.error("[Image Styles] List error:", error);
    res.status(500).json({ message: "خطأ في جلب أنماط توليد الصور", error: error.message });
  }
});

router.get(
  "/api/admin/image-styles",
  requireAuth,
  requirePermission(PERMISSION_CODES.SYSTEM_MANAGE_SETTINGS),
  async (_req: Request, res: Response) => {
    try {
      const settings = await getImageStyleSettings();
      res.json(settings);
    } catch (error: any) {
      console.error("[Image Styles] Admin get error:", error);
      res.status(500).json({ message: "خطأ في جلب إعدادات الأنماط", error: error.message });
    }
  }
);

router.put(
  "/api/admin/image-styles",
  requireAuth,
  requirePermission(PERMISSION_CODES.SYSTEM_MANAGE_SETTINGS),
  async (req: Request, res: Response) => {
    try {
      const saved = await saveImageStyleSettings(req.body);
      res.json({ message: "تم حفظ أنماط توليد الصور", settings: saved });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "بيانات الأنماط غير صحيحة", errors: error.errors });
      }
      console.error("[Image Styles] Save error:", error);
      res.status(500).json({ message: "خطأ في حفظ إعدادات الأنماط", error: error.message });
    }
  }
);

export default router;
