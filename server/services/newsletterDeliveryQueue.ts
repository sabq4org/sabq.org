import pLimit from "p-limit";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { log } from "../utils/logger";
import {
  articles,
  audioNewsletterArticles,
  newsletterDeliveryJobs,
  newsletterDeliveryRecipients,
  newsletterSubscriptions,
  type Article,
  type NewsletterDeliveryJob,
  type NewsletterSubscription,
} from "@shared/schema";
import { sendNewsletterEmail } from "./email";
import {
  generateDailyQuestion,
  generateEngagingSummary,
  generateSmartPersonalizedIntro,
  generateSubjectLines,
  isNewsletterAiCircuitOpen,
  resetNewsletterAiCircuit,
  type EnhancedArticleSummary,
} from "./aiNewsletterEnhancer";
import type { NewsletterTemplateType } from "./smartNewsletterTemplates";

type DeliveryNewsletterType = "morning_brief" | "evening_digest" | "weekly_roundup";

type EnqueueDeliveryInput = {
  newsletterId: string;
  newsletterType: DeliveryNewsletterType;
  title: string;
  description: string;
  audioUrl?: string;
  articlesPerSubscriber: number;
};

type ClaimedRecipient = {
  id: string;
  subscriptionId: string;
};

const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_CONCURRENCY = 3;
const MAX_RECIPIENT_ATTEMPTS = 3;
const STALE_LOCK_MINUTES = 10;
const WORKER_POLL_MS = 5_000;
const STALE_RECOVERY_POLL_MS = 60_000;

let workerTimer: NodeJS.Timeout | null = null;
let recoveryTimer: NodeJS.Timeout | null = null;
let workerBusy = false;

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeDeliveryError(error: unknown, email?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutEmail = email ? raw.replaceAll(email, "[redacted]") : raw;
  return withoutEmail.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export async function enqueueNewsletterDelivery(
  input: EnqueueDeliveryInput,
): Promise<NewsletterDeliveryJob> {
  const [inserted] = await db
    .insert(newsletterDeliveryJobs)
    .values({
      newsletterId: input.newsletterId,
      newsletterType: input.newsletterType,
      title: input.title,
      description: input.description,
      audioUrl: input.audioUrl,
      articlesPerSubscriber: input.articlesPerSubscriber,
      status: "queued",
    })
    .onConflictDoNothing({ target: newsletterDeliveryJobs.newsletterId })
    .returning();

  const job = inserted || (await db
    .select()
    .from(newsletterDeliveryJobs)
    .where(eq(newsletterDeliveryJobs.newsletterId, input.newsletterId))
    .limit(1))[0];

  if (!job) {
    throw new Error("Failed to create or recover newsletter delivery job");
  }

  // Snapshot recipients once. ON CONFLICT makes enqueue idempotent.
  await db.execute(sql`
    INSERT INTO newsletter_delivery_recipients (job_id, subscription_id, status)
    SELECT ${job.id}, ${newsletterSubscriptions.id}, 'pending'
    FROM ${newsletterSubscriptions}
    WHERE ${newsletterSubscriptions.status} = 'active'
    ON CONFLICT (job_id, subscription_id) DO NOTHING
  `);

  const [counts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsletterDeliveryRecipients)
    .where(eq(newsletterDeliveryRecipients.jobId, job.id));

  const [updated] = await db
    .update(newsletterDeliveryJobs)
    .set({ totalRecipients: counts?.count || 0, updatedAt: new Date() })
    .where(eq(newsletterDeliveryJobs.id, job.id))
    .returning();

  log.info(
    `[NewsletterDeliveryQueue] Queued job ${job.id} with ${counts?.count || 0} recipients`,
  );
  return updated || job;
}

export async function recoverStaleNewsletterDeliveries(): Promise<void> {
  await db.execute(sql`
    UPDATE newsletter_delivery_recipients
    SET status = 'pending', locked_at = NULL, updated_at = now()
    WHERE status = 'processing'
      AND locked_at < now() - (${STALE_LOCK_MINUTES} * interval '1 minute')
  `);

  await db.execute(sql`
    UPDATE newsletter_delivery_jobs
    SET status = 'queued', updated_at = now()
    WHERE status = 'processing'
      AND updated_at < now() - (${STALE_LOCK_MINUTES} * interval '1 minute')
  `);
}

async function recoverStaleDeliveriesSafely(): Promise<void> {
  try {
    await recoverStaleNewsletterDeliveries();
  } catch (error) {
    console.error(
      `[NewsletterDeliveryWorker] Stale-lock recovery failed: ${sanitizeDeliveryError(error)}`,
    );
  }
}

async function claimNextJob(): Promise<NewsletterDeliveryJob | null> {
  const [candidate] = await db
    .select()
    .from(newsletterDeliveryJobs)
    .where(eq(newsletterDeliveryJobs.status, "queued"))
    .orderBy(asc(newsletterDeliveryJobs.createdAt))
    .limit(1);

  if (!candidate) return null;

  const [claimed] = await db
    .update(newsletterDeliveryJobs)
    .set({
      status: "processing",
      attempts: sql`${newsletterDeliveryJobs.attempts} + 1`,
      startedAt: candidate.startedAt || new Date(),
      updatedAt: new Date(),
      lastError: null,
    })
    .where(and(
      eq(newsletterDeliveryJobs.id, candidate.id),
      eq(newsletterDeliveryJobs.status, "queued"),
    ))
    .returning();

  return claimed || null;
}

async function claimRecipientBatch(jobId: string, batchSize: number): Promise<ClaimedRecipient[]> {
  const result = await db.execute(sql`
    WITH claimed AS (
      SELECT id
      FROM newsletter_delivery_recipients
      WHERE job_id = ${jobId}
        AND (
          status = 'pending'
          OR (status = 'failed' AND attempts < ${MAX_RECIPIENT_ATTEMPTS})
        )
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE newsletter_delivery_recipients AS recipient
    SET status = 'processing',
        attempts = recipient.attempts + 1,
        locked_at = now(),
        updated_at = now(),
        last_error = NULL
    FROM claimed
    WHERE recipient.id = claimed.id
    RETURNING recipient.id, recipient.subscription_id
  `);

  return (result.rows || []).map((row: any) => ({
    id: String(row.id),
    subscriptionId: String(row.subscription_id),
  }));
}

async function loadJobArticles(newsletterId: string): Promise<Article[]> {
  const rows = await db
    .select({ article: articles })
    .from(audioNewsletterArticles)
    .innerJoin(articles, eq(audioNewsletterArticles.articleId, articles.id))
    .where(eq(audioNewsletterArticles.newsletterId, newsletterId))
    .orderBy(asc(audioNewsletterArticles.order));

  return rows.map((row) => row.article);
}

async function refreshJobCounts(jobId: string): Promise<{
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'pending' OR (status = 'failed' AND attempts < ${MAX_RECIPIENT_ATTEMPTS}))::int AS pending,
      count(*) FILTER (WHERE status = 'processing')::int AS processing,
      count(*) FILTER (WHERE status = 'sent')::int AS sent,
      count(*) FILTER (WHERE status = 'failed' AND attempts >= ${MAX_RECIPIENT_ATTEMPTS})::int AS failed,
      count(*) FILTER (WHERE status = 'skipped')::int AS skipped
    FROM newsletter_delivery_recipients
    WHERE job_id = ${jobId}
  `);
  const row = (result.rows?.[0] || {}) as any;
  const counts = {
    pending: Number(row.pending || 0),
    processing: Number(row.processing || 0),
    sent: Number(row.sent || 0),
    failed: Number(row.failed || 0),
    skipped: Number(row.skipped || 0),
  };

  await db
    .update(newsletterDeliveryJobs)
    .set({
      sentCount: counts.sent,
      failedCount: counts.failed,
      skippedCount: counts.skipped,
      aiCircuitOpened: isNewsletterAiCircuitOpen(),
      updatedAt: new Date(),
    })
    .where(eq(newsletterDeliveryJobs.id, jobId));

  return counts;
}

function selectArticlesForSubscriber(
  allArticles: Article[],
  subscriberCategories: string[],
  articlesPerSubscriber: number,
): Article[] {
  if (subscriberCategories.length === 0) {
    return [...allArticles]
      .sort(() => Math.random() - 0.5)
      .slice(0, articlesPerSubscriber);
  }

  const matching = allArticles.filter((article) =>
    subscriberCategories.includes(article.categoryId || ""));
  if (matching.length >= articlesPerSubscriber) {
    return matching.slice(0, articlesPerSubscriber);
  }

  const nonMatching = allArticles.filter((article) =>
    !subscriberCategories.includes(article.categoryId || ""));
  return [...matching, ...nonMatching.slice(0, articlesPerSubscriber - matching.length)];
}

function parseSubscriberCategories(subscriber: NewsletterSubscription): string[] {
  try {
    const preferences = typeof subscriber.preferences === "string"
      ? JSON.parse(String(subscriber.preferences))
      : subscriber.preferences;
    return Array.isArray(preferences?.categories) ? preferences.categories : [];
  } catch {
    return [];
  }
}

async function processRecipient(
  recipient: ClaimedRecipient,
  subscriber: NewsletterSubscription,
  job: NewsletterDeliveryJob,
  allArticles: Article[],
  summaries: Map<string, EnhancedArticleSummary>,
  dailyQuestion: Awaited<ReturnType<typeof generateDailyQuestion>>,
  selectedSubject: Awaited<ReturnType<typeof generateSubjectLines>>[number] | undefined,
): Promise<"sent" | "failed" | "skipped"> {
  if (subscriber.status !== "active") {
    await db
      .update(newsletterDeliveryRecipients)
      .set({ status: "skipped", lockedAt: null, updatedAt: new Date() })
      .where(eq(newsletterDeliveryRecipients.id, recipient.id));
    return "skipped";
  }

  try {
    const categories = parseSubscriberCategories(subscriber);
    const personalizedArticles = selectArticlesForSubscriber(
      allArticles,
      categories,
      job.articlesPerSubscriber,
    );
    const articleSummaries = personalizedArticles.map((article) => {
      const cached = summaries.get(article.id);
      return {
        title: article.newsletterSubtitle || article.title,
        excerpt: cached?.excerpt || article.newsletterExcerpt || article.excerpt || "لا يوجد ملخص متاح",
        url: article.slug
          ? `${process.env.FRONTEND_URL || ""}/article/${article.englishSlug || article.slug}`
          : undefined,
        curiosityHook: cached?.curiosityHook || "",
        keyTakeaway: cached?.keyTakeaway || "",
        engagementScore: cached?.engagementScore || 50,
      };
    });
    const personalizedIntro = await generateSmartPersonalizedIntro(
      undefined,
      categories,
      undefined,
      job.newsletterType as NewsletterTemplateType,
      personalizedArticles[0],
    );
    const result = await sendNewsletterEmail({
      to: subscriber.email,
      newsletterTitle: job.title,
      newsletterDescription: job.description,
      audioUrl: job.audioUrl || undefined,
      articleSummaries,
      newsletterType: job.newsletterType as DeliveryNewsletterType,
      unsubscribeToken: subscriber.id,
      personalizedIntro,
      dailyQuestion,
      aiSubject: selectedSubject?.subject,
      aiPreheader: selectedSubject?.preheader,
    });

    if (!result.success) {
      throw new Error(result.error || "Email provider rejected delivery");
    }

    await db
      .update(newsletterDeliveryRecipients)
      .set({
        status: "sent",
        sentAt: new Date(),
        lockedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(newsletterDeliveryRecipients.id, recipient.id));
    return "sent";
  } catch (error) {
    await db
      .update(newsletterDeliveryRecipients)
      .set({
        status: "failed",
        lockedAt: null,
        lastError: sanitizeDeliveryError(error, subscriber.email),
        updatedAt: new Date(),
      })
      .where(eq(newsletterDeliveryRecipients.id, recipient.id));
    return "failed";
  }
}

export async function processNewsletterDeliveryJob(job: NewsletterDeliveryJob): Promise<void> {
  resetNewsletterAiCircuit();
  const allArticles = await loadJobArticles(job.newsletterId);
  if (allArticles.length === 0) {
    throw new Error("Newsletter delivery job has no linked articles");
  }

  const templateType = job.newsletterType as NewsletterTemplateType;
  const dailyQuestion = await generateDailyQuestion(allArticles, templateType);
  const subjectLines = await generateSubjectLines(allArticles, templateType);
  const selectedSubject = subjectLines[0];

  const summaryCache = new Map<string, EnhancedArticleSummary>();
  const aiSummaryLimit = pLimit(2);
  await Promise.all(allArticles.map((article) => aiSummaryLimit(async () => {
    summaryCache.set(article.id, await generateEngagingSummary(article));
  })));

  const batchSize = boundedEnvInt("NEWSLETTER_DELIVERY_BATCH_SIZE", DEFAULT_BATCH_SIZE, 10, 100);
  const concurrency = boundedEnvInt(
    "NEWSLETTER_DELIVERY_CONCURRENCY",
    DEFAULT_CONCURRENCY,
    1,
    8,
  );
  const deliveryLimit = pLimit(concurrency);

  while (true) {
    const claimed = await claimRecipientBatch(job.id, batchSize);
    if (claimed.length === 0) {
      const counts = await refreshJobCounts(job.id);
      if (counts.processing > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }

      await db
        .update(newsletterDeliveryJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
          lastError: counts.failed > 0 ? `${counts.failed} recipients exhausted retries` : null,
        })
        .where(eq(newsletterDeliveryJobs.id, job.id));
      log.info(
        `[NewsletterDeliveryWorker] Completed job ${job.id}: `
        + `${counts.sent} sent, ${counts.failed} failed, ${counts.skipped} skipped`,
      );
      return;
    }

    const subscriptions = await db
      .select()
      .from(newsletterSubscriptions)
      .where(inArray(
        newsletterSubscriptions.id,
        claimed.map((recipient) => recipient.subscriptionId),
      ));
    const subscriptionsById = new Map(subscriptions.map((subscriber) => [subscriber.id, subscriber]));

    const batchResults = await Promise.all(claimed.map((recipient) => deliveryLimit(async () => {
      const subscriber = subscriptionsById.get(recipient.subscriptionId);
      if (!subscriber) {
        await db
          .update(newsletterDeliveryRecipients)
          .set({ status: "skipped", lockedAt: null, updatedAt: new Date() })
          .where(eq(newsletterDeliveryRecipients.id, recipient.id));
        return "skipped" as const;
      }
      const result = await processRecipient(
        recipient,
        subscriber,
        job,
        allArticles,
        summaryCache,
        dailyQuestion,
        selectedSubject,
      );
      // يحمي مزود البريد من bursts مع إبقاء التوازي محدودًا.
      await new Promise((resolve) => setTimeout(resolve, 200));
      return result;
    })));

    const counts = await refreshJobCounts(job.id);
    const sentInBatch = batchResults.filter((result) => result === "sent").length;
    const failedInBatch = batchResults.filter((result) => result === "failed").length;
    log.info(
      `[NewsletterDeliveryWorker] Job ${job.id} batch ${claimed.length}: `
      + `${sentInBatch} sent, ${failedInBatch} retryable failures; total sent=${counts.sent}`,
    );
  }
}

async function processNextJob(): Promise<void> {
  if (workerBusy) return;
  workerBusy = true;
  let job: NewsletterDeliveryJob | null = null;
  try {
    job = await claimNextJob();
    if (!job) return;
    await processNewsletterDeliveryJob(job);
  } catch (error) {
    const message = sanitizeDeliveryError(error);
    console.error(`[NewsletterDeliveryWorker] Job failed: ${message}`);
    if (job) {
      // claimNextJob already increments attempts before returning the job.
      const terminal = job.attempts >= MAX_RECIPIENT_ATTEMPTS;
      await db
        .update(newsletterDeliveryJobs)
        .set({
          status: terminal ? "failed" : "queued",
          lastError: message,
          completedAt: terminal ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(newsletterDeliveryJobs.id, job.id));
    }
  } finally {
    workerBusy = false;
  }
}

export async function startNewsletterDeliveryWorker(): Promise<void> {
  if (workerTimer) {
    log.info("[NewsletterDeliveryWorker] Already started");
    return;
  }
  await recoverStaleNewsletterDeliveries();
  log.info("[NewsletterDeliveryWorker] Started durable batch worker");
  void processNextJob();
  workerTimer = setInterval(() => void processNextJob(), WORKER_POLL_MS);
  // A surviving replica can recover leases left by a crashed replica; relying
  // only on process startup would leave those jobs stuck indefinitely.
  recoveryTimer = setInterval(
    () => void recoverStaleDeliveriesSafely(),
    STALE_RECOVERY_POLL_MS,
  );
}

export function stopNewsletterDeliveryWorker(): void {
  if (workerTimer) clearInterval(workerTimer);
  if (recoveryTimer) clearInterval(recoveryTimer);
  workerTimer = null;
  recoveryTimer = null;
}
