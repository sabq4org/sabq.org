import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

/** بطولات بلوكات الواجهة المدارة من لوحة التحكم */
export type TournamentBlockSlug = "world-cup" | "gulf-cup" | "asian-cup" | "kings-cup" | "pro-league";

export interface TournamentBlockSettings {
  /** إظهار البلوك في واجهة الويب (والتطبيقات حيث يعتمد البلوك على overview) */
  visible: boolean;
  /** بطل مُعيَّن يدويًا (احتياط تأخّر المزوّد) — null = تلقائي من نتيجة النهائي */
  manualChampionTeamId: number | null;
  /** ISO — البلوك يظهر من هذا الوقت؛ null = بلا حدّ */
  startAt: string | null;
  /** ISO — يختفي بعده؛ null = بلا حدّ */
  endAt: string | null;
}

/** كاش overview الذي يجب إبطاله بعد الحفظ ليعكس التغيير فورًا للمشرف */
const OVERVIEW_KEY: Record<TournamentBlockSlug, string> = {
  "world-cup": "/api/world-cup/overview",
  "gulf-cup": "/api/gulf-cup/overview",
  "asian-cup": "/api/asian-cup/overview",
  "kings-cup": "/api/kings-cup/overview",
  "pro-league": "/api/rsl/hero",
};

export function useTournamentBlockSettings(slug: TournamentBlockSlug) {
  const settingsKey = `/api/system/${slug}-block`;

  const { data, isLoading } = useQuery<TournamentBlockSettings>({
    queryKey: [settingsKey],
    queryFn: getQueryFn<TournamentBlockSettings>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 5,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<TournamentBlockSettings>) => {
      return apiRequest(settingsKey, {
        method: "POST",
        body: JSON.stringify(patch),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [settingsKey] });
      queryClient.invalidateQueries({ queryKey: [OVERVIEW_KEY[slug]] });
    },
  });

  return {
    visible: data?.visible ?? true,
    manualChampionTeamId: data?.manualChampionTeamId ?? null,
    startAt: data?.startAt ?? null,
    endAt: data?.endAt ?? null,
    save: (patch: Partial<TournamentBlockSettings>) => updateMutation.mutate(patch),
    isLoading,
    isSaving: updateMutation.isPending,
  };
}
