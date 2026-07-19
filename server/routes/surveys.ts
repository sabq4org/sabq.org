import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requireRole, logActivity } from "../rbac";
import {
  SURVEY_QUESTION_TYPES,
  closeSurvey,
  createSurvey,
  deleteSurvey,
  getPublicSurveyByToken,
  getSurveyInvitationsAdmin,
  getSurveyResults,
  getSurveyWithQuestions,
  listSurveys,
  resolveAudience,
  searchAudienceUsers,
  sendSurvey,
  submitSurveyResponse,
  updateSurvey,
} from "../services/surveyService";
import { generateSurveyAnalysis, getLatestSurveyAnalysis } from "../services/surveyAnalysisService";

const router = Router();
const requestUserId = (req: Request) => (req.user as { id: string }).id;

const questionSchema = z.object({
  type: z.enum(SURVEY_QUESTION_TYPES),
  text: z.string().trim().min(3).max(500),
  hint: z.string().trim().max(300).optional().nullable(),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(200)).max(12).optional().nullable(),
  settings: z.object({
    maxChoices: z.number().int().min(1).max(12).optional(),
    scaleMin: z.number().int().min(0).max(1).optional(),
    scaleMax: z.number().int().min(2).max(10).optional(),
    minLabel: z.string().max(60).optional(),
    maxLabel: z.string().max(60).optional(),
  }).optional().nullable(),
}).refine(
  (question) => !["single", "multi"].includes(question.type) || (question.options?.length ?? 0) >= 2,
  { message: "أسئلة الاختيار تحتاج خيارين على الأقل" },
);

const surveySchema = z.object({
  title: z.string().trim().min(3).max(300),
  purpose: z.string().trim().max(300).optional().nullable(),
  welcomeTitle: z.string().trim().max(300).optional().nullable(),
  welcomeMessage: z.string().trim().max(2000).optional().nullable(),
  thankYouTitle: z.string().trim().max(300).optional().nullable(),
  thankYouMessage: z.string().trim().max(2000).optional().nullable(),
  audienceRoles: z.array(z.string().trim().min(1)).max(20).optional().nullable(),
  audienceUserIds: z.array(z.string().trim().min(1)).max(2000).optional().nullable(),
  channels: z.array(z.enum(["email", "dashboard"])).min(1).default(["email", "dashboard"]),
  showRecipientStats: z.boolean().default(true),
  closesAt: z.coerce.date().optional().nullable(),
  questions: z.array(questionSchema).min(1).max(30),
});

const surveyIdParam = z.string().uuid();

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestUserId,
  message: { message: "وصلت لحد توليد التحليلات مؤقتًا؛ حاول بعد دقائق" },
});

// ============ لوحة التحكم (مسؤولون فقط) ============

router.use("/api/surveys", requireAuth, requireRole("admin"));

router.get("/api/surveys", async (_req, res) => {
  try {
    res.json(await listSurveys());
  } catch (error) {
    console.error("[Surveys] list failed:", error);
    res.status(500).json({ message: "تعذر جلب الاستطلاعات" });
  }
});

router.post("/api/surveys", async (req, res) => {
  const parsed = surveySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || "بيانات الاستطلاع غير مكتملة" });
  }
  try {
    const created = await createSurvey(parsed.data, requestUserId(req));
    await logActivity({
      userId: requestUserId(req),
      action: "survey_created",
      entityType: "survey",
      entityId: created.survey.id,
      newValue: { title: parsed.data.title },
    });
    res.status(201).json(created);
  } catch (error) {
    console.error("[Surveys] create failed:", error);
    res.status(500).json({ message: "تعذر إنشاء الاستطلاع" });
  }
});

router.get("/api/surveys/users/search", async (req, res) => {
  const query = z.string().trim().min(2).max(100).safeParse(req.query.q);
  if (!query.success) return res.json([]);
  const rolesFilter = typeof req.query.roles === "string" && req.query.roles.length > 0 ? req.query.roles.split(",") : undefined;
  try {
    res.json(await searchAudienceUsers(query.data, rolesFilter));
  } catch (error) {
    console.error("[Surveys] user search failed:", error);
    res.status(500).json({ message: "تعذر البحث عن المستخدمين" });
  }
});

router.post("/api/surveys/audience/preview", async (req, res) => {
  const schema = z.object({
    audienceRoles: z.array(z.string()).optional().nullable(),
    audienceUserIds: z.array(z.string()).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "بيانات الجمهور غير صالحة" });
  try {
    const audience = await resolveAudience(parsed.data.audienceRoles, parsed.data.audienceUserIds);
    res.json({ count: audience.length, sample: audience.slice(0, 8) });
  } catch (error) {
    console.error("[Surveys] audience preview failed:", error);
    res.status(500).json({ message: "تعذر حساب الجمهور" });
  }
});

router.get("/api/surveys/:id", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    const data = await getSurveyWithQuestions(parsedId.data);
    if (!data) return res.status(404).json({ message: "الاستطلاع غير موجود" });
    res.json(data);
  } catch (error) {
    console.error("[Surveys] get failed:", error);
    res.status(500).json({ message: "تعذر جلب الاستطلاع" });
  }
});

router.patch("/api/surveys/:id", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  const parsed = surveySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || "بيانات الاستطلاع غير مكتملة" });
  }
  try {
    res.json(await updateSurvey(parsedId.data, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "SURVEY_NOT_FOUND") {
      return res.status(404).json({ message: "الاستطلاع غير موجود" });
    }
    console.error("[Surveys] update failed:", error);
    res.status(500).json({ message: "تعذر تحديث الاستطلاع" });
  }
});

router.delete("/api/surveys/:id", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    const data = await getSurveyWithQuestions(parsedId.data);
    if (!data) return res.status(404).json({ message: "الاستطلاع غير موجود" });
    if (data.survey.status !== "draft") {
      return res.status(409).json({ message: "لا يمكن حذف استطلاع أُرسل بالفعل؛ أغلقه بدلًا من ذلك" });
    }
    await deleteSurvey(parsedId.data);
    res.json({ success: true });
  } catch (error) {
    console.error("[Surveys] delete failed:", error);
    res.status(500).json({ message: "تعذر حذف الاستطلاع" });
  }
});

router.post("/api/surveys/:id/send", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    const result = await sendSurvey(parsedId.data);
    await logActivity({
      userId: requestUserId(req),
      action: "survey_sent",
      entityType: "survey",
      entityId: parsedId.data,
      newValue: result,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SURVEY_NOT_FOUND") return res.status(404).json({ message: "الاستطلاع غير موجود" });
    if (message === "SURVEY_NO_QUESTIONS") return res.status(400).json({ message: "أضف سؤالًا واحدًا على الأقل قبل الإرسال" });
    if (message === "SURVEY_EMPTY_AUDIENCE") return res.status(400).json({ message: "لم يُعثر على مدعوين؛ راجع الجمهور المستهدف" });
    console.error("[Surveys] send failed:", error);
    res.status(500).json({ message: "تعذر إرسال الدعوات" });
  }
});

router.post("/api/surveys/:id/close", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    await closeSurvey(parsedId.data);
    res.json({ success: true });
  } catch (error) {
    console.error("[Surveys] close failed:", error);
    res.status(500).json({ message: "تعذر إغلاق الاستطلاع" });
  }
});

router.get("/api/surveys/:id/results", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    const results = await getSurveyResults(parsedId.data);
    if (!results) return res.status(404).json({ message: "الاستطلاع غير موجود" });
    res.json(results);
  } catch (error) {
    console.error("[Surveys] results failed:", error);
    res.status(500).json({ message: "تعذر جلب النتائج" });
  }
});

router.get("/api/surveys/:id/invitations", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    res.json(await getSurveyInvitationsAdmin(parsedId.data));
  } catch (error) {
    console.error("[Surveys] invitations failed:", error);
    res.status(500).json({ message: "تعذر جلب الدعوات" });
  }
});

router.get("/api/surveys/:id/analysis", async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    res.json({ analysis: await getLatestSurveyAnalysis(parsedId.data) });
  } catch (error) {
    console.error("[Surveys] analysis fetch failed:", error);
    res.status(500).json({ message: "تعذر جلب التحليل" });
  }
});

router.post("/api/surveys/:id/analyze", analyzeLimiter, async (req, res) => {
  const parsedId = surveyIdParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف الاستطلاع غير صالح" });
  try {
    const analysis = await generateSurveyAnalysis(parsedId.data, requestUserId(req));
    res.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SURVEY_NOT_FOUND") return res.status(404).json({ message: "الاستطلاع غير موجود" });
    if (message === "NO_RESPONSES") return res.status(400).json({ message: "لا توجد إجابات بعد لتحليلها" });
    console.error("[Surveys] analyze failed:", error);
    res.status(502).json({ message: "تعذر توليد التحليل الآن" });
  }
});

// ============ الصفحة العامة (رابط شخصي بالتوكن، بدون تسجيل دخول) ============

const tokenParam = z.string().trim().min(16).max(64);

router.get("/api/public/surveys/:token", async (req, res) => {
  const parsedToken = tokenParam.safeParse(req.params.token);
  if (!parsedToken.success) return res.status(404).json({ message: "الرابط غير صالح" });
  try {
    const data = await getPublicSurveyByToken(parsedToken.data);
    if (!data) return res.status(404).json({ message: "الاستطلاع غير موجود أو انتهى رابطه" });
    res.setHeader("Cache-Control", "private, no-store");
    res.json(data);
  } catch (error) {
    console.error("[Surveys] public fetch failed:", error);
    res.status(500).json({ message: "تعذر فتح الاستطلاع" });
  }
});

router.post("/api/public/surveys/:token/submit", async (req, res) => {
  const parsedToken = tokenParam.safeParse(req.params.token);
  if (!parsedToken.success) return res.status(404).json({ message: "الرابط غير صالح" });
  const schema = z.object({
    answers: z.record(z.union([z.number(), z.array(z.number()), z.string().max(5000)])),
    durationSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "الإجابات غير صالحة" });
  try {
    const result = await submitSurveyResponse(parsedToken.data, parsed.data.answers, parsed.data.durationSeconds);
    res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVITATION_NOT_FOUND") return res.status(404).json({ message: "الرابط غير صالح" });
    if (message === "ALREADY_COMPLETED") return res.status(409).json({ message: "سبق أن أكملت هذا الاستطلاع — شكرًا لك" });
    if (message === "SURVEY_NOT_ACTIVE") return res.status(410).json({ message: "أُغلق هذا الاستطلاع" });
    if (message === "MISSING_REQUIRED_ANSWER") return res.status(400).json({ message: "بعض الأسئلة الإلزامية بلا إجابة" });
    if (message === "INVALID_ANSWER") return res.status(400).json({ message: "الإجابات غير صالحة" });
    console.error("[Surveys] submit failed:", error);
    res.status(500).json({ message: "تعذر إرسال إجاباتك؛ حاول مرة أخرى" });
  }
});

export default router;
