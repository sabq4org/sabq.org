import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ContentDutyResponse } from "@shared/contentDuty";
import { useAuth } from "@/hooks/useAuth";
import { riyadhDutyTime } from "@/lib/contentDuty";
import { apiRequest } from "@/lib/queryClient";

const rosterUrl = "/api/admin/dashboard/content-duty";

export function useContentDuty() {
  const { user, isLoading: authLoading } = useAuth();
  const [time, setTime] = useState(() => riyadhDutyTime(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      clearTimeout(timer);
      setTime(riyadhDutyTime(new Date()));
      timer = setTimeout(tick, 60000 - Date.now() % 60000);
    }
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const query = useQuery<ContentDutyResponse>({
    queryKey: [rosterUrl, user?.id],
    queryFn: () => apiRequest<ContentDutyResponse>(rosterUrl, { silent: true }),
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return {
    ...time,
    managers: query.isError ? [] : query.data?.managers ?? [],
    isLoading: authLoading || query.isLoading,
    isError: query.isError,
    retry: query.refetch,
  };
}
