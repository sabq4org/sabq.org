import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { infographicStudioRequestSchema } from "@shared/infographicStudio";
import {
  createInfographicStudioJob,
  getInfographicStudioJob,
  InfographicStudioError,
  isInfographicStudioConfigured,
  runInfographicStudioJob,
} from "../services/infographicStudio/service";

// «إنفو للموقع»: the editor sends the story, the server answers 202 at once and the client polls.
const router = Router();
router.use(
  "/api/infographic-studio",
  (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  },
  requireAuth,
  requirePermission(PERMISSION_CODES.ARTICLES_INFOGRAPHICS),
);

router.get("/api/infographic-studio/capabilities", (_req, res) => {
  res.json({ configured: isInfographicStudioConfigured() });
});

router.post("/api/infographic-studio/jobs", async (req, res) => {
  const parsed = infographicStudioRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "راجع عنوان الخبر ونصه." });
  const userId = (req.user as { id: string }).id;
  try {
    const { job, created } = await createInfographicStudioJob(userId, parsed.data);
    res.status(job.status === "processing" ? 202 : 200).json(job);
    if (created) {
      void runInfographicStudioJob(userId, parsed.data).catch(() => {
        console.warn("[infographic-studio] could not persist job outcome", { generationId: job.id });
      });
    }
  } catch (error) {
    if (error instanceof InfographicStudioError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error("[infographic-studio] create failed", (error as Error)?.message);
    res.status(503).json({ message: "تعذر بدء الإنفوجرافيك. حاول مجددًا." });
  }
});

router.get("/api/infographic-studio/jobs/:id", async (req, res) => {
  if (!z.string().guid().safeParse(req.params.id).success) return res.status(400).json({ message: "معرّف العملية غير صالح." });
  try {
    const job = await getInfographicStudioJob((req.user as { id: string }).id, req.params.id);
    if (!job) return res.status(404).json({ message: "العملية غير موجودة." });
    res.json(job);
  } catch {
    res.status(503).json({ message: "تعذر جلب حالة الإنفوجرافيك. حاول التحديث مجددًا." });
  }
});

export default router;
