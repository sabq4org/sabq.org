// ----------------------------------------------------------------------------
// آثار نشر/جدولة مسودة بوت — نفس ما يفعله زر النشر والجدولة في اللوحة.
//
// النشر الفوري: إبطال كاش القرّاء + CDN، IndexNow على englishSlug، بث المحررين،
// ثم تنبيهات المراسل والجمهور وربط القصة والتضمين والصورة المصغّرة.
// الجدولة: إبطال قوائم اللوحة فقط (بلا تدفئة صفحة غير منشورة) وتنبيه الجدولة.
// الترقية إلى published تبقى على publishScheduledArticles في notificationWorker.
// الفشل هنا لا يتراجع عن الكتابة: المادة أصبحت منشورة أو مجدولة.
// ----------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { articles } from "@shared/schema";
import { db } from "../db";
import { memoryCache } from "../memoryCache";
import { invalidateArticleWrite } from "./contentInvalidation";

export interface BotDraftReleaseRow {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  content: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  categoryId: string | null;
  newsType: string;
  articleType: string;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  authorId: string;
  reporterId: string | null;
  submitterId: string | null;
  isFeatured: boolean;
  geoLocations: unknown;
}

function canonicalSlug(article: Pick<BotDraftReleaseRow, "englishSlug" | "slug">): string | null {
  return article.englishSlug || article.slug || null;
}

function stakeholderPayload(article: BotDraftReleaseRow) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    englishSlug: article.englishSlug || undefined,
    articleType: article.articleType,
    scheduledAt: article.scheduledAt,
    publishedAt: article.publishedAt,
    authorId: article.authorId,
    reporterId: article.reporterId,
    submitterId: article.submitterId,
  };
}

async function safe(label: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(`[BotDrafts] ${label} failed:`, error);
  }
}

/** إبطال متزامن ثم تنبيهات في الخلفية. يُستدعى بعد نجاح كتابة status=published. */
export function queueBotDraftPublishEffects(article: BotDraftReleaseRow, botName: string): void {
  try {
    invalidateArticleWrite(article, { reason: `bot-draft-publish:${botName}` });
    memoryCache.delete("lite-feed");
  } catch (error) {
    console.error("[BotDrafts] publish cache invalidation failed:", error);
  }

  const target = canonicalSlug(article);
  if (target) {
    import("../indexNow")
      .then((mod) => mod.notifySearchEngines(target))
      .catch(() => {});
  }

  import("../routes/editorPresence")
    .then((mod) => {
      mod.broadcastArticlePublished({
        articleId: article.id,
        articleTitle: article.title,
        articleSlug: article.slug || null,
        publisherName: `بوت ${botName}`,
        publishedAt: (article.publishedAt instanceof Date ? article.publishedAt : new Date()).toISOString(),
      });
    })
    .catch((error) => console.error("[BotDrafts] publish broadcast failed:", error));

  setImmediate(() => {
    void runPublishFanout(article);
  });
}

/** إبطال قوائم اللوحة وتنبيه الجدولة. لا IndexNow: الصفحة ليست عامة بعد. */
export function queueBotDraftScheduleEffects(article: BotDraftReleaseRow, botName: string): void {
  try {
    invalidateArticleWrite(article, { reason: `bot-draft-schedule:${botName}`, warm: false });
  } catch (error) {
    console.error("[BotDrafts] schedule cache invalidation failed:", error);
  }

  setImmediate(() => {
    void runScheduleFanout(article);
  });
}

async function runPublishFanout(article: BotDraftReleaseRow): Promise<void> {
  const notificationType = article.newsType === "breaking" ? "breaking" : article.isFeatured ? "featured" : "published";

  await safe("reader notification", async () => {
    const { sendArticleNotification } = await import("../notificationService");
    await sendArticleNotification(article, notificationType);
  });

  await safe("legacy notification", async () => {
    const { createNotification } = await import("../notificationEngine");
    await createNotification({
      type: article.newsType === "breaking" ? "BREAKING_NEWS" : "NEW_ARTICLE",
      data: {
        articleId: article.id,
        articleTitle: article.title,
        articleSlug: article.slug,
        categoryId: article.categoryId,
        newsType: article.newsType,
      },
    });
  });

  await safe("reporter notification", async () => {
    const { notifyReporterArticlePublished } = await import("../notificationEngine");
    const { sendReporterPublishEmail, sendEditorPublishAlert } = await import("./editorAlerts");
    await notifyReporterArticlePublished(article.id);
    await sendReporterPublishEmail(article.id);
    await sendEditorPublishAlert({
      id: article.id,
      title: article.title,
      slug: article.slug,
      englishSlug: article.englishSlug || undefined,
      authorName: "صحيفة سبق",
      publishedAt: article.publishedAt ?? undefined,
    });
  });

  await safe("stakeholder notification", async () => {
    const { notifyArticleStakeholders } = await import("./editorialNotifications");
    await notifyArticleStakeholders(stakeholderPayload(article), "published");
  });

  await safe("publisher credit", async () => {
    const { deductPublisherCreditSafely } = await import("./publisherCreditService");
    await deductPublisherCreditSafely({
      authorUserId: article.authorId,
      articleId: article.id,
      actorId: article.authorId,
    });
  });

  await safe("lite image", async () => {
    const { refreshArticleLiteImage } = await import("./articleDerivedWrites");
    await refreshArticleLiteImage(article.id, article.imageUrl);
  });

  if (article.imageUrl && !article.thumbnailUrl) {
    await safe("thumbnail", async () => {
      const { generateArticleThumbnail } = await import("./thumbnailService");
      await generateArticleThumbnail(article.id, article.imageUrl!);
    });
  }

  await safe("vectorize", async () => {
    const { vectorizeArticle } = await import("../embeddingsService");
    await vectorizeArticle(article.id);
  });

  await safe("story link", async () => {
    const { matchAndLinkArticle } = await import("../storyMatcher");
    await matchAndLinkArticle(article.id);
  });

  if (!article.geoLocations) {
    await safe("geo", async () => {
      const { extractGeoLocations } = await import("./geoExtractionService");
      const locations = await extractGeoLocations(article.title, article.content || "");
      if (locations.length > 0) {
        await db.update(articles).set({ geoLocations: locations }).where(eq(articles.id, article.id));
      }
    });
  }
}

async function runScheduleFanout(article: BotDraftReleaseRow): Promise<void> {
  const when = article.scheduledAt instanceof Date ? article.scheduledAt : article.scheduledAt ? new Date(article.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) return;

  await safe("schedule stakeholder", async () => {
    const { notifyArticleStakeholders } = await import("./editorialNotifications");
    await notifyArticleStakeholders(stakeholderPayload(article), "scheduled");
  });

  await safe("schedule reporter", async () => {
    const { notifyReporterArticleScheduled } = await import("../notificationEngine");
    const { sendReporterScheduleEmail } = await import("./editorAlerts");
    await notifyReporterArticleScheduled(article.id, when);
    await sendReporterScheduleEmail(article.id, when);
  });
}
