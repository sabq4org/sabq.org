// اعتماد «طلب تعديل» مع آثاره: إبطال الكاش، ثم إعادة توليد الموجز والسيو
// اختياريًا. مشترك بين لوحة الويب (/api/article-edit-requests/:id/approve)
// وتطبيق «مكتب سبق» (/api/v1/staff/news/edit-requests/:id/approve).

import { resolveApplyFields, type EditRequestField, type EditRequestProposal } from "@shared/articleEditRequests";
import { userHasPermission } from "../rbac";
import { approveEditRequest, getEditRequestDetail, regenerateEditRequestDerived } from "./articleEditRequestsService";
import { invalidateArticleWrite } from "./contentInvalidation";

type Fail = { ok: false; status: number; message: string; code?: string; missing?: string[] };

export async function approveEditRequestWithEffects(input: {
  id: string;
  actorId: string;
  /** ما أرسله العميل كما هو؛ undefined = كل ما يحمله الطلب. */
  requestedFields: unknown;
  updateLine: string | null;
  manual: boolean;
  regenerate: boolean;
  reason: string;
}): Promise<
  | Fail
  | { ok: true; appliedFields: EditRequestField[]; missingParagraphs: string[]; regenerating: boolean; articleId: string }
> {
  let fields: EditRequestField[] = [];
  if (!input.manual) {
    const detail = await getEditRequestDetail(input.id, { userId: input.actorId, reviewer: true });
    if (!detail.ok) return detail;
    const resolved = resolveApplyFields(input.requestedFields, detail.request.proposed as EditRequestProposal);
    if (!resolved) return { ok: false, status: 400, message: "الحقول المختارة غير صالحة" };
    fields = resolved;
  }
  const result = await approveEditRequest({
    id: input.id,
    actorId: input.actorId,
    fields,
    updateLine: input.updateLine,
    manual: input.manual,
  });
  if (!result.ok) return result;
  if (result.changed) {
    invalidateArticleWrite(result.article, {
      reason: input.reason,
      oldSlug: result.before.slug,
      oldEnglishSlug: result.before.englishSlug,
      warm: result.article.status === "published",
    });
  }
  // إعادة توليد الموجز والسيو: اختيارية، فقط إن تغيّر العنوان أو النص، وبصلاحية أدوات الذكاء.
  const textChanged = result.appliedFields.some((f) => f === "title" || f === "subtitle" || f === "content");
  const regenerate = input.regenerate && !input.manual && textChanged
    && (await userHasPermission(input.actorId, "articles.ai_generate"));
  if (regenerate) {
    const proposed = (result.request?.proposed ?? {}) as EditRequestProposal;
    regenerateEditRequestDerived({
      articleId: result.article.id,
      actorId: input.actorId,
      keepImageAlt: result.appliedFields.includes("imageUrl") ? proposed.imageAlt ?? null : null,
    })
      .then((out) => {
        if (out?.regenerated.length) {
          invalidateArticleWrite(out.article, { reason: `${input.reason}:regenerate`, warm: out.article.status === "published" });
        }
      })
      .catch((error) => console.error("[edit-requests] regenerate failed", error));
  }
  return {
    ok: true,
    appliedFields: result.appliedFields,
    missingParagraphs: result.missingParagraphs,
    regenerating: regenerate,
    articleId: result.article.id,
  };
}
