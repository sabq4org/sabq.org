import { Router, type Request } from "express";
import { z } from "zod";
import { getUserPermissions, requireAuth } from "../rbac";
import {
  addPublisherMemberByEmail,
  closePublisherRequest,
  createGuideSection,
  createPublisherMember,
  createPublisherRequest,
  deleteGuideSection,
  deletePortalArticle,
  getPortalArticle,
  getPortalArticles,
  getPortalCreditLogs,
  getPortalCreditPackages,
  getPortalOverview,
  getPublishedGuideSections,
  listAgencyReviewQueue,
  listGuideSectionsAdmin,
  listOpenPublisherRequests,
  listPublisherMembers,
  listPublishersRich,
  removePublisherMember,
  requestArticleChanges,
  resolvePublisherForUser,
  runPublisherDailyAlerts,
  sendPublisherMonthlyReports,
  submitPortalArticle,
  updateGuideSection,
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
    // وكالة معلقة = البوابة محجوبة عن كل أعضائها (مالكاً وموظفين)
    if (!publisher.isActive) {
      return res.status(403).json({
        message: "حساب الوكالة معلق حالياً. يرجى التواصل مع إدارة سبق.",
        code: "SUSPENDED",
      });
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

const creditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
});

router.get("/api/publisher/portal/credit-logs", async (req, res) => {
  try {
    const query = creditLogsQuerySchema.parse(req.query);
    res.json(await getPortalCreditLogs((req as any).publisher, query));
  } catch (error) {
    console.error("[Publisher Portal] credit logs failed:", error);
    res.status(500).json({ message: "تعذر جلب سجل الرصيد" });
  }
});

router.get("/api/publisher/portal/credit-packages", async (req, res) => {
  try {
    res.json(await getPortalCreditPackages((req as any).publisher));
  } catch (error) {
    console.error("[Publisher Portal] credit packages failed:", error);
    res.status(500).json({ message: "تعذر جلب باقات الرصيد" });
  }
});

router.get("/api/publisher/portal/articles/:id", async (req, res) => {
  try {
    const article = await getPortalArticle(
      requestUserId(req),
      req.params.id,
      (req as any).publisher,
    );
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

router.delete("/api/publisher/portal/articles/:id", async (req, res) => {
  try {
    const result = await deletePortalArticle(
      requestUserId(req),
      req.params.id,
      (req as any).publisher,
    );
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.json({ message: result.message });
  } catch (error) {
    console.error("[Publisher Portal] delete failed:", error);
    res.status(500).json({ message: "تعذر حذف المادة" });
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

// ============================================
// دليل الناشر
// ============================================

router.get("/api/publisher/portal/guide", async (_req, res) => {
  try {
    res.json({ sections: await getPublishedGuideSections() });
  } catch (error) {
    console.error("[Publisher Portal] guide failed:", error);
    res.status(500).json({ message: "تعذر جلب دليل الناشر" });
  }
});

const guideSectionSchema = z.object({
  title: z.string().trim().min(2, "العنوان مطلوب"),
  content: z.string().trim().min(10, "المحتوى مطلوب (10 أحرف على الأقل)"),
  displayOrder: z.coerce.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
});

router.get("/api/admin/publishers/guide", requireAuth, requirePublisherManagement, async (_req, res) => {
  try {
    res.json({ sections: await listGuideSectionsAdmin() });
  } catch (error) {
    console.error("[Publisher Portal] admin guide list failed:", error);
    res.status(500).json({ message: "تعذر جلب أقسام الدليل" });
  }
});

router.post("/api/admin/publishers/guide", requireAuth, requirePublisherManagement, async (req, res) => {
  try {
    const parsed = guideSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
    }
    const section = await createGuideSection((req.user as { id: string }).id, parsed.data);
    res.status(201).json(section);
  } catch (error) {
    console.error("[Publisher Portal] guide create failed:", error);
    res.status(500).json({ message: "تعذر إضافة القسم" });
  }
});

router.patch("/api/admin/publishers/guide/:id", requireAuth, requirePublisherManagement, async (req, res) => {
  try {
    const parsed = guideSectionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
    }
    const section = await updateGuideSection((req.user as { id: string }).id, req.params.id, parsed.data);
    if (!section) return res.status(404).json({ message: "القسم غير موجود" });
    res.json(section);
  } catch (error) {
    console.error("[Publisher Portal] guide update failed:", error);
    res.status(500).json({ message: "تعذر تحديث القسم" });
  }
});

router.delete("/api/admin/publishers/guide/:id", requireAuth, requirePublisherManagement, async (req, res) => {
  try {
    const deleted = await deleteGuideSection(req.params.id);
    if (!deleted) return res.status(404).json({ message: "القسم غير موجود" });
    res.json({ message: "حُذف القسم" });
  } catch (error) {
    console.error("[Publisher Portal] guide delete failed:", error);
    res.status(500).json({ message: "تعذر حذف القسم" });
  }
});

// ============================================
// طلبات الناشرين (تجديد الباقة ...)
// ============================================

const portalRequestSchema = z.object({
  type: z.enum(["renewal", "window_extension", "other"]).optional(),
  message: z.string().trim().max(1000).optional(),
});

router.post("/api/publisher/portal/requests", async (req, res) => {
  try {
    const parsed = portalRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
    }
    const result = await createPublisherRequest(
      (req as any).publisher,
      requestUserId(req),
      parsed.data,
    );
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.status(201).json({ message: result.message });
  } catch (error) {
    console.error("[Publisher Portal] request create failed:", error);
    res.status(500).json({ message: "تعذر إرسال الطلب" });
  }
});

router.get("/api/admin/publishers/requests", requireAuth, requirePublisherManagement, async (_req, res) => {
  try {
    res.json({ requests: await listOpenPublisherRequests() });
  } catch (error) {
    console.error("[Publisher Portal] requests list failed:", error);
    res.status(500).json({ message: "تعذر جلب الطلبات" });
  }
});

router.post("/api/admin/publishers/requests/:id/close", requireAuth, requirePublisherManagement, async (req, res) => {
  try {
    const closed = await closePublisherRequest(req.params.id, (req.user as { id: string }).id);
    if (!closed) return res.status(404).json({ message: "الطلب غير موجود أو مغلق بالفعل" });
    res.json({ message: "أُغلق الطلب" });
  } catch (error) {
    console.error("[Publisher Portal] request close failed:", error);
    res.status(500).json({ message: "تعذر إغلاق الطلب" });
  }
});

// ============================================
// قائمة الناشرين الغنية (بطاقات الإدارة)
// ============================================

// طابور مراجعة مواد الوكالات — GET كان مفقوداً كلياً (الواجهة كانت
// تسقط على مسار /:id القديم). المعلقة الأقدم إرسالاً أولاً (SLA).
router.get("/api/admin/publishers/articles", requireAuth, requirePublisherManagement, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    res.json(await listAgencyReviewQueue({ page, limit, status: req.query.status as string | undefined }));
  } catch (error) {
    console.error("[Publisher Portal] review queue failed:", error);
    res.status(500).json({ message: "تعذر جلب طابور المراجعة" });
  }
});

router.get("/api/admin/publishers/rich-list", requireAuth, requirePublisherManagement, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit as string) || 24));
    const isActive = req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined;
    res.json(await listPublishersRich({ page, limit, isActive }));
  } catch (error) {
    console.error("[Publisher Portal] rich list failed:", error);
    res.status(500).json({ message: "تعذر جلب قائمة الناشرين" });
  }
});

export default router;
