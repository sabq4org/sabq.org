import { z } from "zod";
import { CERTAINTIES, OCCURRENCE_STATUSES, REGION_GROUPS } from "./model";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD");
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
