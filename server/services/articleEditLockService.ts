import { eq } from "drizzle-orm";
import { db } from "../db";
import { articleEditLocks } from "@shared/schema";

/**
 * يحرّر كل أقفال التحرير التي يملكها مستخدم. يُستدعى عند تسجيل الخروج:
 * طلب التحرير من الصفحة (beforeunload) يصل بعد إتلاف الجلسة فيُرفض بـ401،
 * فكان القفل يبقى حتى انتهاء مهلته ويحجز الخبر عن الزملاء بعد خروج صاحبه.
 * لا يرمي أبدًا: فشله يجب ألا يعطّل تسجيل الخروج.
 */
export async function releaseEditLocksForUser(userId: string): Promise<number> {
  try {
    const released = await db
      .delete(articleEditLocks)
      .where(eq(articleEditLocks.userId, userId))
      .returning({ articleId: articleEditLocks.articleId });
    return released.length;
  } catch (error) {
    console.error("[edit-lock] release on logout failed:", error);
    return 0;
  }
}
