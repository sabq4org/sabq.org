// تدوير رمز النشر وإعادة معالجة الرسائل الفاشلة — استعلامات البريد الذكي (ADR-001).
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { emailWebhookLogs, trustedEmailSenders, type EmailWebhookLog, type TrustedEmailSender } from "@shared/schema";
import {
  resolvePreviousTokenGrace,
  resolveTokenExpiry,
  type TokenExpiryOption,
} from "./emailAgentGuards";

/**
 * يصدر رمزًا جديدًا من الخادم. الرمز السابق يبقى مقبولًا 48 ساعة حتى يبدّله
 * المراسل، فلا يتعطل إرساله لحظة التدوير. المهلة لا تتجاوز انتهاء الرمز السابق،
 * والمنتهي لا يُحتفظ به.
 */
export async function rotateSenderToken(
  senderId: string,
  expiry: TokenExpiryOption,
  now: Date = new Date(),
): Promise<TrustedEmailSender | null> {
  const [current] = await db.select().from(trustedEmailSenders).where(eq(trustedEmailSenders.id, senderId)).limit(1);
  if (!current) return null;
  const graceUntil = resolvePreviousTokenGrace(current.tokenExpiresAt, now);
  const [updated] = await db
    .update(trustedEmailSenders)
    .set({
      token: crypto.randomBytes(32).toString("hex"),
      tokenCreatedAt: now,
      tokenExpiresAt: resolveTokenExpiry(expiry, now),
      previousToken: graceUntil ? current.token : null,
      previousTokenValidUntil: graceUntil,
      updatedAt: now,
    })
    .where(and(eq(trustedEmailSenders.id, senderId), eq(trustedEmailSenders.token, current.token)))
    .returning();
  return updated ?? null;
}

/** «أوقف القديم الآن»: ينهي مهلة الرمز السابق فورًا (رمز تسرّب مثلًا). */
export async function revokePreviousSenderToken(senderId: string, now: Date = new Date()): Promise<TrustedEmailSender | null> {
  const [updated] = await db
    .update(trustedEmailSenders)
    .set({ previousToken: null, previousTokenValidUntil: null, updatedAt: now })
    .where(eq(trustedEmailSenders.id, senderId))
    .returning();
  return updated ?? null;
}

export async function getEmailWebhookLogById(id: string): Promise<EmailWebhookLog | null> {
  const [log] = await db.select().from(emailWebhookLogs).where(eq(emailWebhookLogs.id, id)).limit(1);
  return log ?? null;
}

/**
 * يحجز الرسالة الفاشلة لإعادة المعالجة ذرّيًا (ضغطتان أو نسختان من الخادم لا تعالجانها مرتين).
 * `processed_at` يصير وقت بدء المحاولة لتحسب منه مهلة «العالقة».
 */
export async function claimLogForReprocess(id: string, now: Date = new Date()): Promise<EmailWebhookLog | null> {
  const [log] = await db
    .update(emailWebhookLogs)
    .set({ status: "received", rejectionReason: null, processingError: null, processedAt: now })
    .where(
      and(
        eq(emailWebhookLogs.id, id),
        eq(emailWebhookLogs.status, "failed"),
        eq(emailWebhookLogs.tokenVerified, true),
        sql`${emailWebhookLogs.articleId} IS NULL`,
        sql`${emailWebhookLogs.rejectionReason} IN ('processing_error', 'processing_interrupted')`,
      ),
    )
    .returning();
  return log ?? null;
}

/** يعيد الرسالة إلى «فشلت» إن لم تبدأ إعادة المعالجة (المرسل أعاد الإرسال مثلًا). */
export async function releaseReprocessClaim(id: string, reason: string, message: string): Promise<void> {
  await db
    .update(emailWebhookLogs)
    .set({ status: "failed", rejectionReason: reason, processingError: message, processedAt: new Date() })
    .where(and(eq(emailWebhookLogs.id, id), eq(emailWebhookLogs.status, "received")));
}
