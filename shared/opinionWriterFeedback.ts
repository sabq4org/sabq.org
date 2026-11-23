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
  | { ok: false; message: string };

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** يتحقق من طلب الكاتب وينظّفه: اهتمام واحد على الأقل من القائمة، و«أخرى» تحتاج نصاً. */
export function validateOpinionWriterFeedback(body: unknown): FeedbackValidation {
  const raw = (body ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw.interests) ? raw.interests : [];
  const interests = Array.from(
    new Set(list.filter((v): v is string => typeof v === "string" && INTEREST_IDS.has(v))),
  ) as OpinionWriterInterestId[];
  // ترتيب ثابت حسب القائمة حتى تكون المقارنة والعرض متسقين
  interests.sort(
    (a, b) =>
      OPINION_WRITER_INTERESTS.findIndex((i) => i.id === a) -
      OPINION_WRITER_INTERESTS.findIndex((i) => i.id === b),
  );

  if (interests.length === 0) {
    return { ok: false, message: "اختر مجال اهتمام واحداً على الأقل" };
  }

  const otherInterest = interests.includes("other")
    ? cleanText(raw.otherInterest, MAX_OTHER_INTEREST_CHARS)
    : null;
  if (interests.includes("other") && !otherInterest) {
    return { ok: false, message: "اكتب مجال اهتمامك الآخر" };
  }

  return {
    ok: true,
    value: {
      interests,
      otherInterest,
      suggestions: cleanText(raw.suggestions, MAX_SUGGESTIONS_CHARS),
    },
  };
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
