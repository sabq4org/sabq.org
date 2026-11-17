import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, apiUrl, queryClient } from "./queryClient";

type Scope = "homepage_only" | "site_full" | "dashboard";
const refreshMs = 60_000;
const stringMap = z.record(z.string(), z.string()).optional();

// Persist only the presentation fields. The API row also includes editorial
// account IDs and a changelog, which do not belong in browser storage.
const appearance = z.object({
  assets: z.object({
    logoLight: z.string().optional(),
    logoDark: z.string().optional(),
    favicon: z.string().optional(),
  }).nullable(),
  tokens: z.object({
    colors: stringMap,
    fonts: stringMap,
    spacing: stringMap,
    borderRadius: stringMap,
  }).nullable(),
}).nullable();

const snapshotSchema = z.object({ requestedAt: z.number().int().positive(), theme: appearance });
export type ActiveAppearance = z.infer<typeof appearance>;
type Snapshot = z.infer<typeof snapshotSchema>;

function readSnapshot(key: string): Snapshot | undefined {
  try {
    const snapshot = snapshotSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    const age = Date.now() - snapshot.requestedAt;
    if (age >= 0 && age < refreshMs) return snapshot;
  } catch {
    // A blocked store or an obsolete payload falls back to a normal GET.
  }
}

export function useActiveTheme(scope: Scope) {
  const key = `sabq:public-theme:v1:${scope}`;
  const initial = useMemo(() => scope === "dashboard" ? undefined : readSnapshot(key), [scope, key]);
  // React Query restarts its interval on mount. Catch up once at the
  // restored sample's own deadline, including when the tab resumes later.
  useEffect(() => {
    if (!initial) return;
    const queryKey = ["/api/themes/active", scope];
    const refresh = () => {
      if (document.hidden || !navigator.onLine) return;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      const current = queryClient.getQueryState(queryKey);
      if (current?.dataUpdatedAt === initial.requestedAt && current.fetchStatus === "idle") {
        void queryClient.refetchQueries({ queryKey, exact: true, type: "active" });
      }
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("visibilitychange", refresh);
      window.addEventListener("online", refresh);
      refresh();
    }, Math.max(0, initial.requestedAt + refreshMs - Date.now()));
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [initial, scope]);

  return useQuery({
    queryKey: ["/api/themes/active", scope],
    initialData: initial?.theme,
    initialDataUpdatedAt: initial?.requestedAt,
    staleTime: refreshMs,
    retry: false,
    queryFn: async ({ signal, queryKey }): Promise<ActiveAppearance> => {
      const requestedAt = Date.now();
      const url = `/api/themes/active?scope=${scope}`;
      if (scope === "dashboard") {
        return apiRequest<ActiveAppearance>(url, { silent: true }).catch(() => null);
      }

      // Refetches, including explicit invalidation, always go through fetch.
      // Drop the old value even if this request fails or forbids persistence.
      try {
        sessionStorage.removeItem(key);
      } catch { /* Storage can be disabled. */ }
      const invalidated = queryClient.getQueryState(queryKey)?.isInvalidated;
      const response = await fetch(apiUrl(url), {
        credentials: "omit",
        cache: invalidated ? "reload" : "default",
        signal,
      });
      if (!response.ok) throw new Error(`Theme request failed (${response.status})`);
      const theme: ActiveAppearance = await response.json();
      const cacheControl = response.headers.get("cache-control") || "";
      if (response.status === 200 && !/\b(?:private|no-store|no-cache)\b/i.test(cacheControl)) {
        const result = appearance.safeParse(theme);
        if (result.success) {
          try {
            sessionStorage.setItem(key, JSON.stringify({ requestedAt, theme: result.data }));
          } catch { /* Quota or privacy settings can prevent writes. */ }
        }
      }
      return theme;
    },
    refetchInterval: refreshMs,
  });
}
