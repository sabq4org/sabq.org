import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { requireAuth, requirePermission } from "../rbac";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import {
  approveNewsletterEditorialDraft,
  createNewsletterEditorialDraft,
  getNewsletterEditorialApproveInput,
  getNewsletterEditorialDraft,
  getVerifiedNewsletterEditorialHtml,
  getNewsletterEditorialManifest,
  listNewsletterEditorialDrafts,
  newsletterEditorialEditSchema,
  validateNewsletterEditorialSources,
  updateNewsletterEditorialDraft,
} from "../services/newsletterEditorialService";

const router = Router();
const editorialDraftLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  message: { message: "تم تجاوز حد إنشاء المسودات؛ حاول لاحقًا" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req.user as { id?: string } | undefined)?.id || cfKeyGenerator(req)),
  validate: cfValidate,
});

function actorId(req: { user?: unknown }): string {
  const user = req.user as { id?: unknown } | undefined;
  return typeof user?.id === "string" ? user.id : "";
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

router.use(
  "/api/newsletter/editorial",
  (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  },
  requireAuth,
  requirePermission("articles.publish"),
);

const createSchema = z.object({
  type: z.enum(["daily", "weekly"]),
  articleIds: z.array(z.string().min(1)).max(20).optional(),
  title: z.string().trim().max(180).optional(),
  description: z.string().trim().max(240).optional(),
});

router.get("/api/newsletter/editorial", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const records = await listNewsletterEditorialDrafts(limit);
    res.json(records.map((record) => ({
      id: record.id,
      title: record.editorial!.title,
      preheader: record.editorial!.preheader,
      type: record.editorial!.type,
      status: record.editorial!.status,
      revision: record.editorial!.revision,
      contentHash: record.editorial!.contentHash,
      approvedHash: record.editorial!.approvedHash,
      approvedAt: record.editorial!.approvedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      sourceCount: record.editorial!.sourceRefs.length,
    })));
  } catch (error) {
    console.error("[NewsletterEditorial] list failed:", error);
    res.status(500).json({ message: "تعذر تحميل مسودات النشرة" });
  }
});

router.get("/api/newsletter/editorial/:id", async (req, res) => {
  try {
    const record = await getNewsletterEditorialDraft(req.params.id);
    if (!record) return res.status(404).json({ message: "المسودة غير موجودة" });
    res.json({
      id: record.newsletter.id,
      title: record.editorial.title,
      preheader: record.editorial.preheader,
      type: record.editorial.type,
      status: record.editorial.status,
      revision: record.editorial.revision,
      contentHash: record.editorial.contentHash,
      approvedHash: record.editorial.approvedHash,
      approvedAt: record.editorial.approvedAt,
      items: record.editorial.items,
      sourceReferences: record.editorial.sourceRefs,
      html: record.editorial.html,
      createdAt: record.newsletter.createdAt,
      updatedAt: record.newsletter.updatedAt,
    });
  } catch (error) {
    console.error("[NewsletterEditorial] detail failed:", error);
    res.status(500).json({ message: "تعذر تحميل المسودة" });
  }
});

router.post("/api/newsletter/editorial/drafts", editorialDraftLimiter, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "بيانات غير صحيحة" });
  try {
    const userId = actorId(req);
    const newsletter = await createNewsletterEditorialDraft({ ...parsed.data, userId });
    const record = await getNewsletterEditorialDraft(newsletter.id);
    res.status(201).json(record ? {
      id: newsletter.id,
      title: record.editorial.title,
      preheader: record.editorial.preheader,
      type: record.editorial.type,
      status: record.editorial.status,
      revision: record.editorial.revision,
      contentHash: record.editorial.contentHash,
      approvedHash: record.editorial.approvedHash,
      approvedAt: record.editorial.approvedAt,
      items: record.editorial.items,
      sourceReferences: record.editorial.sourceRefs,
      html: record.editorial.html,
    } : { id: newsletter.id });
  } catch (error: unknown) {
    console.error("[NewsletterEditorial] create failed:", error);
    res.status(422).json({ message: errorText(error, "تعذر إنشاء المسودة") });
  }
});

router.patch("/api/newsletter/editorial/:id", async (req, res) => {
  const parsed = newsletterEditorialEditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "بيانات غير صحيحة" });
  try {
    const result = await updateNewsletterEditorialDraft(req.params.id, parsed.data, actorId(req));
    if (!result) return res.status(404).json({ message: "المسودة غير موجودة" });
    res.json({ id: result.newsletter.id, ...result.editorial, newsletterUpdatedAt: result.newsletter.updatedAt });
  } catch (error: unknown) {
    if (errorText(error, "") === "NEWSLETTER_EDITORIAL_CONFLICT") return res.status(409).json({ message: "تغيرت المسودة؛ أعد تحميلها قبل الحفظ" });
    if (error instanceof z.ZodError) return res.status(400).json({ message: "بيانات غير صحيحة" });
    console.error("[NewsletterEditorial] update failed:", error);
    res.status(422).json({ message: errorText(error, "تعذر حفظ التعديل") });
  }
});

router.post("/api/newsletter/editorial/:id/approve", async (req, res) => {
  let input: { expectedHash: string };
  try {
    input = getNewsletterEditorialApproveInput(req.body);
  } catch {
    return res.status(400).json({ message: "expectedHash غير صالح" });
  }
  try {
    const result = await approveNewsletterEditorialDraft(req.params.id, input.expectedHash, actorId(req));
    if (!result) return res.status(404).json({ message: "المسودة غير موجودة" });
    res.json({ id: result.newsletter.id, ...result.editorial, newsletterUpdatedAt: result.newsletter.updatedAt });
  } catch (error: unknown) {
    if (errorText(error, "") === "NEWSLETTER_EDITORIAL_CONFLICT") return res.status(409).json({ message: "تغيرت المسودة؛ أعد تحميلها قبل الاعتماد" });
    console.error("[NewsletterEditorial] approve failed:", error);
    res.status(422).json({ message: errorText(error, "تعذر اعتماد المسودة") });
  }
});

router.get("/api/newsletter/editorial/:id/manifest", async (req, res) => {
  try {
    const record = await getNewsletterEditorialDraft(req.params.id);
    if (!record) return res.status(404).json({ message: "المسودة غير موجودة" });
    if (!(await validateNewsletterEditorialSources(record))) return res.status(409).json({ message: "تغير أحد المصادر؛ أعد إنشاء المسودة ومراجعتها", reason: "source_snapshot_changed" });
    res.json(getNewsletterEditorialManifest(record));
  } catch (error) {
    console.error("[NewsletterEditorial] manifest failed:", error);
    res.status(500).json({ message: "تعذر إنشاء manifest" });
  }
});

router.get("/api/newsletter/editorial/:id/export", async (req, res) => {
  try {
    const record = await getNewsletterEditorialDraft(req.params.id);
    if (!record) return res.status(404).json({ message: "المسودة غير موجودة" });
    if (record.editorial.status !== "approved") {
      return res.status(409).json({ message: "لا يمكن تصدير نشرة غير معتمدة", reason: "approval_required" });
    }
    if (record.editorial.approvedHash !== record.editorial.contentHash) {
      return res.status(409).json({ message: "الاعتماد لا يطابق محتوى النشرة الحالي", reason: "approval_hash_mismatch" });
    }
    if (!(await validateNewsletterEditorialSources(record))) {
      return res.status(409).json({ message: "تغير أحد المصادر؛ أعد إنشاء المسودة ومراجعتها", reason: "source_snapshot_changed" });
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sabq-newsletter-${record.newsletter.id}.html"`);
    res.send(getVerifiedNewsletterEditorialHtml(record.editorial));
  } catch (error) {
    console.error("[NewsletterEditorial] export failed:", error);
    res.status(409).json({ message: "تعذر تصدير HTML؛ أعد تحميل المسودة والتحقق من الاعتماد", reason: "export_validation_failed" });
  }
});

export default router;
