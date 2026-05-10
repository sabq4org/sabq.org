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
  isProfileComplete?: boolean;
  profileImageUrl?: string;
};

// Check if user has a specific permission
export function hasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user) return false;
  return user.permissions?.includes(permission) ?? false;
}

// Check if user has any of the specified permissions
export function hasAnyPermission(user: User | null | undefined, ...permissionsToCheck: string[]): boolean {
  if (!user) return false;
  return permissionsToCheck.some(p => user.permissions?.includes(p) ?? false);
}

// Check if user has all of the specified permissions  
export function hasAllPermissions(user: User | null | undefined, ...permissionsToCheck: string[]): boolean {
  if (!user) return false;
  return permissionsToCheck.every(p => user.permissions?.includes(p) ?? false);
}

// Helper function to check if user has any of the specified roles
// Accepts any user object with role/roles properties
export function hasRole(user: { role?: string; roles?: string[] } | null | undefined, ...rolesToCheck: string[]): boolean {
  if (!user) return false;
  const userRoles = user.roles || [user.role].filter(Boolean);
  return rolesToCheck.some(roleToCheck => userRoles.includes(roleToCheck));
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

export function useAuth(options?: { redirectToLogin?: boolean }) {
  const redirectToLogin = options?.redirectToLogin ?? false;

  const { data: user, isLoading, isError } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (redirectToLogin && !isLoading && (isError || !user)) {
      window.location.href = "/login";
    }
  }, [user, isLoading, isError, redirectToLogin]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !isError,
    isError,
  };
}
