import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Lightbulb, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

interface NotificationPreferences {
  enableRecommendations: boolean;
  enableDailyDigest: boolean;
  digestTime: string;
  minSimilarityScore: number;
  enableCrossCategory: boolean;
  enableTrending: boolean;
  enablePersonalized: boolean;
  maxNotificationsPerDay: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export default function UserRecommendationSettings() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences | null>(null);

  // Fetch user for header
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data, isLoading, error } = useQuery<{ preferences: NotificationPreferences }>({
    queryKey: ["/api/recommendations/preferences"],
    retry: false, // Don't retry on 401
  });

  const preferences = data?.preferences;

  // Redirect to login if unauthorized
  useEffect(() => {
    if (error && (error as any).status === 401) {
      navigate("/login?redirect=" + encodeURIComponent(location));
    }
  }, [error, navigate, location]);

  useEffect(() => {
    if (preferences) {
      setLocalPrefs(preferences);
    }
  }, [preferences]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      return await apiRequest("/api/recommendations/preferences", {
        method: "PATCH",
        body: JSON.stringify(updates),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/preferences"] });
      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات التوصيات بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حفظ الإعدادات. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (field: keyof NotificationPreferences, value: boolean) => {
    const newPrefs = { ...localPrefs, [field]: value };
    setLocalPrefs(newPrefs as NotificationPreferences);
  };

  const handleSave = () => {
    if (localPrefs) {
      updateMutation.mutate(localPrefs);
    }
  };

  if (error) {
    return (
      <>
        <Header user={user} />
        <main className="min-h-screen bg-background py-8">
          <div className="container max-w-4xl mx-auto px-4">
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h2 className="text-2xl font-bold mb-2">حدث خطأ</h2>
              <p className="text-muted-foreground">
                فشل تحميل الإعدادات. يرجى المحاولة مرة أخرى.
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header user={user} />
      <main className="min-h-screen bg-background py-8">
        <div className="container max-w-4xl mx-auto px-4">
          <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold" data-testid="text-page-title">
                  إعدادات التوصيات الذكية
                </h1>
              </div>
              <p className="text-muted-foreground">
                تحكم في كيفية تلقيك للتوصيات والإشعارات الذكية المخصصة لك
              </p>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <p className="text-muted-foreground">جاري تحميل الإعدادات...</p>
              </div>
            ) : (
              <>
                {/* Main Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle>الإعدادات الرئيسية</CardTitle>
                    <CardDescription>
                      تفعيل وإيقاف ميزات نظام التوصيات الذكية
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enable-recommendations">
                          تفعيل التوصيات الذكية
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          احصل على توصيات مخصصة بناءً على اهتماماتك وسلوكك
                        </p>
                      </div>
                      <Switch
                        id="enable-recommendations"
                        checked={localPrefs?.enableRecommendations ?? true}
                        onCheckedChange={(checked) =>
                          handleToggle("enableRecommendations", checked)
                        }
                        data-testid="switch-enable-recommendations"
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enable-daily-digest">
                          الملخص اليومي
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          احصل على ملخص يومي للمقالات المهمة في وقت محدد
                        </p>
                      </div>
                      <Switch
                        id="enable-daily-digest"
                        checked={localPrefs?.enableDailyDigest ?? true}
                        onCheckedChange={(checked) =>
                          handleToggle("enableDailyDigest", checked)
                        }
                        data-testid="switch-enable-daily-digest"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendation Types */}
                <Card>
                  <CardHeader>
                    <CardTitle>أنواع التوصيات</CardTitle>
                    <CardDescription>
                      اختر أنواع التوصيات التي ترغب في تلقيها
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enable-personalized">
                          محتوى مخصص
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          مقالات مشابهة لما قرأته سابقاً
                        </p>
                      </div>
                      <Switch
                        id="enable-personalized"
                        checked={localPrefs?.enablePersonalized ?? true}
                        onCheckedChange={(checked) =>
                          handleToggle("enablePersonalized", checked)
                        }
                        data-testid="switch-enable-personalized"
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enable-trending">
                          الأكثر رواجاً
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          المقالات الشائعة في مجالات اهتمامك
                        </p>
                      </div>
                      <Switch
                        id="enable-trending"
                        checked={localPrefs?.enableTrending ?? true}
                        onCheckedChange={(checked) =>
                          handleToggle("enableTrending", checked)
                        }
                        data-testid="switch-enable-trending"
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enable-cross-category">
                          اكتشاف محتوى جديد
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          مقالات من أقسام أخرى قد تثير اهتمامك
                        </p>
                      </div>
                      <Switch
                        id="enable-cross-category"
                        checked={localPrefs?.enableCrossCategory ?? true}
                        onCheckedChange={(checked) =>
                          handleToggle("enableCrossCategory", checked)
                        }
                        data-testid="switch-enable-cross-category"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    size="lg"
                    data-testid="button-save-settings"
                  >
                    <Save className="h-4 w-4 ml-2" />
                    {updateMutation.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
