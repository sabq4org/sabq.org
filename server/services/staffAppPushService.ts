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
import { STAFF_APP_BUNDLE_ID, type StaffAlertPrefs } from "@shared/staffApp";
import { userHasPermission } from "../rbac";
import { clipDeskAlertExcerpt } from "./deskBotAlerts";
import { isOpinionTicketNotifyRecipient } from "./opinionTicketNotice";
import { getStaffAlertPrefsForUsers } from "./staffAlertPrefsService";
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

export type StaffAdminAlertPref = keyof StaffAlertPrefs;

/** المشرفون النشطون (ai_hub.view) الذين فعّلوا التفضيل المطلوب. */
export async function listStaffAdminAlertRecipientIds(
  pref: StaffAdminAlertPref,
): Promise<string[]> {
  const ids = await listStaffPermissionRecipientUserIds(STAFF_ADMIN_ALERT_PERMISSION);
  if (ids.length === 0) return [];
  try {
    const prefs = await getStaffAlertPrefsForUsers(ids);
    return ids.filter((id) => prefs.get(id)?.[pref] !== false);
  } catch (err) {
    console.error("[StaffAppPush] alert prefs lookup failed:", err);
    return ids;
  }
}

/** يرسل إشعاراً لحزمة الديسك فقط إلى المشرفين المفعّلين للتفضيل. لا يرمي. */
export async function sendStaffAdminPush(
  pref: StaffAdminAlertPref,
  message: UserAppPushMessage,
): Promise<number> {
  try {
    const recipientIds = await listStaffAdminAlertRecipientIds(pref);
    if (recipientIds.length === 0) return 0;
    const results = await Promise.all(
      recipientIds.map(async (recipientId) => {
        try {
          const r = await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, message);
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
}): Promise<void> {
  try {
    const recipientIds = await listSocialDeskRecipientUserIds(input.excludeUserId);
    if (recipientIds.length === 0) return;

    const title =
      input.proposalKind === "agency"
        ? `مقترح تغريدة من وكالة: ${input.senderName}`
        : input.isUpdate
          ? `تحديث مقترح تغريدة: ${input.senderName}`
          : `مقترح تغريدة من كاتب: ${input.senderName}`;
    const excerpt = clipDeskAlertExcerpt(input.text || input.articleTitle, 140);
    const body = input.articleTitle ? `«${input.articleTitle}» — ${excerpt}` : excerpt;
    const deeplink = `sabqdesk://social/${input.postId}`;

    await Promise.all(
      recipientIds.map(async (recipientId) => {
        try {
          await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, {
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
        } catch (pushErr) {
          console.error("[StaffAppPush] social push to recipient failed:", pushErr);
        }
      }),
    );
  } catch (err) {
    console.error("[StaffAppPush] notifyStaffDeskOfSocialProposal failed:", err);
  }
}
