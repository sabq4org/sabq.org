import { articles, botPublisherTokens } from "@shared/schema";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { authenticatePublisherTokenId } from "./botPublisherTokenService";
import { assertMediaLicenseAllowsSubmission } from "./mediaLicenseService";
import { deductPublisherCreditSafely } from "./publisherCreditService";
import { logArticleEvent } from "./articleEventsService";
import { logActivity } from "../rbac";

type ScheduledArticle = Pick<typeof articles.$inferSelect, "id" | "title" | "sourceMetadata" | "publisherId">;

/** Revocation, account suspension and permission changes also stop pending schedules. */
export async function personalBotScheduledReleaseAllowed(article: ScheduledArticle): Promise<boolean> {
  const owner = article.sourceMetadata?.publisherUserId;
  const tokenId = article.sourceMetadata?.publisherTokenId;
  if (!owner || !tokenId) return false;
  const principal = await authenticatePublisherTokenId(tokenId);
  if (!principal || principal.userId !== owner || !principal.capabilities.includes("publish")) return false;
  if ((principal.publisherId ?? null) !== article.publisherId) return false;
  return (await assertMediaLicenseAllowsSubmission(owner)).ok;
}

/** Called only after the atomic scheduled -> published transition succeeds. */
export async function recordPersonalBotScheduledPublish(article: ScheduledArticle): Promise<void> {
  const actorId = article.sourceMetadata!.publisherUserId!;
  const metadata = { channel: "bot-drafts-api", scheduled: true, tokenId: article.sourceMetadata!.publisherTokenId };
  await Promise.allSettled([
    logArticleEvent({ articleId: article.id, eventType: "published", actorId, summary: "نشر مجدول عبر تطبيق نشر سبق", metadata }),
    logActivity({ userId: actorId, action: "published", entityType: "article", entityId: article.id, newValue: { title: article.title, status: "published" }, metadata }),
    ...(article.sourceMetadata?.publisherOwnerUserId ? [deductPublisherCreditSafely({
      authorUserId: article.sourceMetadata.publisherOwnerUserId, articleId: article.id, actorId,
    })] : []),
  ]).then((results) => {
    for (const result of results) if (result.status === "rejected") console.error("[BotDrafts] scheduled publication side effect failed");
  });
}


/** Check revocation/expiry again in the very SQL statement that publishes. */
export function personalBotScheduledWriteCondition(article: ScheduledArticle): SQL | undefined {
  if (!article.sourceMetadata?.publisherUserId) return undefined;
  return sql`exists (
    select 1 from ${botPublisherTokens}
    where ${botPublisherTokens.id} = ${article.sourceMetadata.publisherTokenId ?? ""}
      and ${botPublisherTokens.userId} = ${article.sourceMetadata.publisherUserId}
      and ${botPublisherTokens.revokedAt} is null
      and ${botPublisherTokens.expiresAt} > now()
  )`;
}

/** A permanently rejected schedule returns to draft, preventing worker starvation. */
export async function stopUnauthorizedPersonalSchedule(article: typeof articles.$inferSelect): Promise<void> {
  const now = new Date();
  const reason = "أوقفت الجدولة وأعيدت المادة مسودة لأن اعتماد المستخدم أو صلاحية النشر لم تعد صالحة. أعد الربط واعتماد الموعد بعد تصحيح الصلاحية.";
  const [changed] = await db.update(articles).set({
    status: "draft", scheduledAt: null, updatedAt: now,
    sourceMetadata: { ...article.sourceMetadata!, scheduleFailure: { at: now.toISOString(), reason } },
  }).where(and(eq(articles.id, article.id), eq(articles.status, "scheduled"), eq(articles.updatedAt, article.updatedAt))).returning({ id: articles.id });
  if (!changed) return;
  await Promise.allSettled([
    logArticleEvent({ articleId: article.id, eventType: "unpublished", actorId: article.sourceMetadata!.publisherUserId!, summary: reason, metadata: { channel: "bot-drafts-api", reason: "schedule_authorization_lost" } }),
    logActivity({ userId: article.sourceMetadata!.publisherUserId!, action: "bot_schedule_stopped", entityType: "article", entityId: article.id, newValue: { status: "draft", reason } }),
  ]);
}
