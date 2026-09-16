import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { withQueryDeadline } from "@/lib/queryDeadline";

export interface SportsFreshness {
  state: "fresh" | "stale";
  updatedAt: string;
  retryAfterSeconds: number;
}

export function useSportsHomeQuery<T extends { freshness?: SportsFreshness }>(
  endpoint: string,
  interval: (data: T | undefined) => number | false,
) {
  const query = useQuery<T>({
    queryKey: [endpoint, { resilient: 1 }],
    queryFn: context => withQueryDeadline(
      async signal => getQueryFn<T>({ on401: "throw", silent: true })({ ...context, signal }),
      context.signal, 6_000,
    ),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: q => q.state.status === "error" ? 30_000
      : q.state.data?.freshness?.state === "stale"
        ? Math.max(15_000, (q.state.data.freshness.retryAfterSeconds ?? 0) * 1000)
        : interval(q.state.data),
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  // During a rolling deploy the previous backend can omit freshness. In that
  // case use the browser's successful retrieval time, never an unbounded cache.
  const freshness = query.data?.freshness ?? (query.dataUpdatedAt > 0 ? {
    state: "fresh" as const,
    updatedAt: new Date(query.dataUpdatedAt).toISOString(),
    retryAfterSeconds: 0,
  } : undefined);
  const cachedData = query.data ? { ...query.data, freshness } : undefined;
  const fetchedAt = freshness?.updatedAt;
  // React Query retains successful data after an error. Bound that fallback too,
  // including a tab whose network subsequently goes offline.
  const expired = fetchedAt != null && now - Date.parse(fetchedAt) > 10 * 60_000;
  return {
    ...query,
    data: expired ? undefined : cachedData,
    lastData: cachedData,
    stale: query.isError || query.fetchStatus === "paused" || query.data?.freshness?.state === "stale",
    unavailable: expired || ((query.isError || query.fetchStatus === "paused") && !query.data),
  };
}

export function sportsLastFetchLabel(updatedAt: string): string {
  return `آخر بيانات متاحة ${new Date(updatedAt).toLocaleTimeString("ar-SA", {
    timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit",
  })} بتوقيت الرياض · جارٍ إعادة التحديث`;
}
