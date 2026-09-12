import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../rbac";
import { EDITORIAL_RESEARCH_ROLES, researchRequestSchema } from "@shared/editorialResearch";
import { ResearchError } from "../services/editorialResearchProvider";
import { researchCapabilities, createResearchJob, getResearchJob, listResearchJobs, requestResearchCancellation } from "../services/editorialResearchService";

const router = Router();
const prefix = "/api/editorial-research";
router.use(prefix, (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); }, requireAuth, requireRole(...EDITORIAL_RESEARCH_ROLES));
router.get(`${prefix}/capabilities`, (_req, res) => res.json(researchCapabilities()));
router.get(`${prefix}/jobs`, async (req, res) => {
  try { res.json(await listResearchJobs((req.user as { id: string }).id)); }
  catch { res.status(503).json({ message: "تعذر تحميل مهام البحث. حاول مجددًا." }); }
});
router.post(`${prefix}/jobs`, async (req, res) => {
  const parsed = researchRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "راجع موضوع البحث." });
  try { res.status(202).json(await createResearchJob((req.user as { id: string }).id, parsed.data)); }
  catch (error) {
    const safe = error instanceof ResearchError ? error : new ResearchError(503, "unavailable", "تعذر بدء البحث. حاول مجددًا.");
    res.status(safe.status).json({ code: safe.code, message: safe.message });
  }
});
router.get(`${prefix}/jobs/:id`, async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ message: "معرّف غير صالح." });
  try {
    const job = await getResearchJob((req.user as { id: string }).id, req.params.id);
    if (!job) return res.status(404).json({ message: "المهمة غير موجودة." });
    res.json(job);
  } catch { res.status(503).json({ message: "تعذر تحديث حالة البحث. حاول مجددًا." }); }
});
router.post(`${prefix}/jobs/:id/cancel`, async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ message: "معرّف غير صالح." });
  try {
    const job = await requestResearchCancellation((req.user as { id: string }).id, req.params.id);
    if (!job) return res.status(404).json({ message: "المهمة غير موجودة." });
    res.json(job);
  } catch { res.status(503).json({ message: "تعذر تأكيد طلب الإلغاء. حاول مجددًا." }); }
});
export default router;
