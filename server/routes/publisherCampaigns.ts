import { Router, type NextFunction, type Request, type Response } from "express";
import { getUserPermissions, requireAuth } from "../rbac";
import { resolvePublisherForUser } from "../services/publisherPortalService";
import {
  addCampaignArticles,
  createCampaign,
  getAdminActionQueue,
  getArticleCampaignIds,
  getCampaignReport,
  getPortalActionItems,
  listActiveCampaignsAdmin,
  listPortalCampaigns,
  removeCampaignArticle,
  updateCampaign,
} from "../services/publisherCampaignService";
import {
  campaignArticlesInputSchema,
  campaignInputSchema,
  campaignUpdateSchema,
} from "@shared/publisherCampaigns";
import type { Publisher } from "@shared/schema";

/**
 * ملف الحملة للوكالات (بوابة الناشر) وقائمة العمل في لوحة إدارة الناشرين.
 * المنطق في server/services/publisherCampaignService.ts.
 */
const router = Router();
const userIdOf = (req: Request) => (req.user as { id: string }).id;
const publisherOf = (req: Request) => (req as Request & { publisher: Publisher }).publisher;

async function requirePortalPublisher(req: Request, res: Response, next: NextFunction) {
  try {
    const publisher = await resolvePublisherForUser(userIdOf(req));
    if (!publisher) return res.status(404).json({ message: "لم يتم العثور على حساب ناشر مرتبط بهذا المستخدم" });
    if (!publisher.isActive) {
      return res.status(403).json({ message: "حساب الوكالة معلق حالياً. يرجى التواصل مع إدارة سبق.", code: "SUSPENDED" });
    }
    (req as Request & { publisher: Publisher }).publisher = publisher;
    next();
  } catch (error) {
    console.error("[Publisher Campaigns] resolve failed:", error);
    res.status(500).json({ message: "تعذر التحقق من حساب الناشر" });
  }
}

async function requirePublisherManagement(req: Request, res: Response, next: NextFunction) {
  try {
    const permissions = await getUserPermissions(userIdOf(req));
    if (!permissions.includes("publishers.manage") && !permissions.includes("articles.review")) {
      return res.status(403).json({ message: "ليست لديك صلاحية إدارة الناشرين" });
    }
    next();
  } catch (error) {
    console.error("[Publisher Campaigns] permission check failed:", error);
    res.status(500).json({ message: "تعذر التحقق من الصلاحيات" });
  }
}

/** جدول غير موجود بعد على قاعدة ما (42P01) أو بلا صلاحية (42501): رسالة واضحة بدل 500 مبهم. */
function failWith(res: Response, error: unknown, message: string) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code
    ?? (error as { cause?: { code?: string } })?.cause?.code;
  const status = (error as { status?: number })?.status;
  if (status === 400) return res.status(400).json({ message: (error as Error).message });
  if (code === "42P01" || code === "42501") {
    return res.status(503).json({ message: "ميزة الحملات لم تُفعّل بعد على هذه القاعدة", code: "CAMPAIGNS_NOT_READY" });
  }
  console.error(`[Publisher Campaigns] ${message}:`, error);
  return res.status(500).json({ message });
}

const portal = [requireAuth, requirePortalPublisher];
const admin = [requireAuth, requirePublisherManagement];

// ============================================
// بوابة الناشر
// ============================================

router.get("/api/publisher/portal/campaigns", ...portal, async (req, res) => {
  try {
    const status = req.query.status === "archived" || req.query.status === "all" ? req.query.status : "active";
    res.json({ campaigns: await listPortalCampaigns(publisherOf(req), status) });
  } catch (error) {
    failWith(res, error, "تعذر تحميل الحملات");
  }
});

router.post("/api/publisher/portal/campaigns", ...portal, async (req, res) => {
  const parsed = campaignInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" });
  try {
    res.status(201).json(await createCampaign(publisherOf(req), userIdOf(req), parsed.data));
  } catch (error) {
    failWith(res, error, "تعذر إنشاء الحملة");
  }
});

router.get("/api/publisher/portal/campaigns/:id", ...portal, async (req, res) => {
  try {
    const report = await getCampaignReport(req.params.id, publisherOf(req).id);
    if (!report) return res.status(404).json({ message: "الحملة غير موجودة" });
    res.json(report);
  } catch (error) {
    failWith(res, error, "تعذر تحميل ملف الحملة");
  }
});

router.patch("/api/publisher/portal/campaigns/:id", ...portal, async (req, res) => {
  const parsed = campaignUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" });
  try {
    const row = await updateCampaign(publisherOf(req), req.params.id, parsed.data);
    if (!row) return res.status(404).json({ message: "الحملة غير موجودة" });
    res.json(row);
  } catch (error) {
    failWith(res, error, "تعذر حفظ الحملة");
  }
});

router.post("/api/publisher/portal/campaigns/:id/articles", ...portal, async (req, res) => {
  const parsed = campaignArticlesInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "اختر خبرًا واحدًا على الأقل" });
  try {
    const result = await addCampaignArticles(publisherOf(req), req.params.id, parsed.data.articleIds, userIdOf(req));
    if (!result) return res.status(404).json({ message: "الحملة غير موجودة" });
    res.json(result);
  } catch (error) {
    failWith(res, error, "تعذر إضافة الأخبار");
  }
});

router.delete("/api/publisher/portal/campaigns/:id/articles/:articleId", ...portal, async (req, res) => {
  try {
    const result = await removeCampaignArticle(publisherOf(req), req.params.id, req.params.articleId);
    if (!result) return res.status(404).json({ message: "الحملة غير موجودة" });
    res.json(result);
  } catch (error) {
    failWith(res, error, "تعذر إزالة الخبر من الحملة");
  }
});

router.get("/api/publisher/portal/articles/:id/campaigns", ...portal, async (req, res) => {
  try {
    res.json({ campaignIds: await getArticleCampaignIds(publisherOf(req), req.params.id) });
  } catch (error) {
    failWith(res, error, "تعذر تحميل حملات الخبر");
  }
});

router.get("/api/publisher/portal/action-items", ...portal, async (req, res) => {
  try {
    res.json(await getPortalActionItems(publisherOf(req)));
  } catch (error) {
    failWith(res, error, "تعذر تحميل ما ينتظر إجراءك");
  }
});

// ============================================
// لوحة إدارة الناشرين
// ============================================

router.get("/api/admin/publishers/action-queue", ...admin, async (_req, res) => {
  try {
    res.json(await getAdminActionQueue());
  } catch (error) {
    failWith(res, error, "تعذر تحميل قائمة العمل");
  }
});

router.get("/api/admin/publishers/campaigns", ...admin, async (_req, res) => {
  try {
    res.json({ campaigns: await listActiveCampaignsAdmin() });
  } catch (error) {
    failWith(res, error, "تعذر تحميل الحملات");
  }
});

router.get("/api/admin/publishers/campaigns/:id", ...admin, async (req, res) => {
  try {
    const report = await getCampaignReport(req.params.id, null);
    if (!report) return res.status(404).json({ message: "الحملة غير موجودة" });
    res.json(report);
  } catch (error) {
    failWith(res, error, "تعذر تحميل تقرير الحملة");
  }
});

export default router;
