import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Tag, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface FollowedKeyword {
  tagId: string;
  tagName: string;
  notify: boolean;
  articleCount: number;
}

export function FollowedKeywordsBlock() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: keywordsRaw, isLoading } = useQuery<FollowedKeyword[]>({
    queryKey: ["/api/user/followed-keywords"],
    enabled: !!user,
  });
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : [];

  const unfollowMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return await apiRequest(`/api/keywords/unfollow/${tagId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/followed-keywords"] });
      toast({
        title: "تم إلغاء المتابعة",
        description: "لن تتلقى إشعارات عن هذه الكلمة",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إلغاء المتابعة",
        variant: "destructive",
      });
    },
  });

  // Don't show if user is not logged in
  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">كلماتي المتابعة</CardTitle>
          </div>
          <CardDescription>
            تابع الكلمات المفتاحية واحصل على إشعارات بالمقالات الجديدة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!keywords || keywords.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">كلماتي المتابعة</CardTitle>
          </div>
          <CardDescription>
            تابع الكلمات المفتاحية واحصل على إشعارات بالمقالات الجديدة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6">
            <Tag className="h-10 w-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground text-center">
              لم تتابع أي كلمات بعد — تصفح الكلمات المتداولة واضغط على الجرس للمتابعة
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">كلماتي المتابعة</CardTitle>
        </div>
        <CardDescription>
          تابع الكلمات المفتاحية واحصل على إشعارات بالمقالات الجديدة
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {keywords.map((keyword) => (
            <div
              key={keyword.tagId}
              className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate"
            >
              <Link href={`/keyword/${keyword.tagName}`}>
                <span className="flex items-center gap-2 flex-1 cursor-pointer" data-testid={`link-keyword-${keyword.tagId}`}>
                  <Tag className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-medium">{keyword.tagName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {keyword.articleCount}
                  </Badge>
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => unfollowMutation.mutate(keyword.tagId)}
                disabled={unfollowMutation.isPending}
                data-testid={`button-unfollow-keyword-${keyword.tagId}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
