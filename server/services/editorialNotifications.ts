/**
 * Editorial notifications — high-level "notify the author/reporter" helpers.
 *
 * Sits on top of `apnsService.ts` (APNs HTTP/2 sender) and the shared
 * `editorialNotifications` / `editorialNotificationPrefs` tables. Every
 * call here:
 *   1. Checks the recipient's per-type preference and respects opt-outs.
 *   2. Inserts a row into `editorialNotifications` so the in-app history
 *      stays consistent even when APNs delivery fails.
 *   3. Fans out to every active iOS device the recipient has registered.
 *   4. Updates the log row with the final delivery status.
 *
 * The four high-level event types match what the dashboard surfaces:
 *   - article.scheduled   — editor scheduled the piece for future publish
 *   - article.published   — piece is now live
 *   - article.rejected    — piece will not be published (with reason)
 *   - article.needs_revision — editor wants the author to revise & resubmit
 */

import { db } from "../db";
import { and, eq } from "drizzle-orm";
import {
  editorialNotifications,
  editorialNotificationPrefs,
  pushDevices,
} from "@shared/schema";
import {
  sendPushNotification,
  createCustomNotificationPayload,
  isApnsConfigured,
} from "./apnsService";

export type EditorialEvent =
  | "scheduled"
  | "published"
  | "rejected"
  | "needs_revision"
  | "archived"
  | "deleted";

export interface NotifyEditorialArgs {
  /** Recipient — typically `articles.authorId` or `articles.reporterId`. */
  userId: string;
  event: EditorialEvent;
  article: {
    id: string;
    title: string;
    slug: string | null;
    englishSlug?: string | null;
    articleType?: string | null;
    scheduledAt?: Date | null;
    publishedAt?: Date | null;
  };
  /** Editor's note (rejection reason or revision request). Required for
   *  rejected/needs_revision; ignored for scheduled/published. */
  reviewerNote?: string | null;
}

/** Generic "صحيفة سبق" byline account — not a human colleague. */
export const NEWSPAPER_REPORTER_ID = "RnP7eDOAl5T5rGpib9_8d";

const PREFS_DEFAULTS = {
  scheduledEnabled: true,
  publishedEnabled: true,
  rejectedEnabled: true,
  revisionEnabled: true,
};

function isNonHumanAccount(userId: string): boolean {
  return (
    userId === "newspaper" ||
    userId === "system" ||
    userId === "sabq-newspaper" ||
    userId === NEWSPAPER_REPORTER_ID
  );
}

async function fetchUserPrefs(userId: string) {
  const [row] = await db
    .select()
    .from(editorialNotificationPrefs)
    .where(eq(editorialNotificationPrefs.userId, userId))
    .limit(1);
  if (!row) return PREFS_DEFAULTS;
  return {
    scheduledEnabled: row.scheduledEnabled,
    publishedEnabled: row.publishedEnabled,
    rejectedEnabled: row.rejectedEnabled,
    revisionEnabled: row.revisionEnabled,
  };
}

function eventEnabled(prefs: typeof PREFS_DEFAULTS, event: EditorialEvent): boolean {
  switch (event) {
    case "scheduled":      return prefs.scheduledEnabled;
    case "published":      return prefs.publishedEnabled;
    case "rejected":       return prefs.rejectedEnabled;
    case "needs_revision": return prefs.revisionEnabled;
    // Archive/delete are critical — always deliver (in-app + push attempt).
    // Previously gated on `rejectedEnabled` ("الاعتذار / الرفض" toggle in
    // iOS) which caused writers to miss archive/delete entirely when they
    // disabled rejection notifications.
    case "archived":
    case "deleted":
      return true;
  }
}

/** Who should receive editorial pushes for this article? */
export function resolveArticleStakeholderIds(article: {
  reporterId?: string | null;
  authorId?: string | null;
  submitterId?: string | null;
}): string[] {
  const seen = new Set<string>();
  const add = (id?: string | null) => {
    if (!id || isNonHumanAccount(id) || seen.has(id)) return;
    seen.add(id);
  };

  const reporter = article.reporterId;
  const author = article.authorId;

  // Prefer the human byline reporter. When the dropdown still points at the
  // generic newspaper account, fall through to authorId (staff writer / editor
  // who filed the piece) so someone actually receives the alert.
  if (reporter && !isNonHumanAccount(reporter)) {
    add(reporter);
  } else if (author) {
    add(author);
  } else if (reporter) {
    add(reporter);
  }

  if (author) add(author);
  if (article.submitterId) add(article.submitterId);

  return [...seen];
}

/** Format `scheduled_at` as a short Arabic date+time. Uses the
 *  `ar-SA-u-nu-latn` locale extension so digits render as 1234 instead of
 *  ١٢٣٤ — matches the editorial team's product-wide convention. Pinned
 *  to `Asia/Riyadh` because the server runs on UTC; without the
 *  explicit timezone, a 7:25 AM Riyadh schedule was being shown to
 *  authors as 4:25 AM. */
function formatArabicDateTime(d?: Date | null): string {
  if (!d) return "";
  try {
    const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
      timeZone: "Asia/Riyadh",
      weekday: "short",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    return date;
  } catch {
    return d.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
  }
}

function kindLabel(articleType?: string | null): { my: string; the: string } {
  // "مقالتك" vs "خبرك" — used in the Arabic copy.
  const t = (articleType || "news").toLowerCase();
  if (t === "opinion" || t === "analysis" || t === "column") {
    return { my: "مقالتك", the: "المقالة" };
  }
  return { my: "خبرك", the: "الخبر" };
}

function buildCopy(args: NotifyEditorialArgs): { title: string; body: string } {
  const labels = kindLabel(args.article.articleType);
  const title = args.article.title.length > 60
    ? args.article.title.slice(0, 57) + "…"
    : args.article.title;

  switch (args.event) {
    case "scheduled": {
      const when = formatArabicDateTime(args.article.scheduledAt);
      return {
        title: `📅 تمت جدولة ${labels.the}`,
        body: when
          ? `«${title}» — تنشر يوم ${when}`
          : `«${title}» — تمت جدولتها للنشر قريباً`,
      };
    }
    case "published":
      return {
        title: `✅ تم نشر ${labels.my}`,
        body: `«${title}» — اضغط للاطلاع على الإخراج النهائي.`,
      };
    case "rejected": {
      const reason = (args.reviewerNote || "").trim();
      return {
        title: `⚠️ تعذّر نشر ${labels.my}`,
        body: reason
          ? `«${title}» — السبب: ${reason}`
          : `«${title}» — اطّلع على ملاحظة المحرر داخل التطبيق.`,
      };
    }
    case "needs_revision": {
      const note = (args.reviewerNote || "").trim();
      return {
        title: `📝 طلب تعديل على ${labels.the}`,
        body: note
          ? `يؤسفنا إبلاغكم بوجود بعض الملاحظات على ${labels.the} «${title}». الملاحظات: ${note}`
          : `يؤسفنا إبلاغكم بوجود بعض الملاحظات على ${labels.the} «${title}». اطّلع على التفاصيل داخل التطبيق.`,
      };
    }
    case "archived": {
      const reason = (args.reviewerNote || "").trim();
      return {
        title: `📦 قرار بعدم نشر ${labels.the}`,
        body: reason
          ? `يؤسفنا إبلاغكم بعدم نشر ${labels.the} «${title}». السبب: ${reason}`
          : `يؤسفنا إبلاغكم بعدم نشر ${labels.the} «${title}». اطّلع على التفاصيل داخل التطبيق.`,
      };
    }
    case "deleted": {
      const reason = (args.reviewerNote || "").trim();
      return {
        title: `❌ تم حذف ${labels.my} نهائياً`,
        body: reason
          ? `«${title}» — السبب: ${reason}`
          : `«${title}» — لم يعد المحتوى متاحاً على المنصة.`,
      };
    }
  }
}

function buildDeepLink(args: NotifyEditorialArgs): string {
  // sabq://article/<slug>  → news article detail
  // sabq://opinion/<slug>  → opinion article detail (separate iOS view)
  // sabq://draft/<id>      → in-app draft preview (scheduled / needs_revision)
  // sabq://feedback/<id>   → rejection screen with reason + resubmit button
  //
  // Opinion articles MUST use the `opinion` host: ArticleDetailView's
  // loader bails on opinion content (`isOpinionContent` guard), so a
  // `sabq://article/<opinion-slug>` deep link used to leave the user
  // stuck on a skeleton-loading screen forever. The split mirrors how
  // the rest of the iOS app routes opinions vs news.
  const id = args.article.id;
  const slug = args.article.slug || args.article.englishSlug || "";
  const isOpinion = (args.article.articleType || "").toLowerCase() === "opinion";
  switch (args.event) {
    case "published":
      if (!slug) return `sabq://draft/${id}`;
      return isOpinion ? `sabq://opinion/${slug}` : `sabq://article/${slug}`;
    case "scheduled":      return `sabq://draft/${id}`;
    case "needs_revision": return `sabq://draft/${id}`;
    case "rejected":       return `sabq://feedback/${id}`;
    // Same surface as rejection — the author opens an in-app screen that
    // shows the archive reason and (where applicable) a "resubmit" path.
    case "archived":       return `sabq://feedback/${id}`;
    // Permanent deletion has no live article surface to deep-link to;
    // send the author to the same feedback screen as rejection/archive
    // so the deletion reason is visible alongside other editor notes.
    case "deleted":        return `sabq://feedback/${id}`;
  }
}

/**
 * Main entry point — sends the push (best-effort) and always records the
 * notification in `editorialNotifications` so the in-app history is the
 * source of truth.
 */
export async function notifyEditorialEvent(args: NotifyEditorialArgs): Promise<void> {
  try {
    if (!args.userId || isNonHumanAccount(args.userId)) {
      return;
    }

    // Respect the user's per-type preference. We still don't write a log row
    // because the user explicitly opted out of this event class — surfacing
    // it in the history would defeat the opt-out.
    const prefs = await fetchUserPrefs(args.userId);
    if (!eventEnabled(prefs, args.event)) {
      return;
    }

    const { title, body } = buildCopy(args);
    const deepLink = buildDeepLink(args);

    // Insert log row first — we update it after the APNs response so the in-app
    // notification center has a record either way.
    const [logRow] = await db
      .insert(editorialNotifications)
      .values({
        userId: args.userId,
        type: args.event,
        title,
        body,
        articleId: args.article.id,
        articleTitle: args.article.title,
        articleSlug: args.article.slug,
        deepLink,
        reviewerNote: args.reviewerNote ?? null,
        deliveryStatus: "pending",
      })
      .returning({ id: editorialNotifications.id });

    // Find iOS devices to deliver to.
    const devices = await db
      .select({ token: pushDevices.deviceToken, provider: pushDevices.tokenProvider })
      .from(pushDevices)
      .where(and(
        eq(pushDevices.userId, args.userId),
        eq(pushDevices.platform, "ios"),
        eq(pushDevices.isActive, true),
      ));

    // Only APNs tokens are sent through the apnsService; FCM iOS tokens go
    // through Firebase elsewhere if/when that pipeline is added.
    const apnsTokens = devices
      .filter(d => d.provider === "apns")
      .map(d => d.token);

    if (apnsTokens.length === 0) {
      await db.update(editorialNotifications)
        .set({ deliveryStatus: "no_device" })
        .where(eq(editorialNotifications.id, logRow.id));
      return;
    }

    if (!isApnsConfigured()) {
      await db.update(editorialNotifications)
        .set({ deliveryStatus: "failed", deliveryError: "APNS_NOT_CONFIGURED" })
        .where(eq(editorialNotifications.id, logRow.id));
      return;
    }

    // Send to each device. We deliberately use the existing per-token sender
    // here (not the campaign batch) because each device gets identical
    // payload + we don't want the result mingled with campaign analytics.
    const results = await Promise.all(apnsTokens.map(t =>
      sendPushNotification(
        t,
        createCustomNotificationPayload(title, body, {
          deeplink: deepLink,
          articleId: args.article.id,
          type: `editorial.${args.event}`,
          // "active" = banner + sound, "time-sensitive" = bypasses focus modes
          // when relevant. Rejected/revision are time-sensitive so the author
          // sees them in their next focus window.
          priority: (args.event === "rejected" || args.event === "needs_revision" || args.event === "archived")
            ? "time-sensitive"
            : "active",
          category: `EDITORIAL_${args.event.toUpperCase()}`,
        }),
        { priority: "10", pushType: "alert" }
      )
    ));

    const anySuccess = results.some(r => r.success);
    const errors = results.filter(r => !r.success).map(r => r.reason || "unknown").join("; ");

    await db.update(editorialNotifications)
      .set({
        deliveryStatus: anySuccess ? "sent" : "failed",
        deliveryError: anySuccess ? null : errors,
      })
      .where(eq(editorialNotifications.id, logRow.id));

    console.log(
      `[Editorial Notify] event=${args.event} user=${args.userId} ` +
      `devices=${apnsTokens.length} sent=${results.filter(r => r.success).length}`
    );
  } catch (err) {
    // Never throw — editorial workflow continues even if notifications fail.
    console.error("[Editorial Notify] error:", err);
  }
}

/**
 * Helper used by `routes.ts` to fan out to ALL of an article's stakeholders
 * (author + reporter, when they differ). Deduplicates on userId.
 */
export async function notifyArticleStakeholders(
  article: NotifyEditorialArgs["article"] & { authorId?: string | null; reporterId?: string | null; submitterId?: string | null },
  event: EditorialEvent,
  reviewerNote?: string | null,
): Promise<void> {
  const targets = resolveArticleStakeholderIds(article);

  if (targets.length === 0) {
    console.warn(
      `[Editorial Notify] No human stakeholders for article ${article.id} ` +
      `(reporterId=${article.reporterId ?? "null"}, authorId=${article.authorId ?? "null"}) — ` +
      `event=${event} skipped`,
    );
    return;
  }

  console.log(
    `[Editorial Notify] Fan-out event=${event} article=${article.id} targets=[${targets.join(", ")}]`,
  );

  await Promise.all(
    targets.map(userId =>
      notifyEditorialEvent({ userId, event, article, reviewerNote }),
    ),
  );
}
