// النشر الاجتماعي من لوحة الوكالة: الوكالة تجهّز تغريدة لخبرها المنشور
// على حساب سبق في X. بموافقة فريق سبق (الافتراضي) أو نشر مباشر حسب إعداد
// الوكالة. يعيد استخدام مسار النشر الاجتماعي كما هو (المسودة، الجدولة،
// العامل، سجل المحاولات)؛ هنا فقط قواعد الوكالة والملكية والإشعارات.
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { articles, socialPosts, users, type Publisher, type SocialPost } from "@shared/schema";
import { sendEmailNotification } from "./email";
import {
  assertValidScheduleTime,
  buildArticleUrl,
  cancelPost,
  claimPostForImmediatePublish,
  createDraftPost,
  getConnectedAccount,
  getPost,
  publishClaimedPost,
  schedulePost,
  SocialPublishValidationError,
  updateEditablePost,
} from "./socialPublishing/socialPublishingService";
import { activeSocialTransport } from "./socialPublishing/publerApiClient";
import { suggestSocialPostForArticle } from "./socialPublishing/suggestService";
import { listPublisherMembers, notifyAdmins, notifyPublisherMembers } from "./publisherPortalService";
import { sendEditorWhatsAppNotice } from "./editorAlerts";
import { button, emailShell, escapeHtml } from "./publisherRenewalService";

export type AgencySocialMode = "off" | "approval" | "direct";
export type AgencyMediaChoice = "article" | "images" | "video" | "none";
export type AgencySocialAction = "submit" | "publish_now" | "schedule";

/** المهلة التي يمكن فيها طلب تغريدة للخبر بعد نشره. */
export const AGENCY_SOCIAL_WINDOW_MS = 48 * 60 * 60 * 1000;
/** عدد مرات توليد النص المسموحة لكل وكالة في اليوم (بتوقيت الرياض). */
export const AGENCY_SOCIAL_AI_DAILY_LIMIT = 5;

const LIVE_STATUSES = ["scheduled", "processing", "published"];

export function agencySocialMode(publisher: Pick<Publisher, "socialPublishMode">): AgencySocialMode {
  const mode = publisher.socialPublishMode;
  return mode === "off" || mode === "direct" ? mode : "approval";
}

export function allowedAgencyActions(mode: AgencySocialMode): AgencySocialAction[] {
  if (mode === "direct") return ["publish_now", "schedule"];
  if (mode === "approval") return ["submit"];
  return [];
}

export function agencySocialWindow(publishedAt: Date | string | null, now = new Date()) {
  if (!publishedAt) return { eligible: false, expiresAt: null as string | null };
  const expires = new Date(new Date(publishedAt).getTime() + AGENCY_SOCIAL_WINDOW_MS);
  return { eligible: now < expires, expiresAt: expires.toISOString() };
}

/** يحوّل اختيار الوسائط في الواجهة إلى حقول المنشور في مسار النشر الحالي. */
export function agencyPostMedia(choice: AgencyMediaChoice, urls: string[], articleImageUrl: string | null) {
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  switch (choice) {
    case "article":
      if (!articleImageUrl) throw new SocialPublishValidationError("الخبر بلا صورة؛ ارفع صورة أو اختر «بلا وسائط»");
      return { imageSource: "article" as const, imageUrl: articleImageUrl, mediaKind: "none" as const, mediaUrls: [] };
    case "images":
      return { imageSource: "none" as const, imageUrl: null, mediaKind: "image" as const, mediaUrls: clean };
    case "video":
      return { imageSource: "none" as const, imageUrl: null, mediaKind: "video" as const, mediaUrls: clean };
    default:
      return { imageSource: "none" as const, imageUrl: null, mediaKind: "none" as const, mediaUrls: [] };
  }
}

// عداد التوليد في الذاكرة: يكفي حدًا تقريبيًا للكلفة، ويُصفَّر مع إعادة التشغيل.
const aiUsage = new Map<string, number>();
const riyadhDay = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export function agencyAiRemaining(publisherId: string, now = new Date()): number {
  return Math.max(0, AGENCY_SOCIAL_AI_DAILY_LIMIT - (aiUsage.get(`${publisherId}:${riyadhDay(now)}`) ?? 0));
}

function consumeAgencyAi(publisherId: string, now = new Date()) {
  const key = `${publisherId}:${riyadhDay(now)}`;
  aiUsage.set(key, (aiUsage.get(key) ?? 0) + 1);
}

async function loadAgencyArticle(publisher: Publisher, articleId: string) {
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      status: articles.status,
      publishedAt: articles.publishedAt,
      publisherId: articles.publisherId,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!article || article.publisherId !== publisher.id) return null;
  return article;
}

export type AgencySocialState = "off" | "not_published" | "expired" | "open" | "pending" | "live";

export async function getAgencySocialStatus(publisher: Publisher, articleId: string, now = new Date()) {
  const article = await loadAgencyArticle(publisher, articleId);
  if (!article) return null;
  const mode = agencySocialMode(publisher);
  const posts = await db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.articleId, articleId))
    .orderBy(desc(socialPosts.createdAt))
    .limit(20);
  const agencyPost = posts.find((p) => p.publisherId === publisher.id) ?? null;
  const live = posts.find((p) => LIVE_STATUSES.includes(p.status)) ?? null;
  const window = agencySocialWindow(article.publishedAt, now);
  const isPublished = article.status === "published" && Boolean(article.publishedAt);

  let state: AgencySocialState;
  if (mode === "off") state = "off";
  else if (live) state = "live";
  else if (agencyPost && (agencyPost.status === "draft" || agencyPost.status === "failed")) state = "pending";
  else if (!isPublished) state = "not_published";
  else if (!window.eligible) state = "expired";
  else state = "open";

  const account = await getConnectedAccount("x");
  return {
    mode,
    state,
    allowedActions: allowedAgencyActions(mode),
    accountConnected: Boolean(account && account.status === "connected"),
    accountHandle: account?.handle || "sabqorg",
    videoSupported: activeSocialTransport() === "publer",
    aiRemaining: agencyAiRemaining(publisher.id, now),
    windowExpiresAt: window.expiresAt,
    article: {
      id: article.id,
      title: article.title,
      url: buildArticleUrl(article),
      imageUrl: article.imageUrl || null,
      publishedAt: article.publishedAt,
    },
    post: agencyPost ? toAgencyPostView(agencyPost) : null,
    livePost: live && live.id !== agencyPost?.id ? toAgencyPostView(live) : null,
  };
}

function toAgencyPostView(post: SocialPost) {
  return {
    id: post.id,
    status: post.status,
    text: post.text,
    textSource: post.textSource,
    includeLink: Boolean(post.linkUrl),
    imageSource: post.imageSource,
    mediaKind: post.mediaKind,
    mediaUrls: Array.isArray(post.mediaUrls) ? post.mediaUrls : [],
    requestedAt: post.requestedAt,
    scheduledAt: post.scheduledAt,
    publishedAt: post.publishedAt,
    externalPostUrl: post.externalPostUrl,
    note: post.status === "canceled" ? post.lastError : null,
  };
}

export interface AgencySocialInput {
  text: string;
  textSource: "title" | "custom" | "ai";
  includeLink: boolean;
  media: AgencyMediaChoice;
  mediaUrls: string[];
  requestedAt: Date | null;
  action: AgencySocialAction;
}

export type AgencySocialOutcome = "submitted" | "updated" | "published" | "scheduled";

const AGENCY_REQUESTS_URL = "https://sabq.org/dashboard/social-publishing?filter=agency";
/** نسخة بريدية من تنبيه تغريدات الوكالات (طلب الإدارة، 6 أكتوبر 2026). */
const AGENCY_SOCIAL_ALERT_EMAIL = "aalhazmi@sabq.org";

/**
 * إنشاء أو تعديل تغريدة الوكالة لخبرها، ثم إرسالها للموافقة أو نشرها
 * حسب إعداد الوكالة. تغريدة واحدة حية لكل خبر.
 */
export async function saveAgencySocialPost(
  publisher: Publisher,
  userId: string,
  articleId: string,
  input: AgencySocialInput,
  now = new Date(),
): Promise<{ outcome: AgencySocialOutcome; post: SocialPost }> {
  const status = await getAgencySocialStatus(publisher, articleId, now);
  if (!status) throw new SocialPublishValidationError("الخبر غير موجود", 404);
  if (status.mode === "off") throw new SocialPublishValidationError("النشر الاجتماعي غير مفعّل لوكالتكم", 403);
  if (!status.allowedActions.includes(input.action)) {
    throw new SocialPublishValidationError(
      status.mode === "approval" ? "تغريدات وكالتكم تُرسل لموافقة فريق سبق" : "إجراء غير متاح",
      403,
    );
  }
  if (status.state === "live") {
    throw new SocialPublishValidationError("لهذا الخبر تغريدة منشورة أو مجدولة بالفعل", 409);
  }
  if (status.state === "not_published") {
    throw new SocialPublishValidationError("يمكن طلب التغريدة بعد نشر الخبر");
  }
  if (status.state === "expired") {
    throw new SocialPublishValidationError("انتهت مهلة 48 ساعة لطلب تغريدة لهذا الخبر");
  }
  if (input.media === "video" && !status.videoSupported) {
    throw new SocialPublishValidationError("نشر الفيديو غير متاح حاليًا");
  }

  const requestedAt = input.requestedAt;
  if (input.action === "schedule" && !requestedAt) {
    throw new SocialPublishValidationError("اختر موعد النشر");
  }
  if (requestedAt) assertValidScheduleTime(requestedAt);

  const text = input.textSource === "title" ? status.article.title : input.text;
  const media = agencyPostMedia(input.media, input.mediaUrls, status.article.imageUrl);
  const pendingId = status.state === "pending" ? status.post?.id ?? null : null;
  const askedAt = input.action === "submit" ? requestedAt : null;

  let post: SocialPost;
  if (pendingId) {
    await updateEditablePost(pendingId, { text, includeLink: input.includeLink, ...media });
    const [updated] = await db
      .update(socialPosts)
      .set({ textSource: input.textSource, requestedAt: askedAt, updatedAt: new Date() })
      .where(and(eq(socialPosts.id, pendingId), inArray(socialPosts.status, ["draft", "failed"])))
      .returning();
    if (!updated) throw new SocialPublishValidationError("تعذر التعديل، التغريدة دخلت مرحلة النشر", 409);
    post = updated;
  } else {
    post = await createDraftPost({
      articleId,
      text,
      textSource: input.textSource,
      includeLink: input.includeLink,
      ...media,
      createdByUserId: userId,
      publisherId: publisher.id,
      requestedAt: askedAt,
    });
  }

  const riyadh = (d: Date) =>
    d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
  // واتساب رئيس التحرير ونسخة بالبريد: لا ينتظرهما الطلب، وفشلهما لا يُفشل التغريدة
  const whatsapp = (headline: string) => {
    void sendEditorWhatsAppNotice(
      `${headline}\nالوكالة: ${publisher.agencyName}\nالخبر: ${status.article.title}\nالتغريدة: ${text.slice(0, 200)}\n${AGENCY_REQUESTS_URL}`,
    ).catch((err) => console.error("[Agency Social] WhatsApp notice failed:", err));
    void sendEmailNotification({
      to: AGENCY_SOCIAL_ALERT_EMAIL,
      subject: `سبق | ${headline.replace(/^\S+\s/, "")} · ${publisher.agencyName}`,
      html: emailShell(`
        <h3 style="margin:0 0 8px;color:#0f172a">${escapeHtml(headline)}</h3>
        <p><strong>الوكالة:</strong> ${escapeHtml(publisher.agencyName)}<br><strong>الخبر:</strong> ${escapeHtml(status.article.title)}</p>
        <p style="white-space:pre-wrap;background:#f1f5f9;border-radius:8px;padding:12px">${escapeHtml(text)}</p>
        ${button(AGENCY_REQUESTS_URL, "طلبات الوكالات")}`),
    }).catch((err) => console.error("[Agency Social] email notice failed:", err));
  };

  if (input.action === "publish_now") {
    const claimed = await claimPostForImmediatePublish(post.id);
    if (!claimed) throw new SocialPublishValidationError("التغريدة قيد النشر بالفعل", 409);
    const result = await publishClaimedPost(claimed, userId);
    if (result.status !== "published") {
      throw new SocialPublishValidationError(result.lastError || "تعذر النشر، حاولوا مرة أخرى", 502);
    }
    whatsapp("🐦 وكالة نشرت تغريدة على حساب سبق");
    return { outcome: "published", post: result };
  }
  if (input.action === "schedule") {
    const scheduled = await schedulePost(post.id, requestedAt!);
    whatsapp(`🗓️ وكالة جدولت تغريدة على حساب سبق (${riyadh(requestedAt!)})`);
    return { outcome: "scheduled", post: scheduled };
  }

  if (!pendingId) {
    const when = askedAt
      ? `تطلب النشر ${askedAt.toLocaleString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}`
      : "تطلب النشر بعد الموافقة";
    await notifyAdmins({
      title: `طلب نشر اجتماعي من ${publisher.agencyName}`,
      body: `«${status.article.title}» · ${when}`,
      deeplink: "/dashboard/social-publishing?filter=agency",
    });
    whatsapp(`🐦 طلب تغريدة من وكالة بانتظار موافقتك${askedAt ? ` (موعد مطلوب: ${riyadh(askedAt)})` : ""}`);
  }
  return { outcome: pendingId ? "updated" : "submitted", post };
}

/** سحب الوكالة لتغريدتها قبل نشرها. */
export async function withdrawAgencySocialPost(publisher: Publisher, userId: string, postId: string) {
  const post = await getPost(postId);
  if (!post || post.publisherId !== publisher.id) {
    throw new SocialPublishValidationError("التغريدة غير موجودة", 404);
  }
  return cancelPost(postId, userId, null);
}

export async function listAgencySocialPosts(publisher: Publisher) {
  const creator = alias(users, "agency_social_creator");
  const rows = await db
    .select({
      post: socialPosts,
      articleTitle: articles.title,
      creatorFirst: creator.firstName,
      creatorLast: creator.lastName,
    })
    .from(socialPosts)
    .leftJoin(articles, eq(socialPosts.articleId, articles.id))
    .leftJoin(creator, eq(socialPosts.createdByUserId, creator.id))
    .where(eq(socialPosts.publisherId, publisher.id))
    .orderBy(desc(socialPosts.createdAt))
    .limit(100);
  const memberIds = new Set(((await listPublisherMembers(publisher.id)) ?? []).map((m) => m.id));
  return rows.map(({ post, articleTitle, creatorFirst, creatorLast }) => {
    const withdrawn = post.status === "canceled" && Boolean(post.canceledByUserId && memberIds.has(post.canceledByUserId));
    return {
      ...toAgencyPostView(post),
      articleId: post.articleId,
      articleTitle,
      createdAt: post.createdAt,
      createdByName: [creatorFirst, creatorLast].filter(Boolean).join(" ") || null,
      withdrawn,
      note: post.status === "canceled" && !withdrawn ? post.lastError : null,
    };
  });
}

/** نص مقترح للتغريدة بنفس مولّد صفحة النشر الاجتماعي، بحد يومي لكل وكالة. */
export async function suggestAgencySocialText(publisher: Publisher, userId: string, articleId: string, now = new Date()) {
  const article = await loadAgencyArticle(publisher, articleId);
  if (!article) throw new SocialPublishValidationError("الخبر غير موجود", 404);
  if (agencySocialMode(publisher) === "off") {
    throw new SocialPublishValidationError("النشر الاجتماعي غير مفعّل لوكالتكم", 403);
  }
  if (agencyAiRemaining(publisher.id, now) <= 0) {
    throw new SocialPublishValidationError(
      `استخدمتم توليد النص ${AGENCY_SOCIAL_AI_DAILY_LIMIT} مرات اليوم. اكتبوا النص بأنفسكم أو جرّبوا غدًا.`,
      429,
    );
  }
  const suggestion = await suggestSocialPostForArticle({ articleId, userId });
  consumeAgencyAi(publisher.id, now);
  const tags = suggestion.hashtags.map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "_")}`).join(" ");
  return { text: tags ? `${suggestion.post}\n${tags}` : suggestion.post, remaining: agencyAiRemaining(publisher.id, now) };
}

const arDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

/** إشعار أعضاء الوكالة بقرار فريق سبق على تغريدتهم (من مسار النشر الاجتماعي). */
export async function notifyAgencyOfSocialPost(
  post: SocialPost,
  articleTitle: string,
  event: "social_published" | "social_scheduled" | "social_rejected",
  reviewerNote: string | null,
) {
  if (!post.publisherId) return;
  try {
    const members = (await listPublisherMembers(post.publisherId)) ?? [];
    // سحب الوكالة لتغريدتها ليس قرارًا يحتاج إشعارًا
    if (event === "social_rejected" && post.canceledByUserId && members.some((m) => m.id === post.canceledByUserId)) return;

    const title = articleTitle;
    const payload =
      event === "social_published"
        ? { title: "نُشرت تغريدة خبركم على X", body: `«${title}»` }
        : event === "social_scheduled"
          ? {
              title: "جُدولت تغريدة خبركم على X",
              body: post.scheduledAt ? `«${title}» · تُنشر ${arDateTime(post.scheduledAt)}` : `«${title}»`,
            }
          : {
              title: "اعتذر فريق سبق عن تغريدة خبركم",
              body: reviewerNote ? `«${title}» · ${reviewerNote}` : `«${title}»`,
            };
    await notifyPublisherMembers(post.publisherId, { ...payload, deeplink: "/dashboard/publisher/social" });

    if (event === "social_scheduled") return;
    // البريد لعضو الوكالة الذي أرسل التغريدة
    const [sender] = await db.select({ email: users.email }).from(users).where(eq(users.id, post.createdByUserId)).limit(1);
    if (!sender?.email) return;
    await sendEmailNotification({
      to: sender.email,
      subject: `سبق | ${payload.title}`,
      html: emailShell(`
        <h3 style="margin:0 0 8px;color:#0f172a">${escapeHtml(payload.title)}</h3>
        <p>«${escapeHtml(title)}»</p>
        ${event === "social_rejected" && reviewerNote ? `<p>ملاحظة فريق سبق: ${escapeHtml(reviewerNote)}</p>` : ""}
        ${event === "social_published" && post.externalPostUrl ? button(post.externalPostUrl, "عرض التغريدة") : button("https://sabq.org/dashboard/publisher/social", "منشوراتي الاجتماعية")}
        <p>فريق النشر في صحيفة سبق</p>`),
    });
  } catch (err) {
    console.error("[Publisher Social] notify failed:", err);
  }
}
