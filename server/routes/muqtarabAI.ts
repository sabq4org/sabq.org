/**
 * مُقترب — مسارات مساعد الكاتب الذكي (angle_writer فقط، مصادقة مطلوبة).
 *
 *   POST /api/muqtarab/my-angle/ai/suggest-titles   اقتراح 3 عناوين
 *   POST /api/muqtarab/my-angle/ai/proofread        تدقيق لغوي
 *   POST /api/muqtarab/my-angle/ai/suggest-excerpt  وصف مختصر
 */
import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { requireAuth, requirePermission, requireRole } from "../rbac";
import { db } from "../db";
import { angles } from "@shared/schema";
import { storage } from "../storage";
import {
  suggestTitles,
  proofreadContent,
  suggestExcerpt,
  suggestSeo,
  generateTopicHero,
  assistReview,
  classifySubmission,
} from "../services/muqtarabAI";

const router = Router();

async function getOwnedAngle(userId: string) {
  const [angle] = await db
    .select()
    .from(angles)
    .where(eq(angles.managerUserId, userId))
    .orderBy(asc(angles.createdAt))
    .limit(1);
  return angle;
}

async function requireOwnedAngle(req: any, res: any): Promise<boolean> {
  const angle = await getOwnedAngle(req.user.id);
  if (!angle) {
    res.status(404).json({ message: "لا توجد زاوية مخصّصة لحسابك" });
    return false;
  }
  return true;
}

router.post("/api/muqtarab/my-angle/ai/suggest-titles", requireAuth, async (req: any, res) => {
  try {
    if (!(await requireOwnedAngle(req, res))) return;

    const content = String(req.body?.content || "");
    const currentTitle = req.body?.currentTitle ? String(req.body.currentTitle) : undefined;

    const result = await suggestTitles({ content, currentTitle });
    res.json(result);
  } catch (err) {
    console.error("[muqtarab-ai] suggest-titles:", err);
    res.status(400).json({
      message: err instanceof Error ? err.message : "فشل في اقتراح العناوين",
    });
  }
});

router.post("/api/muqtarab/my-angle/ai/proofread", requireAuth, async (req: any, res) => {
  try {
    if (!(await requireOwnedAngle(req, res))) return;

    const content = String(req.body?.content || "");
    const title = req.body?.title ? String(req.body.title) : undefined;

    const result = await proofreadContent({ content, title });
    res.json(result);
  } catch (err) {
    console.error("[muqtarab-ai] proofread:", err);
    res.status(400).json({
      message: err instanceof Error ? err.message : "فشل في التدقيق اللغوي",
    });
  }
});

router.post("/api/muqtarab/my-angle/ai/suggest-excerpt", requireAuth, async (req: any, res) => {
  try {
    if (!(await requireOwnedAngle(req, res))) return;

    const content = String(req.body?.content || "");
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "العنوان مطلوب" });

    const result = await suggestExcerpt({ content, title });
    res.json(result);
  } catch (err) {
    console.error("[muqtarab-ai] suggest-excerpt:", err);
    res.status(400).json({
      message: err instanceof Error ? err.message : "فشل في توليد الوصف",
    });
  }
});

router.post("/api/muqtarab/my-angle/ai/seo", requireAuth, async (req: any, res) => {
  try {
    if (!(await requireOwnedAngle(req, res))) return;

    const content = String(req.body?.content || "");
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "العنوان مطلوب" });

    const result = await suggestSeo({ content, title });
    res.json(result);
  } catch (err) {
    console.error("[muqtarab-ai] seo:", err);
    res.status(400).json({
      message: err instanceof Error ? err.message : "فشل في اقتراح بيانات SEO",
    });
  }
});

// ============================================================
// توليد صورة الغلاف بالذكاء الاصطناعي — مسؤول النظام فقط
// ============================================================

router.post(
  "/api/admin/muqtarab/ai/generate-hero",
  requireAuth,
  requireRole("system_admin"),
  async (req: any, res) => {
    try {
      const title = String(req.body?.title || "").trim();
      if (!title) return res.status(400).json({ message: "العنوان مطلوب" });

      const excerpt = req.body?.excerpt ? String(req.body.excerpt) : undefined;
      const content = req.body?.content ? String(req.body.content) : undefined;

      const result = await generateTopicHero({ title, excerpt, content });
      res.json(result);
    } catch (err) {
      console.error("[muqtarab-ai] generate-hero:", err);
      res.status(400).json({
        message: err instanceof Error ? err.message : "فشل في توليد صورة الغلاف",
      });
    }
  },
);

// ============================================================
// مساعد الإدارة (muqtarab.manage)
// ============================================================

router.post(
  "/api/admin/muqtarab/topics/:id/ai/review-assist",
  requirePermission("muqtarab.manage"),
  async (req: any, res) => {
    try {
      const topic = await storage.getTopicById(req.params.id);
      if (!topic) return res.status(404).json({ message: "الموضوع غير موجود" });

      const content = topic.content?.rawHtml || topic.content?.plainText || "";
      const result = await assistReview({ title: topic.title, content });
      res.json(result);
    } catch (err) {
      console.error("[muqtarab-ai] review-assist:", err);
      res.status(400).json({
        message: err instanceof Error ? err.message : "فشل في مساعدة المراجعة",
      });
    }
  },
);

router.post(
  "/api/admin/muqtarab/ai/classify",
  requirePermission("muqtarab.manage"),
  async (req: any, res) => {
    try {
      const text = String(req.body?.text || "");
      const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
      if (categories.length === 0) {
        return res.status(400).json({ message: "قائمة التصنيفات مطلوبة" });
      }

      const result = await classifySubmission({ text, categories });
      res.json(result);
    } catch (err) {
      console.error("[muqtarab-ai] classify:", err);
      res.status(400).json({
        message: err instanceof Error ? err.message : "فشل في التصنيف الذكي",
      });
    }
  },
);

export default router;
