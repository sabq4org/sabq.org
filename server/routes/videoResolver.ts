import { Router } from "express";
import { z } from "zod";
import { resolveVideoUrl } from "../services/videoResolverService";
import { requireAuth } from "../rbac";

const router = Router();

const resolveSchema = z.object({
  url: z.string().min(1),
});

router.post("/api/video/resolve", requireAuth, async (req, res) => {
  try {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "رابط الفيديو مطلوب" });
    }

    const info = await resolveVideoUrl(parsed.data.url);
    res.json(info);
  } catch (error: any) {
    console.error("[VideoResolver] Failed to resolve video:", error);
    res.status(500).json({ message: "تعذر معالجة رابط الفيديو" });
  }
});

export default router;
