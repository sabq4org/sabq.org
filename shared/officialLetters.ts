/**
 * الخطابات الرسمية الصادرة من صحيفة سبق الإلكترونية.
 *
 * مصدر واحد لأنواع الخطابات وصياغتها ونصوصها — يستهلكه الخادم (توليد PDF)
 * والواجهة (المعاينة والقوائم) معاً حتى لا تنفصل الصياغة بين الطبقتين.
 */

export const OFFICIAL_LETTER_TYPES = [
  "media_license",
  "facilitate_mission",
  "general",
] as const;

export type OfficialLetterType = (typeof OFFICIAL_LETTER_TYPES)[number];

export const OFFICIAL_LETTER_STATUSES = ["issued", "revoked"] as const;
export type OfficialLetterStatus = (typeof OFFICIAL_LETTER_STATUSES)[number];

/** من أين جاء الطلب — للتدقيق ولإحصاءات الاستخدام. */
export const OFFICIAL_LETTER_SOURCES = ["admin", "ticket", "self"] as const;
export type OfficialLetterSource = (typeof OFFICIAL_LETTER_SOURCES)[number];

export const OFFICIAL_LETTER_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type OfficialLetterRequestStatus =
  (typeof OFFICIAL_LETTER_REQUEST_STATUSES)[number];

export type OfficialLetterTypeMeta = {
  id: OfficialLetterType;
  labelAr: string;
  /** عنوان المستند المطبوع في وسط الصفحة (قرار المالك: شهادة تعريف). */
  documentTitleAr: string;
  /** وصف قصير يظهر في قائمة الاختيار. */
  hintAr: string;
  /** الجهة الافتراضية المقترحة — يستطيع المُصدِر تغييرها. */
  defaultRecipientAr: string | null;
  /** فقرة الغرض داخل الشهادة. */
  purposeAr: string;
};

export const OFFICIAL_LETTER_TYPE_META: Record<
  OfficialLetterType,
  OfficialLetterTypeMeta
> = {
  media_license: {
    id: "media_license",
    labelAr: "شهادة تعريف",
    documentTitleAr: "شهادة تعريف",
    hintAr: "شهادة تعريف رسمية من صحيفة سبق",
    defaultRecipientAr: "الهيئة العامة لتنظيم الإعلام",
    purposeAr:
      "وقد صدرت هذه الشهادة بناءً على طلبه، لاستكمال إجراءات التقديم للحصول على الترخيص الإعلامي، دون أدنى مسؤولية على الصحيفة تجاه الغير.",
  },
  facilitate_mission: {
    id: "facilitate_mission",
    labelAr: "شهادة تسهيل مهمة",
    documentTitleAr: "شهادة تسهيل مهمة",
    hintAr: "لتغطية فعالية أو مهمة صحفية ميدانية",
    defaultRecipientAr: null,
    purposeAr:
      "وقد صدرت هذه الشهادة بناءً على طلبه، لتسهيل مهمته الصحفية وتمكينه من أداء عمله التحريري، دون أدنى مسؤولية على الصحيفة تجاه الغير.",
  },
  general: {
    id: "general",
    labelAr: "شهادة تعريف عام",
    documentTitleAr: "شهادة تعريف",
    hintAr: "تعريف بالصفة لمن يهمه الأمر",
    defaultRecipientAr: null,
    purposeAr:
      "وقد صدرت هذه الشهادة بناءً على طلبه، دون أدنى مسؤولية على الصحيفة تجاه الغير.",
  },
};

export const OFFICIAL_LETTER_TYPE_LIST: OfficialLetterTypeMeta[] =
  OFFICIAL_LETTER_TYPES.map((id) => OFFICIAL_LETTER_TYPE_META[id]);

export function isOfficialLetterType(value: unknown): value is OfficialLetterType {
  return (
    typeof value === "string" &&
    (OFFICIAL_LETTER_TYPES as readonly string[]).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────────
// جاهزية بيانات المنسوب
//
// الحقل الناقص يُحذف سطره من الخطاب. بعض الحقول ناقصةً تُضعف الخطاب لدى
// الجهة (مثل رقم الهوية في خطاب الترخيص الإعلامي) فتُصنَّف «مهمة»، وبعضها
// تجميلي فيبقى «اختياري».
// ────────────────────────────────────────────────────────────────────

export type LetterFieldKey =
  | "officialFullName"
  | "nationalId"
  | "department"
  | "joinedAt";

export const LETTER_FIELD_LABELS_AR: Record<LetterFieldKey, string> = {
  officialFullName: "الاسم الرباعي (للشهادة)",
  nationalId: "رقم الهوية",
  department: "القسم",
  joinedAt: "تاريخ الالتحاق",
};

/** أثر غياب كل حقل — يُعرض للمنسوب للإطلاع فقط (لا يستكمل ملفه بنفسه). */
export const LETTER_FIELD_IMPACT_AR: Record<LetterFieldKey, string> = {
  officialFullName: "الجهات الرسمية تحتاج الاسم كاملاً كما في الهوية — وليس الاسم الثنائي للعرض",
  nationalId: "الجهات الرسمية غالباً تطلبه لمطابقة الهوية",
  department: "يوضّح الموقع داخل الصحيفة",
  joinedAt: "يثبت مدة الارتباط بالصحيفة",
};

/** الحقول التي يُنصح بشدة بوجودها لكل نوع خطاب. */
export const LETTER_TYPE_IMPORTANT_FIELDS: Record<
  OfficialLetterType,
  LetterFieldKey[]
> = {
  media_license: ["officialFullName", "nationalId"],
  facilitate_mission: ["officialFullName", "nationalId"],
  general: ["officialFullName"],
};

export type LetterFieldSeverity = "important" | "optional";

export function fieldSeverityFor(
  field: LetterFieldKey,
  letterType: OfficialLetterType,
): LetterFieldSeverity {
  return LETTER_TYPE_IMPORTANT_FIELDS[letterType].includes(field)
    ? "important"
    : "optional";
}

/** إرشاد عند النواقص — أكمل الملف ثم اضغط الإصدار ليصدر فوراً. */
export const LETTER_GAPS_STAFF_HINT_AR =
  "أكمل الحقول الناقصة من بطاقة «استكمال الملف» أعلاه، ثم ارجع هنا لإصدار الشهادة فوراً.";

/** من يستطيع استكمال الحقل — الكاتب/المراسل ذاتياً عبر /api/staff-profiles/me. */
export const LETTER_FIELD_OWNER: Record<LetterFieldKey, "staff" | "self"> = {
  officialFullName: "self",
  nationalId: "self",
  department: "self",
  joinedAt: "self",
};

/** التسمية العربية لصفة المنسوب حين لا يوجد مسمّى وظيفي مسجّل. */
export const OFFICIAL_LETTER_ROLE_FALLBACK_AR: Record<string, string> = {
  opinion_author: "كاتب رأي",
  angle_writer: "كاتب زاوية",
  reporter: "مراسل صحفي",
  editor: "محرر",
  correspondent: "مراسل صحفي",
};

/** الجملة التي تصف اعتماد المنسوب داخل الصحيفة، حسب صفته. */
export function buildAffiliationSentenceAr(roleTitleAr: string): string {
  return `يُعدّ من ${roleTitleAr === "مراسل صحفي" ? "المراسلين المعتمدين" : "المعتمدين"} لدى الصحيفة، ويمارس نشاطه التحريري باسمها وفق سياساتها التحريرية والمهنية.`;
}

/** «لمن يهمه الأمر» حين لا تُحدَّد جهة. */
export const OFFICIAL_LETTER_OPEN_RECIPIENT_AR = "لمن يهمه الأمر";

export const OFFICIAL_LETTER_BRAND_AR = "صحيفة سبق الإلكترونية";
export const OFFICIAL_LETTER_SIGNATORY_AR = "رئيس التحرير";

/** صيغة الرقم المرجعي: SBQ-2026-0147 */
export function formatLetterReference(year: number, sequence: number): string {
  return `SBQ-${year}-${String(sequence).padStart(4, "0")}`;
}

const REFERENCE_PATTERN = /^SBQ-\d{4}-\d{4,}$/;

export function isValidLetterReference(code: string): boolean {
  return REFERENCE_PATTERN.test(code.trim().toUpperCase());
}

export function statusLabelAr(status: OfficialLetterStatus): string {
  return status === "revoked" ? "ملغى" : "سارٍ";
}
