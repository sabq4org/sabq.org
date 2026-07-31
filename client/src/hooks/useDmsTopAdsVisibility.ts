import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

interface DmsTopAdsResponse {
  showTopAds: boolean;
}

const QUERY_KEY = ["/api/system/dms-top-ads"];

/**
 * قراءة فقط — تستهلكها مكوّنات إعلانات DMS في الواجهة العامة.
 * الافتراضي true أثناء التحميل حتى لا يتأخر ظهور الإعلان في الحالة
 * الاعتيادية (الإعلانات مفعّلة)؛ الإطفاء حالة نادرة يقبل فيها انزياح
 * لمرة واحدة عند أول تحميل قبل وصول الإعداد.
 */
export function useDmsTopAdsEnabled(): boolean {
  const { data } = useQuery<DmsTopAdsResponse | null>({
    queryKey: QUERY_KEY,
    queryFn: getQueryFn<DmsTopAdsResponse>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 5,
  });
  return data?.showTopAds ?? true;
}

/** قراءة + حفظ — للوحة إعدادات النظام */
export function useDmsTopAdsVisibility() {
  const { data, isLoading } = useQuery<DmsTopAdsResponse | null>({
    queryKey: QUERY_KEY,
    queryFn: getQueryFn<DmsTopAdsResponse>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 5,
  });

  const updateMutation = useMutation({
    mutationFn: async (showTopAds: boolean) => {
      return apiRequest("/api/system/dms-top-ads", {
        method: "POST",
        body: JSON.stringify({ showTopAds }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    showTopAds: data?.showTopAds ?? true,
    setShowTopAds: (value: boolean) => updateMutation.mutate(value),
    isLoading,
    isSaving: updateMutation.isPending,
  };
}
