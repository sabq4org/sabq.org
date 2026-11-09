// «مكتب سبق» — تعديل عنوان مقال الرأي قبل الجدولة (2026-11-09).
// منطق خالص مشترك بين المسار والاختبارات: تنظيف العنوان والتحقق منه.

import { z } from "zod";

export const STAFF_OPINION_TITLE_MIN = 5;
export const STAFF_OPINION_TITLE_MAX = 200;

/** يوحّد المسافات والأسطر: العنوان سطر واحد بلا فراغات مكررة أو طرفية. */
export function normalizeOpinionTitle(raw: string): string {
  return raw.replace(/[‎‏‪-‮]/g, "").replace(/\s+/g, " ").trim();
}

export const staffOpinionTitleSchema = z
  .object({
    title: z
      .string({ error: "اكتب العنوان" })
      .transform(normalizeOpinionTitle)
      .pipe(
        z
          .string()
          .min(STAFF_OPINION_TITLE_MIN, `العنوان قصير جداً (${STAFF_OPINION_TITLE_MIN} أحرف على الأقل)`)
          .max(STAFF_OPINION_TITLE_MAX, `العنوان طويل جداً (${STAFF_OPINION_TITLE_MAX} حرفاً على الأكثر)`),
      ),
    /** العنوان الذي بدأ العضو التعديل منه؛ إن تغيّر منذئذٍ يُرفض الحفظ بـ409. */
    expectedTitle: z.string().max(1000).optional(),
  })
  .strict();

export type StaffOpinionTitleInput = z.infer<typeof staffOpinionTitleSchema>;
