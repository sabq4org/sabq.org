import { useQuery, useMutation } from "@tanstack/react-query";
import { useLayoutEffect } from "react";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import "@/styles/dms-top-ads.css";

interface DmsTopAdsResponse {
  showTopAds: boolean;
}

const QUERY_KEY = ["/api/system/dms-top-ads"];

/**
 * قراءة فقط — تستهلكها مكوّنات إعلانات DMS في الواجهة العامة.
 * ثلاث حالات وليست حالتين: undefined = الإعداد لم يصل بعد. التمييز جوهري:
 * افتراض «مفعّل» أثناء التحميل كان يركّب حاوية #Leaderboard لمدة ~300ms،
 * وسكربت DMS (السكين) يخطفها ويعيد غرسها خارج شجرة React قبل أن يزيلها
 * التفكيك — فيبقى الإعلان رغم الإطفاء. المستهلك يحجب id الحاوية حتى
 * تُحسم الحالة. فشل الجلب (شبكة/خادم) يُحسم إلى «مفعّل» حتى لا يُفقد
 * العائد الإعلاني بسبب عطل عابر.
 */
export function useDmsTopAdsEnabled(): boolean | undefined {
  const { data, isError } = useQuery<DmsTopAdsResponse | null>({
    queryKey: QUERY_KEY,
    queryFn: getQueryFn<DmsTopAdsResponse>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 5,
  });
  const enabled = isError ? true : data === undefined ? undefined : data?.showTopAds ?? true;
  useLayoutEffect(() => {
    // GTM recreates #Leaderboard outside React. A once-per-second removal
    // briefly exposes its 100px slot and then collapses it (two CLS events).
    // CSS must enforce the existing disabled decision before the next paint.
    if (enabled !== undefined) {
      document.documentElement.toggleAttribute("data-sabq-top-ads-disabled", enabled === false);
    }
    // Keep the last resolved setting between route unmounts; it is site-wide.
  }, [enabled]);
  return enabled;
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
