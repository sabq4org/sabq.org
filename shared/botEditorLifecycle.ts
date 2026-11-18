import { z } from "zod";

const reason = z.string().trim().min(1, "updateReason مطلوب").max(500);
const expectedUpdatedAt = z.string().trim().min(1).refine((value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}, "expectedUpdatedAt يجب أن يكون ISO-8601 مع منطقة زمنية");

/** Required on every widened nashr-sabq lifecycle write. */
export const nashrConcurrencySchema = z.object({
  updateReason: reason,
  expectedUpdatedAt,
}).strict();

export const nashrPublishSchema = nashrConcurrencySchema.extend({
  operationId: z.string().uuid().optional(),
}).strict();

export const nashrScheduleSchema = nashrConcurrencySchema.extend({
  publishAt: z.string().trim().min(1),
}).strict();

export type NashrConcurrency = z.infer<typeof nashrConcurrencySchema>;
