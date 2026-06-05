/**
 * مُقترب — إشعارات داخلية (in-app) عبر notifications_inbox + بثّ لحظي (SSE).
 *
 *   notifyReviewersOfPendingTopic — يُشعر الأدمن/المحررين بموضوع بانتظار المراجعة
 *   notifyAuthorTopicPublished    — يُشعر الكاتب بنشر موضوعه
 *   notifyAuthorTopicReturned     — يُشعر الكاتب بإرجاع موضوعه للتعديل
 *
 * كل دالة محصّنة بـ try/catch داخلي — فشل الإشعار لا يكسر تدفّق المراجعة.
 */

import { db } from "../db";
import { users, roles, userRoles, notificationsInbox } from "@shared/schema";
import { and, eq, or, inArray } from "drizzle-orm";
import { notificationBus } from "../notificationBus";

// أدوار من يحقّ لهم مراجعة مواضيع مُقترب (يطابقون صلاحية muqtarab.manage).
const REVIEWER_ROLE_NAMES = ["admin", "system_admin", "editor"];

const REVIEW_QUEUE_DEEPLINK = "/dashboard/muqtarab/review";
const MY_ANGLE_DEEPLINK = "/dashboard/my-angle";

async function pushInbox(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  deeplink: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  await db.insert(notificationsInbox).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    deeplink: params.deeplink,
    read: false,
    metadata: params.metadata,
  });
  // بثّ لحظي للعميل المتصل (إن وُجد) — التوقيع emit(userId, payload)
  notificationBus.emit(params.userId, {
    type: params.type,
    title: params.title,
    body: params.body,
    deeplink: params.deeplink,
  });
}

/** يُشعر جميع المراجعين (أدمن/محرر، نشطين) بموضوع جديد بانتظار المراجعة. */
export async function notifyReviewersOfPendingTopic(opts: {
  topicId: string;
  topicTitle: string;
  angleName: string;
  authorName: string;
  excludeUserId?: string;
}): Promise<void> {
  try {
    // الأدمن قد يُعرَّف بعمود users.role النصي فقط (بلا صف user_roles)، لذا نجمع
    // الحالتين: الدور النصي أو دور عبر user_roles.
    const reviewers = await db
      .selectDistinct({ id: users.id })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.status, "active"),
          or(inArray(users.role, REVIEWER_ROLE_NAMES), inArray(roles.name, REVIEWER_ROLE_NAMES)),
        ),
      );

    for (const r of reviewers) {
      if (!r.id || r.id === opts.excludeUserId) continue;
      try {
        await pushInbox({
          userId: r.id,
          type: "MuqtarabTopicPendingReview",
          title: "📥 موضوع بانتظار المراجعة",
          body: `أرسل ${opts.authorName} موضوع «${opts.topicTitle}» في زاوية ${opts.angleName}`,
          deeplink: REVIEW_QUEUE_DEEPLINK,
          metadata: { topicId: opts.topicId },
        });
      } catch (err) {
        console.error(`[muqtarab-notify] فشل إشعار المراجع ${r.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[muqtarab-notify] فشل جلب المراجعين:", err);
  }
}

/** يُشعر الكاتب بنشر موضوعه. */
export async function notifyAuthorTopicPublished(opts: {
  userId: string;
  topicId: string;
  topicTitle: string;
  angleName: string;
}): Promise<void> {
  try {
    await pushInbox({
      userId: opts.userId,
      type: "MuqtarabTopicPublished",
      title: "🎉 تم نشر موضوعك",
      body: `نُشر موضوعك «${opts.topicTitle}» في زاوية ${opts.angleName}`,
      deeplink: MY_ANGLE_DEEPLINK,
      metadata: { topicId: opts.topicId },
    });
  } catch (err) {
    console.error("[muqtarab-notify] فشل إشعار الكاتب بالنشر:", err);
  }
}

/** يُشعر الكاتب بإرجاع موضوعه للتعديل. */
export async function notifyAuthorTopicReturned(opts: {
  userId: string;
  topicId: string;
  topicTitle: string;
}): Promise<void> {
  try {
    await pushInbox({
      userId: opts.userId,
      type: "MuqtarabTopicReturned",
      title: "📝 موضوعك يحتاج تعديلاً",
      body: `أُعيد موضوعك «${opts.topicTitle}» للتعديل — راجع ملاحظات المحرر`,
      deeplink: MY_ANGLE_DEEPLINK,
      metadata: { topicId: opts.topicId },
    });
  } catch (err) {
    console.error("[muqtarab-notify] فشل إشعار الكاتب بالإرجاع:", err);
  }
}

/** يُشعر الكاتب برفض موضوعه (لن يُنشر) مع السبب. */
export async function notifyAuthorTopicRejected(opts: {
  userId: string;
  topicId: string;
  topicTitle: string;
  reason?: string | null;
}): Promise<void> {
  try {
    await pushInbox({
      userId: opts.userId,
      type: "MuqtarabTopicRejected",
      title: "📋 لم يُنشر موضوعك",
      body: opts.reason
        ? `لم يُنشر «${opts.topicTitle}» — ${opts.reason}`
        : `لم يُنشر موضوعك «${opts.topicTitle}»`,
      deeplink: MY_ANGLE_DEEPLINK,
      metadata: { topicId: opts.topicId },
    });
  } catch (err) {
    console.error("[muqtarab-notify] فشل إشعار الكاتب بالرفض:", err);
  }
}
