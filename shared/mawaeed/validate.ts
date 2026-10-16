import { z } from "zod";
import { CERTAINTIES, OCCURRENCE_STATUSES, REGION_GROUPS } from "./model";

/** تاريخ مدني حقيقي: 2027-02-31 يُرفض هنا بخطأ إدخال 400 بدل أن تُسقطه قاعدة البيانات بـ500. */
export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD")
  .refine(isRealIsoDate, "التاريخ غير موجود في التقويم");
const optionalDate = z.union([isoDate, z.literal(""), z.null()]).optional();
const httpUrl = z.string().trim().max(2000).url("رابط المصدر غير صالح").refine(
  (value) => /^https?:\/\//i.test(value),
  "رابط المصدر يجب أن يبدأ بـ http أو https",
);

export const occurrenceWriteSchema = z.object({
  seriesId: z.string().trim().min(1),
  titleAr: z.string().trim().min(2).max(300),
  startsOn: isoDate,
  endsOn: optionalDate,
  sourceUrl: httpUrl,
  sourceTitle: z.string().trim().min(2).max(300),
  certainty: z.enum(CERTAINTIES),
  status: z.enum(OCCURRENCE_STATUSES).optional(),
  published: z.boolean(),
  regionGroup: z.enum(REGION_GROUPS),
  hijriLabel: z.union([z.string().trim().max(80), z.literal(""), z.null()]).optional(),
  publicNote: z.union([z.string().trim().max(500), z.literal(""), z.null()]).optional(),
  ruleNote: z.union([z.string().trim().max(4000), z.literal(""), z.null()]).optional(),
  /** ختم updatedAt الذي رآه المحرر؛ اختلافه عن الصف الحالي يعيد 409 بدل الكتابة فوق تعديل زميل. */
  expectedUpdatedAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
}).superRefine((value, ctx) => {
  if (value.endsOn && value.endsOn < value.startsOn) {
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "تاريخ النهاية قبل البداية" });
  }
  if (value.published && value.certainty === "unverified") {
    ctx.addIssue({ code: "custom", path: ["published"], message: "لا يُنشر موعد بانتظار التحقق" });
  }
  if (value.certainty === "confirmed" && value.published && !value.sourceUrl) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "رابط المصدر مطلوب قبل التأكيد" });
  }
});

export const confirmOccurrenceSchema = z.object({
  sourceUrl: httpUrl,
  sourceTitle: z.string().trim().min(2).max(300),
});

export type OccurrenceWrite = z.infer<typeof occurrenceWriteSchema>;

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}
