// «مكتب سبق» — توليد صورة مقال الرأي أو إعادة توليدها من bot-desk API (2026-11-16).
//
// لماذا: «جهّز وجدول» يولّد الصورة مرة واحدة، فإن تعذرت يُجدول المقال بلا صورة
// ولا سبيل بعدها لتوليدها (التجهيز يرفض المجدول بـ 409). هذا المسار يولّد الصورة
// وحدها لمسودة بانتظار المكتب أو لمقال مجدول، بالدالة نفسها (generateOpinionImage).
//
// ما يكتبه: image_url وis_ai_generated_image (وupdated_at كنسخة المقال) فقط.
// لا يغيّر status ولا scheduled_at ولا published_at أبداً: الحفظ مشروط بأن تبقى
// الحالة والموعد والنشر والصورة كما كانت عند بدء العملية، فإن نُشر المقال أو
// أُعيدت جدولته أو غُيّرت صورته أثناء التوليد لا يُحفظ شيء وتفشل العملية برسالة.
//
// التزامن (أكثر من نسخة خادم):
//   - المطالبة بالعملية داخل معاملة بقفل استشاري على المفتاح
//     staff_app.opinion_image:<articleId> (مثل «جهّز وجدول»). نداء ثانٍ أثناء عملية
//     جارية يعيد العملية نفسها (created=false → 202) ولا يبدأ توليداً آخر.
//   - صورة المقال تُقرأ من جديد تحت القفل: إن كانت موجودة ولا force → لا توليد.
//   - مسار الصور يسمح بصورة واحدة قيد التوليد لكل مستخدم؛ إن كانت للحساب صورة
//     أخرى جارية (مثل تجهيز مقال آخر) ننتظر حتى BUSY_WAIT_MS ثم نعيد المحاولة.
//   - عملية «جارية» بلا نبض منذ IMAGE_STALE_MS تُعد منقطعة ويمكن البدء من جديد.
import { randomUUID } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, systemSettings, type Article } from "@shared/schema";
import type { BotDeskOpinionImageJob } from "@shared/botDesk";
import { resolveStaffOpinionArticleStatus } from "@shared/staffApp";
import { logActivity } from "../rbac";
import { recordArticleSave } from "./articleHistoryService";
import { articleLockAllowsWriter, nextArticleVersion } from "./articleWriteVersion";
import { draftLockMessageFor } from "./draftLockService";
import { buildOpinionImagePrompt } from "./opinionPrepareText";
import { stripHtmlToText } from "./proofreadService";
import { StaffOpinionDeskError } from "./staffOpinionDeskService";
import {
  OPINION_PREP_IMAGE_MODEL,
  generateOpinionImage,
  getOpinionPrepJob,
  imageFailureDetail,
  lockHeldByOther,
} from "./staffOpinionPrepareService";

const IMAGE_KEY_PREFIX = "staff_app.opinion_image:";
/** انتظار صورة أخرى للحساب نفسه (مهلة مسار الصور 4 دقائق). */
export const OPINION_IMAGE_BUSY_WAIT_MS = 5 * 60_000;
/** عملية جارية بلا نبض منذ هذه المدة تُعد منقطعة. */
export const OPINION_IMAGE_STALE_MS = 10 * 60_000;

type StoredJob = BotDeskOpinionImageJob & { runId: string; actorId: string; heartbeatAt: string };

/** ما قرأناه تحت القفل؛ الحفظ مشروط ببقائه كما هو. */
interface ArticleSnapshot {
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  imageUrl: string | null;
}

export function opinionImageKey(articleId: string): string {
  return `${IMAGE_KEY_PREFIX}${articleId}`;
}

function publicJob(job: StoredJob): BotDeskOpinionImageJob {
  const { runId: _r, actorId: _a, heartbeatAt: _h, ...rest } = job;
  return rest;
}

function asStoredJob(value: unknown, now = Date.now()): StoredJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as StoredJob;
  if (typeof job.runId !== "string" || typeof job.status !== "string") return null;
  if (job.status === "running" && now - Date.parse(job.heartbeatAt) > OPINION_IMAGE_STALE_MS) {
    return {
      ...job,
      status: "failed",
      step: null,
      finishedAt: job.heartbeatAt,
      message: "انقطع توليد الصورة قبل اكتماله. أعد المحاولة.",
    };
  }
  return job;
}

async function writeJob(job: StoredJob): Promise<void> {
  await db
    .update(systemSettings)
    .set({ value: job as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(and(
      eq(systemSettings.key, opinionImageKey(job.articleId)),
      sql`${systemSettings.value}->>'runId' = ${job.runId}`,
    ));
}

export async function getOpinionImageJob(articleId: string): Promise<BotDeskOpinionImageJob | null> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, opinionImageKey(articleId)))
    .limit(1);
  const job = asStoredJob(row?.value);
  return job ? publicJob(job) : null;
}

/** المسموح: مسودة رأي بانتظار المكتب (new_draft/in_prep) أو مقال مجدول. */
export function assertOpinionImageAllowed(row: {
  status: string | null;
  reviewStatus: string | null;
  source?: string | null;
}): void {
  if (row.status === "published") {
    throw new StaffOpinionDeskError(409, "conflict", "المقال منشور؛ غيّر صورته من لوحة التحكم");
  }
  const resolved = resolveStaffOpinionArticleStatus(row);
  if (resolved !== "new_draft" && resolved !== "in_prep" && resolved !== "scheduled") {
    throw new StaffOpinionDeskError(
      409,
      "conflict",
      "توليد الصورة متاح لمسودة رأي بانتظار المكتب أو لمقال مجدول فقط",
    );
  }
}

/** وصف الصورة كما في «جهّز وجدول»: العنوان + الملخص (أو المقتطف أو بداية النص). */
export function opinionImagePromptFor(article: Pick<Article, "title" | "aiSummary" | "excerpt" | "content">): string {
  const summary = article.aiSummary?.trim()
    || article.excerpt?.trim()
    || stripHtmlToText(article.content || "").slice(0, 300);
  return buildOpinionImagePrompt({ title: article.title, summary });
}

export type StartOpinionImageOutcome = "started" | "in_progress" | "image_exists";

export async function startOpinionImage(input: {
  articleId: string;
  actorId: string;
  force?: boolean;
}): Promise<{ job: BotDeskOpinionImageJob | null; outcome: StartOpinionImageOutcome; imageUrl: string | null }> {
  const force = input.force === true;
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, input.articleId), eq(articles.articleType, "opinion")))
    .limit(1);
  if (!article) throw new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود");
  assertOpinionImageAllowed(article);

  // «جهّز وجدول» يولّد الصورة بنفسه ويكتب المقال في نهايته.
  const prep = await getOpinionPrepJob(article.id);
  if (prep?.status === "running") {
    throw new StaffOpinionDeskError(409, "conflict", "التجهيز جارٍ على هذا المقال وسيولّد الصورة؛ تابع حالة التجهيز");
  }
  const draftLock = await draftLockMessageFor(article.id, input.actorId);
  if (draftLock) throw new StaffOpinionDeskError(409, "conflict", draftLock);
  const holder = await lockHeldByOther(article.id, input.actorId);
  if (holder) throw new StaffOpinionDeskError(409, "conflict", `المقال مفتوح للتحرير عند ${holder} الآن`);

  const key = opinionImageKey(article.id);
  const claimed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const [row] = await tx
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    const existing = asStoredJob(row?.value);
    if (existing?.status === "running") {
      return { job: existing, outcome: "in_progress" as const, imageUrl: existing.previousImageUrl, snapshot: null };
    }
    // نقرأ المقال من جديد تحت القفل: عملية سابقة ربما حفظت صورة للتو.
    const [fresh] = await tx
      .select({
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        source: articles.source,
        scheduledAt: articles.scheduledAt,
        publishedAt: articles.publishedAt,
        imageUrl: articles.imageUrl,
      })
      .from(articles)
      .where(eq(articles.id, article.id))
      .limit(1);
    if (!fresh) throw new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود");
    assertOpinionImageAllowed(fresh);
    if (fresh.imageUrl && !force) {
      return { job: existing, outcome: "image_exists" as const, imageUrl: fresh.imageUrl, snapshot: null };
    }
    const now = new Date().toISOString();
    const job: StoredJob = {
      articleId: article.id,
      status: "running",
      step: "generating",
      force,
      startedAt: now,
      finishedAt: null,
      imageUrl: null,
      previousImageUrl: fresh.imageUrl ?? null,
      message: null,
      runId: randomUUID(),
      actorId: input.actorId,
      heartbeatAt: now,
    };
    await tx
      .insert(systemSettings)
      .values({ key, value: job as unknown as Record<string, unknown>, category: "staff_app", isPublic: false })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: job as unknown as Record<string, unknown>, updatedAt: new Date() },
      });
    const snapshot: ArticleSnapshot = {
      status: fresh.status,
      scheduledAt: fresh.scheduledAt ?? null,
      publishedAt: fresh.publishedAt ?? null,
      imageUrl: fresh.imageUrl ?? null,
    };
    return { job, outcome: "started" as const, imageUrl: fresh.imageUrl ?? null, snapshot };
  });

  if (claimed.outcome === "started" && claimed.job && claimed.snapshot) {
    const job = claimed.job;
    const snapshot = claimed.snapshot;
    const prompt = opinionImagePromptFor(article);
    setImmediate(() => {
      void runOpinionImage(job, snapshot, prompt).catch((err) => {
        console.error("[opinion-image] unexpected failure:", err);
      });
    });
  }
  return {
    job: claimed.job ? publicJob(claimed.job) : null,
    outcome: claimed.outcome,
    imageUrl: claimed.imageUrl,
  };
}

export async function runOpinionImage(initial: StoredJob, snapshot: ArticleSnapshot, prompt: string): Promise<StoredJob> {
  let job = initial;
  const advance = async (patch: Partial<StoredJob>) => {
    job = { ...job, ...patch, heartbeatAt: new Date().toISOString() };
    await writeJob(job);
  };
  let saved: Article | null = null;
  let before: Article | null = null;
  try {
    const imageUrl = await generateOpinionImage(prompt, job.actorId, {
      waitForBusyMs: OPINION_IMAGE_BUSY_WAIT_MS,
      onWait: () => advance({ step: "waiting_for_slot" }),
    });
    await advance({ step: "saving" });

    [before] = await db.select().from(articles).where(eq(articles.id, job.articleId)).limit(1);
    // الحفظ مشروط: الحالة والموعد والنشر والصورة كما قرأناها عند البدء، ولا قفل لزميل.
    const [row] = await db
      .update(articles)
      .set({ imageUrl, isAiGeneratedImage: true, updatedAt: nextArticleVersion } as Record<string, unknown>)
      .where(and(
        eq(articles.id, job.articleId),
        eq(articles.articleType, "opinion"),
        eq(articles.status, snapshot.status),
        snapshot.scheduledAt ? eq(articles.scheduledAt, snapshot.scheduledAt) : isNull(articles.scheduledAt),
        snapshot.publishedAt ? eq(articles.publishedAt, snapshot.publishedAt) : isNull(articles.publishedAt),
        snapshot.imageUrl ? eq(articles.imageUrl, snapshot.imageUrl) : isNull(articles.imageUrl),
        articleLockAllowsWriter(job.actorId),
      ))
      .returning();
    if (!row) {
      throw new StaffOpinionDeskError(
        409,
        "conflict",
        "تغيّر المقال أثناء التوليد (نُشر أو أُعيدت جدولته أو تغيّرت صورته أو فُتح للتحرير)، فلم تُحفظ الصورة.",
      );
    }
    saved = row;
    if (before) {
      await recordArticleSave({
        before,
        after: row,
        actorId: job.actorId,
        summary: job.force ? "أعاد مكتب سبق توليد صورة مقال الرأي" : "ولّد مكتب سبق صورة مقال الرأي",
        metadata: { channel: "bot-desk-api", flow: "opinion-image", force: job.force },
      }).catch((err) => console.error("[opinion-image] history record failed:", err));
    }
    job = {
      ...job,
      status: "done",
      step: null,
      imageUrl,
      finishedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      message: null,
    };
    await writeJob(job);
  } catch (error) {
    console.warn("[opinion-image] failed", { articleId: job.articleId, error: (error as Error)?.message });
    job = {
      ...job,
      status: "failed",
      step: null,
      finishedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      message: error instanceof StaffOpinionDeskError
        ? error.message
        : `تعذر توليد الصورة: ${imageFailureDetail(error)}`,
    };
    await writeJob(job).catch((err) => console.error("[opinion-image] status write failed:", err));
  }

  await logActivity({
    userId: job.actorId,
    action: "staff_opinion_image",
    entityType: "article",
    entityId: job.articleId,
    oldValue: { imageUrl: snapshot.imageUrl, status: snapshot.status, scheduledAt: snapshot.scheduledAt?.toISOString() ?? null },
    newValue: {
      outcome: job.status,
      imageUrl: saved?.imageUrl ?? snapshot.imageUrl,
      status: saved?.status ?? snapshot.status,
      scheduledAt: (saved?.scheduledAt ?? snapshot.scheduledAt)?.toISOString?.() ?? null,
    },
    metadata: {
      channel: "bot-desk-api",
      force: job.force,
      imageModel: job.status === "done" ? OPINION_PREP_IMAGE_MODEL : undefined,
    },
  }).catch((err) => console.error("[opinion-image] audit failed:", err));
  return job;
}
