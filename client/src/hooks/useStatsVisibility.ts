import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

interface StatsVisibilityResponse {
  showStats: boolean;
}

export function useStatsVisibility() {
  const { data, isLoading } = useQuery<StatsVisibilityResponse>({
    queryKey: ["/api/system/stats-visibility"],
    queryFn: getQueryFn<StatsVisibilityResponse>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const updateMutation = useMutation({
    mutationFn: async (showStats: boolean) => {
      return apiRequest("/api/system/stats-visibility", {
        method: "POST",
        body: JSON.stringify({ showStats }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/stats-visibility"] });
    },
  });

  const showStats = data?.showStats ?? true;

  const setShowStats = (value: boolean) => {
    updateMutation.mutate(value);
  };

  const toggleStats = () => {
    updateMutation.mutate(!showStats);
  };

  return { 
    showStats, 
    setShowStats, 
    toggleStats, 
    isLoading,
    isSaving: updateMutation.isPending,
  };
}
