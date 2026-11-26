import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  BarChart3,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Contact,
  Newspaper,
  PenTool,
  Settings,
  Users,
  PanelsTopLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NavItem, NavContext, NavState, UserRole } from "./types";
import { navConfig } from "./nav.config";
import { isRoleExcluded } from "@shared/effectiveRoles";

export interface StaffNavSubsection {
  /** عنوان فرعي رمادي صغير داخل المجموعة؛ null = بلا عنوان */
  label: string | null;
  itemIds: readonly string[];
}

export interface StaffNavSectionDefinition {
  id: string;
  labelAr: string;
  labelKey: string;
  icon: LucideIcon;
  subsections: readonly StaffNavSubsection[];
}

/**
 * توزيع القائمة حسب مجال العمل (اعتُمد 2026-11-24).
 * لا يوجد «المزيد»: كل عنصر في nav.config.ts له مكان هنا أو في
 * STAFF_NAV_PRIORITY_IDS، واختبار tests/unit/navSections.test.ts يفشل
 * إن أُضيف عنصر بلا مجموعة.
 *
 * قاعدة الخدمة الجديدة (أول جواب يصدق):
 *  تكتب الخبر أو تنشره أو توزعه → التحرير والنشر
 *  تخص كتّاب الرأي أو زوايا مُقترب → مقالات الرأي
 *  منتج مستقل له صفحته العامة (مواعيدك، إنفاذ، بطولة) → منصات سبق
 *  تغيّر شكل الصفحة الرئيسية أو التطبيق → واجهة الموقع
 *  أداة ذكاء اصطناعي عامة أو مختبر → الأدوات الذكية
 *  القرّاء وتعليقاتهم ورسائلهم → الجمهور والتواصل
 *  معلن أو ناشر أو وكالة أو مدفوعات → الأعمال والشراكات
 *  أرقام وتقارير للقراءة → التحليلات والتقارير
 *  المنسوبون وصلاحياتهم ومراسلتهم → الفريق والصلاحيات
 *  إعداد أو مفتاح أو مصدر بيانات أو سجل → النظام والتكاملات
 */
export const STAFF_NAV_SECTION_DEFINITIONS: readonly StaffNavSectionDefinition[] = [
  {
    id: "workspace_editorial",
    labelAr: "التحرير والنشر",
    labelKey: "nav.workspace_editorial",
    icon: Newspaper,
    subsections: [
      {
        label: null,
        itemIds: [
          "articles",
          "breaking_ticker",
          "gulf_events",
          "smart_radar",
          "calendar",
          "world_days",
          "media_library",
          "publish_banned_words",
          "smart_editor_usage",
        ],
      },
      { label: "التوزيع", itemIds: ["social_publishing", "audio_bulletin", "push_notifications"] },
    ],
  },
  {
    id: "workspace_opinion",
    labelAr: "مقالات الرأي",
    labelKey: "nav.workspace_opinion",
    icon: PenTool,
    subsections: [
      {
        label: "كتّاب الرأي",
        itemIds: [
          "opinion_writers",
          "opinion_writer_files",
          "opinion_writer_voices",
          "opinion_writer_announcements",
          "opinion_writer_feedback",
          "opinion_tickets",
          "opinion-authors",
        ],
      },
      { label: "زوايا مُقترب", itemIds: ["muqtarab", "muqtarab_review"] },
    ],
  },
  {
    id: "workspace_platforms",
    labelAr: "منصات سبق",
    labelKey: "nav.workspace_platforms",
    icon: Boxes,
    subsections: [
      { label: "خدمات", itemIds: ["mawaeed", "infath"] },
      { label: "الرياضة", itemIds: ["sports_tournaments", "wc_2026_numbers_report", "sportmonks_news"] },
    ],
  },
  {
    id: "workspace_site",
    labelAr: "واجهة الموقع",
    labelKey: "nav.workspace_site",
    icon: PanelsTopLeft,
    subsections: [
      { label: "التصنيف والروابط", itemIds: ["categories", "tags", "smart_links"] },
      {
        label: "البلوكات",
        itemIds: ["smart_blocks", "quad_categories_block", "hajj_block", "national_day_block", "sahraa_tv_block"],
      },
      { label: "الشكل", itemIds: ["themes", "templates", "ios_national_day_theme"] },
    ],
  },
  {
    id: "workspace_ai",
    labelAr: "الأدوات الذكية",
    labelKey: "nav.workspace_ai",
    icon: Bot,
    subsections: [
      { label: "عُمق", itemIds: ["deep_analysis_manage", "deep_analysis_create", "deep_analysis_public"] },
      { label: "المساعدون", itemIds: ["ai_staff", "ops_room", "ai_summaries", "ai_headlines"] },
      {
        label: "المختبرات والإعدادات",
        itemIds: ["prompt_studio", "deepseek_lab", "voice_management", "auto_image_settings", "ai_hub"],
      },
    ],
  },
  {
    id: "workspace_audience",
    labelAr: "الجمهور والتواصل",
    labelKey: "nav.workspace_audience",
    icon: Contact,
    subsections: [
      {
        label: null,
        itemIds: [
          "contact_messages",
          "communications",
          "ai_moderation",
          "sentiment_insights",
          "surveys",
          "users_mgmt",
          "loyalty_admin",
        ],
      },
    ],
  },
  {
    id: "workspace_business",
    labelAr: "الأعمال والشراكات",
    labelKey: "nav.workspace_business",
    icon: BriefcaseBusiness,
    subsections: [
      { label: "المتجر الإعلامي", itemIds: ["media_store_orders", "native_ads", "payment-analytics"] },
      {
        label: "الإعلانات",
        itemIds: ["ad_campaigns", "ad_creatives", "inventory_slots", "ad_account", "ad_analytics"],
      },
      {
        label: "الناشرون والوكالات",
        itemIds: [
          "publishers_list",
          "publishers_applications",
          "publishers_articles",
          "publishers_analytics",
          "publishers_guide",
        ],
      },
    ],
  },
  {
    id: "workspace_analytics",
    labelAr: "التحليلات والتقارير",
    labelKey: "nav.workspace_analytics",
    icon: BarChart3,
    subsections: [
      {
        label: null,
        itemIds: ["dashboards", "trending", "behavior", "article-analytics", "deep_analysis_stats", "seo_weekly"],
      },
    ],
  },
  {
    id: "workspace_people",
    labelAr: "الفريق والصلاحيات",
    labelKey: "nav.workspace_people",
    icon: Users,
    subsections: [
      {
        label: "المنسوبون",
        itemIds: ["staff", "reporters", "correspondents", "staff_profiles", "official_letters", "staff-productivity"],
      },
      { label: "التواصل الداخلي", itemIds: ["staff-communications", "announcements", "email-templates"] },
      { label: "الصلاحيات", itemIds: ["roles", "permissions"] },
    ],
  },
  {
    id: "workspace_system",
    labelAr: "النظام والتكاملات",
    labelKey: "nav.workspace_system",
    icon: Settings,
    subsections: [
      { label: "الإعدادات", itemIds: ["system_settings", "editor_alerts", "dashboard-appearance", "publisher_tokens"] },
      { label: "المصادر والتكاملات", itemIds: ["rss_feeds", "integrations", "storage"] },
      { label: "المراقبة والأدوات", itemIds: ["audits", "admin_tools", "systems_catalog"] },
    ],
  },
];

export const STAFF_NAV_PRIORITY_IDS = ["dashboard", "tasks", "new_article", "meetings"] as const;
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
export function organizeStaffNavigation(items: NavItem[], role: UserRole): NavItem[] {
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
    const subsections = section.subsections
      .map((sub) => ({
        label: sub.label,
        items: sub.itemIds.flatMap((id) => {
          const item = leavesById.get(id);
          if (!item || usedIds.has(id)) return [];
          usedIds.add(id);
          return [item];
        }),
      }))
      .filter((sub) => sub.items.length > 0);

    const total = subsections.reduce((sum, sub) => sum + sub.items.length, 0);
    if (total === 0) return [];

    // مجموعة فيها صفحة واحدة لهذا المستخدم: رابط مباشر بلا فتح.
    if (total === 1) return [subsections[0].items[0]];

    // العناوين الفرعية تظهر فقط إن بقي أكثر من قسم فرعي.
    const showSubLabels = subsections.length > 1;
    const children = subsections.flatMap((sub) =>
      sub.items.map((item) => ({
        ...item,
        sectionLabel: showSubLabels && sub.label ? sub.label : undefined,
      })),
    );

    return [{
      id: section.id,
      labelKey: section.labelKey,
      labelAr: section.labelAr,
      icon: section.icon,
      roles: [role],
      children,
    } satisfies NavItem];
  });

  // شبكة أمان فقط: الاختبار يمنع وصول أي عنصر إلى هنا.
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
    if (isRoleExcluded(roles, item.excludeRoles)) {
      return false;
    }
  }

  if (item.requireAllRoles && item.requireAllRoles.length > 0) {
    const roles = allRoles && allRoles.length > 0 ? allRoles : [role];
    if (!item.requireAllRoles.every((r) => roles.includes(r))) return false;
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
export function filterNavTree(
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
      if (isRoleExcluded(roles, item.excludeRoles)) {
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
