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
import { STAFF_APP_BUNDLE_ID } from "@shared/staffApp";
import { userHasPermission } from "../rbac";
import { clipDeskAlertExcerpt } from "./deskBotAlerts";
import { isOpinionTicketNotifyRecipient } from "./opinionTicketNotice";
import { sendPushToUserApp } from "./userAppPushService";

/**
 * Roles that grant `social_publish.view_log` in code (`ROLE_PERMISSIONS_MAP` + superusers).
 */
function getCodeRolesWithSocialViewLog(): string[] {
  const roleSet = new Set<string>([...SUPERUSER_ROLE_NAMES]);
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    if (
      Array.isArray(perms) &&
      (perms.includes("*") || perms.includes(PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG))
    ) {
      roleSet.add(roleName);
    }
  }
  return [...roleSet];
}

/**
 * Returns active user IDs who currently hold `social_publish.view_log`.
 */
export async function listSocialDeskRecipientUserIds(
  excludeUserId?: string | null,
): Promise<string[]> {
  try {
    const codeRoleNames = getCodeRolesWithSocialViewLog();

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
      .where(eq(permissions.code, PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG));

    const overrideAllowUserIds = db
      .select({ userId: userPermissionOverrides.userId })
      .from(userPermissionOverrides)
      .where(
        and(
          eq(userPermissionOverrides.permissionCode, PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG),
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
      const allowed = await userHasPermission(
        row.id,
        PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG,
      );
      if (allowed) {
        uniqueIds.add(row.id);
      }
    }

    return [...uniqueIds];
  } catch (err) {
    console.error("[StaffAppPush] listSocialDeskRecipientUserIds failed:", err);
    return [];
  }
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
