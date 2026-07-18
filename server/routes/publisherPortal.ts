import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth } from "../rbac";
import {
  getPortalArticles,
  getPortalOverview,
  resolvePublisherForUser,
} from "../services/publisherPortalService";

/**
 * بوابة الناشر — الأسطح الجديدة للوحة الوكالة.
 * الحراسة بالملكية: أي مستخدم يملك سجل publishers أو مرتبط عبر
 * linkedPublisherId (لا يُشترط دور publisher حصراً — بعض حسابات الوكالات
 * تحمل دور content_manager تاريخياً).
 */
const router = Router();
const requestUserId = (req: Request) => (req.user as { id: string }).id;

router.use("/api/publisher/portal", requireAuth, async (req, res, next) => {
  try {
    const publisher = await resolvePublisherForUser(requestUserId(req));
    if (!publisher) {
      return res.status(404).json({ message: "لم يتم العثور على حساب ناشر مرتبط بهذا المستخدم" });
    }
    (req as any).publisher = publisher;
    next();
  } catch (error) {
    console.error("[Publisher Portal] resolve failed:", error);
    res.status(500).json({ message: "تعذر التحقق من حساب الناشر" });
  }
});

router.get("/api/publisher/portal/overview", async (req, res) => {
  try {
    const overview = await getPortalOverview(requestUserId(req));
    if (!overview) {
      return res.status(404).json({ message: "لم يتم العثور على حساب الناشر" });
    }
    res.json(overview);
  } catch (error) {
    console.error("[Publisher Portal] overview failed:", error);
    res.status(500).json({ message: "تعذر تجهيز لوحة الناشر" });
  }
});

const articlesQuerySchema = z.object({
  status: z.string().optional(),
  searchQuery: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
});

router.get("/api/publisher/portal/articles", async (req, res) => {
  try {
    const query = articlesQuerySchema.parse(req.query);
    res.json(await getPortalArticles((req as any).publisher, query));
  } catch (error) {
    console.error("[Publisher Portal] articles failed:", error);
    res.status(500).json({ message: "تعذر جلب مواد الناشر" });
  }
});

export default router;
