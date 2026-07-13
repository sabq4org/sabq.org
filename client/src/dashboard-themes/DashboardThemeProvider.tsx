import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  DASHBOARD_THEME_PRESETS,
  DEFAULT_DASHBOARD_THEME_ID,
  getDashboardThemeFontStack,
  readStoredDashboardTheme,
  writeStoredDashboardTheme,
  type DashboardThemeId,
  type DashboardThemePreset,
} from "./presets";
import { useOrgDashboardTheme } from "@/hooks/useOrgDashboardTheme";
import { cn } from "@/lib/utils";

interface DashboardThemeContextValue {
  themeId: DashboardThemeId;
  preset: DashboardThemePreset;
  presets: DashboardThemePreset[];
  /** Optimistic local apply; org save is done via setOrgThemeId on appearance page. */
  setThemeId: (id: DashboardThemeId) => void;
  isOrgLoading: boolean;
}

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

/** Nested-provider safe counter so html attr stays while any dashboard shell is mounted. */
let dashboardThemeMountCount = 0;

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    throw new Error("useDashboardTheme must be used within DashboardThemeProvider");
  }
  return ctx;
}

/** Safe for components that may render outside the dashboard shell. */
export function useDashboardThemeOptional() {
  return useContext(DashboardThemeContext);
}

interface DashboardThemeProviderProps {
  children: ReactNode;
  className?: string;
}

export function DashboardThemeProvider({ children, className }: DashboardThemeProviderProps) {
  const { themeId: orgThemeId, isLoading: isOrgLoading } = useOrgDashboardTheme();

  // Prefer org setting once loaded; localStorage only as first-paint fallback.
  const resolvedId: DashboardThemeId = isOrgLoading
    ? readStoredDashboardTheme()
    : orgThemeId || DEFAULT_DASHBOARD_THEME_ID;

  const setThemeId = useCallback((id: DashboardThemeId) => {
    writeStoredDashboardTheme(id);
  }, []);

  // Keep local cache aligned with org theme for next visit first paint.
  useEffect(() => {
    if (!isOrgLoading) {
      writeStoredDashboardTheme(resolvedId);
    }
  }, [isOrgLoading, resolvedId]);

  const preset = useMemo(
    () => DASHBOARD_THEME_PRESETS.find((item) => item.id === resolvedId) ?? DASHBOARD_THEME_PRESETS[0]!,
    [resolvedId],
  );

  const fontStack = getDashboardThemeFontStack(resolvedId);

  // Sync theme to <html> so Radix portals (dialogs/selects) inherit tokens + fonts.
  useEffect(() => {
    const root = document.documentElement;
    dashboardThemeMountCount += 1;
    root.setAttribute("data-dashboard-theme", resolvedId);
    root.style.setProperty("--dashboard-font-sans", fontStack);

    return () => {
      dashboardThemeMountCount = Math.max(0, dashboardThemeMountCount - 1);
      if (dashboardThemeMountCount === 0) {
        root.removeAttribute("data-dashboard-theme");
        root.style.removeProperty("--dashboard-font-sans");
      }
    };
  }, [resolvedId, fontStack]);

  const value = useMemo<DashboardThemeContextValue>(
    () => ({
      themeId: resolvedId,
      preset,
      presets: DASHBOARD_THEME_PRESETS,
      setThemeId,
      isOrgLoading,
    }),
    [resolvedId, preset, setThemeId, isOrgLoading],
  );

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        className={cn(
          "dashboard-theme min-h-screen bg-background font-sans text-foreground",
          className,
        )}
        data-dashboard-theme={resolvedId}
        data-testid="dashboard-theme-wrapper"
        style={{ fontFamily: fontStack }}
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}
