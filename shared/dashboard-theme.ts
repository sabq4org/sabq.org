/** Org-wide dashboard theme IDs — shared by API validation and client presets. */

export const DASHBOARD_THEME_IDS = [
  "sabq",
  "twitter",
  "claude",
  "claude-amber-ibm",
  "claude-azure",
  "whatsapp",
  "elegant-luxury",
  "sage-meadow",
] as const;

export type DashboardThemeId = (typeof DASHBOARD_THEME_IDS)[number];

export const DEFAULT_DASHBOARD_THEME_ID: DashboardThemeId = "twitter";

export const DASHBOARD_THEME_SETTING_KEY = "dashboard_theme_id";

export function isDashboardThemeId(value: unknown): value is DashboardThemeId {
  return typeof value === "string" && (DASHBOARD_THEME_IDS as readonly string[]).includes(value);
}

export function parseDashboardThemeId(value: unknown): DashboardThemeId {
  if (isDashboardThemeId(value)) return value;
  if (value && typeof value === "object" && isDashboardThemeId((value as { themeId?: unknown }).themeId)) {
    return (value as { themeId: DashboardThemeId }).themeId;
  }
  return DEFAULT_DASHBOARD_THEME_ID;
}
