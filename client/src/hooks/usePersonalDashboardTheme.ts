import { useMutation, useQuery } from "@tanstack/react-query";
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

export function usePersonalDashboardTheme(enabled = true) {
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
        })) as { success: boolean; themeId: DashboardThemeId | null };
      } catch {
        // Column may not be pushed yet — local personal preference still applies.
        return { success: true, themeId };
      }
    },
    onMutate: async (themeId) => {
      await queryClient.cancelQueries({ queryKey: PERSONAL_DASHBOARD_THEME_QUERY_KEY });
      const previous = queryClient.getQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY);
      queryClient.setQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY, { themeId });
      writeLocalPersonalTheme(themeId);
      if (isDashboardThemeId(themeId)) writeStoredDashboardTheme(themeId);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY, ctx.previous);
      }
    },
    onSuccess: (data) => {
      const next = data?.themeId === null || isDashboardThemeId(data?.themeId) ? data.themeId : null;
      queryClient.setQueryData(PERSONAL_DASHBOARD_THEME_QUERY_KEY, { themeId: next });
      writeLocalPersonalTheme(next);
      if (isDashboardThemeId(next)) writeStoredDashboardTheme(next);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PERSONAL_DASHBOARD_THEME_QUERY_KEY });
    },
  });

  const fromApi =
    query.data && (query.data.themeId === null || isDashboardThemeId(query.data.themeId))
      ? query.data.themeId
      : undefined;
  const fromLocal = readLocalPersonalTheme();

  const personalThemeId: DashboardThemeId | null =
    fromApi !== undefined ? fromApi : fromLocal !== undefined ? fromLocal : null;

  return {
    personalThemeId,
    isLoading: query.isLoading,
    isSaving: updateMutation.isPending,
    setPersonalThemeId: (id: DashboardThemeId | null) => updateMutation.mutateAsync(id),
  };
}
