import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BreakingSwitchProps {
  articleId: string;
  initialValue: boolean;
}

const BREAKING_EXCLUSIVE_EVENT = "sabq:breaking-article-exclusive";

interface BreakingExclusiveEventDetail {
  articleId: string;
}

/** منطق تبديل «عاجل» مشترك بين المفتاح وزر البرق في صف القائمة. */
export function useBreakingToggle(articleId: string, initialValue: boolean) {
  const [isBreaking, setIsBreaking] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsBreaking(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const handleExclusive = (event: Event) => {
      const detail = (event as CustomEvent<BreakingExclusiveEventDetail>).detail;
      if (detail?.articleId && detail.articleId !== articleId) {
        setIsBreaking(false);
      }
    };
    window.addEventListener(BREAKING_EXCLUSIVE_EVENT, handleExclusive);
    return () => window.removeEventListener(BREAKING_EXCLUSIVE_EVENT, handleExclusive);
  }, [articleId]);

  const toggle = async (checked: boolean) => {
    const previousValue = isBreaking;
    
    setIsBreaking(checked);
    if (checked && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<BreakingExclusiveEventDetail>(BREAKING_EXCLUSIVE_EVENT, {
          detail: { articleId },
        }),
      );
    }
    setIsPending(true);
    
    try {
      await apiRequest(`/api/admin/articles/${articleId}/toggle-breaking`, {
        method: "POST",
      });

      // Invalidate all relevant caches for instant update across the platform
      queryClient.removeQueries({ queryKey: ["/api/admin/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage-lite"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/breaking"] });
      queryClient.invalidateQueries({ queryKey: ["/api/breaking-ticker/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles"] });
      
      toast({
        title: checked ? "تم التمييز كخبر عاجل" : "تم إلغاء التمييز كخبر عاجل",
        description: checked 
          ? "تم تمييز المقال كخبر عاجل وإلغاء العاجل تلقائياً عن الخبر السابق"
          : "تم إلغاء تمييز المقال كخبر عاجل بنجاح",
      });
    } catch (error: any) {
      setIsBreaking(previousValue);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      
      toast({
        title: "خطأ",
        description: error.message || "فشل تحديث حالة الخبر العاجل",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  return { isBreaking, isPending, toggle };
}

export function BreakingSwitch({ articleId, initialValue }: BreakingSwitchProps) {
  const { isBreaking, toggle } = useBreakingToggle(articleId, initialValue);

  return (
    <Switch
      checked={isBreaking}
      onCheckedChange={toggle}
      title={isBreaking ? "إلغاء العاجل" : "تمييز كخبر عاجل (يلغي العاجل عن الخبر السابق)"}
      className="h-5 w-9 data-[state=checked]:bg-red-600 dark:data-[state=checked]:bg-red-600 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600"
      data-testid={`switch-breaking-${articleId}`}
    />
  );
}
