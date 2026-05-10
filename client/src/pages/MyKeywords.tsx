import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Trash2, Search, Hash } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FollowedKeyword {
  tagId: string;
  tagName: string;
  notify: boolean;
}

export default function MyKeywords() {
  const { user, isLoading: authLoading } = useAuth({ redirectToLogin: true });
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
        description: "لن تتلقى إشعارات بعد الآن",
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

  if (authLoading || isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8" dir="rtl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Hash className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">الكلمات المفتاحية المتابعة</h1>
        </div>
        <p className="text-muted-foreground">
          إدارة الكلمات المفتاحية التي تتابعها وستتلقى إشعارات بشأنها
        </p>
      </div>

      {keywords.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">لا توجد كلمات متابعة</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              ابدأ بمتابعة الكلمات المفتاحية التي تهمك للحصول على إشعارات فورية
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              تصفح المقالات
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keywords.map((keyword) => (
            <Card
              key={keyword.tagId}
              className="hover-elevate transition-all duration-200"
              data-testid={`card-followed-keyword-${keyword.tagName}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Badge
                      variant="secondary"
                      className="text-base px-4 py-1.5 whitespace-nowrap"
                    >
                      #{keyword.tagName}
                    </Badge>
                    {keyword.notify && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Bell className="h-4 w-4" />
                        <span>تلقي الإشعارات</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLocation(`/keyword/${encodeURIComponent(keyword.tagName)}`)}
                      data-testid={`button-view-keyword-${keyword.tagName}`}
                    >
                      عرض المقالات
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => unfollowMutation.mutate(keyword.tagId)}
                      disabled={unfollowMutation.isPending}
                      data-testid={`button-unfollow-keyword-${keyword.tagName}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
