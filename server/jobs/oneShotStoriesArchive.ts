/**
 * One-shot legacy stories archive (2026-07-15).
 *
 * قرار تحريري: أرشفة كل القصص المتراكمة منذ إطلاق الميزة (~1,024 قصة، كلها
 * active ولا آلية أرشفة) والإبقاء فقط على ما يُنشأ بعد اللحظة الفاصلة أدناه —
 * عمليًا قصص تحليل ما بعد المباراة للمباراتين المتبقيتين في مونديال 2026.
 * كانت القائمة الكاملة هي سبب حادثة البطء الموقعي ليلة 2026-07-14.
 *
 * ينفَّذ عبر الإقلاع لأن قاعدة الإنتاج لا يصلها إلا Railway. الشرط الزمني
 * يجعله idempotent: بعد أول تشغيل يحدّث صفر صفوف على كل إقلاع لاحق.
 * صفحات القصص المؤرشفة وخطوطها الزمنية تبقى تعمل (getStoryBySlug لا يفلتر
 * بالحالة) — الأرشفة تخفيها فقط من قائمة /api/stories ومن prompt المُطابق.
 * يمكن حذف هذا الملف بأمان بعد أسابيع من تنفيذه.
 */
import { db } from "../db";
import { stories } from "@shared/schema";
import { and, eq, lt } from "drizzle-orm";
import { log } from "../utils/logger";

/** كل قصة أُنشئت قبل هذه اللحظة تُؤرشف؛ ما بعدها (تحليلات المباريات القادمة) يبقى. */
const ARCHIVE_CUTOFF = new Date("2026-07-14T21:40:00Z");

export async function runOneShotStoriesArchive(): Promise<void> {
  try {
    const result = await db
      .update(stories)
      .set({ status: "archived" })
      .where(and(eq(stories.status, "active"), lt(stories.createdAt, ARCHIVE_CUTOFF)));
    const archived = result.rowCount ?? 0;
    if (archived > 0) {
      log.info(
        `[Stories One-Shot] Archived ${archived} legacy stories (created before ${ARCHIVE_CUTOFF.toISOString()})`
      );
    }
  } catch (error) {
    log.error("[Stories One-Shot] Failed to archive legacy stories:", error);
  }
}
