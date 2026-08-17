// التحقق من جلسات تطبيقات الموبايل (Bearer) كخدمة قابلة للاستيراد.
// المنطق مطابق لـ verifyMemberSession الخاص داخل mobileApiRoutes.ts (ذاك
// الملف على قائمة استثناءات ADR-001 القديمة ولا يمكن للوحدات الجديدة
// الاستيراد منه) — نفس الجدول ونفس sha256 فتصلح الرموز القائمة كما هي.

import crypto from "crypto";
import type { Request } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { appMemberSessions, users, canUserLogin } from "@shared/schema";

export async function verifyMemberBearer(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Join users and pull every column getUserEffectiveStatus reads so
  // canUserLogin evaluates correctly — this guard was previously MISSING here,
  // so banned/deleted/suspended members kept access to callers of this helper
  // (e.g. /api/v1/predictions/*) for the token's remaining 30-day life. Mirrors
  // verifyMemberSession in mobileApiRoutes.
  const [session] = await db
    .select({
      userId: appMemberSessions.memberId,
      status: users.status,
      bannedUntil: users.bannedUntil,
      suspendedUntil: users.suspendedUntil,
      accountLocked: users.accountLocked,
      lockedUntil: users.lockedUntil,
      deletedAt: users.deletedAt,
      emailVerified: users.emailVerified,
    })
    .from(appMemberSessions)
    .innerJoin(users, eq(users.id, appMemberSessions.memberId))
    .where(and(
      eq(appMemberSessions.tokenHash, tokenHash),
      eq(appMemberSessions.isActive, true),
      gt(appMemberSessions.expiresAt, new Date()),
    ))
    .limit(1);

  if (!session) {
    return null;
  }

  if (!canUserLogin(session as any)) {
    // Retire the token so a blocked account stops looking live and the check
    // doesn't re-run every request.
    try {
      await db
        .update(appMemberSessions)
        .set({ isActive: false })
        .where(eq(appMemberSessions.tokenHash, tokenHash));
    } catch (err) {
      console.warn("[auth] failed to retire bearer session for blocked account:", err);
    }
    return null;
  }

  await db
    .update(appMemberSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(appMemberSessions.tokenHash, tokenHash));

  return { userId: session.userId };
}
