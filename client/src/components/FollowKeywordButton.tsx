import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BellRing, Bell } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface FollowKeywordButtonProps {
  keyword: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  showText?: boolean;
}

export function FollowKeywordButton({
  keyword,
  variant = "ghost",
  size = "sm",
  showText = false,
}: FollowKeywordButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Safety check: return null if keyword is invalid
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return null;
  }

  const { data: followedKeywordsRaw, isLoading } = useQuery<
    Array<{ tagId: string; tagName: string; notify: boolean }>
  >({
    queryKey: ["/api/user/followed-keywords"],
    enabled: !!user,
  });
  const followedKeywords = Array.isArray(followedKeywordsRaw) ? followedKeywordsRaw : [];

  const isFollowing = followedKeywords.some(
    (k) => k.tagName.toLowerCase() === keyword.toLowerCase()
  );

  const followMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/keywords/follow", {
        method: "POST",
        body: JSON.stringify({ keyword }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/followed-keywords"] });
      toast({
        title: "تمت المتابعة",
        description: `ستتلقى إشعارات بالمقالات الجديدة عن "${keyword}"`,
      });
    },
    onError: () => {
      toast({
        title: "حدث خطأ",
        description: "لم نتمكن من متابعة الكلمة المفتاحية",
        variant: "destructive",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const tag = followedKeywords.find(
        (k) => k.tagName.toLowerCase() === keyword.toLowerCase()
      );
      if (!tag) throw new Error("Tag not found");
      return await apiRequest(`/api/keywords/unfollow/${tag.tagId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/followed-keywords"] });
      toast({
        title: "تم إلغاء المتابعة",
        description: `لن تتلقى إشعارات عن "${keyword}"`,
      });
    },
    onError: () => {
      toast({
        title: "حدث خطأ",
        description: "لم نتمكن من إلغاء المتابعة",
        variant: "destructive",
      });
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast({
        title: "سجل الدخول",
        description: "يجب تسجيل الدخول لمتابعة الكلمات المفتاحية",
        variant: "destructive",
      });
      return;
    }

    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  if (!user) return null;

  const isPending = followMutation.isPending || unfollowMutation.isPending;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isPending || isLoading}
      data-testid={`button-${isFollowing ? "unfollow" : "follow"}-keyword-${keyword}`}
      className="gap-1.5"
    >
      {isFollowing ? (
        <BellRing className="h-3.5 w-3.5 text-primary" />
      ) : (
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {showText && (
        <span className="text-xs">
          {isFollowing ? "إلغاء المتابعة" : "متابعة"}
        </span>
      )}
    </Button>
  );
}
