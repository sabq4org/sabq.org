import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

interface IFoxBlockVisibilityResponse {
  showIFoxBlock: boolean;
}

export function useIFoxBlockVisibility() {
  const { data, isLoading } = useQuery<IFoxBlockVisibilityResponse>({
    queryKey: ["/api/system/ifox-block-visibility"],
    queryFn: getQueryFn<IFoxBlockVisibilityResponse>({ on401: "returnNull", silent: true }),
    staleTime: 1000 * 60 * 5,
  });

  const updateMutation = useMutation({
    mutationFn: async (showIFoxBlock: boolean) => {
      return apiRequest("/api/system/ifox-block-visibility", {
        method: "POST",
        body: JSON.stringify({ showIFoxBlock }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/ifox-block-visibility"] });
    },
  });

  const showIFoxBlock = data?.showIFoxBlock ?? true;

  const setShowIFoxBlock = (value: boolean) => {
    updateMutation.mutate(value);
  };

  return { 
    showIFoxBlock, 
    setShowIFoxBlock, 
    isLoading,
    isSaving: updateMutation.isPending,
  };
}
