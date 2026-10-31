// «طلب تعديل» على الخبر. صاحب المادة يطلب، ومن يملك articles.edit_any أو
// articles.publish يعتمد أو يرفض. لا استعلام Drizzle هنا — البيانات في الخدمة.

import { Router, type Response } from "express";
import { requireAuth, userHasPermission } from "../rbac";
import { EDIT_REQUEST_LIMITS, parseEditRequestInput, resolveApplyFields, type EditRequestProposal } from "@shared/articleEditRequests";
import {
  approveEditRequest,
  cancelEditRequest,
  createEditRequest,
  getEditRequestContext,
  getEditRequestDetail,
  listEditRequestsForList,
  rejectEditRequest,
} from "../services/articleEditRequestsService";
import { invalidateArticleWrite } from "../services/contentInvalidation";

const router = Router();

async function canReview(userId: string): Promise<boolean> {
  const [editAny, publish] = await Promise.all([
    userHasPermission(userId, "articles.edit_any"),
    userHasPermission(userId, "articles.publish"),
  ]);
  return editAny || publish;
}

function fail(res: Response, result: { status: number; message: string; code?: string; missing?: string[] }) {
  return res.status(result.status).json({ message: result.message, code: result.code, missing: result.missing });
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
}

router.get("/api/article-edit-requests/context/:articleId", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    const result = await getEditRequestContext(req.params.articleId, req.user.id);
    if (!result.ok) return fail(res, result);
    res.json(result);
  } catch (error) {
    console.error("[edit-requests] context failed", error);
    res.status(500).json({ message: "تعذر تحميل الخبر" });
  }
});

router.get("/api/article-edit-requests", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    const reviewer = await canReview(req.user.id);
    const articleId = typeof req.query.articleId === "string" ? req.query.articleId : null;
    const result = await listEditRequestsForList({ userId: req.user.id, reviewer, articleId });
    if (!result.ok) return fail(res, result);
    res.json({ reviewer, requests: result.requests });
  } catch (error) {
    console.error("[edit-requests] list failed", error);
    res.status(500).json({ message: "تعذر تحميل طلبات التعديل" });
  }
});

router.get("/api/article-edit-requests/:id", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    const reviewer = await canReview(req.user.id);
    const result = await getEditRequestDetail(req.params.id, { userId: req.user.id, reviewer });
    if (!result.ok) return fail(res, result);
    res.json({ ...result, reviewer });
  } catch (error) {
    console.error("[edit-requests] detail failed", error);
    res.status(500).json({ message: "تعذر تحميل الطلب" });
  }
});

router.post("/api/article-edit-requests", requireAuth, async (req: any, res) => {
  noStore(res);
  const parsed = parseEditRequestInput(req.body);
  if (!parsed.ok) return res.status(400).json({ message: parsed.message });
  try {
    const result = await createEditRequest(parsed.value, req.user.id);
    if (!result.ok) return fail(res, result);
    res.status(201).json({ ok: true, request: result.request });
  } catch (error) {
    console.error("[edit-requests] create failed", error);
    res.status(500).json({ message: "تعذر إرسال الطلب" });
  }
});

router.post("/api/article-edit-requests/:id/cancel", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    const result = await cancelEditRequest(req.params.id, req.user.id);
    if (!result.ok) return fail(res, result);
    res.json({ ok: true });
  } catch (error) {
    console.error("[edit-requests] cancel failed", error);
    res.status(500).json({ message: "تعذر إلغاء الطلب" });
  }
});

router.post("/api/article-edit-requests/:id/approve", requireAuth, async (req: any, res) => {
  noStore(res);
  const userId = req.user.id as string;
  if (!(await canReview(userId))) return res.status(403).json({ message: "الاعتماد للمحررين فقط" });
  const manual = req.body?.manual === true;
  const updateLine = typeof req.body?.updateLine === "string"
    ? req.body.updateLine.trim().slice(0, EDIT_REQUEST_LIMITS.updateLine)
    : null;
  try {
    let fields: ReturnType<typeof resolveApplyFields> = [];
    if (!manual) {
      const detail = await getEditRequestDetail(req.params.id, { userId, reviewer: true });
      if (!detail.ok) return fail(res, detail);
      fields = resolveApplyFields(req.body?.fields, detail.request.proposed as EditRequestProposal);
      if (!fields) return res.status(400).json({ message: "الحقول المختارة غير صالحة" });
    }
    const result = await approveEditRequest({ id: req.params.id, actorId: userId, fields: fields ?? [], updateLine, manual });
    if (!result.ok) return fail(res, result);
    if (result.changed) {
      invalidateArticleWrite(result.article, {
        reason: "article-edit-request-approve",
        oldSlug: result.before.slug,
        oldEnglishSlug: result.before.englishSlug,
        warm: result.article.status === "published",
      });
    }
    res.json({ ok: true, appliedFields: result.appliedFields, missingParagraphs: result.missingParagraphs });
  } catch (error) {
    console.error("[edit-requests] approve failed", error);
    res.status(500).json({ message: "تعذر اعتماد الطلب" });
  }
});

router.post("/api/article-edit-requests/:id/reject", requireAuth, async (req: any, res) => {
  noStore(res);
  const userId = req.user.id as string;
  if (!(await canReview(userId))) return res.status(403).json({ message: "الرفض للمحررين فقط" });
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, EDIT_REQUEST_LIMITS.rejectReason) : "";
  if (reason.length < 3) return res.status(400).json({ message: "اكتب سبب الرفض ليصل للمراسل" });
  try {
    const result = await rejectEditRequest({ id: req.params.id, actorId: userId, reason });
    if (!result.ok) return fail(res, result);
    res.json({ ok: true });
  } catch (error) {
    console.error("[edit-requests] reject failed", error);
    res.status(500).json({ message: "تعذر رفض الطلب" });
  }
});

export default router;
