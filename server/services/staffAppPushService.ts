import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db";
import {
  permissions,
  pushDevices,
  rolePermissions,
  roles,
  userPermissionOverrides,
  userRoles,
  users,
} from "@shared/schema";
import {
  PERMISSION_CODES,
  ROLE_PERMISSIONS_MAP,
  SUPERUSER_ROLE_NAMES,
} from "@shared/rbac-constants";
import {
  DEFAULT_STAFF_ALERT_PREFS,
  STAFF_APP_BUNDLE_ID,
  isStaffQuietHour,
  type StaffAlertKind,
  type StaffAlertPrefs,
} from "@shared/staffApp";
import { userHasPermission } from "../rbac";
import { clipDeskAlertExcerpt } from "./deskBotAlerts";
import { isOpinionTicketNotifyRecipient } from "./opinionTicketNotice";
import { getStaffAlertPrefsForUsers, listStaffAlertOptInUserIds } from "./staffAlertPrefsService";
import { sendPushToUserApp, type UserAppPushMessage } from "./userAppPushService";

/**
 * Roles that grant `permissionCode` in code (`ROLE_PERMISSIONS_MAP` + superusers).
 */
function getCodeRolesWithPermission(permissionCode: string): string[] {
  const roleSet = new Set<string>([...SUPERUSER_ROLE_NAMES]);
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    if (Array.isArray(perms) && (perms.includes("*") || perms.includes(permissionCode))) {
      roleSet.add(roleName);
    }
  }
  return [...roleSet];
}

/**
 * Returns active user IDs who currently hold `permissionCode` (live RBAC check
 * per candidate). Candidates: code roles, RBAC roles, DB role grants, allow
 * overrides, and anyone with an active desk-app device.
 */
export async function listStaffPermissionRecipientUserIds(
  permissionCode: string,
  excludeUserId?: string | null,
): Promise<string[]> {
  try {
    const codeRoleNames = getCodeRolesWithPermission(permissionCode);

    const rbacRoleUserIds = db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(roles.name, codeRoleNames));

    const dbPermRoleUserIds = db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(permissions.code, permissionCode));

    const overrideAllowUserIds = db
      .select({ userId: userPermissionOverrides.userId })
      .from(userPermissionOverrides)
      .where(
        and(
          eq(userPermissionOverrides.permissionCode, permissionCode),
          eq(userPermissionOverrides.effect, "allow"),
        ),
      );

    const deskDeviceUserIds = db
      .select({ userId: pushDevices.userId })
      .from(pushDevices)
      .where(
        and(
          eq(pushDevices.bundleId, STAFF_APP_BUNDLE_ID),
          eq(pushDevices.isActive, true),
        ),
      );

    const candidates = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.status, "active"),
          or(
            inArray(users.role, codeRoleNames),
            inArray(users.id, rbacRoleUserIds),
            inArray(users.id, dbPermRoleUserIds),
            inArray(users.id, overrideAllowUserIds),
            inArray(users.id, deskDeviceUserIds),
          ),
        ),
      );

    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const uniqueIds = new Set<string>();
    for (const row of candidates) {
      if (!row?.id || row.id === excludeUserId) continue;
      if (row.role === "reader" && !isOpinionTicketNotifyRecipient(row.role, [])) {
        continue;
      }
      const allowed = await userHasPermission(row.id, permissionCode);
      if (allowed) {
        uniqueIds.add(row.id);
      }
    }

    return [...uniqueIds];
  } catch (err) {
    console.error("[StaffAppPush] listStaffPermissionRecipientUserIds failed:", err);
    return [];
  }
}

/**
 * Returns active user IDs who currently hold `social_publish.view_log`.
 */
export async function listSocialDeskRecipientUserIds(
  excludeUserId?: string | null,
): Promise<string[]> {
  return listStaffPermissionRecipientUserIds(
    PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG,
    excludeUserId,
  );
}

/** صلاحية مشرفي تطبيق الديسك (صحة النظام + تنبيهات الإدارة). */
export const STAFF_ADMIN_ALERT_PERMISSION = "ai_hub.view";

export type StaffAdminAlertPref = Extract<StaffAlertKind, "aiAlerts" | "adminAlerts">;

/** الساعة (0–23) بتوقيت الرياض. */
export function riyadhHour(date: Date = new Date()): number {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Riyadh" }).format(date),
    );
    if (Number.isFinite(hour)) return hour % 24;
  } catch {
    // يسقط إلى الحساب الثابت أدناه (الرياض UTC+3 بلا توقيت صيفي).
  }
  return (date.getUTCHours() + 3) % 24;
}

/**
 * يطبّق تفضيلات العضو على إشعار الديسك: null إن أطفأ هذا النوع، ونسخة صامتة
 * (passive) في ساعاته الهادئة، وإلا الرسالة كما هي.
 */
export function applyStaffDeskPrefs(
  prefs: StaffAlertPrefs | undefined,
  kind: StaffAlertKind,
  message: UserAppPushMessage,
  now: Date = new Date(),
): UserAppPushMessage | null {
  const p = prefs ?? DEFAULT_STAFF_ALERT_PREFS;
  if (p[kind] === false) return null;
  if (isStaffQuietHour(p.quietHours, riyadhHour(now))) {
    return { ...message, interruptionLevel: "passive" };
  }
  return message;
}

/** تفضيلات المستلمين؛ إن تعذّرت القراءة يُعامل الجميع بالافتراضي (يصلهم كل شيء). */
export async function loadStaffDeskPrefs(userIds: string[]): Promise<Map<string, StaffAlertPrefs>> {
  try {
    return await getStaffAlertPrefsForUsers(userIds);
  } catch (err) {
    console.error("[StaffAppPush] alert prefs lookup failed:", err);
    return new Map();
  }
}

/** المشرفون النشطون (ai_hub.view) الذين فعّلوا التفضيل المطلوب. */
export async function listStaffAdminAlertRecipientIds(
  pref: StaffAdminAlertPref,
): Promise<string[]> {
  const ids = await listStaffPermissionRecipientUserIds(STAFF_ADMIN_ALERT_PERMISSION);
  if (ids.length === 0) return [];
  const prefs = await loadStaffDeskPrefs(ids);
  return ids.filter((id) => prefs.get(id)?.[pref] !== false);
}

/** يرسل إشعاراً لحزمة الديسك فقط إلى المشرفين المفعّلين للتفضيل. لا يرمي. */
export async function sendStaffAdminPush(
  pref: StaffAdminAlertPref,
  message: UserAppPushMessage,
): Promise<number> {
  try {
    const ids = await listStaffPermissionRecipientUserIds(STAFF_ADMIN_ALERT_PERMISSION);
    if (ids.length === 0) return 0;
    const prefs = await loadStaffDeskPrefs(ids);
    const results = await Promise.all(
      ids.map(async (recipientId) => {
        const personal = applyStaffDeskPrefs(prefs.get(recipientId), pref, message);
        if (!personal) return 0;
        try {
          const r = await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, personal);
          return r.sent;
        } catch (pushErr) {
          console.error("[StaffAppPush] admin push to recipient failed:", pushErr);
          return 0;
        }
      }),
    );
    return results.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[StaffAppPush] sendStaffAdminPush failed:", err);
    return 0;
  }
}

/** HH:mm بتوقيت الرياض وبأرقام لاتينية. */
export function formatRiyadhTime(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Riyadh",
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** إشعار عاجل للمشرفين عند فشل نشر تغريدة فشلاً نهائياً. لا يرمي. */
export async function notifyStaffAdminsOfSocialFailure(input: {
  postId: string;
  text?: string | null;
  error?: string | null;
  at?: Date;
}): Promise<void> {
  const excerpt = clipDeskAlertExcerpt(input.text || "", 80);
  const reason = clipDeskAlertExcerpt(input.error || "", 100);
  const time = formatRiyadhTime(input.at ?? new Date());
  const parts = [excerpt ? `«${excerpt}»` : null, reason || null, time].filter(Boolean);
  await sendStaffAdminPush("adminAlerts", {
    title: "فشل نشر تغريدة",
    body: parts.join(" — "),
    type: "admin_alert",
    deeplink: "sabqdesk://alerts",
    data: { postId: input.postId },
    collapseId: `desk-social-failed-${input.postId}`,
    interruptionLevel: "time-sensitive",
  });
}

export async function notifyStaffDeskOfSocialProposal(input: {
  postId: string;
  proposalKind: "author" | "agency";
  senderName: string;
  articleTitle: string;
  text: string;
  isUpdate?: boolean;
  excludeUserId?: string | null;
  /** عنوان بديل للإشعار (مثل مقترح محرر من «نشر سبق»). */
  titleOverride?: string;
}): Promise<void> {
  try {
    const recipientIds = await listSocialDeskRecipientUserIds(input.excludeUserId);
    if (recipientIds.length === 0) return;

    const title = input.titleOverride?.trim()
      ? input.titleOverride.trim()
      : input.proposalKind === "agency"
        ? `مقترح تغريدة من وكالة: ${input.senderName}`
        : input.isUpdate
          ? `تحديث مقترح تغريدة: ${input.senderName}`
          : `مقترح تغريدة من كاتب: ${input.senderName}`;
    const excerpt = clipDeskAlertExcerpt(input.text || input.articleTitle, 140);
    const body = input.articleTitle ? `«${input.articleTitle}» — ${excerpt}` : excerpt;
    const deeplink = `sabqdesk://social/${input.postId}`;

    const prefs = await loadStaffDeskPrefs(recipientIds);
    await Promise.all(
      recipientIds.map(async (recipientId) => {
        const message = applyStaffDeskPrefs(prefs.get(recipientId), "socialProposals", {
          title,
          body,
          type: "desk.social_proposal",
          deeplink,
          data: {
            postId: input.postId,
            proposalKind: input.proposalKind,
          },
          collapseId: `desk-social-${input.postId}`,
        });
        if (!message) return;
        try {
          await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, message);
        } catch (pushErr) {
          console.error("[StaffAppPush] social push to recipient failed:", pushErr);
        }
      }),
    );
  } catch (err) {
    console.error("[StaffAppPush] notifyStaffDeskOfSocialProposal failed:", err);
  }
}

/**
 * مستلمو تنبيه «مقال رأي جديد»: كل عضو نشط يملك مراجعة الرأي (`opinion.review`)
 * أو الجدولة (`articles.schedule`) — الصلاحيتان نفسهما اللتان يشترطهما
 * `GET /api/opinion-writers/:writerId/next-slot` و`week-board`.
 */
export const OPINION_DESK_RECIPIENT_PERMISSIONS = [
  PERMISSION_CODES.OPINION_REVIEW,
  PERMISSION_CODES.ARTICLES_SCHEDULE,
] as const;

export async function listOpinionDeskRecipientUserIds(
  excludeUserId?: string | null,
): Promise<string[]> {
  const lists = await Promise.all(
    OPINION_DESK_RECIPIENT_PERMISSIONS.map((code) =>
      listStaffPermissionRecipientUserIds(code, excludeUserId),
    ),
  );
  return [...new Set(lists.flat())];
}

/**
 * إشعار تطبيق الديسك بمقال رأي جديد بانتظار المراجعة. يحترم مفتاح
 * «مقالات الرأي» (`opinionDrafts`) والساعات الهادئة. لا يرمي.
 *
 * الرابط `sabqdesk://opinion/<id>`: التطبيق الحالي لا يعرف هذا المسار بعد،
 * فيتجاهله ويفتح التطبيق على شاشته الحالية (لا نضع ticketId/postId في data
 * حتى لا يُفسَّر كتذكرة أو تغريدة).
 */
export async function notifyStaffDeskOfOpinionDraft(input: {
  articleId: string;
  title: string;
  body: string;
  authorId?: string | null;
  nextSlot?: string | null;
}): Promise<number> {
  try {
    const recipientIds = await listOpinionDeskRecipientUserIds(input.authorId);
    if (recipientIds.length === 0) return 0;
    const prefs = await loadStaffDeskPrefs(recipientIds);
    const results = await Promise.all(
      recipientIds.map(async (recipientId) => {
        const message = applyStaffDeskPrefs(prefs.get(recipientId), "opinionDrafts", {
          title: input.title,
          body: input.body,
          type: "desk.opinion_draft",
          deeplink: `sabqdesk://opinion/${input.articleId}`,
          data: {
            articleId: input.articleId,
            ...(input.nextSlot ? { nextSlot: input.nextSlot } : {}),
          },
          collapseId: `desk-opinion-${input.articleId}`,
        });
        if (!message) return 0;
        try {
          const r = await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, message);
          return r.sent;
        } catch (pushErr) {
          console.error("[StaffAppPush] opinion draft push to recipient failed:", pushErr);
          return 0;
        }
      }),
    );
    return results.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[StaffAppPush] notifyStaffDeskOfOpinionDraft failed:", err);
    return 0;
  }
}

/**
 * خبر جديد نشره زميل أو شريك من تطبيق «نشر سبق»: إشعار لكل من يملك
 * articles.publish (عدا الناشر نفسه)، يحترم مفتاح «أخبار نشر سبق»
 * (`publisherNews`) والساعات الهادئة. يفتح مركز التنبيهات. لا يرمي.
 */
export async function notifyStaffDeskOfPublisherNews(input: {
  articleId: string;
  title: string;
  publisherName: string | null;
  excludeUserId?: string | null;
  /** نشره بوت بتوكن البيئة (قروك…) لا زميل ولا وكالة: يتبع مفتاح «نشاط البوتات». */
  fromBot?: boolean;
  /** رابط الخبر المنشور؛ التطبيق الأحدث يفتحه مباشرة بدل مركز التنبيهات. */
  linkUrl?: string | null;
}): Promise<number> {
  try {
    const recipientIds = await listStaffPermissionRecipientUserIds(
      PERMISSION_CODES.ARTICLES_PUBLISH,
      input.excludeUserId,
    );
    if (recipientIds.length === 0) return 0;
    const prefs = await loadStaffDeskPrefs(recipientIds);
    const title = input.publisherName ? `خبر جديد من ${input.publisherName}` : "خبر جديد عبر بوت النشر";
    const body = clipDeskAlertExcerpt(input.title, 160);
    const results = await Promise.all(
      recipientIds.map(async (recipientId) => {
        const message = applyStaffDeskPrefs(prefs.get(recipientId), input.fromBot ? "botNews" : "publisherNews", {
          title,
          body,
          type: "desk.publisher_news",
          // النسخ الأقدم تفتح مركز التنبيهات؛ الأحدث تقرأ linkUrl أولاً.
          deeplink: "sabqdesk://notifications",
          data: { articleId: input.articleId, ...(input.linkUrl ? { linkUrl: input.linkUrl } : {}) },
          collapseId: `desk-news-${input.articleId}`,
        });
        if (!message) return 0;
        try {
          const r = await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, message);
          return r.sent;
        } catch (pushErr) {
          console.error("[StaffAppPush] publisher news push to recipient failed:", pushErr);
          return 0;
        }
      }),
    );
    return results.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[StaffAppPush] notifyStaffDeskOfPublisherNews failed:", err);
    return 0;
  }
}

/**
 * خبر من مراسل بانتظار القرار، أو «طلب تعديل» على خبر (2026-10-31): إشعار لكل
 * من يملك articles.publish (عدا المرسل نفسه)، يحترم مفتاح «أخبار المراسلين»
 * (`newsDrafts`) والساعات الهادئة. يفتح تبويب «الأخبار» على الخبر أو الطلب. لا يرمي.
 */
export async function notifyStaffDeskOfNewsItem(input: {
  kind: "draft" | "edit_request";
  articleId: string;
  /** معرّف طلب التعديل (edit_request فقط). */
  requestId?: string | null;
  title: string;
  senderName: string;
  senderId?: string | null;
  urgent?: boolean;
  /** «العنوان والنص»، «+3 صور»… لطلب التعديل. */
  label?: string | null;
}): Promise<number> {
  try {
    const recipientIds = await listStaffPermissionRecipientUserIds(
      PERMISSION_CODES.ARTICLES_PUBLISH,
      input.senderId,
    );
    if (recipientIds.length === 0) return 0;
    const prefs = await loadStaffDeskPrefs(recipientIds);
    const isRequest = input.kind === "edit_request";
    const title = isRequest
      ? `${input.urgent ? "طلب تعديل عاجل" : "طلب تعديل"} من ${input.senderName}`
      : `خبر جديد من ${input.senderName}`;
    const excerpt = clipDeskAlertExcerpt(input.title, 160);
    const body = isRequest && input.label ? `${input.label}: ${excerpt}` : excerpt;
    const deeplink = isRequest && input.requestId
      ? `sabqdesk://news/edit-request/${input.requestId}`
      : `sabqdesk://news/${input.articleId}`;
    const results = await Promise.all(
      recipientIds.map(async (recipientId) => {
        const message = applyStaffDeskPrefs(prefs.get(recipientId), "newsDrafts", {
          title,
          body,
          type: isRequest ? "desk.edit_request" : "desk.news_draft",
          deeplink,
          data: {
            articleId: input.articleId,
            ...(isRequest && input.requestId ? { editRequestId: input.requestId } : {}),
          },
          collapseId: isRequest ? `desk-edit-request-${input.requestId}` : `desk-news-draft-${input.articleId}`,
        });
        if (!message) return 0;
        try {
          const r = await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, message);
          return r.sent;
        } catch (pushErr) {
          console.error("[StaffAppPush] news item push to recipient failed:", pushErr);
          return 0;
        }
      }),
    );
    return results.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[StaffAppPush] notifyStaffDeskOfNewsItem failed:", err);
    return 0;
  }
}

/**
 * مسودة خبر أضافها بوت (قروك، «نشر سبق»…) وتنتظر قرار محرر (2026-11-10): إشعار
 * لكل من يملك articles.publish، يحترم مفتاح «نشاط البوتات» (`botNews`) والساعات
 * الهادئة، ويفتح المسودة في تبويب «الأخبار». collapseId نفسه الذي يستعمله إشعار
 * «نُشر الخبر»، فإن نُشرت المسودة بعد لحظات حلّ إشعار النشر محل هذا. لا يرمي.
 */
export async function notifyStaffDeskOfBotDraft(input: {
  articleId: string;
  title: string;
  botName: string | null;
  excludeUserId?: string | null;
}): Promise<number> {
  try {
    const recipientIds = await listStaffPermissionRecipientUserIds(
      PERMISSION_CODES.ARTICLES_PUBLISH,
      input.excludeUserId,
    );
    if (recipientIds.length === 0) return 0;
    const prefs = await loadStaffDeskPrefs(recipientIds);
    const title = input.botName ? `مسودة خبر من ${input.botName}` : "مسودة خبر من بوت";
    const body = clipDeskAlertExcerpt(input.title, 160);
    const results = await Promise.all(
      recipientIds.map(async (recipientId) => {
        const message = applyStaffDeskPrefs(prefs.get(recipientId), "botNews", {
          title,
          body,
          type: "desk.bot_draft",
          deeplink: `sabqdesk://news/${input.articleId}`,
          data: { articleId: input.articleId },
          collapseId: `desk-news-${input.articleId}`,
        });
        if (!message) return 0;
        try {
          const r = await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, message);
          return r.sent;
        } catch (pushErr) {
          console.error("[StaffAppPush] bot draft push to recipient failed:", pushErr);
          return 0;
        }
      }),
    );
    return results.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[StaffAppPush] notifyStaffDeskOfBotDraft failed:", err);
    return 0;
  }
}

/**
 * أعضاء فعّلوا صراحةً تفضيلاً افتراضيه مطفأ ويملكون إحدى الصلاحيات الآن.
 * يبدأ من قائمة المفعِّلين (قصيرة) بدل فحص صلاحيات كل الطاقم.
 */
export async function listStaffOptInRecipientUserIds(
  kind: StaffAlertKind,
  permissionCodes: readonly string[],
  excludeUserId?: string | null,
): Promise<string[]> {
  const optedIn = (await listStaffAlertOptInUserIds(kind)).filter((id) => id !== excludeUserId);
  if (optedIn.length === 0) return [];
  const active = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, optedIn), eq(users.status, "active")));
  const out: string[] = [];
  for (const row of active) {
    for (const code of permissionCodes) {
      if (await userHasPermission(row.id, code)) {
        out.push(row.id);
        break;
      }
    }
  }
  return out;
}

export type StaffDeskFollowEvent = "tweet_scheduled" | "tweet_published" | "opinion_scheduled";

/** عنوان إشعار المتابعة. دالة نقية للاختبار. */
export function staffDeskFollowTitle(event: StaffDeskFollowEvent, botName?: string | null): string {
  if (event === "opinion_scheduled") return "جُدول مقال رأي";
  const verb = event === "tweet_scheduled" ? "جُدولت" : "نُشرت";
  return botName ? `${verb} تغريدة من ${botName}` : `${verb} تغريدة`;
}

/**
 * إشعار «للعلم» (2026-11-10): تغريدة جُدولت أو نُشرت، أو مقال رأي جُدول.
 *  - من بوت (`botName`): يصل كل من يملك الصلاحية ما لم يطفئ «نشاط البوتات».
 *  - من زميل أو من العامل المجدول: يصل فقط من فعّل «متابعة النشر» (مطفأ افتراضياً).
 * لا يرمي.
 */
export async function notifyStaffDeskOfFollowEvent(input: {
  event: StaffDeskFollowEvent;
  targetId: string;
  title: string;
  /** السطر الثاني الجاهز (من فعل ومتى)، يُلحق بالنص. */
  detail?: string | null;
  botName?: string | null;
  excludeUserId?: string | null;
}): Promise<number> {
  try {
    const isOpinion = input.event === "opinion_scheduled";
    const permissionCodes: readonly string[] = isOpinion
      ? OPINION_DESK_RECIPIENT_PERMISSIONS
      : [PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG];
    const pref: StaffAlertKind = input.botName ? "botNews" : "publishFollow";
    const recipientIds = input.botName
      ? [
          ...new Set(
            (
              await Promise.all(
                permissionCodes.map((code) => listStaffPermissionRecipientUserIds(code, input.excludeUserId)),
              )
            ).flat(),
          ),
        ]
      : await listStaffOptInRecipientUserIds("publishFollow", permissionCodes, input.excludeUserId);
    if (recipientIds.length === 0) return 0;
    const prefs = await loadStaffDeskPrefs(recipientIds);
    const excerpt = clipDeskAlertExcerpt(input.title, 140);
    const body = input.detail ? `${excerpt} — ${input.detail}` : excerpt;
    const results = await Promise.all(
      recipientIds.map(async (recipientId) => {
        const message = applyStaffDeskPrefs(prefs.get(recipientId), pref, {
          title: staffDeskFollowTitle(input.event, input.botName),
          body,
          type: `desk.${input.event}`,
          deeplink: isOpinion ? `sabqdesk://opinion/${input.targetId}` : `sabqdesk://social/${input.targetId}`,
          // بلا postId للرأي حتى لا تفسّره نسخة أقدم كتغريدة.
          data: isOpinion ? { articleId: input.targetId } : { postId: input.targetId },
          collapseId: `desk-follow-${input.targetId}`,
          // للعلم لا للقرار: لا يقطع التركيز.
          interruptionLevel: "passive",
        });
        if (!message) return 0;
        try {
          const r = await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, message);
          return r.sent;
        } catch (pushErr) {
          console.error("[StaffAppPush] follow push to recipient failed:", pushErr);
          return 0;
        }
      }),
    );
    return results.reduce((a, b) => a + b, 0);
  } catch (err) {
    console.error("[StaffAppPush] notifyStaffDeskOfFollowEvent failed:", err);
    return 0;
  }
}
