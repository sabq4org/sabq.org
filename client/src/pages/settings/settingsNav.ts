import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Heart,
  Languages,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";

export type SettingsSectionId =
  | "account"
  | "notifications"
  | "interests"
  | "security"
  | "privacy"
  | "appearance";

export type SettingsNavItem = {
  id: SettingsSectionId;
  labelAr: string;
  descriptionAr: string;
  icon: LucideIcon;
  path: string;
};

export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  {
    id: "account",
    labelAr: "الحساب والبيانات",
    descriptionAr: "الاسم والصورة والبريد والجوال",
    icon: User,
    path: "/settings/account",
  },
  {
    id: "notifications",
    labelAr: "الإشعارات",
    descriptionAr: "عام، مباريات، توصيات، وهدوء",
    icon: Bell,
    path: "/settings/notifications",
  },
  {
    id: "interests",
    labelAr: "الاهتمامات والمحتوى",
    descriptionAr: "اهتماماتك وما يظهر لك",
    icon: Heart,
    path: "/settings/interests",
  },
  {
    id: "security",
    labelAr: "تسجيل الدخول والأمان",
    descriptionAr: "كلمة المرور والتحقق بخطوتين",
    icon: ShieldCheck,
    path: "/settings/security",
  },
  {
    id: "privacy",
    labelAr: "الخصوصية والبيانات",
    descriptionAr: "سياساتك وبياناتك",
    icon: Shield,
    path: "/settings/privacy",
  },
  {
    id: "appearance",
    labelAr: "اللغة والمظهر",
    descriptionAr: "المظهر والوصول واللغة",
    icon: Languages,
    path: "/settings/appearance",
  },
] as const;

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "account";

export function isSettingsSectionId(value: string | undefined): value is SettingsSectionId {
  return SETTINGS_NAV.some((item) => item.id === value);
}

export function resolveSettingsSection(raw: string | undefined): SettingsSectionId {
  if (isSettingsSectionId(raw)) return raw;
  return DEFAULT_SETTINGS_SECTION;
}
