import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Check, Palette } from "lucide-react";
import type { Theme } from "@shared/schema";

export default function ThemeSwitcher() {
  const { toast } = useToast();

  const { data: themes, isLoading } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
  });

  const activateThemeMutation = useMutation({
    mutationFn: async (themeId: string) => {
      return apiRequest(`/api/themes/${themeId}/activate`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active"] });
      toast({
        title: "تم تفعيل الثيم",
        description: "تم تبديل الثيم بنجاح",
      });
      // Reload page to apply new theme
      setTimeout(() => window.location.reload(), 1000);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تفعيل الثيم",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="container mx-auto py-8 px-4" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Palette className="h-8 w-8" />
          إدارة الثيمات
        </h1>
        <p className="text-muted-foreground">
          اختر الثيم الذي تريد تطبيقه على الموقع
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {themes?.map((theme) => (
            <Card
              key={theme.id}
              className={theme.status === "active" ? "border-primary" : ""}
              data-testid={`card-theme-${theme.slug}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{theme.name}</CardTitle>
                  {theme.status === "active" && (
                    <Badge variant="default" className="gap-1">
                      <Check className="h-3 w-3" />
                      مفعّل
                    </Badge>
                  )}
                  {theme.status === "draft" && (
                    <Badge variant="secondary">مسودة</Badge>
                  )}
                </div>
                <CardDescription>{theme.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Logo Preview */}
                {theme.assets?.logoLight && (
                  <div className="bg-muted rounded-lg p-4 flex items-center justify-center">
                    <img
                      src={theme.assets.logoLight}
                      alt={theme.name}
                      className="h-16 object-contain"
                      data-testid={`img-theme-logo-${theme.slug}`}
                    />
                  </div>
                )}

                {/* Color Preview */}
                {theme.tokens?.colors && (
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(theme.tokens.colors)
                      .filter(([key]) => key.includes("-light"))
                      .slice(0, 5)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="h-8 rounded border"
                          style={{
                            background: `hsl(${value})`,
                          }}
                          title={key}
                        />
                      ))}
                  </div>
                )}

                {/* Activate Button */}
                <Button
                  className="w-full"
                  variant={theme.status === "active" ? "outline" : "default"}
                  disabled={theme.status === "active" || activateThemeMutation.isPending}
                  onClick={() => activateThemeMutation.mutate(theme.id)}
                  data-testid={`button-activate-${theme.slug}`}
                >
                  {theme.status === "active" ? "مفعّل حالياً" : "تفعيل الثيم"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
