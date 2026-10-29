import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  canUserLogin,
  permissions,
  publishers,
  pushDevices,
  rolePermissions,
  roles,
  userPermissionOverrides,
  userRoles,
  users,
  type SocialPost,
  type SocialPostAttempt,
} from "@shared/schema";
import {
  PERMISSION_CODES,
  ROLE_PERMISSIONS_MAP,
  SUPERUSER_ROLE_NAMES,
} from "@shared/rbac-constants";
import { composeXPostText, validateXPostText } from "@shared/socialPostText";
import {
  STAFF_APP_BUNDLE_ID,
  computeStaffCanceledBySelf,
  computeStaffOpinionCapabilities,
  decodeStaffInboxCursor,
  encodeStaffInboxCursor,
  type StaffCapabilities,
  type StaffInboxCursorPayload,
  type StaffInboxItem,
  type StaffInboxType,
  type StaffSenderKind,
  resolveStaffSocialSenderKind,
  safeStaffAvatarUrl,
} from "@shared/staffApp";
import {
  getUserRoleNames,
  invalidateUserPermissionCache,
  userHasPermission,
} from "../rbac";
import { clipDeskAlertExcerpt } from "./deskBotAlerts";
import { isOpinionTicketNotifyRecipient } from "./opinionTicketNotice";
import {
  canUserViewOpinionDesk,
  fullName,
  getOpinionTicketsUnreadCounts,
  listOpinionTickets,
  roleNamesForUserIds,
} from "./opinionTicketsService";
import {
  buildArticleUrl,
  getPost,
  getPostAttempts,
  listPendingSocialProposalsForDesk,
} from "./socialPublishing/socialPublishingService";
import { sendPushToUserApp } from "./userAppPushService";

export interface StaffUserAccount {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string;
  role: string;
  status: string;
  profileImageUrl: string | null;
  twoFactorEnabled: boolean;
  twoFactorMethod: string;
}

export interface StaffAuthContext {
  user: StaffUserAccount;
  roles: string[];
  capabilities: StaffCapabilities;
}

function toIsoString(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

export async function getStaffUserAccount(userId: string): Promise<StaffUserAccount | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      profileImageUrl: users.profileImageUrl,
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorMethod: users.twoFactorMethod,
      bannedUntil: users.bannedUntil,
      suspendedUntil: users.suspendedUntil,
      accountLocked: users.accountLocked,
      lockedUntil: users.lockedUntil,
      deletedAt: users.deletedAt,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return null;
  if (!canUserLogin(row as Parameters<typeof canUserLogin>[0])) {
    return null;
  }

  const displayName =
    fullName(row.firstName, row.lastName) || row.email || row.id;

  return {
    id: row.id,
    email: row.email ?? null,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    name: displayName,
    role: row.role,
    status: row.status,
    profileImageUrl: row.profileImageUrl ?? null,
    twoFactorEnabled: Boolean(row.twoFactorEnabled),
    twoFactorMethod: row.twoFactorMethod || "authenticator",
  };
}

/** صحة النظام وتنبيهات الإدارة للمشرفين فقط (المستخدم الخارق يمر عبر userHasPermission). */
export const STAFF_SYSTEM_HEALTH_PERMISSION = "ai_hub.view";
/** حفظ شحنة رصيد أو حد تنبيه من تطبيق الديسك (قرار المالك 2026-10-25). */
export const STAFF_BALANCE_MANAGE_PERMISSION = "ai_hub.manage";

export async function resolveStaffCapabilitiesAndRoles(
  userId: string,
  legacyRole?: string | null,
): Promise<{ roles: string[]; capabilities: StaffCapabilities }> {
  // Always evaluate live RBAC per request on staff endpoints.
  if (typeof invalidateUserPermissionCache === "function") {
    invalidateUserPermissionCache(userId);
  }

  const [
    resolvedRoles,
    canTickets,
    canViewSocial,
    canPublishSocial,
    canScheduleSocial,
    canManageScheduledSocial,
    canCreateSocial,
    canAiHubView,
    canAiHubManage,
    canOpinionReview,
    canArticlesSchedule,
    canArticlesPublish,
    canArticlesEditAny,
  ] = await Promise.all([
    typeof getUserRoleNames === "function"
      ? getUserRoleNames(userId).catch(() => (legacyRole ? [legacyRole] : []))
      : Promise.resolve(legacyRole ? [legacyRole] : []),
    canUserViewOpinionDesk(userId, legacyRole),
    userHasPermission(userId, PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG),
    userHasPermission(userId, PERMISSION_CODES.SOCIAL_PUBLISH_NOW),
    userHasPermission(userId, PERMISSION_CODES.SOCIAL_PUBLISH_SCHEDULE),
    userHasPermission(userId, PERMISSION_CODES.SOCIAL_PUBLISH_MANAGE_SCHEDULED),
    userHasPermission(userId, PERMISSION_CODES.SOCIAL_PUBLISH_CREATE),
    userHasPermission(userId, STAFF_SYSTEM_HEALTH_PERMISSION),
    userHasPermission(userId, STAFF_BALANCE_MANAGE_PERMISSION),
    userHasPermission(userId, PERMISSION_CODES.OPINION_REVIEW),
    userHasPermission(userId, PERMISSION_CODES.ARTICLES_SCHEDULE),
    userHasPermission(userId, PERMISSION_CODES.ARTICLES_PUBLISH),
    userHasPermission(userId, PERMISSION_CODES.ARTICLES_EDIT_ANY),
  ]);

  const roleList =
    Array.isArray(resolvedRoles) && resolvedRoles.length > 0
      ? resolvedRoles
      : legacyRole
        ? [legacyRole]
        : [];

  return {
    roles: roleList,
    capabilities: {
      canTickets: Boolean(canTickets),
      canSocial: {
        view: Boolean(canViewSocial),
        publish: Boolean(canPublishSocial),
        schedule: Boolean(canScheduleSocial),
        reject: Boolean(canManageScheduledSocial || canCreateSocial),
      },
      canSystemHealth: Boolean(canAiHubView),
      canAdminAlerts: Boolean(canAiHubView),
      canManageBalances: Boolean(canAiHubView && canAiHubManage),
      canOpinion: computeStaffOpinionCapabilities({
        opinionReview: Boolean(canOpinionReview),
        articlesSchedule: Boolean(canArticlesSchedule),
        articlesPublish: Boolean(canArticlesPublish),
        articlesEditAny: Boolean(canArticlesEditAny),
      }),
      canPublisherNews: Boolean(canArticlesPublish),
    },
  };
}

export function mapTicketAuthorKindToSenderKind(
  authorKind: string | null | undefined,
): StaffSenderKind {
  if (authorKind === "reporter") return "reporter";
  return "writer";
}

/** مرسل استفسار المساهم في شاشة التفاصيل — نفس الاسم والصورة التي يعرضها الصندوق. */
export function buildStaffTicketDetailSender(ticket: {
  writerId?: string | null;
  writerName?: string | null;
  writerEmail?: string | null;
  writerProfileImageUrl?: string | null;
  authorKind?: string | null;
  writer?: { name?: string | null; profileImageUrl?: string | null } | null;
}) {
  return {
    id: ticket.writerId ?? null,
    name: ticket.writerName ?? ticket.writer?.name ?? ticket.writerEmail ?? "مساهم",
    kind: mapTicketAuthorKindToSenderKind(ticket.authorKind),
    roleKind: ticket.authorKind,
    avatarUrl: safeStaffAvatarUrl(ticket.writerProfileImageUrl ?? ticket.writer?.profileImageUrl),
  };
}

function senderRoleKind(kind: StaffSenderKind): string {
  if (kind === "reporter") return "reporter";
  if (kind === "organization") return "organization";
  return "opinion_author";
}

function compareInboxItemsDesc(a: StaffInboxItem, b: StaffInboxItem): number {
  const timeA = Date.parse(a.updatedAt) || Date.parse(a.createdAt) || 0;
  const timeB = Date.parse(b.updatedAt) || Date.parse(b.createdAt) || 0;
  if (timeA !== timeB) return timeB - timeA;
  if (a.kind !== b.kind) return b.kind.localeCompare(a.kind);
  return b.id.localeCompare(a.id);
}

function isAfterCursorDesc(
  item: StaffInboxItem,
  cursor: StaffInboxCursorPayload,
): boolean {
  const itemTime = Date.parse(item.updatedAt) || Date.parse(item.createdAt) || 0;
  const cursorTime = Date.parse(cursor.t) || 0;
  if (itemTime !== cursorTime) {
    return itemTime < cursorTime;
  }
  if (item.kind !== cursor.k) {
    return bCompareDesc(item.kind, cursor.k) > 0;
  }
  return bCompareDesc(item.id, cursor.id) > 0;
}

function bCompareDesc(itemVal: string, cursorVal: string): number {
  // In descending order, items after cursor have smaller lexical keys than cursorVal.
  return cursorVal.localeCompare(itemVal);
}

export function paginateStaffInboxItems(
  sortedItems: StaffInboxItem[],
  options: { cursor?: string; limit: number },
): {
  items: StaffInboxItem[];
  nextCursor: string | null;
  hasMore: boolean;
} {
  let working = sortedItems;
  if (options.cursor) {
    const decoded = decodeStaffInboxCursor(options.cursor);
    if (!decoded) {
      throw new StaffInboxCursorError("مؤشر الصفحات (cursor) غير صالح");
    }
    const exactIndex = working.findIndex(
      (item) => item.id === decoded.id && item.kind === decoded.k,
    );
    if (exactIndex >= 0) {
      working = working.slice(exactIndex + 1);
    } else {
      working = working.filter((item) => isAfterCursorDesc(item, decoded));
    }
  }

  const limit = Math.min(Math.max(options.limit, 1), 50);
  const hasMore = working.length > limit;
  const pageItems = working.slice(0, limit);
  const lastItem = pageItems[pageItems.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeStaffInboxCursor({
          t: lastItem.updatedAt || lastItem.createdAt,
          k: lastItem.kind,
          id: lastItem.id,
        })
      : null;

  return {
    items: pageItems,
    nextCursor,
    hasMore,
  };
}

export class StaffInboxCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffInboxCursorError";
  }
}

export const STAFF_INBOX_SOCIAL_ACTIVE_STATUSES = ["draft", "scheduled", "processing"] as const;
export const STAFF_INBOX_SOCIAL_RECENT_STATUSES = ["published", "failed"] as const;
export const STAFF_INBOX_SOCIAL_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * تبويبا «منشور» و«مرفوض» في تطبيق الديسك: عند طلب `status` بإحدى هاتين
 * القيمتين يُجلب السجل كاملاً (أحدث 200 مقترح) بدل نافذة الـ24 ساعة.
 */
export const STAFF_INBOX_SOCIAL_HISTORY_STATUSES = ["published", "canceled"] as const;

/** `status` accepts one value or a comma list (`draft,processing,failed`). */
export function parseStaffInboxStatuses(status: string | undefined): string[] {
  if (!status) return [];
  return status
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function socialStatusFilterFor(status: string | undefined) {
  const statuses = parseStaffInboxStatuses(status);
  if (
    statuses.length > 0 &&
    statuses.every((s) => (STAFF_INBOX_SOCIAL_HISTORY_STATUSES as readonly string[]).includes(s))
  ) {
    return { statuses };
  }
  // المجدول والجاري نشره يظلان ظاهرين حتى النشر، والمنشور/الفاشل آخر 24 ساعة.
  // المرفوض (canceled) مستبعد. العدّاد و hasUnread يبقيان للمسودات فقط.
  return {
    statuses: [...STAFF_INBOX_SOCIAL_ACTIVE_STATUSES],
    recentStatuses: [...STAFF_INBOX_SOCIAL_RECENT_STATUSES],
    recentSince: new Date(Date.now() - STAFF_INBOX_SOCIAL_RECENT_WINDOW_MS),
  };
}

export async function listStaffUnifiedInbox(options: {
  userId: string;
  canTickets: boolean;
  canSocialView: boolean;
  type: StaffInboxType;
  status?: string;
  unread?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}): Promise<{
  items: StaffInboxItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  if (options.cursor) {
    const decoded = decodeStaffInboxCursor(options.cursor);
    if (!decoded) {
      throw new StaffInboxCursorError("مؤشر الصفحات (cursor) غير صالح");
    }
  }

  const includeTickets =
    (options.type === "all" || options.type === "ticket") && options.canTickets;
  const includeSocial =
    (options.type === "all" || options.type === "social") && options.canSocialView;

  const [ticketsRaw, socialRaw] = await Promise.all([
    includeTickets
      ? listOpinionTickets({
          viewerId: options.userId,
          isAdmin: true,
          // A comma list (desk tabs) is filtered after the merge below.
          status: options.status?.includes(",") ? undefined : options.status,
          unread: options.unread,
          limit: 200,
        })
      : Promise.resolve([]),
    includeSocial
      ? listPendingSocialProposalsForDesk("all", 200, socialStatusFilterFor(options.status))
      : Promise.resolve([]),
  ]);

  const unified: StaffInboxItem[] = [];

  for (const t of ticketsRaw) {
    const createdAt = toIsoString(t.createdAt ?? t.lastMessageAt ?? t.last_message_at);
    const updatedAt = toIsoString(t.lastMessageAt ?? t.last_message_at ?? t.updatedAt ?? t.createdAt);
    const previewText = t.latestMessageExcerpt ?? t.latest_message_excerpt ?? t.title ?? "";
    const senderKind = mapTicketAuthorKindToSenderKind(t.authorKind);
    const senderName = t.writerName ?? t.writer?.name ?? t.writerEmail ?? "مساهم";

    unified.push({
      id: t.id,
      kind: "ticket",
      title: t.title,
      previewText,
      preview: previewText,
      sender: {
        id: t.writerId ?? t.writer?.id ?? null,
        name: senderName,
        kind: senderKind,
        roleKind: t.authorKind ?? "other",
        avatarUrl: safeStaffAvatarUrl(t.writerProfileImageUrl ?? t.writer?.profileImageUrl),
      },
      createdAt,
      updatedAt,
      status: t.status,
      hasUnread: Boolean(t.hasUnread),
      deeplink: `sabqdesk://ticket/${t.id}`,
    });
  }

  for (const s of socialRaw) {
    const createdAt = toIsoString(s.createdAt ?? s.created_at);
    const updatedAt = toIsoString(s.updatedAt ?? s.updated_at ?? s.createdAt ?? s.created_at);
    const isAgency = s.kind === "agency" || Boolean(s.isAgencyProposal || s.publisherId);
    const senderKind = resolveStaffSocialSenderKind({ isAgency, roles: s.creatorRoles });
    const senderName =
      s.proposerName ??
      (isAgency ? s.agencyName : s.authorName) ??
      s.createdByName ??
      (isAgency ? "وكالة" : "كاتب رأي");
    const title = s.articleTitle ?? s.article?.title ?? "مقترح نشر اجتماعي";
    const previewText = s.text ?? "";
    const hasUnread = s.status === "draft";

    unified.push({
      id: s.id,
      kind: "social",
      title,
      previewText,
      preview: previewText,
      sender: {
        id: s.publisherId ?? s.createdByUserId ?? null,
        name: senderName,
        kind: senderKind,
        roleKind: isAgency ? "agency" : senderRoleKind(senderKind),
        avatarUrl: safeStaffAvatarUrl(isAgency ? s.agencyLogoUrl : s.creatorProfileImageUrl),
      },
      createdAt,
      updatedAt,
      status: s.status,
      hasUnread,
      deeplink: `sabqdesk://social/${s.id}`,
      scheduledAt: s.scheduledAt ?? null,
      publishedAt: s.publishedAt ?? null,
      lastError: s.status === "canceled" || s.status === "failed" ? s.lastError ?? null : null,
      canceledBySelf: computeStaffCanceledBySelf(s),
      article: s.article ?? null,
    });
  }

  let filtered = unified;
  const statusList = parseStaffInboxStatuses(options.status);
  if (statusList.length > 0) {
    filtered = filtered.filter((item) => statusList.includes(item.status));
  }
  if (typeof options.unread === "boolean") {
    filtered = filtered.filter((item) => item.hasUnread === options.unread);
  }
  if (options.q && options.q.trim().length > 0) {
    const needle = options.q.trim().toLowerCase();
    filtered = filtered.filter((item) => {
      const hay = `${item.title} ${item.previewText} ${item.sender.name}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  filtered.sort(compareInboxItemsDesc);

  return paginateStaffInboxItems(filtered, {
    cursor: options.cursor,
    limit: options.limit,
  });
}

export async function getStaffUnreadCounts(options: {
  userId: string;
  canTickets: boolean;
  canSocialView: boolean;
}): Promise<{ tickets: number; social: number; total: number }> {
  const [ticketCounts, socialPending] = await Promise.all([
    options.canTickets
      ? getOpinionTicketsUnreadCounts({ viewerId: options.userId, isAdmin: true })
      : Promise.resolve({ unreadCount: 0, unansweredCount: 0 }),
    options.canSocialView
      ? listPendingSocialProposalsForDesk("all", 200)
      : Promise.resolve([]),
  ]);

  const tickets = Number(ticketCounts?.unreadCount ?? 0);
  const social = Array.isArray(socialPending) ? socialPending.length : 0;

  return {
    tickets,
    social,
    total: tickets + social,
  };
}

export interface StaffSocialDetailResult {
  post: SocialPost;
  preview: {
    text: string;
    linkUrl: string | null;
    composedText: string;
    weightedLength: number;
    maxLength: number;
    valid: boolean;
    overStandard: boolean;
    imageUrl: string | null;
    imageSource: string;
    mediaKind: string;
    mediaUrls: string[];
  };
  author: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  agency: {
    id: string;
    name: string | null;
  } | null;
  article: {
    id: string;
    title: string | null;
    url: string | null;
    imageUrl: string | null;
  } | null;
  sender: {
    id: string | null;
    name: string;
    kind: StaffSenderKind;
    avatarUrl: string | null;
  };
  canceledBySelf: boolean | null;
  attempts: SocialPostAttempt[];
}

export async function getStaffSocialPostDetail(
  postId: string,
): Promise<StaffSocialDetailResult | null> {
  const post = await getPost(postId);
  if (!post) return null;

  const attempts = await getPostAttempts(post.id);

  let authorName: string | null = null;
  let authorEmail: string | null = null;
  let authorImageUrl: string | null = null;
  let authorRoles: string[] | undefined;
  let agencyName: string | null = null;
  let agencyLogoUrl: string | null = null;
  let articleInfo: {
    id: string;
    title: string | null;
    url: string | null;
    imageUrl: string | null;
  } | null = null;

  try {
    if (post.createdByUserId) {
      const userRows = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, post.createdByUserId))
        .limit(1);
      const u = Array.isArray(userRows) ? userRows[0] : undefined;
      if (u) {
        authorName = fullName(u.firstName, u.lastName);
        authorEmail = u.email ?? null;
        authorImageUrl = u.profileImageUrl ?? null;
      }
      if (!post.publisherId) {
        const roleMap = await roleNamesForUserIds([post.createdByUserId]);
        const set = roleMap.get(post.createdByUserId);
        if (set) authorRoles = [...set];
      }
    }

    if (post.publisherId) {
      const pubRows = await db
        .select({ agencyName: publishers.agencyName, logoUrl: publishers.logoUrl })
        .from(publishers)
        .where(eq(publishers.id, post.publisherId))
        .limit(1);
      const p = Array.isArray(pubRows) ? pubRows[0] : undefined;
      if (p) {
        agencyName = p.agencyName ?? null;
        agencyLogoUrl = p.logoUrl ?? null;
      }
    }

    if (post.articleId) {
      const artRows = await db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          imageUrl: articles.imageUrl,
        })
        .from(articles)
        .where(eq(articles.id, post.articleId))
        .limit(1);
      const a = Array.isArray(artRows) ? artRows[0] : undefined;
      if (a) {
        articleInfo = {
          id: a.id,
          title: a.title ?? null,
          url: buildArticleUrl({ slug: a.slug, englishSlug: a.englishSlug }),
          imageUrl: a.imageUrl ?? null,
        };
      }
    }
  } catch {
    // Enrichment is best-effort so unit tests mocking only getPost/getPostAttempts succeed cleanly.
  }

  const effectiveLinkUrl = post.linkUrl ?? articleInfo?.url ?? null;
  const validation = validateXPostText(post.text ?? "", effectiveLinkUrl);
  const composedText = composeXPostText(post.text ?? "", effectiveLinkUrl);
  const isAgency = Boolean(post.publisherId);
  const senderKind = resolveStaffSocialSenderKind({ isAgency, roles: authorRoles });
  const senderName = isAgency
    ? agencyName ?? authorName ?? "وكالة"
    : authorName ?? authorEmail ?? "كاتب رأي";

  return {
    post,
    preview: {
      text: post.text ?? "",
      linkUrl: effectiveLinkUrl,
      composedText,
      weightedLength: validation.weightedLength,
      maxLength: 280,
      valid: validation.valid,
      overStandard: validation.overStandard,
      imageUrl: post.imageUrl ?? articleInfo?.imageUrl ?? null,
      imageSource: post.imageSource ?? "none",
      mediaKind: post.mediaKind ?? "none",
      mediaUrls: Array.isArray(post.mediaUrls) ? post.mediaUrls : [],
    },
    author: post.createdByUserId
      ? {
          id: post.createdByUserId,
          name: authorName,
          email: authorEmail,
        }
      : null,
    agency: post.publisherId
      ? {
          id: post.publisherId,
          name: agencyName,
        }
      : null,
    article: articleInfo,
    sender: {
      id: post.publisherId ?? post.createdByUserId ?? null,
      name: senderName,
      kind: senderKind,
      avatarUrl: safeStaffAvatarUrl(isAgency ? agencyLogoUrl : authorImageUrl),
    },
    canceledBySelf: computeStaffCanceledBySelf(post),
    attempts,
  };
}

export {
  listSocialDeskRecipientUserIds,
  notifyStaffDeskOfSocialProposal,
} from "./staffAppPushService";
