/**
 * مصدر وحيد لعناصر قائمة حساب العضو —
 * يستهلكه UserAccountMenu وSheet الهامبرغر في Header.
 */
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bookmark,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Settings,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import { hasPermission, type User as AuthUser } from "@/hooks/useAuth";

export type AccountMenuItem = {
  id: string;
  labelAr: string;
  href: string;
  icon: LucideIcon;
  /** صلاحية مطلوبة؛ إن وُجدت تُفحص عبر hasPermission (مع دعم "*") */
  permission?: string;
  testId: string;
  /** مجموعة: member = عناصر العضوية، staff = أدوات العمل */
  group: "member" | "staff";
};

export type AccountQuickChip = {
  id: string;
  labelAr: string;
  href: string;
  icon: LucideIcon;
  testId: string;
  /** مفتاح العدّاد الاختياري */
  countKey?: "bookmarks" | "inbox";
};

/** شرائح سريعة — نقرة واحدة للوجهات الأكثر استخدامًا */
export const ACCOUNT_QUICK_CHIPS: readonly AccountQuickChip[] = [
  {
    id: "bookmarks",
    labelAr: "المحفوظات",
    href: "/profile/saved",
    icon: Bookmark,
    testId: "chip-bookmarks",
    countKey: "bookmarks",
  },
  {
    id: "inbox",
    labelAr: "الوارد",
    href: "/notifications",
    icon: Bell,
    testId: "chip-inbox",
    countKey: "inbox",
  },
  {
    id: "daily-brief",
    labelAr: "ملخص اليوم",
    href: "/daily-brief",
    icon: Newspaper,
    testId: "chip-daily-brief",
  },
] as const;

/** عناصر القائمة الرئيسية (عضوية + موظفين) */
export const ACCOUNT_MENU_ITEMS: readonly AccountMenuItem[] = [
  {
    id: "profile",
    labelAr: "ملفي",
    href: "/profile",
    icon: UserIcon,
    testId: "link-profile",
    group: "member",
  },
  {
    id: "activity",
    labelAr: "نشاطي وتقاريري",
    href: "/profile/activity",
    icon: TrendingUp,
    testId: "link-activity",
    group: "member",
  },
  {
    id: "settings",
    labelAr: "الإعدادات",
    href: "/settings",
    icon: Settings,
    testId: "link-account-settings",
    group: "member",
  },
  {
    id: "dashboard",
    labelAr: "لوحة التحكم",
    href: "/dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
    testId: "link-dashboard",
    group: "staff",
  },
  {
    id: "communications",
    labelAr: "قنوات الاتصال",
    href: "/dashboard/communications",
    icon: MessageSquare,
    permission: "dashboard.view_messages",
    testId: "link-communications",
    group: "staff",
  },
] as const;

export function getVisibleAccountMenuItems(
  user: Pick<AuthUser, "permissions"> | null | undefined,
): AccountMenuItem[] {
  return ACCOUNT_MENU_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(user as AuthUser, item.permission);
  });
}

export function getMemberMenuItems(
  user: Pick<AuthUser, "permissions"> | null | undefined,
): AccountMenuItem[] {
  return getVisibleAccountMenuItems(user).filter((i) => i.group === "member");
}

export function getStaffMenuItems(
  user: Pick<AuthUser, "permissions"> | null | undefined,
): AccountMenuItem[] {
  return getVisibleAccountMenuItems(user).filter((i) => i.group === "staff");
}

/** عناصر Sheet الموبايل — نفس المصدر مع إضافة المحفوظات كصف صريح */
export function getMobileToolsItems(
  user: Pick<AuthUser, "permissions"> | null | undefined,
): AccountMenuItem[] {
  const member = getMemberMenuItems(user);
  const staff = getStaffMenuItems(user);
  const bookmarks: AccountMenuItem = {
    id: "bookmarks-row",
    labelAr: "المحفوظات",
    href: "/profile/saved",
    icon: Bookmark,
    testId: "link-mobile-bookmarks",
    group: "member",
  };
  // ترتيب Sheet: staff أولًا (لوحة التحكم) ثم العضوية مع المحفوظات
  return [
    ...staff.filter((i) => i.id === "dashboard"),
    ...member.filter((i) => i.id === "profile"),
    bookmarks,
    ...member.filter((i) => i.id === "activity"),
    ...member.filter((i) => i.id === "settings"),
    ...staff.filter((i) => i.id === "communications"),
  ];
}
