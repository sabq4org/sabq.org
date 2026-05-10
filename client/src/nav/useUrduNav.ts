import { useMemo } from "react";
import { useLocation } from "wouter";
import type { NavItem, NavContext, NavState, UserRole } from "./types";
import { urduNavConfig } from "./ur.nav.config";

/**
 * Check if feature flags pass for an item
 */
function checkFeatureFlags(item: NavItem, flags: Record<string, boolean>): boolean {
  if (item.featureFlags && item.featureFlags.length > 0) {
    return item.featureFlags.every((flag) => flags[flag] === true);
  }
  return true;
}

/**
 * Check if an item passes access checks (feature flags, permissions, or roles)
 */
function itemPassesAccessCheck(
  item: NavItem,
  role: UserRole,
  flags: Record<string, boolean>,
  userPermissions?: string[]
): boolean {
  // Check feature flags first (must always pass)
  if (!checkFeatureFlags(item, flags)) {
    return false;
  }

  // If item has permissions defined, check permissions (permission-first)
  if (item.permissions && item.permissions.length > 0) {
    return userPermissions?.some(p => item.permissions!.includes(p)) ?? false;
  }

  // No permissions defined - use role-based check
  return item.roles.includes(role);
}

/**
 * فلترة عناصر القائمة بناءً على الدور والصلاحيات والمسار
 * Filter navigation items based on role, permissions, and path
 * 
 * Access logic (permission-first with secure parent handling):
 * 1. Feature flags must be satisfied for ALL items (including containers)
 * 2. If item has permissions array - check permissions (permission-first)
 * 3. If item has NO permissions array - use role-based check
 * 4. Pure containers (no path) with passing feature flags show if ANY child passes
 * 5. Items WITH paths MUST pass their own access check - they have navigable routes
 * 6. When parent fails but children pass, children are promoted to parent level
 */
function filterNavTree(
  items: NavItem[],
  role: UserRole,
  flags: Record<string, boolean>,
  userPermissions?: string[]
): NavItem[] {
  const result: NavItem[] = [];
  
  for (const item of items) {
    // Feature flags ALWAYS apply - even for containers
    if (!checkFeatureFlags(item, flags)) {
      continue;
    }
    
    // First, recursively process children
    if (item.children && item.children.length > 0) {
      const filteredChildren = filterNavTree(item.children, role, flags, userPermissions);
      
      // If children passed, handle parent visibility
      if (filteredChildren.length > 0) {
        // Pure container (no path) - safe to show if children are accessible
        if (!item.path) {
          result.push({
            ...item,
            children: filteredChildren,
          });
          continue;
        }
        
        // Parent WITH path - must pass its own access check for security
        if (itemPassesAccessCheck(item, role, flags, userPermissions)) {
          result.push({
            ...item,
            children: filteredChildren,
          });
        } else {
          // Parent failed but children passed - promote children to parent level
          result.push(...filteredChildren);
        }
        continue;
      }
      
      // No children passed - check if parent itself passes and has a direct path
      if (item.path && itemPassesAccessCheck(item, role, flags, userPermissions)) {
        result.push({ ...item, children: [] });
      }
      continue;
    }
    
    // Leaf item - apply direct access check
    if (itemPassesAccessCheck(item, role, flags, userPermissions)) {
      result.push(item);
    }
  }
  
  return result;
}

/**
 * تحويل الشجرة إلى قائمة مسطحة
 * Flatten tree to flat list
 */
function flattenNavTree(items: NavItem[]): NavItem[] {
  const flat: NavItem[] = [];

  function traverse(items: NavItem[]) {
    items.forEach((item) => {
      flat.push(item);
      if (item.children) {
        traverse(item.children);
      }
    });
  }

  traverse(items);
  return flat;
}

/**
 * إيجاد العنصر النشط بناءً على المسار
 * Find active item based on pathname
 */
function findActiveItem(items: NavItem[], pathname: string): NavItem | null {
  const flat = flattenNavTree(items);

  // First, try exact match
  const exactMatch = flat.find(
    (item) => item.path && item.meta?.exact && item.path === pathname
  );
  if (exactMatch) {
    return exactMatch;
  }

  // Then, try startsWith match (longest path first)
  const startsWithMatches = flat
    .filter((item) => item.path && pathname.startsWith(item.path))
    .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0));

  return startsWithMatches[0] || null;
}

/**
 * إيجاد الآباء للعنصر النشط
 * Find parents of active item
 */
function findParents(items: NavItem[], activeItem: NavItem | null): NavItem[] {
  if (!activeItem) return [];

  const parents: NavItem[] = [];

  function traverse(items: NavItem[], path: NavItem[]): boolean {
    for (const item of items) {
      const currentPath = [...path, item];

      if (activeItem && item.id === activeItem.id) {
        parents.push(...path);
        return true;
      }

      if (item.children) {
        if (traverse(item.children, currentPath)) {
          return true;
        }
      }
    }
    return false;
  }

  traverse(items, []);
  return parents;
}

/**
 * هوك للحصول على حالة التنقل المفلترة
 * Hook to get filtered navigation state for Urdu dashboard
 */
export function useUrduNav(context: NavContext): NavState {
  const navState = useMemo<NavState>(() => {
    // Use provided context
    const role = context.role;
    const flags = context.flags;
    const currentPath = context.pathname;
    const permissions = context.permissions || [];

    // Filter tree with permission support
    const treeFiltered = filterNavTree(urduNavConfig, role, flags, permissions);

    // Find active item
    const activeItem = findActiveItem(treeFiltered, currentPath);

    // Find parents
    const parents = findParents(treeFiltered, activeItem);

    // Flatten tree
    const flat = flattenNavTree(treeFiltered);

    return {
      treeFiltered,
      activeItem,
      parents,
      flat,
    };
  }, [context.role, context.flags, context.pathname, context.permissions]);

  return navState;
}

/**
 * تتبع حدث النقر على عنصر القائمة
 * Track navigation item click event
 */
export function trackNavClick(id: string, path?: string) {
  // Placeholder for analytics tracking
  if (typeof window !== "undefined") {
    console.log("[Nav] Item clicked:", { id, path, timestamp: new Date().toISOString() });
    
    // يمكن إضافة تكامل مع Google Analytics أو أي نظام تتبع آخر هنا
    // Example: window.gtag?.('event', 'nav_item_clicked', { id, path });
  }
}
