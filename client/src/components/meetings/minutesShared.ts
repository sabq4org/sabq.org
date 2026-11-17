// أنواع ودوال مشتركة بين صفحة المحضر وأرشيف المحاضر في مركز الاجتماعات.
// نقية كلها — مختبرة في tests/unit/meetingMinutesShared.test.ts.

export type MinutesTask = {
  task: string;
  owner: string | null;
  due: string | null;
  done?: boolean;
};

export type MinutesDoc = {
  summary: string;
  decisions: string[];
  actionItems: MinutesTask[];
  deferred: string[];
};

export type MinutesStatus = "none" | "recording" | "generating" | "draft" | "approved" | "failed";

export const EMPTY_MINUTES: MinutesDoc = { summary: "", decisions: [], actionItems: [], deferred: [] };

/** يطبّع ما يعود من الخادم (قد يكون null أو ناقص الحقول) إلى شكل آمن للعرض والتحرير */
export function normalizeMinutes(raw: unknown): MinutesDoc {
  const m = (raw && typeof raw === "object" ? raw : {}) as Partial<MinutesDoc>;
  return {
    summary: typeof m.summary === "string" ? m.summary : "",
    decisions: Array.isArray(m.decisions) ? m.decisions.filter((d) => typeof d === "string") : [],
    actionItems: Array.isArray(m.actionItems)
      ? m.actionItems
          .filter((a) => a && typeof a.task === "string")
          .map((a) => ({
            task: a.task,
            owner: a.owner ?? null,
            due: a.due ?? null,
            ...(a.done === true ? { done: true } : {}),
          }))
      : [],
    deferred: Array.isArray(m.deferred) ? m.deferred.filter((d) => typeof d === "string") : [],
  };
}

/** ما يُرسل للحفظ: بلا بنود فارغة ولا فراغات زائدة */
export function cleanMinutesForSave(doc: MinutesDoc): MinutesDoc {
  const text = (s: string) => s.replace(/\s+/g, " ").trim();
  return {
    summary: doc.summary.trim(),
    decisions: doc.decisions.map(text).filter(Boolean),
    actionItems: doc.actionItems
      .map((a) => ({
        task: text(a.task),
        owner: a.owner && text(a.owner) ? text(a.owner) : null,
        due: a.due && text(a.due) ? text(a.due) : null,
        ...(a.done === true ? { done: true } : {}),
      }))
      .filter((a) => a.task),
    deferred: doc.deferred.map(text).filter(Boolean),
  };
}

export function minutesEqual(a: MinutesDoc, b: MinutesDoc): boolean {
  return JSON.stringify(cleanMinutesForSave(a)) === JSON.stringify(cleanMinutesForSave(b));
}

export type ArabicForms = {
  /** «قرار واحد» */
  one: string;
  /** «قراران» */
  two: string;
  /** جمع ٣–١٠: «قرارات» */
  few: string;
  /** تمييز ١١ فأكثر: «قرارًا» */
  many: string;
  /** عند الصفر: «بلا قرارات» */
  zero: string;
};

/** صياغة عربية صحيحة للمعدود — بدل «1 بنود» و«N مشاركاً» */
export function arCount(n: number, f: ArabicForms): string {
  if (!Number.isFinite(n) || n <= 0) return f.zero;
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return `${n} ${f.few}`;
  return `${n} ${f.many}`;
}

export const DECISIONS_FORMS: ArabicForms = {
  one: "قرار واحد", two: "قراران", few: "قرارات", many: "قرارًا", zero: "بلا قرارات",
};
export const TASKS_FORMS: ArabicForms = {
  one: "مهمة واحدة", two: "مهمتان", few: "مهام", many: "مهمة", zero: "بلا مهام",
};
export const MINUTES_FORMS: ArabicForms = {
  one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة", zero: "أقل من دقيقة",
};
export const RECIPIENTS_FORMS: ArabicForms = {
  one: "حاضر واحد", two: "حاضرَين", few: "حاضرين", many: "حاضرًا", zero: "لا أحد",
};

export function minutesStatusLabel(status: string, isHost: boolean): { label: string; tone: "ok" | "warn" | "muted" | "bad" } {
  switch (status) {
    case "approved":
      return { label: "معتمد", tone: "ok" };
    case "draft":
      return { label: isHost ? "مسودة بانتظار اعتمادك" : "قيد المراجعة", tone: "warn" };
    case "recording":
      return { label: "جارٍ التفريغ", tone: "muted" };
    case "generating":
      return { label: "جارٍ توليد المحضر", tone: "muted" };
    case "failed":
      return { label: "بلا محضر", tone: "bad" };
    default:
      return { label: "لم يبدأ", tone: "muted" };
  }
}

/** تاريخ حذف التفريغ الخام: ٣٠ يوماً بعد انتهاء الاجتماع */
export function transcriptDeletionDate(endedAt: string | null): Date | null {
  if (!endedAt) return null;
  const d = new Date(endedAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 30 * 24 * 60 * 60_000);
}

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
