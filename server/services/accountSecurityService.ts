import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { validatePassword } from "../utils/passwordPolicy";
import { invalidateAllUserSessions } from "../auth";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * تغيير كلمة مرور طوعي لجلسة ويب (Passport).
 * يُبطل كل الجلسات الأخرى مع الإبقاء على جلسة المتصل الحالية.
 */
export async function changeWebPassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  currentSessionId?: string;
}): Promise<ChangePasswordResult> {
  const { userId, currentPassword, newPassword, currentSessionId } = params;

  if (!currentPassword || !newPassword) {
    return { ok: false, status: 400, message: "كلمة المرور الحالية والجديدة مطلوبتان" };
  }

  const newPwCheck = validatePassword(newPassword);
  if (!newPwCheck.ok) {
    return {
      ok: false,
      status: 400,
      message: newPwCheck.message ?? "كلمة المرور الجديدة غير مقبولة",
    };
  }

  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { ok: false, status: 404, message: "المستخدم غير موجود" };
  }

  if (!user.passwordHash) {
    return {
      ok: false,
      status: 400,
      message: "لا يمكن تغيير كلمة المرور لهذا الحساب (تسجيل عبر مزوّد خارجي)",
    };
  }

  const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValidPassword) {
    return { ok: false, status: 401, message: "كلمة المرور الحالية غير صحيحة" };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
    })
    .where(eq(users.id, userId));

  await invalidateAllUserSessions(userId, {
    exceptWebSid: currentSessionId,
  });

  return { ok: true };
}
