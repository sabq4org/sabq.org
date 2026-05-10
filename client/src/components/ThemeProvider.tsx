import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Theme as AppTheme } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Theme = "light" | "dark";
export type Variant = "ai-first" | "magazine" | "classic" | "terminal";

const VALID_VARIANTS: Variant[] = ["ai-first", "magazine", "classic", "terminal"];

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultVariant?: Variant;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  variant: Variant;
  setVariant: (variant: Variant) => void;
  appTheme: AppTheme | null;
  isLoadingAppTheme: boolean;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined
);

type AuthUser = {
  id: string;
  preferredVariant?: Variant | null;
};

export function ThemeProvider({
  children,
  defaultTheme = "light",
  defaultVariant = "ai-first",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || defaultTheme
  );
  const [variant, setVariantState] = useState<Variant>(() => {
    const stored = localStorage.getItem("variant") as Variant | null;
    return stored && VALID_VARIANTS.includes(stored) ? stored : defaultVariant;
  });
  const [location] = useLocation();

  const { data: authUser } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Tracks the last variant value successfully synced to the server, so we
  // only PATCH when the user actually changes the variant in this session.
  const lastSyncedVariantRef = useRef<Variant | null>(null);
  // Tracks which (userId, variant) pair we already pulled from the account,
  // so the server-saved value is applied once on login but doesn't keep
  // overriding a manual change made in the same session.
  const lastAppliedFromAccountRef = useRef<string | null>(null);

  const scope = (() => {
    if (location === "/") return "homepage_only";
    if (location.startsWith("/dashboard")) return "dashboard";
    return "site_full";
  })();

  const { data: appTheme, isLoading: isLoadingAppTheme } = useQuery<AppTheme | null>({
    queryKey: ["/api/themes/active", scope],
    queryFn: async () => {
      const res = await fetch(`/api/themes/active?scope=${scope}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-variant", variant);
    localStorage.setItem("variant", variant);
  }, [variant]);

  // Apply the user's account-saved preferred variant once per (user, value).
  useEffect(() => {
    if (!authUser?.id) return;
    const saved = authUser.preferredVariant;
    if (!saved || !VALID_VARIANTS.includes(saved)) return;
    const sigKey = `${authUser.id}:${saved}`;
    if (lastAppliedFromAccountRef.current === sigKey) return;
    lastAppliedFromAccountRef.current = sigKey;
    lastSyncedVariantRef.current = saved;
    if (saved !== variant) {
      setVariantState(saved);
    }
  }, [authUser?.id, authUser?.preferredVariant, variant]);

  const setVariant = (next: Variant) => {
    setVariantState(next);
    // Sync to user account if logged in and value actually changed.
    if (authUser?.id && lastSyncedVariantRef.current !== next) {
      const previousSynced = lastSyncedVariantRef.current;
      apiRequest("/api/auth/user", {
        method: "PATCH",
        body: JSON.stringify({ preferredVariant: next }),
        headers: { "Content-Type": "application/json" },
      })
        .then(() => {
          // Only mark as synced after the server confirms the update,
          // so a failed PATCH can be retried by toggling again.
          lastSyncedVariantRef.current = next;
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        })
        .catch((err) => {
          // Roll back so the next attempt re-tries the sync.
          lastSyncedVariantRef.current = previousSynced;
          console.error("[ThemeProvider] Failed to sync preferredVariant:", err);
        });
    }
  };

  useEffect(() => {
    if (!appTheme) return;

    const root = document.documentElement;

    if (appTheme.tokens?.colors) {
      Object.entries(appTheme.tokens.colors).forEach(([key, value]) => {
        // Apply theme-specific variables
        root.style.setProperty(`--theme-${key}`, value);
        
        // Apply mode-specific colors to base variables
        const suffix = theme === 'dark' ? '-dark' : '-light';
        if (key.endsWith(suffix)) {
          // Extract base variable name (e.g., "background-dark" -> "background")
          const baseKey = key.replace(suffix, '');
          root.style.setProperty(`--${baseKey}`, value);
        } else if (!key.includes('-light') && !key.includes('-dark')) {
          // If no suffix, apply to base variable
          root.style.setProperty(`--${key}`, value);
        }
      });
    }

    if (appTheme.tokens?.fonts) {
      Object.entries(appTheme.tokens.fonts).forEach(([key, value]) => {
        root.style.setProperty(`--theme-font-${key}`, value);
        root.style.setProperty(`--font-${key}`, value);
      });
    }

    if (appTheme.tokens?.spacing) {
      Object.entries(appTheme.tokens.spacing).forEach(([key, value]) => {
        root.style.setProperty(`--theme-space-${key}`, value);
      });
    }

    if (appTheme.tokens?.borderRadius) {
      Object.entries(appTheme.tokens.borderRadius).forEach(([key, value]) => {
        root.style.setProperty(`--theme-radius-${key}`, value);
      });
    }

    if (appTheme.assets?.favicon) {
      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (favicon) {
        favicon.href = appTheme.assets.favicon;
      }
    }
  }, [appTheme, theme]);

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme, variant, setVariant, appTheme: appTheme || null, isLoadingAppTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
