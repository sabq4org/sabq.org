// استبيان كتّاب الرأي: اهتماماتهم (اختيار متعدد) ومقترحاتهم للتطوير القادم.
// ثوابت ودوال خالصة بلا قاعدة بيانات، يستعملها الخادم والواجهة معاً.

export const OPINION_WRITER_INTERESTS = [
  { id: "economy", label: "الشأن الاقتصادي" },
  { id: "social", label: "الشأن الاجتماعي" },
  { id: "psychology", label: "الجانب النفسي" },
  { id: "culture", label: "الشأن الثقافي" },
  { id: "local", label: "الشأن المحلي" },
  { id: "consulting", label: "الاستشارات" },
  { id: "politics", label: "السياسة والشؤون الدولية" },
  { id: "education", label: "التعليم" },
  { id: "health", label: "الصحة" },
  { id: "tech_media", label: "التقنية والإعلام" },
  { id: "sports", label: "الرياضة" },
  { id: "other", label: "أخرى" },
] as const;

export type OpinionWriterInterestId = (typeof OPINION_WRITER_INTERESTS)[number]["id"];

const INTEREST_IDS = new Set<string>(OPINION_WRITER_INTERESTS.map((i) => i.id));

export const MAX_OTHER_INTEREST_CHARS = 120;
export const MAX_SUGGESTIONS_CHARS = 3000;

export function opinionWriterInterestLabel(id: string): string {
  return OPINION_WRITER_INTERESTS.find((i) => i.id === id)?.label ?? id;
}

export type OpinionWriterFeedbackInput = {
  interests: OpinionWriterInterestId[];
  otherInterest: string | null;
  suggestions: string | null;
};

export type FeedbackValidation =
  | { ok: true; value: OpinionWriterFeedbackInput }
  | { ok: false; code: string; message: string };

const ALLOWED_KEYS = new Set(["interests", "otherInterest", "suggestions"]);

function cleanText(value: string, max: number): string | null {
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * يتحقق من طلب الكاتب بصرامة: أي حقل غير معروف أو قيمة بنوع خاطئ تُرفض برمز واضح
 * بدل إسقاطها بصمت (REVIEW.md A4). اهتمام واحد على الأقل، و«أخرى» تحتاج نصاً.
 */
export function validateOpinionWriterFeedback(body: unknown): FeedbackValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "INVALID_BODY", message: "صيغة الطلب غير صحيحة" };
  }
  const raw = body as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return { ok: false, code: "UNKNOWN_FIELD", message: `حقول غير مدعومة: ${unknownKeys.join("، ")}` };
  }
  if (!Array.isArray(raw.interests) || raw.interests.some((v) => typeof v !== "string" || !INTEREST_IDS.has(v))) {
    return { ok: false, code: "INVALID_INTEREST", message: "مجالات الاهتمام غير صحيحة" };
  }
  for (const key of ["otherInterest", "suggestions"] as const) {
    const v = raw[key];
    if (v !== undefined && v !== null && typeof v !== "string") {
      return { ok: false, code: "INVALID_FIELD_TYPE", message: `قيمة ${key} يجب أن تكون نصاً` };
    }
  }

  const interests = Array.from(new Set(raw.interests as string[])) as OpinionWriterInterestId[];
  // ترتيب ثابت حسب القائمة حتى تكون المقارنة والعرض متسقين
  interests.sort(
    (a, b) =>
      OPINION_WRITER_INTERESTS.findIndex((i) => i.id === a) -
      OPINION_WRITER_INTERESTS.findIndex((i) => i.id === b),
  );
  if (interests.length === 0) {
    return { ok: false, code: "INTEREST_REQUIRED", message: "اختر مجال اهتمام واحداً على الأقل" };
  }

  const otherInterest =
    typeof raw.otherInterest === "string" ? cleanText(raw.otherInterest, MAX_OTHER_INTEREST_CHARS) : null;
  const hasOther = interests.includes("other");
  if (hasOther && !otherInterest) {
    return { ok: false, code: "OTHER_INTEREST_REQUIRED", message: "اكتب مجال اهتمامك الآخر" };
  }
  if (!hasOther && otherInterest) {
    return { ok: false, code: "OTHER_INTEREST_WITHOUT_OTHER", message: "المجال الآخر يُكتب فقط عند اختيار «أخرى»" };
  }

  return {
    ok: true,
    value: {
      interests,
      otherInterest,
      suggestions: typeof raw.suggestions === "string" ? cleanText(raw.suggestions, MAX_SUGGESTIONS_CHARS) : null,
    },
  };
}

/** يحيّد الخلايا التي قد يفسّرها Excel أو LibreOffice صيغةً عند تصدير CSV. */
export function neutralizeSpreadsheetCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** عدّ الردود لكل اهتمام (لشرائح الفرز في صفحة الإدارة). */
export function countInterests(rows: Array<{ interests: string[] }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of OPINION_WRITER_INTERESTS) counts[i.id] = 0;
  for (const row of rows) {
    for (const id of row.interests ?? []) {
      if (id in counts) counts[id] += 1;
    }
  }
  return counts;
}
