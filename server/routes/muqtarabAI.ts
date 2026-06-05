/**
 * مُقترب — مسارات مساعد الكاتب الذكي (angle_writer فقط، مصادقة مطلوبة).
 *
 *   POST /api/muqtarab/my-angle/ai/suggest-titles   اقتراح 3 عناوين
 *   POST /api/muqtarab/my-angle/ai/proofread        تدقيق لغوي
 *   POST /api/muqtarab/my-angle/ai/suggest-excerpt  وصف مختصر
 */
import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { requireAuth } from "../rbac";
import { db } from "../db";
import { angles } from "@shared/schema";
import { suggestTitles, proofreadContent, suggestExcerpt } from "../services/muqtarabAI";

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

export default router;
