// التحقق من جلسات تطبيقات الموبايل (Bearer) كخدمة قابلة للاستيراد.
// المنطق مطابق لـ verifyMemberSession الخاص داخل mobileApiRoutes.ts (ذاك
// الملف على قائمة استثناءات ADR-001 القديمة ولا يمكن للوحدات الجديدة
// الاستيراد منه) — نفس الجدول ونفس sha256 فتصلح الرموز القائمة كما هي.

import crypto from "crypto";
import type { Request } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { appMemberSessions } from "@shared/schema";

export async function verifyMemberBearer(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const [session] = await db
    .select({ userId: appMemberSessions.memberId })
    .from(appMemberSessions)
    .where(and(
      eq(appMemberSessions.tokenHash, tokenHash),
      eq(appMemberSessions.isActive, true),
      gt(appMemberSessions.expiresAt, new Date()),
    ))
    .limit(1);

  if (session) {
    await db
      .update(appMemberSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(appMemberSessions.tokenHash, tokenHash));
  }

  return session || null;
}
