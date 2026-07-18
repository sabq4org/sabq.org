import { LucideIcon } from "lucide-react";

export type UserRole = "admin" | "superadmin" | "super_admin" | "system_admin" | "editor" | "content_manager" | "author" | "reviewer" | "analyst" | "guest" | "opinion_author" | "reporter" | "advertiser" | "comments_moderator" | "publisher" | "angle_writer";

export type BadgeIntent = "default" | "secondary" | "destructive" | "outline";

export interface NavBadge {
  key: string;
  intent?: BadgeIntent;
  count?: number;
}

export interface NavItemMeta {
  exact?: boolean;
  external?: boolean;
  newTab?: boolean;
}

export interface NavItem {
  id: string;
  labelKey: string;
  labelAr?: string; // Direct Arabic label
  labelEn?: string; // Direct English label
  labelUr?: string; // Direct Urdu label
  path?: string;
  icon?: LucideIcon;
  roles: UserRole[];
  excludeRoles?: UserRole[]; // Roles to explicitly exclude (takes precedence over roles)
  /**
   * أدوار خام من user.roles / users.role — تُفحص حرفياً دون تحويل system_admin→admin
   * ودون wildcard الصلاحيات. إن وُجدت تُقدَّم على permissions و roles.
   */
  requireRoles?: string[];
  permissions?: string[]; // Required permissions (any of these grants access)
  featureFlags?: string[];
  badge?: NavBadge;
  children?: NavItem[];
  meta?: NavItemMeta;
  divider?: boolean; // Show divider after this item
}

export interface NavContext {
  role: UserRole;
  /**
   * All of the user's roles (from the RBAC user_roles table + the legacy
   * users.role text column). Used by excludeRoles so that a user with
   * multiple roles (e.g. admin + opinion_author) is excluded if ANY of
   * their roles is in an item's excludeRoles list. When omitted, the
   * filter falls back to checking only `role`.
   */
  allRoles?: string[];
  permissions?: string[]; // User's permissions for permission-based filtering
  flags: Record<string, boolean>;
  pathname: string;
}

export interface NavState {
  treeFiltered: NavItem[];
  activeItem: NavItem | null;
  parents: NavItem[];
  flat: NavItem[];
}
