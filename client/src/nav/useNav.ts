import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Contact,
  Newspaper,
  Settings,
  Users,
  PanelsTopLeft,
} from "lucide-react";
import type { NavItem, NavContext, NavState, UserRole } from "./types";
import { navConfig } from "./nav.config";

const STAFF_NAV_SECTION_DEFINITIONS = [
  {
    id: "workspace_editorial",
    labelAr: "التحرير والنشر",
    labelKey: "nav.workspace_editorial",
    icon: Newspaper,
    itemIds: [
      "articles",
      "smart_radar",
      "breaking_ticker",
      "gulf_events",
      "muqtarab",
      "muqtarab_review",
      "audio_newsletters",
      "audio_briefs",
      "calendar",
      "world_days",
      "media_library",
    ],
  },
  {
    id: "workspace_site",
    labelAr: "واجهة الموقع",
    labelKey: "nav.workspace_site",
    icon: PanelsTopLeft,
    itemIds: [
      "categories",
      "tags",
      "smart_links",
      "smart_blocks",
      "quad_categories_block",
      "themes",
      "templates",
      "hajj_block",
      "national_day_block",
      "sahraa_tv_block",
    ],
  },
  {
    id: "workspace_ai",
    labelAr: "الأدوات الذكية",
    labelKey: "nav.workspace_ai",
    icon: Bot,
    itemIds: [
      "deep_analysis_manage",
      "deep_analysis_create",
      "deep_analysis_public",
      "prompt_studio",
      "voice_management",
      "auto_image_settings",
    ],
  },
  {
    id: "workspace_audience",
    labelAr: "الجمهور والتواصل",
    labelKey: "nav.workspace_audience",
    icon: Contact,
    itemIds: [
      "ai_moderation",
      "push_notifications",
      "contact_messages",
      "opinion_tickets",
      "surveys",
      "announcements",
      "communications",
      "editor_alerts",
      "loyalty_admin",
    ],
  },
  {
    id: "workspace_business",
    labelAr: "الأعمال والشراكات",
    labelKey: "nav.workspace_business",
    icon: BriefcaseBusiness,
    itemIds: [
      "media_store_orders",
      "native_ads",
      "payment-analytics",
      "ad_campaigns",
      "ad_creatives",
      "inventory_slots",
      "ad_account",
      "ad_analytics",
      "publishers_list",
      "publishers_articles",
      "publishers_analytics",
    ],
  },
  {
    id: "workspace_analytics",
    labelAr: "التحليلات والتقارير",
    labelKey: "nav.workspace_analytics",
    icon: BarChart3,
    itemIds: [
      "dashboards",
      "trending",
      "behavior",
      "article-analytics",
      "deep_analysis_stats",
    ],
  },
  {
    id: "workspace_people",
    labelAr: "الفريق والصلاحيات",
    labelKey: "nav.workspace_people",
    icon: Users,
    itemIds: [
      "staff",
      "users_mgmt",
      "roles",
      "permissions",
      "correspondents",
      "opinion-authors",
      "staff-communications",
      "staff-productivity",
      "email-templates",
    ],
  },
  {
    id: "workspace_system",
    labelAr: "النظام والتكاملات",
    labelKey: "nav.workspace_system",
    icon: Settings,
    itemIds: [
      "rss_feeds",
      "sportmonks_news",
      "integrations",
      "storage",
      "audits",
      "system_settings",
      "sports_tournaments",
      "wc_2026_numbers_report",
      "admin_tools",
      "systems_catalog",
      "ai_hub",
    ],
  },
] as const;

const STAFF_NAV_PRIORITY_IDS = ["dashboard", "tasks", "new_article"] as const;
const COMPACT_NAV_ROLES = new Set<UserRole>([
  "reporter",
  "opinion_author",
  "angle_writer",
  "publisher",
  "advertiser",
  "guest",
]);

/**
 * Reorganize the already-authorized navigation leaves by staff workflow.
 * Access is intentionally filtered first; this layer changes presentation only.
 */
function organizeStaffNavigation(items: NavItem[], role: UserRole): NavItem[] {
  if (COMPACT_NAV_ROLES.has(role)) return items;

  const leaves = flattenNavTree(items).filter((item) => item.path);

  // Small contributor menus are clearer without extra containers.
  if (leaves.length <= 5) return items;

  const leavesById = new Map<string, NavItem>();
  const seenPaths = new Set<string>();

  for (const item of leaves) {
    if (!item.path || leavesById.has(item.id) || seenPaths.has(item.path)) continue;
    leavesById.set(item.id, { ...item, children: undefined });
    seenPaths.add(item.path);
  }

  const usedIds = new Set<string>();
  const priorityItems = STAFF_NAV_PRIORITY_IDS.flatMap((id) => {
    const item = leavesById.get(id);
    if (!item) return [];
    usedIds.add(id);
    return [item];
  });

  const sections: NavItem[] = STAFF_NAV_SECTION_DEFINITIONS.flatMap((section) => {
    const children = section.itemIds.flatMap((id) => {
      const item = leavesById.get(id);
      if (!item || usedIds.has(id)) return [];
      usedIds.add(id);
      return [item];
    });

    if (children.length === 0) return [];

    return [{
      id: section.id,
      labelKey: section.labelKey,
      labelAr: section.labelAr,
      icon: section.icon,
      roles: [role],
      children,
    } satisfies NavItem];
  });

  const remaining = Array.from(leavesById.values()).filter((item) => !usedIds.has(item.id));
  if (remaining.length > 0) {
    sections.push({
      id: "workspace_more",
      labelKey: "nav.workspace_more",
      labelAr: "المزيد",
      icon: Settings,
      roles: [role],
      children: remaining,
    });
  }

  return [...priorityItems, ...sections];
}

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
  userPermissions?: string[],
  allRoles?: string[]
): boolean {
  // Check feature flags first (must always pass)
  if (!checkFeatureFlags(item, flags)) {
    return false;
  }

  // Check excludeRoles - if ANY of the user's roles is in excludeRoles,
  // deny access. We check the full roles set (not just the highest role)
  // because a user with both `admin` and `opinion_author` should still
  // be excluded from a writer-noise entry that lists `opinion_author`.
  // excludeRoles is intentionally a soft-deny for UX layering — it does
  // NOT prevent the user from accessing the URL directly if they have
  // permission, it only hides the sidebar entry from the curated view.
  if (item.excludeRoles && item.excludeRoles.length > 0) {
    const roles = allRoles && allRoles.length > 0 ? allRoles : [role];
    if (item.excludeRoles.some((r) => roles.includes(r))) {
      return false;
    }
  }

  // requireRoles: raw role names only (e.g. system_admin) — bypasses
  // resolveUserRole mapping and permission wildcards so regular admin
  // with "*" cannot see system_admin-only items.
  if (item.requireRoles && item.requireRoles.length > 0) {
    const roles = allRoles && allRoles.length > 0 ? allRoles : [role];
    return item.requireRoles.some((r) => roles.includes(r));
  }

  // If item has permissions defined, check permissions (permission-first).
  // "*" in userPermissions is a wildcard issued to admin/system_admin —
  // grants access regardless of the specific permission asked for.
  if (item.permissions && item.permissions.length > 0) {
    if (userPermissions?.includes("*")) return true;
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
  userPermissions?: string[],
  allRoles?: string[]
): NavItem[] {
  const result: NavItem[] = [];
  
  for (const item of items) {
    // Feature flags ALWAYS apply - even for containers
    // This is a hard gate that cannot be bypassed
    if (!checkFeatureFlags(item, flags)) {
      continue; // Skip this item entirely if feature flags fail
    }

    // Container-level excludeRoles: hide the entire subtree when any of
    // the user's roles is in the parent's excludeRoles. Without this,
    // children would still show because admin/wildcard permissions pass
    // them individually.
    if (item.excludeRoles && item.excludeRoles.length > 0) {
      const roles = allRoles && allRoles.length > 0 ? allRoles : [role];
      if (item.excludeRoles.some((r) => roles.includes(r))) {
        continue;
      }
    }

    // First, recursively process children
    if (item.children && item.children.length > 0) {
      const filteredChildren = filterNavTree(item.children, role, flags, userPermissions, allRoles);

      // If children passed, handle parent visibility
      if (filteredChildren.length > 0) {
        // Pure container (no path) - safe to show if children are accessible
        // Feature flags already checked above
        if (!item.path) {
          result.push({
            ...item,
            children: filteredChildren,
          });
          continue;
        }

        // Parent WITH path - must pass its own access check for security
        if (itemPassesAccessCheck(item, role, flags, userPermissions, allRoles)) {
          result.push({
            ...item,
            children: filteredChildren,
          });
        } else {
          // Parent failed but children passed - promote children to parent level
          // This ensures permissioned children remain visible without exposing parent route
          result.push(...filteredChildren);
        }
        continue;
      }

      // No children passed - check if parent itself passes and has a direct path
      if (item.path && itemPassesAccessCheck(item, role, flags, userPermissions, allRoles)) {
        result.push({ ...item, children: [] });
      }
      // Otherwise, parent with no accessible children - skip
      continue;
    }

    // Leaf item - apply direct access check
    if (itemPassesAccessCheck(item, role, flags, userPermissions, allRoles)) {
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

  // Then, try startsWith match (longest path first).
  // عناصر meta.exact (مثل /dashboard) لا تُطابق بالمقدّمة — وإلا تسرق كل الصفحات الفرعية.
  const startsWithMatches = flat
    .filter(
      (item) =>
        item.path &&
        !item.meta?.exact &&
        (pathname === item.path || pathname.startsWith(`${item.path}/`)),
    )
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
 * Hook to get filtered navigation state
 */
export function useNav(context: NavContext): NavState {
  const navState = useMemo<NavState>(() => {
    // Use provided context
    const role = context.role;
    const flags = context.flags;
    const currentPath = context.pathname;
    const userPermissions = context.permissions;
    const allRoles = context.allRoles;

    // Filter tree - now includes permission-based filtering
    const authorizedTree = filterNavTree(navConfig, role, flags, userPermissions, allRoles);
    const treeFiltered = organizeStaffNavigation(authorizedTree, role);

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
  }, [context.role, context.flags, context.pathname, context.permissions, context.allRoles]);

  return navState;
}

/**
 * تتبع حدث النقر على عنصر القائمة
 * Track navigation item click event
 */
export function trackNavClick(id: string, path?: string) {
  // Placeholder for analytics tracking
  if (typeof window !== "undefined") {
    // يمكن إضافة تكامل مع Google Analytics أو أي نظام تتبع آخر هنا
    // Example: window.gtag?.('event', 'nav_item_clicked', { id, path });
    void id;
    void path;
  }
}
