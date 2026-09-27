// ضمانات «النشر أولاً» — منطق خالص بلا قاعدة بيانات.
// الأعلام تُقرأ من system_settings وقت التشغيل (انظر publishFirstService).

import { SUPERUSER_ROLE_NAMES } from "./rbac-constants";

export const PUBLISH_FIRST_SUBTITLE_MAX = 120;
/** سقف Zod التاريخي في عقد البوت قبل تفعيل علم التحقق. */
export const PUBLISH_FIRST_SUBTITLE_MAX_WHEN_OFF = 300;

export const PUBLISH_FIRST_RISK_LABELS = ["safe", "needs_look", "sensitive"] as const;
export type PublishFirstRiskLabel = (typeof PUBLISH_FIRST_RISK_LABELS)[number];

export const PUBLISH_FIRST_RISK_LABELS_AR: Record<PublishFirstRiskLabel, string> = {
  safe: "آمنة",
  needs_look: "تحتاج نظرة",
  sensitive: "حساسة",
};

export const PUBLISH_FIRST_VERDICTS = ["ok", "minor", "major"] as const;
export type PublishFirstVerdict = (typeof PUBLISH_FIRST_VERDICTS)[number];

export const PUBLISH_FIRST_VERDICTS_AR: Record<PublishFirstVerdict, string> = {
  ok: "مناسب",
  minor: "ملاحظات طفيفة",
  major: "ملاحظات جوهرية",
};

/** مفاتيح system_settings. غياب الصف = مفعّل (الافتراضي). */
export const PUBLISH_FIRST_FLAG_KEYS = {
  validation: "publish_first_validation",
  sensitiveGate: "publish_first_sensitive_gate",
  revisionHistory: "publish_first_revision_history",
  updateLine: "publish_first_update_line",
} as const;

export type PublishFirstFlagName = keyof typeof PUBLISH_FIRST_FLAG_KEYS;

export interface PublishFirstFlags {
  validation: boolean;
  sensitiveGate: boolean;
  revisionHistory: boolean;
  updateLine: boolean;
}

export const PUBLISH_FIRST_FLAGS_DEFAULT: PublishFirstFlags = {
  validation: true,
  sensitiveGate: true,
  revisionHistory: true,
  updateLine: true,
};

export const SENSITIVE_PUBLISH_MESSAGE =
  "لا يمكن نشر هذه المادة: تصنيف المخاطر «حساسة» ويتطلب حكم مراجع (مناسب أو ملاحظات طفيفة أو ملاحظات جوهرية) قبل النشر.";

export const SENSITIVE_CORRECT_MESSAGE =
  "لا يمكن تصحيح هذه المادة: تصنيف المخاطر «حساسة» ويتطلب حكم مراجع قبل التعديل بعد النشر.";

/** حقول المحتوى التي تُلتقط في سجل المراجعة. riskLabel يُسجَّل ولا يُعدّ وحده «تصحيحاً». */
export const PUBLISH_FIRST_REVISION_FIELDS = [
  "title",
  "subtitle",
  "excerpt",
  "content",
  "categoryId",
  "imageUrl",
  "riskLabel",
] as const;

export type PublishFirstRevisionField = (typeof PUBLISH_FIRST_REVISION_FIELDS)[number];

const CONTENT_CORRECTION_FIELDS = new Set<string>([
  "title",
  "subtitle",
  "excerpt",
  "content",
  "categoryId",
  "imageUrl",
]);

export function isPublishFirstRiskLabel(value: unknown): value is PublishFirstRiskLabel {
  return typeof value === "string" && (PUBLISH_FIRST_RISK_LABELS as readonly string[]).includes(value);
}

export function isPublishFirstVerdict(value: unknown): value is PublishFirstVerdict {
  return typeof value === "string" && (PUBLISH_FIRST_VERDICTS as readonly string[]).includes(value);
}

/** يقرأ `{ enabled: boolean }` أو قيمة منطقية خام. الصف الغائب يبقى على الافتراضي (مفعّل). */
export function flagEnabledFromSetting(value: unknown, fallback = true): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "object" && value && "enabled" in value) {
    return (value as { enabled?: unknown }).enabled !== false;
  }
  return fallback;
}

export interface PublishFirstUploadIssue {
  httpStatus: 422;
  code: "subtitle_too_long" | "category_not_found";
  message: string;
  details: Record<string, unknown>;
}

/**
 * تحقق وقت الرفع. `knownSlugs` تُمرَّر فقط عند الفشل وفيما العلم مفعّل
 * حتى يتضمن الرد قائمة التصنيفات الصالحة.
 */
export function validateBotDraftUpload(input: {
  subtitle?: string | null;
  categorySlug?: string | null;
  categoryResolved: boolean;
  categoryProvided: boolean;
  validationEnabled: boolean;
  validSlugs?: string[];
  slugsTruncated?: boolean;
}): PublishFirstUploadIssue | null {
  const subtitle = typeof input.subtitle === "string" ? input.subtitle : "";
  const max = input.validationEnabled ? PUBLISH_FIRST_SUBTITLE_MAX : PUBLISH_FIRST_SUBTITLE_MAX_WHEN_OFF;
  if (subtitle.length > max && input.validationEnabled) {
    return {
      httpStatus: 422,
      code: "subtitle_too_long",
      message: `العنوان الفرعي يتجاوز ${PUBLISH_FIRST_SUBTITLE_MAX} حرفاً`,
      details: { max: PUBLISH_FIRST_SUBTITLE_MAX, length: subtitle.length },
    };
  }
  if (input.categoryProvided && !input.categoryResolved) {
    const details: Record<string, unknown> = {
      categorySlug: input.categorySlug ?? null,
    };
    if (input.validationEnabled) {
      details.validSlugs = input.validSlugs ?? [];
      details.hint = input.slugsTruncated
        ? "التصنيف غير موجود. القائمة مختصرة؛ راجع GET /api/categories"
        : "استخدم categorySlug من تصنيفات الظاهرة (visible أو active)";
    }
    return {
      httpStatus: 422,
      code: "category_not_found",
      message: "التصنيف غير موجود أو غير نشط",
      details,
    };
  }
  return null;
}

export type SensitiveGateDecision =
  | { allow: true; override: boolean }
  | { allow: false; code: "sensitive_needs_verdict"; message: string };

export function decideSensitiveGate(input: {
  riskLabel: string | null | undefined;
  hasVerdict: boolean;
  gateEnabled: boolean;
  action: "publish" | "correct";
  /** يُحتسب فقط بعد تأكيد أن الطالب مسؤول (admin). البوت يمرّر false دائماً. */
  adminOverride: boolean;
}): SensitiveGateDecision {
  if (!input.gateEnabled) return { allow: true, override: false };
  if (input.riskLabel !== "sensitive") return { allow: true, override: false };
  if (input.hasVerdict) return { allow: true, override: false };
  if (input.adminOverride) return { allow: true, override: true };
  return {
    allow: false,
    code: "sensitive_needs_verdict",
    message: input.action === "correct" ? SENSITIVE_CORRECT_MESSAGE : SENSITIVE_PUBLISH_MESSAGE,
  };
}

export interface RoleLike {
  role?: string | null;
  roles?: Array<string | { name?: string | null } | null> | null;
  permissions?: string[] | null;
}

export function isPublishFirstAdmin(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const names = new Set<string>();
  if (user.role) names.add(user.role);
  for (const role of user.roles ?? []) {
    if (typeof role === "string" && role) names.add(role);
    else if (role && typeof role === "object" && role.name) names.add(role.name);
  }
  for (const name of names) {
    if ((SUPERUSER_ROLE_NAMES as readonly string[]).includes(name)) return true;
  }
  return Boolean(user.permissions?.includes("*"));
}

function jsonSame(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export interface RevisionPlan {
  changedFields: PublishFirstRevisionField[];
  previousValues: Partial<Record<PublishFirstRevisionField, unknown>>;
  updateReason: string | null;
  correctedAt: Date;
  /** تغيير محتوى (بلا الاكتفاء بتغيير شارة المخاطر). */
  contentChanged: boolean;
}

/**
 * لقطة تعديل خبر منشور. لا تُنشأ عند أول نشر، ولا عندما العلم مطفأ،
 * ولا عندما لا يتغير حقل متتبَّع ولا يوجد سبب تحديث.
 */
export function planContentRevision(input: {
  existingStatus: string | null | undefined;
  existing: Partial<Record<PublishFirstRevisionField, unknown>>;
  patch: Partial<Record<PublishFirstRevisionField, unknown>>;
  updateReason?: string | null;
  now: Date;
  historyEnabled: boolean;
}): RevisionPlan | null {
  if (!input.historyEnabled) return null;
  if (input.existingStatus !== "published") return null;
  const changedFields: PublishFirstRevisionField[] = [];
  const previousValues: Partial<Record<PublishFirstRevisionField, unknown>> = {};
  for (const field of PUBLISH_FIRST_REVISION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input.patch, field)) continue;
    const next = input.patch[field];
    if (next === undefined) continue;
    const before = input.existing[field] ?? null;
    if (!jsonSame(before, next ?? null)) {
      changedFields.push(field);
      previousValues[field] = before;
    }
  }
  const updateReason = input.updateReason?.trim() || null;
  if (changedFields.length === 0 && !updateReason) return null;
  return {
    changedFields,
    previousValues,
    updateReason,
    correctedAt: input.now,
    contentChanged: changedFields.some((field) => CONTENT_CORRECTION_FIELDS.has(field)),
  };
}

export interface OverrideLogRow {
  articleId: string;
  actorUserId: string | null;
  actorName: string | null;
  action: "publish" | "correct";
  reason: string | null;
  createdAt: Date;
}

export function buildOverrideLogRow(input: {
  articleId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  action: "publish" | "correct";
  reason?: string | null;
  now: Date;
}): OverrideLogRow {
  const reason = input.reason?.trim() || null;
  return {
    articleId: input.articleId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName?.trim() || null,
    action: input.action,
    reason,
    createdAt: input.now,
  };
}

export interface RevisionLogRow {
  articleId: string;
  editorUserId: string | null;
  editorName: string | null;
  changedFields: string[];
  previousValues: Record<string, unknown>;
  updateReason: string | null;
  createdAt: Date;
}

export function buildRevisionLogRow(input: {
  articleId: string;
  editorUserId?: string | null;
  editorName?: string | null;
  plan: Pick<RevisionPlan, "changedFields" | "previousValues" | "updateReason" | "correctedAt">;
}): RevisionLogRow {
  return {
    articleId: input.articleId,
    editorUserId: input.editorUserId ?? null,
    editorName: input.editorName?.trim() || null,
    changedFields: input.plan.changedFields,
    previousValues: input.plan.previousValues,
    updateReason: input.plan.updateReason,
    createdAt: input.plan.correctedAt,
  };
}

const RIYADH_FORMAT = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatRiyadhDateTime(at: Date): string {
  return RIYADH_FORMAT.format(at);
}

/** «تحديث: <reason> — <date/time Riyadh>» */
export function formatPublishFirstUpdateLine(reason: string, at: Date): string {
  return `تحديث: ${reason.trim()} — ${formatRiyadhDateTime(at)}`;
}

export interface PublicUpdateLine {
  id: string;
  at: string;
  text: string;
}

export function formatPublishFirstUpdateLines(
  rows: Array<{ id: string; updateReason: string | null; createdAt: Date }>,
): PublicUpdateLine[] {
  return rows
    .filter((row) => Boolean(row.updateReason?.trim()))
    .map((row) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      text: formatPublishFirstUpdateLine(row.updateReason!.trim(), row.createdAt),
    }));
}

/** طوابع يملكها الخادم. تُحذف من جسم العميل قبل الكتابة. */
export const PUBLISH_FIRST_SERVER_TIMESTAMPS = ["draftCreatedAt", "correctedAt", "verdictAt"] as const;

export function stripClientOwnedPublishFirstTimestamps<T extends Record<string, unknown>>(body: T): T {
  const next = { ...body };
  for (const key of PUBLISH_FIRST_SERVER_TIMESTAMPS) {
    delete next[key];
  }
  return next;
}

export interface EditorialCategoryChoice {
  id: string;
  type?: string | null;
  status?: string | null;
}

const AUTO_CATEGORY_TYPES = new Set(["smart", "dynamic", "seasonal"]);

/**
 * تصنيفات منتقي المحرر. تُخفى السلال الآلية، وتُبقى تصنيفات القرّاء
 * (visible/active) حتى لو لم يكن نوعها core، ويُضاف تصنيف المقال الحالي
 * دائماً حتى لا يفرغ المنتقي بعد النشر.
 */
export function editorialCategoryChoices<T extends EditorialCategoryChoice>(
  categories: T[],
  currentCategoryId?: string | null,
): T[] {
  const assignable = categories.filter((category) => {
    if (category.type && AUTO_CATEGORY_TYPES.has(category.type)) return false;
    const status = category.status || "active";
    return status === "visible" || status === "active";
  });
  if (currentCategoryId && !assignable.some((category) => category.id === currentCategoryId)) {
    const current = categories.find((category) => category.id === currentCategoryId);
    if (current) return [current, ...assignable];
  }
  return assignable;
}

/** معرّف تصنيف مقبول في الحفظ: نص قصير، وليس UUID حصراً (معرفات الاستيراد التاريخية). */
export function isAcceptableCategoryId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 64 && !trimmed.includes(" ");
}
