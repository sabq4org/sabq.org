import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

export interface WorldCupBlockSettings {
  /** إظهار بلوك المونديال في واجهة الويب وبانر التطبيقات (iOS/أندرويد) */
  visible: boolean;
  /** بطل مُعيَّن يدويًا (احتياط تأخّر المزوّد) — null = تلقائي من نتيجة النهائي */
  manualChampionTeamId: number | null;
}

export function useWorldCupBlockSettings() {
  const { data, isLoading } = useQuery<WorldCupBlockSettings>({
    queryKey: ["/api/system/world-cup-block"],
    queryFn: getQueryFn<WorldCupBlockSettings>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 5,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<WorldCupBlockSettings>) => {
      return apiRequest("/api/system/world-cup-block", {
        method: "POST",
        body: JSON.stringify(patch),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/world-cup-block"] });
      // البلوك نفسه يقرأ overview — نُبطل كاشه ليعكس الإخفاء/البطل فورًا للمشرف
      queryClient.invalidateQueries({ queryKey: ["/api/world-cup/overview"] });
    },
  });

  return {
    visible: data?.visible ?? true,
    manualChampionTeamId: data?.manualChampionTeamId ?? null,
    setVisible: (visible: boolean) => updateMutation.mutate({ visible }),
    setManualChampionTeamId: (manualChampionTeamId: number | null) =>
      updateMutation.mutate({ manualChampionTeamId }),
    isLoading,
    isSaving: updateMutation.isPending,
  };
}
