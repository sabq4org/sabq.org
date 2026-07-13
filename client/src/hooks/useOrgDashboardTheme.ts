import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import {
  DEFAULT_DASHBOARD_THEME_ID,
  isDashboardThemeId,
  type DashboardThemeId,
} from "@shared/dashboard-theme";
import { writeStoredDashboardTheme } from "@/dashboard-themes/presets";

interface DashboardThemeResponse {
  themeId: DashboardThemeId;
}

export const DASHBOARD_THEME_QUERY_KEY = ["/api/system/dashboard-theme"] as const;

export function useOrgDashboardTheme() {
  const query = useQuery<DashboardThemeResponse | null>({
    queryKey: DASHBOARD_THEME_QUERY_KEY,
    queryFn: getQueryFn<DashboardThemeResponse>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: true,
  });

  const updateMutation = useMutation({
    mutationFn: async (themeId: DashboardThemeId) => {
      if (!isDashboardThemeId(themeId)) {
        throw new Error("Invalid themeId");
      }
      return apiRequest("/api/system/dashboard-theme", {
        method: "POST",
        body: JSON.stringify({ themeId }),
        headers: { "Content-Type": "application/json" },
      }) as Promise<{ success: boolean; themeId: DashboardThemeId }>;
    },
    onSuccess: (data) => {
      const next = isDashboardThemeId(data?.themeId) ? data.themeId : undefined;
      if (next) {
        writeStoredDashboardTheme(next);
        queryClient.setQueryData(DASHBOARD_THEME_QUERY_KEY, { themeId: next });
      }
      queryClient.invalidateQueries({ queryKey: DASHBOARD_THEME_QUERY_KEY });
    },
  });

  const themeId: DashboardThemeId = isDashboardThemeId(query.data?.themeId)
    ? query.data.themeId
    : DEFAULT_DASHBOARD_THEME_ID;

  return {
    themeId,
    isLoading: query.isLoading,
    isSaving: updateMutation.isPending,
    setOrgThemeId: (id: DashboardThemeId) => updateMutation.mutateAsync(id),
    updateError: updateMutation.error,
  };
}
