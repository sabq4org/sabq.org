import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import {
  isDashboardThemeId,
  type DashboardThemeId,
} from "@shared/dashboard-theme";
import { writeStoredDashboardTheme } from "@/dashboard-themes/presets";

interface PersonalDashboardThemeResponse {
  themeId: DashboardThemeId | null;
}

export const PERSONAL_DASHBOARD_THEME_QUERY_KEY = ["/api/user/dashboard-theme"] as const;
const PERSONAL_THEME_STORAGE_KEY = "sabq.dashboard.theme.personal.v1";

function readLocalPersonalTheme(): DashboardThemeId | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(PERSONAL_THEME_STORAGE_KEY);
    if (raw === null) return undefined;
    if (raw === "") return null;
    if (isDashboardThemeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return undefined;
}

function writeLocalPersonalTheme(themeId: DashboardThemeId | null) {
  try {
    localStorage.setItem(PERSONAL_THEME_STORAGE_KEY, themeId ?? "");
  } catch {
    /* ignore */
  }
}

function themeFromCache(data: unknown): DashboardThemeId | null | undefined {
  if (!data || typeof data !== "object") return undefined;
  const themeId = (data as PersonalDashboardThemeResponse).themeId;
  if (themeId === null) return null;
  if (isDashboardThemeId(themeId)) return themeId;
  return undefined;
}

/** Client/validation failures must surface; only infra may keep a local preference. */
function isInfraSaveFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (!msg) return true;
  if (msg === "Invalid themeId" || msg.includes("Invalid themeId")) return false;
  if (/^400:/.test(msg) || /^401:/.test(msg) || /^403:/.test(msg) || /^404:/.test(msg)) return false;
  if (msg === "Network error" || /failed to fetch/i.test(msg)) return true;
  if (/^5\d{2}:/.test(msg)) return true;
  if (msg.includes("الخادم غير متاح")) return true;
  return false;
}

export function usePersonalDashboardTheme(enabled = true) {
  /** After an infra-only save, keep local id until a real server sync or explicit follow-org. */
  const preferLocalRef = useRef(false);

  const query = useQuery<PersonalDashboardThemeResponse | null>({
    queryKey: PERSONAL_DASHBOARD_THEME_QUERY_KEY,
    queryFn: getQueryFn<PersonalDashboardThemeResponse>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: true,
    enabled,
  });

  const updateMutation = useMutation({
    mutationFn: async (themeId: DashboardThemeId | null) => {
      if (themeId !== null && !isDashboardThemeId(themeId)) {
        throw new Error("Invalid themeId");
      }
      writeLocalPersonalTheme(themeId);
      try {
        return (await apiRequest("/api/user/dashboard-theme", {
          method: "PUT",
          body: JSON.stringify({ themeId }),
          headers: { "Content-Type": "application/json" },
          silent: true,
        })) as { success: boolean; themeId: DashboardThemeId | null; localOnly?: boolean };
      } catch (error) {
        if (isInfraSaveFailure(error)) {
          return { success: true, themeId, localOnly: true };
        }
        throw error;
      }
    },
    onMutate: async (themeId) => {
      await queryClient.cancelQueries({ queryKey: PERSONAL_DASHBOARD_THEME_QUERY_KEY });
      const previous = queryClient.getQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY);
      queryClient.setQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY, { themeId });
      writeLocalPersonalTheme(themeId);
      if (themeId === null) preferLocalRef.current = false;
      if (isDashboardThemeId(themeId)) writeStoredDashboardTheme(themeId);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY, ctx.previous);
        const prevTheme = themeFromCache(ctx.previous);
        if (prevTheme !== undefined) {
          writeLocalPersonalTheme(prevTheme);
          if (isDashboardThemeId(prevTheme)) writeStoredDashboardTheme(prevTheme);
        }
      }
    },
    onSuccess: (data) => {
      const next =
        data?.themeId === null || isDashboardThemeId(data?.themeId) ? data.themeId : null;
      preferLocalRef.current = Boolean(data && "localOnly" in data && data.localOnly);
      queryClient.setQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY, { themeId: next });
      writeLocalPersonalTheme(next);
      if (isDashboardThemeId(next)) writeStoredDashboardTheme(next);
    },
  });

  const fromApi =
    query.data && (query.data.themeId === null || isDashboardThemeId(query.data.themeId))
      ? query.data.themeId
      : undefined;
  const fromLocal = readLocalPersonalTheme();

  useEffect(() => {
    if (preferLocalRef.current && isDashboardThemeId(fromLocal) && fromApi === fromLocal) {
      preferLocalRef.current = false;
    }
  }, [fromApi, fromLocal]);

  const personalThemeId: DashboardThemeId | null =
    preferLocalRef.current && isDashboardThemeId(fromLocal)
      ? fromLocal
      : fromApi !== undefined
        ? fromApi
        : fromLocal !== undefined
          ? fromLocal
          : null;

  return {
    personalThemeId,
    isLoading: query.isLoading,
    isSaving: updateMutation.isPending,
    setPersonalThemeId: (id: DashboardThemeId | null) => updateMutation.mutateAsync(id),
  };
}
