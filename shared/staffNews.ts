// تبويب «الأخبار» في تطبيق «مكتب سبق» (/api/v1/staff/news/*) — المرحلة 1
// من تكامل الويب وiOS (2026-10-31). أنواع العقد وقواعده الخالصة؛ الاستعلامات
// في server/services/staffNewsDeskService.ts.
import { z } from "zod";
import { EDIT_REQUEST_FIELDS, EDIT_REQUEST_LIMITS, type EditRequestField } from "./articleEditRequests";

/** نافذة المسودات التي تظهر في التبويب (أوسع من يوم العمل حتى لا يفوت شيء). */
export const STAFF_NEWS_WINDOW_DAYS = 30;
/** أقصى عناصر القائمة في طلب واحد. */
export const STAFF_NEWS_LIST_LIMIT = 100;
/** أبعد موعد جدولة مسموح من المكتب. */
export const STAFF_NEWS_MAX_SCHEDULE_DAYS = 60;

/** مصادر البريد: وكيل البريد يكتب source = email أو url (رابط داخل الرسالة). */
export const STAFF_NEWS_EMAIL_SOURCES = ["email", "url"] as const;

export const STAFF_NEWS_FILTERS = ["all", "reporters", "edit_requests", "email"] as const;
export type StaffNewsFilter = (typeof STAFF_NEWS_FILTERS)[number];

/** من أين وصل الخبر: تطبيق الجوال، لوحة الويب، أو البريد. */
export type StaffNewsChannel = "app" | "web" | "email";

export function staffNewsChannel(source: string | null | undefined): StaffNewsChannel {
  const s = (source || "").toLowerCase();
  if ((STAFF_NEWS_EMAIL_SOURCES as readonly string[]).includes(s)) return "email";
  if (s === "ios-app" || s === "android-app" || s === "mobile" || s === "ios" || s === "android") return "app";
  return "web";
}

/**
 * هل المسودة بانتظار قرار المكتب؟ خبر (ليس رأيًا) في حالة draft، وإما أرسله
 * مراسل للمراجعة (pending_review) أو وصل من البريد ولم يُراجع بعد.
 */
export function isStaffNewsPending(row: {
  articleType: string | null;
  status: string;
  reviewStatus: string | null;
  source: string | null;
}): boolean {
  if (row.articleType === "opinion" || row.status !== "draft") return false;
  if (row.reviewStatus === "pending_review") return true;
  return staffNewsChannel(row.source) === "email" && (row.reviewStatus === null || row.reviewStatus === undefined);
}

export interface StaffNewsDraftItem {
  kind: "draft";
  id: string;
  articleId: string;
  title: string;
  subtitle: string | null;
  channel: StaffNewsChannel;
  reporterName: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  albumCount: number;
  isBreaking: boolean;
  /** مفتوحة للتحرير عند زميل الآن (اسمه)، وإلا null. */
  lockedBy: string | null;
  submittedAt: string;
}

export interface StaffNewsEditRequestItem {
  kind: "edit_request";
  id: string;
  articleId: string;
  title: string;
  articleStatus: string;
  requesterName: string;
  urgent: boolean;
  note: string | null;
  fields: EditRequestField[];
  label: string;
  imageUrl: string | null;
  submittedAt: string;
}

export type StaffNewsItem = StaffNewsDraftItem | StaffNewsEditRequestItem;

export interface StaffNewsBoard {
  counts: { all: number; reporters: number; editRequests: number; email: number };
  /** أقدم ما ينتظر القرار (ISO)، أو null إن كانت القائمة فارغة. */
  oldestAt: string | null;
  /** false إن لم يُنفَّذ SQL جدول طلبات التعديل بعد: تبقى المسودات وتغيب الطلبات. */
  editRequestsReady: boolean;
  items: StaffNewsItem[];
}

export interface StaffNewsPreview {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  status: string;
  reviewStatus: string | null;
  /** HTML كما حفظه المراسل أو وكيل البريد. */
  content: string;
  excerpt: string | null;
  imageUrl: string | null;
  albumImages: string[];
  category: { id: string; name: string } | null;
  isBreaking: boolean;
  channel: StaffNewsChannel;
  reporterName: string | null;
  submittedAt: string | null;
  /** الموجز ووصف السيو موجودان (يُعرض «الموجز والسيو جاهزان»). */
  summaryReady: boolean;
  seoReady: boolean;
  lockedBy: string | null;
  /** رابط تحرير الخبر على الويب (للتعديل الكامل للنص). */
  webEditUrl: string;
  /** طلب تعديل مفتوح على هذا الخبر، إن وجد. */
  pendingEditRequestId: string | null;
  /** يعاد مع النشر والجدولة لمنع الكتابة فوق تعديل زميل. */
  updatedAt: string | null;
}

export interface StaffNewsCategory {
  id: string;
  name: string;
}

const expectedUpdatedAt = z
  .string()
  .datetime({ offset: true, message: "صيغة نسخة الخبر غير صالحة" })
  .optional();
const categoryId = z.string().trim().min(1).max(64).optional();

export const staffNewsBoardQuerySchema = z.object({
  filter: z.enum(STAFF_NEWS_FILTERS).optional().default("all"),
});

export const staffNewsPublishSchema = z
  .object({ expectedUpdatedAt, categoryId })
  .strict();

export const staffNewsScheduleSchema = z
  .object({
    scheduledAt: z
      .string()
      .datetime({ offset: true, message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)" }),
    expectedUpdatedAt,
    categoryId,
  })
  .strict();

export const staffNewsReturnSchema = z
  .object({
    note: z
      .string({ error: "اكتب ملاحظتك للمراسل" })
      .trim()
      .min(3, "اكتب ملاحظتك للمراسل (3 أحرف على الأقل)")
      .max(2000, "الملاحظة طويلة جداً"),
  })
  .strict();

export const staffEditRequestApproveSchema = z
  .object({
    /** بلا قيمة = كل ما يحمله الطلب. */
    fields: z.array(z.enum(EDIT_REQUEST_FIELDS)).max(EDIT_REQUEST_FIELDS.length).optional(),
    /** سطر «تحديث» يظهر على الخبر المنشور (اختياري). */
    updateLine: z.string().trim().max(EDIT_REQUEST_LIMITS.updateLine).optional(),
    /** إعادة توليد الموجز والسيو بعد تغيير العنوان أو النص (بصلاحية أدوات الذكاء). */
    regenerate: z.boolean().optional(),
  })
  .strict();

export const staffEditRequestRejectSchema = z
  .object({
    reason: z
      .string({ error: "اكتب سبب الرفض ليصل للمراسل" })
      .trim()
      .min(3, "اكتب سبب الرفض ليصل للمراسل")
      .max(EDIT_REQUEST_LIMITS.rejectReason, "السبب طويل جداً"),
  })
  .strict();

/** خطأ في موعد الجدولة من المكتب، أو null إن كان صالحًا. */
export function staffNewsScheduleError(scheduledAt: Date, now: Date = new Date()): string | null {
  if (Number.isNaN(scheduledAt.getTime())) return "صيغة وقت الجدولة غير صالحة";
  if (scheduledAt.getTime() < now.getTime() + 60_000) return "اختر موعدًا بعد دقيقة على الأقل من الآن";
  if (scheduledAt.getTime() > now.getTime() + STAFF_NEWS_MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) {
    return `اختر موعدًا خلال ${STAFF_NEWS_MAX_SCHEDULE_DAYS} يومًا`;
  }
  return null;
}

/** ترتيب القائمة: العاجل أولًا، ثم الأقدم انتظارًا. */
export function sortStaffNewsItems(items: StaffNewsItem[]): StaffNewsItem[] {
  const urgent = (item: StaffNewsItem) => (item.kind === "draft" ? item.isBreaking : item.urgent);
  return [...items].sort((a, b) => {
    const u = Number(urgent(b)) - Number(urgent(a));
    if (u !== 0) return u;
    return a.submittedAt.localeCompare(b.submittedAt);
  });
}

export function filterStaffNewsItems(items: StaffNewsItem[], filter: StaffNewsFilter): StaffNewsItem[] {
  switch (filter) {
    case "reporters":
      return items.filter((i) => i.kind === "draft" && i.channel !== "email");
    case "email":
      return items.filter((i) => i.kind === "draft" && i.channel === "email");
    case "edit_requests":
      return items.filter((i) => i.kind === "edit_request");
    default:
      return items;
  }
}

export function countStaffNewsItems(items: StaffNewsItem[]): StaffNewsBoard["counts"] {
  return {
    all: items.length,
    reporters: filterStaffNewsItems(items, "reporters").length,
    editRequests: filterStaffNewsItems(items, "edit_requests").length,
    email: filterStaffNewsItems(items, "email").length,
  };
}

/**
 * سطر الاسم على بطاقة الخبر: المرسل الفعلي أولًا، ثم الاسم الذي سيظهر على
 * الخبر إن اختلف («علي الحازمي · باسم صحيفة سبق»).
 */
export function staffNewsPersonLine(sender: string | null, byline: string | null): string | null {
  const who = sender?.trim() || null;
  const by = byline?.trim() || null;
  if (who && by && who !== by) return `${who} · باسم ${by}`;
  return who ?? by;
}
