// كتالوج الأنظمة — /api/admin/systems-catalog/*
// محمي بـ system.manage_settings (نفس أدوات الإدارة).
// ملتزم بـ ADR-001: لا استيراد db هنا.

import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import {
  getSystemById,
  getSystemsCatalog,
} from "../services/systemsCatalogService";

const router = Router();

router.use("/api/admin/systems-catalog", requireAuth);

router.get(
  "/api/admin/systems-catalog",
  requirePermission("system.manage_settings"),
  async (_req, res) => {
    try {
      res.json(await getSystemsCatalog());
    } catch (err) {
      const message = (err as Error).message;
      if (message === "systems_registry_missing") {
        return res.status(503).json({ message: "سجل الأنظمة غير متوفر على الخادم" });
      }
      console.error("[SystemsCatalog] list failed:", err);
      res.status(500).json({ message: "تعذر تحميل كتالوج الأنظمة" });
    }
  },
);

router.get(
  "/api/admin/systems-catalog/:id",
  requirePermission("system.manage_settings"),
  async (req, res) => {
    try {
      const entry = await getSystemById(req.params.id);
      if (!entry) {
        return res.status(404).json({ message: "نظام غير معروف" });
      }
      res.json(entry);
    } catch (err) {
      console.error("[SystemsCatalog] detail failed:", err);
      res.status(500).json({ message: "تعذر تحميل تفاصيل النظام" });
    }
  },
);

export const systemsCatalogRouter = router;
export default router;
