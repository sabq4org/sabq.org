import { Router, type Request } from "express";
import { z } from "zod";
import { getUserPermissions, requireAuth } from "../rbac";
import {
  addPublisherMemberByEmail,
  createPublisherMember,
  getPortalArticle,
  getPortalArticles,
  getPortalOverview,
  listPublisherMembers,
  removePublisherMember,
  requestArticleChanges,
  resolvePublisherForUser,
  runPublisherDailyAlerts,
  sendPublisherMonthlyReports,
  submitPortalArticle,
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

router.get("/api/publisher/portal/articles/:id", async (req, res) => {
  try {
    const article = await getPortalArticle(requestUserId(req), req.params.id);
    if (!article) return res.status(404).json({ message: "المادة غير موجودة" });
    res.json(article);
  } catch (error) {
    console.error("[Publisher Portal] article fetch failed:", error);
    res.status(500).json({ message: "تعذر جلب المادة" });
  }
});

// إرسال للمراجعة — أو نشر فوري إذا كان الناشر موثوقاً (auto_publish)
router.post("/api/publisher/portal/articles/:id/submit", async (req, res) => {
  try {
    const result = await submitPortalArticle(requestUserId(req), req.params.id);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message, code: result.code });
    }
    res.json({ message: result.message, published: result.published });
  } catch (error) {
    console.error("[Publisher Portal] submit failed:", error);
    res.status(500).json({ message: "تعذر إرسال المادة" });
  }
});

// إجراء إداري: إعادة مادة الناشر بملاحظات («تحتاج تعديلات») بدل الرفض النهائي.
// خارج بادئة /api/publisher/portal عمداً — لا يمر بحارس ملكية الناشر.
const requestChangesSchema = z.object({
  notes: z.string().trim().min(5, "الملاحظات مطلوبة (٥ أحرف على الأقل)").max(2000),
});

/** حارس صلاحيات إدارة الناشرين للمسارات الإدارية في هذه الوحدة */
async function requirePublisherManagement(req: Request, res: any, next: () => void) {
  try {
    const permissions = await getUserPermissions((req.user as { id: string }).id);
    if (!permissions.includes("publishers.manage") && !permissions.includes("articles.review")) {
      return res.status(403).json({ message: "ليست لديك صلاحية إدارة الناشرين" });
    }
    next();
  } catch (error) {
    console.error("[Publisher Portal] permission check failed:", error);
    res.status(500).json({ message: "تعذر التحقق من الصلاحيات" });
  }
}

router.post(
  "/api/admin/publishers/articles/:id/request-changes",
  requireAuth,
  requirePublisherManagement,
  async (req, res) => {
    try {
      const parsed = requestChangesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
      }

      const result = await requestArticleChanges(
        req.params.id,
        (req.user as { id: string }).id,
        parsed.data.notes,
      );
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json({ message: result.message });
    } catch (error) {
      console.error("[Publisher Portal] request-changes failed:", error);
      res.status(500).json({ message: "تعذر إعادة المادة للناشر" });
    }
  },
);

// ============================================
// إدارة مستخدمي الوكالة (إداري)
// ============================================

router.get(
  "/api/admin/publishers/:id/members",
  requireAuth,
  requirePublisherManagement,
  async (req, res) => {
    try {
      const members = await listPublisherMembers(req.params.id);
      if (!members) return res.status(404).json({ message: "الوكالة غير موجودة" });
      res.json({ members });
    } catch (error) {
      console.error("[Publisher Portal] members list failed:", error);
      res.status(500).json({ message: "تعذر جلب مستخدمي الوكالة" });
    }
  },
);

const addMemberSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("link"),
    email: z.string().email("البريد الإلكتروني غير صحيح"),
  }),
  z.object({
    mode: z.literal("create"),
    email: z.string().email("البريد الإلكتروني غير صحيح"),
    password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل"),
    firstName: z.string().trim().min(2, "الاسم الأول مطلوب"),
    lastName: z.string().trim().min(2, "اسم العائلة مطلوب"),
  }),
]);

router.post(
  "/api/admin/publishers/:id/members",
  requireAuth,
  requirePublisherManagement,
  async (req, res) => {
    try {
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
      }

      const result = parsed.data.mode === "link"
        ? await addPublisherMemberByEmail(req.params.id, parsed.data.email)
        : await createPublisherMember(req.params.id, parsed.data);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.status(201).json({ message: result.message });
    } catch (error) {
      console.error("[Publisher Portal] add member failed:", error);
      res.status(500).json({ message: "تعذر إضافة المستخدم للوكالة" });
    }
  },
);

router.delete(
  "/api/admin/publishers/:id/members/:userId",
  requireAuth,
  requirePublisherManagement,
  async (req, res) => {
    try {
      const result = await removePublisherMember(req.params.id, req.params.userId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json({ message: result.message });
    } catch (error) {
      console.error("[Publisher Portal] remove member failed:", error);
      res.status(500).json({ message: "تعذر فك ربط المستخدم" });
    }
  },
);

// تشغيل يدوي للتنبيهات/التقارير (للاختبار والتشغيل الفوري من الإدارة).
// منع التكرار مدمج في المحرك نفسه، فالاستدعاء المتكرر آمن.
router.post(
  "/api/admin/publishers/alerts/run",
  requireAuth,
  requirePublisherManagement,
  async (_req, res) => {
    try {
      res.json(await runPublisherDailyAlerts());
    } catch (error) {
      console.error("[Publisher Portal] manual alerts run failed:", error);
      res.status(500).json({ message: "تعذر تشغيل التنبيهات" });
    }
  },
);

router.post(
  "/api/admin/publishers/monthly-reports/run",
  requireAuth,
  requirePublisherManagement,
  async (_req, res) => {
    try {
      res.json(await sendPublisherMonthlyReports());
    } catch (error) {
      console.error("[Publisher Portal] manual monthly reports failed:", error);
      res.status(500).json({ message: "تعذر إرسال التقارير الشهرية" });
    }
  },
);

export default router;
