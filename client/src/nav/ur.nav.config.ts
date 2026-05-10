import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Users,
  PlusCircle,
  MessageSquare,
  Newspaper,
  UserCircle,
  Blocks,
  LayoutGrid,
} from "lucide-react";
import type { NavItem } from "./types";

/**
 * Urdu Navigation Configuration
 * Simplified to show only implemented pages
 * All items have permissions for custom RBAC role support
 */
export const urduNavConfig: NavItem[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    labelAr: "نظرة عامة",
    labelEn: "Overview",
    labelUr: "جائزہ",
    path: "/ur/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "editor", "author", "reviewer", "analyst", "reporter"],
    permissions: ["dashboard.view"],
    meta: { exact: true },
  },

  // ===== المحتوى / Content / مواد =====
  {
    id: "content",
    labelKey: "nav.content",
    labelAr: "المحتوى",
    labelEn: "Content",
    labelUr: "مواد",
    icon: Newspaper,
    roles: ["admin", "editor", "author", "reviewer"],
    children: [
      {
        id: "articles",
        labelKey: "nav.articles",
        labelAr: "الأخبار والمقالات",
        labelEn: "News & Articles",
        labelUr: "خبریں اور مضامین",
        path: "/ur/dashboard/articles",
        icon: FileText,
        roles: ["admin", "editor", "author", "reviewer"],
        permissions: ["articles.view"],
      },
      {
        id: "new_article",
        labelKey: "nav.new_article",
        labelAr: "مقال جديد",
        labelEn: "New Article",
        labelUr: "نیا مضمون",
        path: "/ur/dashboard/articles/new",
        icon: PlusCircle,
        roles: ["admin", "editor", "author"],
        permissions: ["articles.create"],
      },
      {
        id: "categories",
        labelKey: "nav.categories",
        labelAr: "التصنيفات",
        labelEn: "Categories",
        labelUr: "زمرے",
        path: "/ur/dashboard/categories",
        icon: FolderOpen,
        roles: ["admin", "editor"],
        permissions: ["categories.view", "categories.manage"],
      },
    ],
  },

  // ===== Smart Content / المحتوى الذكي / سمارٹ مواد =====
  {
    id: "smart_content",
    labelKey: "nav.smart_content",
    labelAr: "المحتوى الذكي",
    labelEn: "Smart Content",
    labelUr: "سمارٹ مواد",
    icon: Blocks,
    roles: ["admin", "editor"],
    children: [
      {
        id: "smart_blocks",
        labelKey: "nav.smart_blocks",
        labelAr: "البلوكات الذكية",
        labelEn: "Smart Blocks",
        labelUr: "سمارٹ بلاکس",
        path: "/ur/dashboard/smart-blocks",
        icon: Blocks,
        roles: ["admin", "editor"],
        permissions: ["blocks.view", "blocks.manage"],
      },
      {
        id: "quad_categories",
        labelKey: "nav.quad_categories",
        labelAr: "التصنيفات الرباعية",
        labelEn: "Quad Categories",
        labelUr: "چار زمرے",
        path: "/ur/dashboard/quad-categories",
        icon: LayoutGrid,
        roles: ["admin", "editor"],
        permissions: ["blocks.view", "blocks.manage"],
      },
    ],
  },

  // ===== المستخدمون / Users / صارفین =====
  {
    id: "users",
    labelKey: "nav.users_and_roles",
    labelAr: "المستخدمون والأدوار",
    labelEn: "Users",
    labelUr: "صارفین",
    icon: Users,
    roles: ["admin"],
    children: [
      {
        id: "users_mgmt",
        labelKey: "nav.users",
        labelAr: "المستخدمون",
        labelEn: "Users",
        labelUr: "صارفین",
        path: "/ur/dashboard/users",
        icon: UserCircle,
        roles: ["admin"],
        permissions: ["users.view", "users.manage"],
      },
    ],
  },
];
