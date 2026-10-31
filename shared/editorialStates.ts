// قاموس واحد لحالات الخبر والمقال وطلب التعديل (2026-10-31).
// يقرؤه الويب (لوحة المراسل، مساحة الكاتب) والسيرفر (/api/v1/editorial)،
// ونسخته في iOS: `sabq app ios/sabq/Services/EditorialStates.swift`.
// اختبار tests/unit/editorialStates.test.ts يتأكد أن النصوص متطابقة حرفيًا.

/** الحالة كما يراها صاحب الخبر أو المقال. */
export const EDITORIAL_STATES = [
  "draft",
  "pending",
  "needs_changes",
  "approved",
  "scheduled",
  "published",
  "not_published",
  "archived",
] as const;
export type EditorialState = (typeof EDITORIAL_STATES)[number];

/** الشارة الموحّدة: كلمة واحدة لكل حالة في كل الواجهات. */
export const EDITORIAL_STATE_LABELS: Record<EditorialState, string> = {
  draft: "مسودة",
  pending: "أُرسل للمراجعة",
  needs_changes: "يحتاج تعديلك",
  approved: "اعتُمد، بانتظار الجدولة",
  scheduled: "مجدول",
  published: "منشور",
  not_published: "لم يُنشر",
  archived: "مؤرشف",
};

/** أسماء شرائح التصفية (جمع)، بنفس الترتيب في الويب و iOS. */
export const EDITORIAL_FILTER_LABELS = {
  all: "الكل",
  needs_changes: "تحتاج تعديلك",
  pending: "قيد المراجعة",
  scheduled: "مجدولة",
  published: "منشورة",
  draft: "مسودات",
  archived: "المؤرشفة",
} as const;

/** أزرار الخطوة التالية لصاحب الخبر. */
export const EDITORIAL_ACTION_LABELS = {
  resubmit: "عدّل وأعد الإرسال",
  requestEdit: "طلب تعديل",
  cancelRequest: "ألغِ الطلب",
  reviewRequest: "راجع الطلب",
  openArticle: "فتح الخبر",
} as const;

export const EDIT_REQUEST_OUTCOMES = ["pending", "approved", "rejected"] as const;
export type EditRequestOutcome = (typeof EDIT_REQUEST_OUTCOMES)[number];

/** ملصق طلب التعديل على صف الخبر. */
export const EDIT_REQUEST_OUTCOME_LABELS: Record<EditRequestOutcome, string> = {
  pending: "طلب تعديل قيد المراجعة",
  approved: "اعتُمد طلب التعديل",
  rejected: "لم يُعتمد طلب التعديل",
};

export const EDIT_REQUEST_URGENT_LABEL = "طلب تعديل عاجل";

/**
 * الحالة من أعمدة المقال. ترتيب الفحص مهم: النشر يترك reviewStatus على
 * pending_review أحيانًا (#2044)، فالحالة النهائية تسبق حالة المراجعة.
 */
export function editorialState(row: { status: string | null | undefined; reviewStatus?: string | null }): EditorialState {
  const status = row.status ?? "draft";
  if (status === "published") return "published";
  if (status === "scheduled") return "scheduled";
  if (status === "archived" || status === "deleted") return "archived";
  if (status === "rejected" || row.reviewStatus === "rejected") return "not_published";
  if (row.reviewStatus === "needs_changes") return "needs_changes";
  if (row.reviewStatus === "pending_review" || status === "pending") return "pending";
  if (row.reviewStatus === "approved") return "approved";
  return "draft";
}

export function editorialStateLabel(row: { status: string | null | undefined; reviewStatus?: string | null }): string {
  return EDITORIAL_STATE_LABELS[editorialState(row)];
}
