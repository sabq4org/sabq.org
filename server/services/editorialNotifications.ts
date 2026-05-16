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
  | "archived";

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

const PREFS_DEFAULTS = {
  scheduledEnabled: true,
  publishedEnabled: true,
  rejectedEnabled: true,
  revisionEnabled: true,
};

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
    // Archiving is a deletion-class event — author always needs to know,
    // so we treat it under the same toggle as rejection. (Adding a
    // separate preference would let users silently disappear off the
    // platform without notice.)
    case "archived":       return prefs.rejectedEnabled;
  }
}

/** Format `scheduled_at` as a short Arabic date+time. Falls back to a
 *  date-only render if the time portion isn't useful. */
function formatArabicDateTime(d?: Date | null): string {
  if (!d) return "";
  try {
    const date = new Intl.DateTimeFormat("ar-SA", {
      weekday: "short",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    return date;
  } catch {
    return d.toLocaleString("ar-SA");
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
        title: `✅ نُشرت ${labels.my}`,
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
        title: `📝 ${labels.my} بحاجة تعديل قبل النشر`,
        body: note
          ? `«${title}» — ${note}`
          : `«${title}» — تواصل معك المحرّر بملاحظات للتعديل.`,
      };
    }
    case "archived": {
      const reason = (args.reviewerNote || "").trim();
      return {
        title: `🗄️ تمت أرشفة ${labels.my}`,
        body: reason
          ? `«${title}» — السبب: ${reason}`
          : `«${title}» — اطّلع على تفاصيل الأرشفة داخل التطبيق.`,
      };
    }
  }
}

function buildDeepLink(args: NotifyEditorialArgs): string {
  // sabq://article/<slug>  → public article view (only for published)
  // sabq://draft/<id>      → in-app draft preview (scheduled / needs_revision)
  // sabq://feedback/<id>   → rejection screen with reason + resubmit button
  const id = args.article.id;
  const slug = args.article.slug || args.article.englishSlug || "";
  switch (args.event) {
    case "published":      return slug ? `sabq://article/${slug}` : `sabq://draft/${id}`;
    case "scheduled":      return `sabq://draft/${id}`;
    case "needs_revision": return `sabq://draft/${id}`;
    case "rejected":       return `sabq://feedback/${id}`;
    // Same surface as rejection — the author opens an in-app screen that
    // shows the archive reason and (where applicable) a "resubmit" path.
    case "archived":       return `sabq://feedback/${id}`;
  }
}

/**
 * Main entry point — sends the push (best-effort) and always records the
 * notification in `editorialNotifications` so the in-app history is the
 * source of truth.
 */
export async function notifyEditorialEvent(args: NotifyEditorialArgs): Promise<void> {
  try {
    // Skip system-account events (e.g. when the newspaper account is the
    // submitter). We never want to push to it.
    if (!args.userId || args.userId === "newspaper" || args.userId === "system") {
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
  const seen = new Set<string>();
  const targets = [article.reporterId, article.authorId, article.submitterId]
    .filter((id): id is string => !!id)
    .filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  await Promise.all(targets.map(userId =>
    notifyEditorialEvent({ userId, event, article, reviewerNote })
  ));
}
