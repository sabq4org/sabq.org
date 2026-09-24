import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  newsletterSubscriptions,
  emailSuppressions,
  type NewsletterSubscription,
} from "@shared/schema";
import {
  sendNewsletterConfirmationEmail,
} from "./email";
import {
  subscribeToMailerLite,
  getMailerLiteSubscriber,
  isMailerLiteConfigured,
  reconcileMailerLiteCadenceGroups,
  updateMailerLiteSubscriber,
  unsubscribeFromMailerLite,
  type MailerLiteSubscriber,
} from "./mailerlite";

const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;
const CONFIRMATION_TOKEN_BYTES = 32;

export type NewsletterFrequency = "daily" | "weekly";

export type CreatePendingNewsletterSubscriptionInput = {
  email: string;
  frequency: NewsletterFrequency;
  source?: string;
  language: "ar";
  consent: true;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  interests?: string[];
};

export const newsletterSubscribeInputSchema = z.object({
  email: z.string().trim().email().max(254),
  frequency: z.enum(["daily", "weekly"]),
  language: z.literal("ar"),
  consent: z.literal(true),
  source: z.string().trim().max(80).optional(),
  interests: z.array(z.string().trim().min(1).max(128)).max(30).optional(),
});

export type NewsletterSubscriptionResult = {
  subscription: NewsletterSubscription | null;
  confirmationSent: boolean;
};

export type ConfirmNewsletterSubscriptionResult = {
  subscription: NewsletterSubscription;
  mailerlite: { success: boolean; data?: MailerLiteSubscriber; error?: string } | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function readConfirmationExpiry(metadata: unknown): Date | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).confirmationExpiresAt;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function confirmationMetadata(existing: unknown, expiresAt?: Date): Record<string, unknown> {
  const metadata = existing && typeof existing === "object"
    ? { ...(existing as Record<string, unknown>) }
    : {};
  if (expiresAt) metadata.confirmationExpiresAt = expiresAt.toISOString();
  else delete metadata.confirmationExpiresAt;
  return metadata;
}

function confirmationUrl(token: string): string {
  const baseUrl = (process.env.FRONTEND_URL || "https://sabq.org").replace(/\/$/, "");
  return `${baseUrl}/newsletter#confirm=${encodeURIComponent(token)}`;
}

export function mailerLiteGroupIdForFrequency(frequency: NewsletterFrequency): string | null {
  return frequency === "daily"
    ? process.env.MAILERLITE_DAILY_GROUP_ID || null
    : process.env.MAILERLITE_WEEKLY_GROUP_ID || null;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
}

function syncMetadata(existing: unknown, status: "pending" | "synced" | "error", error?: string) {
  const metadata = existing && typeof existing === "object"
    ? { ...(existing as Record<string, unknown>) }
    : {};
  metadata.mailerliteSync = {
    status,
    ...(error ? { reason: error.slice(0, 80) } : {}),
    attemptedAt: new Date().toISOString(),
  };
  return metadata;
}

export function hasConfirmedNewsletterMarker(subscription: NewsletterSubscription): boolean {
  const metadata = subscription.metadata && typeof subscription.metadata === "object"
    ? subscription.metadata as Record<string, unknown>
    : {};
  return metadata.newsletterConsentVersion === 1 && typeof metadata.confirmedAt === "string";
}

async function assertNotSuppressed(email: string): Promise<void> {
  try {
    const [row] = await db.select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(sql`lower(${emailSuppressions.email}) = ${normalizeEmail(email)}`)
      .limit(1);
    if (row) throw new Error("NEWSLETTER_CONFIRMATION_SUPPRESSED");
  } catch (error) {
    if (error instanceof Error && error.message === "NEWSLETTER_CONFIRMATION_SUPPRESSED") throw error;
    throw new Error("NEWSLETTER_SUPPRESSION_CHECK_FAILED");
  }
}

export async function createPendingNewsletterSubscription(
  input: CreatePendingNewsletterSubscriptionInput,
): Promise<NewsletterSubscriptionResult> {
  const request = newsletterSubscribeInputSchema.parse(input);
  const email = normalizeEmail(request.email);
  const existing = await db.query.newsletterSubscriptions.findFirst({
    where: sql`lower(${newsletterSubscriptions.email}) = ${email}`,
  });

  // Unsubscribed/bounced addresses are terminal. Keep the response generic so
  // this endpoint cannot be used as a subscriber-enumeration oracle.
  if (existing && ["unsubscribed", "bounced"].includes(existing.status)) {
    return { subscription: null, confirmationSent: false };
  }

  const token = crypto.randomBytes(CONFIRMATION_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);
  const preferences = {
    ...(existing?.preferences || {}),
    frequency: request.frequency,
    categories: request.interests || existing?.preferences?.categories || [],
  };
  const values = {
    status: "pending_confirmation",
    language: request.language,
    userId: input.userId || existing?.userId || null,
    preferences,
    source: request.source || existing?.source || "smart-newsletter",
    ipAddress: input.ipAddress || existing?.ipAddress || null,
    userAgent: input.userAgent || existing?.userAgent || null,
    verificationToken: hashToken(token),
    verifiedAt: null,
    unsubscribedAt: null,
    unsubscribeReason: null,
    metadata: {
      ...confirmationMetadata(existing?.metadata, expiresAt),
      consent: true,
      consentAt: new Date().toISOString(),
      mailerliteSync: { status: "pending", attemptedAt: new Date().toISOString() },
    },
    updatedAt: new Date(),
  };

  let subscription: NewsletterSubscription | undefined;
  try {
    [subscription] = existing
      ? await db
          .update(newsletterSubscriptions)
          .set(values)
          .where(and(
            eq(newsletterSubscriptions.id, existing.id),
            eq(newsletterSubscriptions.status, "pending_confirmation"),
            sql`${newsletterSubscriptions.updatedAt} < now() - interval '10 minutes'`,
          ))
          .returning()
      : await db
          .insert(newsletterSubscriptions)
          .values({
            email,
            ...values,
            createdAt: new Date(),
          })
          .returning();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { subscription: null, confirmationSent: false };
  }

  // An active row is deliberately not reactivated or mutated. This keeps a
  // second subscription request from bypassing the explicit confirmation step.
  if (!subscription) return { subscription: existing || null, confirmationSent: false };

  const mailResult = await sendNewsletterConfirmationEmail({
    to: email,
    confirmationUrl: confirmationUrl(token),
    language: request.language,
  });

  return { subscription, confirmationSent: mailResult.success };
}

export async function confirmNewsletterSubscription(
  token: string,
): Promise<ConfirmNewsletterSubscriptionResult> {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("NEWSLETTER_CONFIRMATION_INVALID");
  const tokenHash = hashToken(token);

  const pending = await db.query.newsletterSubscriptions.findFirst({
    where: eq(newsletterSubscriptions.verificationToken, tokenHash),
  });
  if (!pending) {
    throw new Error("NEWSLETTER_CONFIRMATION_INVALID");
  }
  const pendingExpiry = readConfirmationExpiry(pending.metadata);
  if (!pendingExpiry || pendingExpiry.getTime() <= Date.now()) {
    throw new Error("NEWSLETTER_CONFIRMATION_EXPIRED");
  }
  if (pending.status === "active") {
    if (!hasConfirmedNewsletterMarker(pending)) throw new Error("NEWSLETTER_CONFIRMATION_INVALID");
    const syncStatus = (pending.metadata as Record<string, any> | null)?.mailerliteSync?.status;
    return {
      subscription: pending,
      mailerlite: syncStatus === "synced"
        ? { success: true }
        : { success: false, error: "MAILERLITE_SYNC_PENDING" },
    };
  }
  if (pending.status !== "pending_confirmation") {
    throw new Error("NEWSLETTER_CONFIRMATION_INVALID");
  }
  await assertNotSuppressed(pending.email);
  if (isMailerLiteConfigured()) {
    const remote = await getMailerLiteSubscriber(pending.email);
    if (remote.success && remote.data && ["unsubscribed", "bounced", "junk"].includes(remote.data.status)) {
      throw new Error("NEWSLETTER_CONFIRMATION_PROVIDER_TERMINAL");
    }
  }

  const transactionResult = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.verificationToken, tokenHash))
      .for("update");

    if (!candidate) throw new Error("NEWSLETTER_CONFIRMATION_INVALID");
    const expiresAt = readConfirmationExpiry(candidate.metadata);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      throw new Error("NEWSLETTER_CONFIRMATION_EXPIRED");
    }
    if (candidate.status === "active") {
      if (!hasConfirmedNewsletterMarker(candidate)) throw new Error("NEWSLETTER_CONFIRMATION_INVALID");
      return { subscription: candidate, replay: true };
    }
    if (candidate.status !== "pending_confirmation") throw new Error("NEWSLETTER_CONFIRMATION_INVALID");

    const [activated] = await tx
      .update(newsletterSubscriptions)
      .set({
        status: "active",
        verifiedAt: new Date(),
        // Retain the hash until the original expiry so a lost successful
        // response can be safely replayed without reactivation or resending.
        metadata: {
          ...syncMetadata(candidate.metadata, "pending"),
          newsletterConsentVersion: 1,
          confirmedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(and(
        eq(newsletterSubscriptions.id, candidate.id),
        eq(newsletterSubscriptions.status, "pending_confirmation"),
        eq(newsletterSubscriptions.verificationToken, tokenHash),
      ))
      .returning();

    if (!activated) throw new Error("NEWSLETTER_CONFIRMATION_INVALID");
    return { subscription: activated, replay: false };
  });

  if (transactionResult.replay) {
    const syncStatus = (transactionResult.subscription.metadata as Record<string, any> | null)?.mailerliteSync?.status;
    return {
      subscription: transactionResult.subscription,
      mailerlite: syncStatus === "synced"
        ? { success: true }
        : { success: false, error: "MAILERLITE_SYNC_PENDING" },
    };
  }
  const mailerlite = await syncConfirmedSubscription(transactionResult.subscription);
  return { subscription: transactionResult.subscription, mailerlite };
}

export async function syncConfirmedSubscription(
  subscription: NewsletterSubscription,
): Promise<ConfirmNewsletterSubscriptionResult["mailerlite"]> {
  const fresh = await db.query.newsletterSubscriptions.findFirst({
    where: eq(newsletterSubscriptions.id, subscription.id),
  });
  if (!fresh || fresh.status !== "active" || !fresh.verifiedAt || !hasConfirmedNewsletterMarker(fresh)) {
    return { success: false, error: "NEWSLETTER_CONFIRMATION_REQUIRED" };
  }
  try {
    await assertNotSuppressed(fresh.email);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "EMAIL_SUPPRESSED" };
  }
  const frequency = fresh.preferences?.frequency === "daily" ? "daily" : "weekly";
  const groupId = mailerLiteGroupIdForFrequency(frequency);
  if (!groupId) {
    const result = { success: false, error: "MAILERLITE_FREQUENCY_GROUP_NOT_CONFIGURED" };
    const syncWhere = fresh.updatedAt
      ? and(eq(newsletterSubscriptions.id, fresh.id), eq(newsletterSubscriptions.status, "active"), eq(newsletterSubscriptions.updatedAt, fresh.updatedAt))
      : and(eq(newsletterSubscriptions.id, fresh.id), eq(newsletterSubscriptions.status, "active"));
    await db.update(newsletterSubscriptions)
      .set({ metadata: syncMetadata(fresh.metadata, "error", result.error), updatedAt: new Date() })
      .where(syncWhere);
    return { success: false, error: result.error };
  }

  let result: ConfirmNewsletterSubscriptionResult["mailerlite"] = null;
  let mutatedRemoteId: string | undefined;
  let attemptedMutation = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remote: Awaited<ReturnType<typeof getMailerLiteSubscriber>> | { success: false; error: string; notFound?: boolean } = isMailerLiteConfigured()
      ? await getMailerLiteSubscriber(fresh.email)
      : { success: false, error: "MAILERLITE_NOT_CONFIGURED" };
    if (remote.success && remote.data && ["unsubscribed", "bounced", "junk"].includes(remote.data.status)) {
      result = { success: false, error: "MAILERLITE_SUBSCRIBER_TERMINAL" };
    } else if (remote.success && remote.data) {
      attemptedMutation = true;
      mutatedRemoteId = remote.data.id;
      result = await updateMailerLiteSubscriber(remote.data.id, {
        language: "ar",
        interests: fresh.preferences?.categories || [],
      });
    } else if (remote.notFound) {
      attemptedMutation = true;
      result = await subscribeToMailerLite({
        email: fresh.email,
        language: "ar",
        interests: fresh.preferences?.categories || [],
        source: fresh.source || "smart-newsletter",
        status: "active",
        groupIds: [groupId],
      });
      mutatedRemoteId = result.data?.id || mutatedRemoteId;
    } else {
      result = { success: false, error: remote.error || "MAILERLITE_LOOKUP_FAILED" };
    }
    if (result.success) {
      result = await reconcileMailerLiteCadenceGroups(fresh.email, groupId);
    }
    if (result.success) break;
  }

  // Even a failed response can follow a successful remote write. Recheck
  // after every mutation attempt, including a failed group reconciliation.
  if (attemptedMutation) {
    const afterSync = await db.query.newsletterSubscriptions.findFirst({
      where: eq(newsletterSubscriptions.id, fresh.id),
    });
    if (!afterSync || afterSync.status !== "active" || !hasConfirmedNewsletterMarker(afterSync)) {
      if (!mutatedRemoteId) {
        const remote = await getMailerLiteSubscriber(fresh.email);
        mutatedRemoteId = remote.data?.id;
      }
      const compensation = mutatedRemoteId
        ? await unsubscribeFromMailerLite(mutatedRemoteId)
        : { success: false };
      if (afterSync && ["unsubscribed", "bounced"].includes(afterSync.status)) {
        await db.update(newsletterSubscriptions).set({
          metadata: syncMetadata(afterSync.metadata, compensation.success ? "synced" : "error",
            compensation.success ? undefined : "UNSUBSCRIBE_SYNC_FAILED"),
          updatedAt: new Date(),
        }).where(and(eq(newsletterSubscriptions.id, afterSync.id), eq(newsletterSubscriptions.status, afterSync.status)));
      }
      return { success: false, error: "NEWSLETTER_LOCAL_STATE_CHANGED" };
    }
    if (afterSync.preferences?.frequency !== fresh.preferences?.frequency) {
      return { success: false, error: "NEWSLETTER_PREFERENCES_CHANGED_RETRY_REQUIRED" };
    }
  }

  const syncWhere = fresh.updatedAt
    ? and(eq(newsletterSubscriptions.id, fresh.id), eq(newsletterSubscriptions.status, "active"), eq(newsletterSubscriptions.updatedAt, fresh.updatedAt))
    : and(eq(newsletterSubscriptions.id, fresh.id), eq(newsletterSubscriptions.status, "active"));
  await db.update(newsletterSubscriptions)
    .set({
      metadata: syncMetadata(fresh.metadata, result?.success ? "synced" : "error", result?.error),
      updatedAt: new Date(),
    })
    .where(syncWhere);
  return result;
}

export async function retryNewsletterMailerLiteSync(
  subscriptionId: string,
): Promise<ConfirmNewsletterSubscriptionResult["mailerlite"]> {
  const subscription = await db.query.newsletterSubscriptions.findFirst({
    where: eq(newsletterSubscriptions.id, subscriptionId),
  });
  if (!subscription || !["active", "unsubscribed", "bounced"].includes(subscription.status) || (subscription.status === "active" && (!subscription.verifiedAt || !hasConfirmedNewsletterMarker(subscription)))) {
    return { success: false, error: "NEWSLETTER_SUBSCRIPTION_NOT_ACTIVE" };
  }
  if (["unsubscribed", "bounced"].includes(subscription.status)) {
    const remote = await getMailerLiteSubscriber(subscription.email);
    const result = remote.success && remote.data
      ? await unsubscribeFromMailerLite(remote.data.id)
      : remote.notFound ? { success: true, error: undefined } : { success: false, error: remote.error || "MAILERLITE_SUBSCRIBER_NOT_FOUND" };
    await db.update(newsletterSubscriptions)
      .set({ metadata: syncMetadata(subscription.metadata, result.success ? "synced" : "error", result.error), updatedAt: new Date() })
      .where(eq(newsletterSubscriptions.id, subscription.id));
    return { success: result.success, ...(result.error ? { error: result.error } : {}) };
  }
  try {
    await assertNotSuppressed(subscription.email);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "EMAIL_SUPPRESSED" };
  }
  return syncConfirmedSubscription(subscription);
}
