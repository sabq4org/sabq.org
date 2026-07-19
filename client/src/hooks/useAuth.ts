// Reference: javascript_log_in_with_replit blueprint
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

export type User = {
  id: string;
  email?: string;
  name?: string;
  role?: string; // Primary role (first role for backward compatibility)
  roles?: string[]; // All user roles from RBAC system
  permissions?: string[]; // All user permissions from RBAC system
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  authProvider?: string;
  isProfileComplete?: boolean;
  profileImageUrl?: string;
};

/** هل يحتاج المستخدم إدخال اسم عرض (حسابات الجوال بلا firstName). */
export function needsDisplayName(user: User | null | undefined): boolean {
  return Boolean(user?.id) && !(user?.firstName ?? "").trim();
}

// "*" is a wildcard issued to superuser-equivalent roles (admin,
// system_admin) by getPermissionsForRoles in rbac-constants. When present
// it grants access regardless of the specific permission asked for —
// useful because nav.config.ts and feature gates reference codes that
// aren't all enumerated in PERMISSION_CODES.
function hasWildcard(user: User | null | undefined): boolean {
  return user?.permissions?.includes("*") ?? false;
}

// Check if user has a specific permission
export function hasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (hasWildcard(user)) return true;
  return user.permissions?.includes(permission) ?? false;
}

// Check if user has any of the specified permissions
export function hasAnyPermission(user: User | null | undefined, ...permissionsToCheck: string[]): boolean {
  if (!user) return false;
  if (hasWildcard(user)) return true;
  return permissionsToCheck.some(p => user.permissions?.includes(p) ?? false);
}

// Check if user has all of the specified permissions
export function hasAllPermissions(user: User | null | undefined, ...permissionsToCheck: string[]): boolean {
  if (!user) return false;
  if (hasWildcard(user)) return true;
  return permissionsToCheck.every(p => user.permissions?.includes(p) ?? false);
}

// Superuser roles that should satisfy any check asking for "admin"
// (matches server/rbac.ts requireRole + SUPERUSER_ROLE_NAMES).
const SUPERUSER_ROLES = ["system_admin", "system.admin", "superadmin", "super_admin"] as const;

// Helper function to check if user has any of the specified roles
// Accepts any user object with role/roles properties
export function hasRole(user: { role?: string; roles?: string[] } | null | undefined, ...rolesToCheck: string[]): boolean {
  if (!user) return false;
  const userRoles = (user.roles || [user.role].filter(Boolean)) as string[];
  if (rolesToCheck.some((roleToCheck) => userRoles.includes(roleToCheck))) {
    return true;
  }
  // system_admin-only accounts must pass ProtectedRoute requireRoles={["admin", ...]}
  // the same way the sidebar maps them to admin via resolveUserRole.
  const isSuperuser = userRoles.some((r) =>
    (SUPERUSER_ROLES as readonly string[]).includes(r),
  );
  return isSuperuser && rolesToCheck.includes("admin");
}

// Check if user is staff (has any role beyond reader)
// This checks both predefined roles and any RBAC role that isn't 'reader'
export function isStaff(user: User | null | undefined): boolean {
  if (!user) return false;
  
  // Check for predefined staff roles
  const predefinedStaffRoles = [
    'super_admin', 'superadmin', 'admin', 'system_admin',
    'editor', 'chief_editor', 'reporter', 'writer',
    'opinion_author', 'moderator', 'content_creator', 
    'comments_moderator', 'content_manager', 'publisher'
  ];
  
  if (hasRole(user, ...predefinedStaffRoles)) {
    return true;
  }
  
  // If user has ANY RBAC role(s) beyond just 'reader', consider them staff
  // This allows custom roles created through the RBAC system to access dashboard
  const userRoles = user.roles || [user.role].filter(Boolean);
  const nonReaderRoles = userRoles.filter(role => role && role !== 'reader');
  
  return nonReaderRoles.length > 0;
}

// Role hierarchy for redirection priority (higher index = higher priority)
// Includes both predefined roles and common custom roles
const ROLE_HIERARCHY = [
  'reader',             // 0 - lowest priority
  'content_creator',    // 1
  'writer',             // 2 - custom role
  'comments_moderator', // 3 - مشرف التعليقات
  'moderator',          // 4
  'opinion_author',     // 5
  'reporter',           // 6
  'content_manager',    // 7 - مدير محتوى (custom role with article permissions)
  'publisher',          // 8 - custom role
  'editor',             // 9
  'chief_editor',       // 10 - رئيس التحرير
  'admin',              // 11
  'system_admin',       // 12
  'superadmin',         // 13
  'super_admin',        // 14 - highest priority
];

// Get the highest role based on hierarchy
// Unknown roles are returned as-is but don't override known higher roles
export function getHighestRole(user: User | null | undefined): string {
  if (!user) return 'reader';
  
  const userRoles = user.roles || [user.role].filter(Boolean);
  let highestKnownRole = 'reader';
  let highestKnownPriority = -1;
  let unknownRole: string | null = null;

  for (const role of userRoles) {
    if (!role) continue;
    const priority = ROLE_HIERARCHY.indexOf(role);
    if (priority > highestKnownPriority) {
      highestKnownPriority = priority;
      highestKnownRole = role;
    } else if (priority === -1 && role !== 'reader') {
      // Track unknown role but don't give it priority over known roles
      unknownRole = role;
    }
  }

  // If we found a known role with priority > reader, use it
  // Otherwise, use unknown role if exists (for RBAC custom roles)
  // Finally, fall back to reader
  if (highestKnownPriority > 0) {
    return highestKnownRole;
  }
  if (unknownRole) {
    return unknownRole;
  }
  return highestKnownRole; // 'reader' if nothing else found
}

// Get default redirect path based on user's highest role
export function getDefaultRedirectPath(user: User | null | undefined): string {
  if (!user) return '/';

  // قبل أي وجهة: أكمل الاسم إن كان فارغًا (دخول الجوال).
  if (needsDisplayName(user)) {
    return '/complete-name';
  }

  // Comments moderator goes directly to AI moderation dashboard
  if (hasRole(user, 'comments_moderator')) {
    return '/dashboard/ai-moderation';
  }

  // Staff members go to dashboard
  if (isStaff(user)) {
    return '/dashboard';
  }

  // Regular readers go to home
  return '/';
}

export function deriveAuthState(
  user: User | null | undefined,
  isLoading: boolean,
  isError: boolean,
) {
  return {
    isAuthenticated: Boolean(user),
    isUnavailable: !isLoading && isError && !user,
    shouldRedirectToLogin: !isLoading && !isError && !user,
  };
}

export function useAuth(options?: { redirectToLogin?: boolean }) {
  const redirectToLogin = options?.redirectToLogin ?? false;

  const { data: user, isLoading, isError, isFetching, refetch } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    // 401 يعيده الـ fetcher كـ null ولا يصل إلى retry. أخطاء الشبكة و5xx
    // تستخدم سياسة QueryClient العامة (3 محاولات مع backoff).
    staleTime: 5 * 60 * 1000,
  });

  const authState = deriveAuthState(user, isLoading, isError);

  useEffect(() => {
    // لا نحوّل تعطل الخادم إلى logout. null بلا error فقط يعني 401 مؤكدة.
    if (redirectToLogin && authState.shouldRedirectToLogin) {
      window.location.href = "/login";
    }
  }, [authState.shouldRedirectToLogin, redirectToLogin]);

  return {
    user,
    isLoading,
    // إن كان لدينا مستخدم محفوظ، يبقى موثقًا أثناء خطأ refetch عابر.
    isAuthenticated: authState.isAuthenticated,
    isError,
    isUnavailable: authState.isUnavailable,
    isRetrying: isFetching && authState.isUnavailable,
    retryAuth: refetch,
  };
}
