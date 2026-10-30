import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import {
  loadEnAutoTranslateSettings,
  runEnAutoTranslate,
  saveEnAutoTranslateSettings,
} from "../services/enAutoTranslateService";

/** إعداد الترجمة الآلية للنسخة الإنجليزية + معاينة الاختيار دون نشر. */
const router = Router();
const base = "/api/admin/en-auto-translate";

router.use(base, (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); },
  requireAuth, requirePermission("articles.publish"));

router.get(`${base}/settings`, async (_req, res) => {
  try {
    res.json({ settings: await loadEnAutoTranslateSettings() });
  } catch (error) {
    console.error("[EN Auto Translate] load settings failed:", error);
    res.status(500).json({ message: "تعذّر قراءة الإعداد" });
  }
});

router.put(`${base}/settings`, async (req, res) => {
  try {
    res.json({ settings: await saveEnAutoTranslateSettings(req.body) });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ message: "إعداد غير صالح", issues: error.issues });
    console.error("[EN Auto Translate] save settings failed:", error);
    res.status(500).json({ message: "تعذّر حفظ الإعداد" });
  }
});

/** ما الذي ستختاره الدورة الآن ولماذا — لا يترجم ولا ينشر. */
router.post(`${base}/preview`, async (_req, res) => {
  try {
    res.json(await runEnAutoTranslate({ dryRun: true }));
  } catch (error) {
    console.error("[EN Auto Translate] preview failed:", error);
    res.status(500).json({ message: "تعذّرت المعاينة" });
  }
});

export default router;
