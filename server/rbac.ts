// RBAC (Role-Based Access Control) middleware and utilities
import { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, roles, permissions, rolePermissions, userRoles, userPermissionOverrides } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { memoryCache, CACHE_TTL } from "./memoryCache";
import { SUPERUSER_ROLE_NAMES, getPermissionsForRoles, ROLE_NAMES, canAssignRole } from "@shared/rbac-constants";

// Type definitions
export type PermissionCode = string; // e.g., "articles.create"

// Check if a user has a specific permission using cached permissions
// Supports user-level permission overrides for fine-grained control
export async function userHasPermission(
  userId: string,
  permissionCode: PermissionCode
): Promise<boolean> {
  try {
    const cacheKey = `rbac:${userId}`;
    let permData = memoryCache.get<{ isSuperuser: boolean; permissions: string[] }>(cacheKey);

    if (!permData) {
      // Check superuser status — single source of truth in shared constants.
      const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      let isSuperuser = user ? (SUPERUSER_ROLE_NAMES as readonly string[]).includes(user.role) : false;
      let rbacRoleNames: string[] = [];

      if (!isSuperuser) {
        const rbacRoles = await db
          .select({ roleName: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, userId));
        rbacRoleNames = rbacRoles.map(r => r.roleName);
        isSuperuser = rbacRoles.some(r => (SUPERUSER_ROLE_NAMES as readonly string[]).includes(r.roleName));
      }

      if (isSuperuser) {
        permData = { isSuperuser, permissions: [] };
      } else {
        const allRoles = rbacRoleNames.length > 0 ? rbacRoleNames : [user?.role || "reader"];
        const dbPerms = await getUserPermissions(userId);
        const codePerms = getPermissionsForRoles(allRoles);
        const merged = [...new Set([...dbPerms, ...codePerms])];
        permData = { isSuperuser, permissions: merged };
      }
      memoryCache.set(cacheKey, permData, 5 * 60 * 1000); // 5 min cache
    }

    if (permData.isSuperuser) return true;
    return permData.permissions.includes(permissionCode);
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

// Get all permissions for a user using efficient JOIN.
// Includes user-level overrides for complete permission set.
//
// Superuser shortcut: if the user's text-column role (users.role) is one of
// SUPERUSER_ROLE_NAMES, OR they have any matching role in user_roles, this
// returns the full set of permission codes from the permissions table —
// every consumer that does `.includes("articles.publish")` etc. gets a true
// match without needing wildcard awareness. This matches the behavior of
// userHasPermission() which already short-circuits superusers.
/** All role names for a user (RBAC user_roles, falling back to users.role). */
export async function getUserRoleNames(userId: string): Promise<string[]> {
  const rbacRoles = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const names = rbacRoles.map((r) => r.roleName);
  if (names.length > 0) return names;

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.role ? [user.role] : [];
}

export async function userHasAnyRole(
  userId: string,
  roleNames: string[],
): Promise<boolean> {
  const userRolesList = await getUserRoleNames(userId);
  return roleNames.some((r) => userRolesList.includes(r));
}

/**
 * The role-assignment tier of an actor, for use with canAssignRole. Maps the
 * actor's roles to SYSTEM_ADMIN (system_admin/system.admin/superadmin), ADMIN,
 * or "" (may assign nothing). Centralizes the hierarchy check so EVERY
 * role-mutation endpoint enforces it — an `admin` must never be able to mint a
 * `system_admin` (audit #2 + the dashboard siblings the first fix missed).
 */
export async function getRoleAssignmentAuthority(assignerId: string): Promise<string> {
  const names = await getUserRoleNames(assignerId);
  const SYSTEM_ADMIN_EQUIVALENTS = ["system_admin", "system.admin", "superadmin"];
  if (names.some((r) => SYSTEM_ADMIN_EQUIVALENTS.includes(r))) return ROLE_NAMES.SYSTEM_ADMIN;
  if (names.includes(ROLE_NAMES.ADMIN)) return ROLE_NAMES.ADMIN;
  return "";
}

/**
 * Validate that `assignerId` may grant `targetRoleName`. Returns an
 * {status, message} to send back, or null when the assignment is allowed.
 * Shared by every role-mutation endpoint so the hierarchy check is identical.
 */
export async function roleAssignmentError(
  assignerId: string,
  targetRoleName: string,
): Promise<{ status: number; message: string } | null> {
  if (!(Object.values(ROLE_NAMES) as string[]).includes(targetRoleName)) {
    return { status: 400, message: "دور غير معروف" };
  }
  const authority = await getRoleAssignmentAuthority(assignerId);
  if (!canAssignRole(authority, targetRoleName)) {
    return { status: 403, message: "لا تملك صلاحية إسناد هذا الدور" };
  }
  return null;
}

/**
 * Hierarchy check for a list of role IDs (resolves each id → name). Returns an
 * {status, message} to send back, or null when allowed. Use on EVERY endpoint
 * that assigns roles by id — create user, update user, update roles — so an
 * admin can never mint a system_admin through any of them (audit #2).
 */
export async function roleIdsAssignmentError(
  assignerId: string,
  roleIds: string[] | undefined | null,
): Promise<{ status: number; message: string } | null> {
  if (!roleIds || roleIds.length === 0) return null;
  const targetRoles = await db.select({ name: roles.name }).from(roles).where(inArray(roles.id, roleIds));
  const authority = await getRoleAssignmentAuthority(assignerId);
  const forbidden = targetRoles.filter((r) => !canAssignRole(authority, r.name));
  if (forbidden.length > 0) {
    return { status: 403, message: `لا تملك صلاحية إسناد الأدوار: ${forbidden.map((r) => r.name).join("، ")}` };
  }
  return null;
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    // Superuser check — matches userHasPermission's logic.
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    let isSuperuser = user ? (SUPERUSER_ROLE_NAMES as readonly string[]).includes(user.role) : false;

    if (!isSuperuser) {
      const rbacRoles = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId));
      isSuperuser = rbacRoles.some(r => (SUPERUSER_ROLE_NAMES as readonly string[]).includes(r.roleName));
    }

    if (isSuperuser) {
      const allPerms = await db.select({ code: permissions.code }).from(permissions);
      return allPerms.map(p => p.code);
    }

    // Get role-based permissions
    const result = await db
      .select({ permissionCode: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId));

    const rolePermissionCodes = new Set(result.map(r => r.permissionCode));

    // Get user-level overrides
    const overrides = await db
      .select({
        permissionCode: userPermissionOverrides.permissionCode,
        effect: userPermissionOverrides.effect
      })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId));

    // Apply overrides
    for (const override of overrides) {
      if (override.effect === 'allow') {
        rolePermissionCodes.add(override.permissionCode);
      } else if (override.effect === 'deny') {
        rolePermissionCodes.delete(override.permissionCode);
      }
    }

    return Array.from(rolePermissionCodes);
  } catch (error) {
    console.error("Error getting user permissions:", error);
    return [];
  }
}

// Get user permission overrides for display in UI
export async function getUserPermissionOverrides(userId: string): Promise<Array<{permissionCode: string, effect: string, reason?: string | null}>> {
  try {
    const overrides = await db
      .select({ 
        permissionCode: userPermissionOverrides.permissionCode,
        effect: userPermissionOverrides.effect,
        reason: userPermissionOverrides.reason
      })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId));

    return overrides;
  } catch (error) {
    console.error("Error getting user permission overrides:", error);
    return [];
  }
}

// Invalidate cached permission data for a user
// Call this when roles/permissions change
export function invalidateUserPermissionCache(userId: string): void {
  memoryCache.delete(`rbac:${userId}`);
  // The composed GET /api/auth/user payload embeds permissions — keep in sync.
  memoryCache.delete(`auth-user:${userId}`);
}

// Middleware: Require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Middleware: Require specific permission
export function requirePermission(permissionCode: PermissionCode) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = (req as any).user?.id;
    const userEmail = (req as any).user?.email;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const hasPermission = await userHasPermission(userId, permissionCode);

    if (!hasPermission) {
      console.error(`[RBAC] Access denied - user ${userEmail} (${userId}): missing ${permissionCode}`);
      return res.status(403).json({ 
        message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
        messageEn: "You don't have permission to access this service",
        required: permissionCode 
      });
    }

    next();
  };
}

// Middleware: Require one of multiple permissions (OR logic)
export function requireAnyPermission(...permissionCodes: PermissionCode[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has any of the required permissions
    const checks = await Promise.all(
      permissionCodes.map(code => userHasPermission(userId, code))
    );

    const hasAnyPermission = checks.some(result => result === true);

    if (!hasAnyPermission) {
      return res.status(403).json({ 
        message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
        messageEn: "You don't have permission to access this service",
        required: permissionCodes 
      });
    }

    next();
  };
}

// Middleware: Require all permissions (AND logic)
export function requireAllPermissions(...permissionCodes: PermissionCode[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has all required permissions
    const checks = await Promise.all(
      permissionCodes.map(code => userHasPermission(userId, code))
    );

    const hasAllPermissions = checks.every(result => result === true);

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
        messageEn: "You don't have permission to access this service",
        required: permissionCodes 
      });
    }

    next();
  };
}

// Middleware: Require specific role(s)
export function requireRole(...roleNames: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const cacheKey = `rbac:${userId}`;
    let cachedData = memoryCache.get<{ isSuperuser: boolean; permissions: string[]; roles: string[] }>(cacheKey);

    let userRoleNames: string[] = [];

    if (cachedData && cachedData.roles) {
      userRoleNames = cachedData.roles;
    } else {
      // Get user's roles from RBAC system
      const userRolesResult = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId));

      userRoleNames = userRolesResult.map(r => r.roleName);

      // Fallback: Check user.role from users table if no RBAC roles
      if (userRoleNames.length === 0) {
        const { users } = await import("@shared/schema");
        const [user] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        
        if (user?.role) {
          userRoleNames.push(user.role);
        }
      }

      // Update cache with roles
      if (cachedData) {
        cachedData.roles = userRoleNames;
        memoryCache.set(cacheKey, cachedData, 2 * 60 * 1000);
      }
    }

    // Check if user has any of the required roles.
    // Superusers (system_admin / superadmin / …) satisfy any gate that
    // includes "admin" — otherwise a system_admin-only account gets 403 on
    // routes written as requireRole("admin", "editor") while still seeing
    // those pages in the sidebar (nav maps system_admin → admin).
    const isSuperuser = userRoleNames.some((r) =>
      (SUPERUSER_ROLE_NAMES as readonly string[]).includes(r),
    );
    const hasRole =
      roleNames.some((roleName) => userRoleNames.includes(roleName)) ||
      (isSuperuser && roleNames.includes("admin"));

    if (!hasRole) {
      console.error(`[RBAC] Access denied - user roles: ${userRoleNames.join(', ')}, required: ${roleNames.join(', ')}`);
      return res.status(403).json({ 
        message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
        messageEn: "You don't have permission to access this service",
        required: roleNames,
        userHas: userRoleNames
      });
    }

    next();
  };
}

// Helper: Log activity to activity_logs table
export async function logActivity(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any> & {
    ip?: string;
    userAgent?: string;
    reason?: string;
  };
}) {
  const { activityLogs } = await import("@shared/schema");

  // entity_type and entity_id are NOT NULL in the schema; bail out early with a
  // clear warning instead of issuing an insert that is guaranteed to violate the
  // constraint (avoids noisy DrizzleQueryError stacks in production logs).
  if (!params.entityType || !params.entityId) {
    console.warn(
      `[logActivity] skipped: missing entityType/entityId for action="${params.action}" (userId=${params.userId})`,
    );
    return;
  }

  try {
    await db.insert(activityLogs).values({
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: params.oldValue || null,
      newValue: params.newValue || null,
      metadata: params.metadata || null,
    });
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}
