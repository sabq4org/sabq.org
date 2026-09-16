import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { editorialImageRequestSchema } from "@shared/editorialImages";
import { areOpenAIImagesConfigured, safeImageError } from "../services/openaiImagesProvider";
import { createEditorialImageJob, getEditorialImageJob, runEditorialImageJob } from "../services/editorialImagesService";

const router = Router();
router.use("/api/editorial-images", (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); }, requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_GENERATE_IMAGES));

router.get("/api/editorial-images/capabilities", (_req, res) => {
  res.json({ configured: areOpenAIImagesConfigured() });
});

router.post("/api/editorial-images/generations", async (req, res) => {
  const parsed = editorialImageRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "راجع وصف الصورة والنموذج والمقاس والجودة." });
  const userId = (req.user as { id: string }).id;
  try {
    const { job, created } = await createEditorialImageJob(userId, parsed.data);
    res.status(job.status === "processing" ? 202 : 200).json(job);
    if (created) {
      // The response is sent before any paid call; the client polls persisted state.
      void runEditorialImageJob(userId, parsed.data).catch(() => {
        // A DB outage can also prevent failure persistence. Polling expires the job.
        console.warn("[editor-openai-images] could not persist job outcome", { generationId: job.id });
      });
    }
  } catch (error) {
    const safe = safeImageError(error);
    res.status(safe.status).json({ message: safe.message, code: safe.code });
  }
});

router.get("/api/editorial-images/generations/:id", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ message: "معرّف العملية غير صالح." });
  try {
    const job = await getEditorialImageJob((req.user as { id: string }).id, req.params.id);
    if (!job) return res.status(404).json({ message: "عملية التوليد غير موجودة." });
    res.json(job);
  } catch {
    res.status(503).json({ message: "تعذر جلب حالة الصورة. حاول التحديث مجددًا." });
  }
});

export default router;
