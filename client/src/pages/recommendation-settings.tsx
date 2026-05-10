import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Bell, Clock, TrendingUp, Bookmark, Heart, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface RecommendationPrefs {
  id: string;
  userId: string;
  becauseYouLiked: boolean;
  similarToSaved: boolean;
  withinReads: boolean;
  trendingForYou: boolean;
  dailyDigest: boolean;
  digestTime: string;
  maxDailyPersonal: number;
  cooldownHours: number;
  abTestGroup: string | null;
}

export default function RecommendationSettingsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch recommendation preferences
  const { data, isLoading } = useQuery<{ preferences: RecommendationPrefs }>({
    queryKey: ["/api/recommendations/preferences"],
  });

  const preferences = data?.preferences;

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<RecommendationPrefs>) => {
      return apiRequest("/api/recommendations/preferences", {
        method: "PATCH",
        body: JSON.stringify(updates),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/preferences"] });
      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات التوصيات بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleToggle = (field: keyof RecommendationPrefs, value: boolean) => {
    updateMutation.mutate({ [field]: value });
  };

  const handleSliderChange = (field: keyof RecommendationPrefs, value: number[]) => {
    updateMutation.mutate({ [field]: value[0] });
  };

  const handleTimeChange = (value: string) => {
    updateMutation.mutate({ digestTime: value });
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-settings-title">
          إعدادات التوصيات
        </h1>
        <p className="text-muted-foreground">
          تخصيص التوصيات والإشعارات حسب تفضيلاتك
        </p>
      </div>

      <div className="space-y-6">
        {/* Notification Types */}
        <Card data-testid="card-notification-types">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              أنواع الإشعارات
            </CardTitle>
            <CardDescription>
              اختر أنواع التوصيات التي تريد استلامها
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Because You Liked */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  <Label htmlFor="because-you-liked" className="font-medium">
                    لأنك أحببت
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  مقالات مشابهة لما أعجبك
                </p>
              </div>
              <Switch
                id="because-you-liked"
                checked={preferences?.becauseYouLiked ?? true}
                onCheckedChange={(checked) => handleToggle("becauseYouLiked", checked)}
                disabled={updateMutation.isPending}
                data-testid="switch-because-you-liked"
              />
            </div>

            {/* Similar to Saved */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-blue-500" />
                  <Label htmlFor="similar-to-saved" className="font-medium">
                    مشابه لما حفظت
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  مقالات مشابهة لما أضفته للمفضلة
                </p>
              </div>
              <Switch
                id="similar-to-saved"
                checked={preferences?.similarToSaved ?? true}
                onCheckedChange={(checked) => handleToggle("similarToSaved", checked)}
                disabled={updateMutation.isPending}
                data-testid="switch-similar-to-saved"
              />
            </div>

            {/* Within Your Reads */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <Label htmlFor="within-reads" className="font-medium">
                    بناءً على قراءاتك
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  مقالات مخصصة بناءً على سلوك القراءة
                </p>
              </div>
              <Switch
                id="within-reads"
                checked={preferences?.withinReads ?? true}
                onCheckedChange={(checked) => handleToggle("withinReads", checked)}
                disabled={updateMutation.isPending}
                data-testid="switch-within-reads"
              />
            </div>

            {/* Trending For You */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-500" />
                  <Label htmlFor="trending-for-you" className="font-medium">
                    رائج في اهتماماتك
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  المقالات الأكثر رواجاً في مجالات اهتمامك
                </p>
              </div>
              <Switch
                id="trending-for-you"
                checked={preferences?.trendingForYou ?? true}
                onCheckedChange={(checked) => handleToggle("trendingForYou", checked)}
                disabled={updateMutation.isPending}
                data-testid="switch-trending-for-you"
              />
            </div>
          </CardContent>
        </Card>

        {/* Frequency Controls */}
        <Card data-testid="card-frequency-controls">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              التحكم في التكرار
            </CardTitle>
            <CardDescription>
              تحديد عدد ووقت الإشعارات
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Max Daily Notifications */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">
                  الحد الأقصى للإشعارات اليومية
                </Label>
                <span className="text-lg font-bold text-primary" data-testid="text-max-daily">
                  {preferences?.maxDailyPersonal ?? 3}
                </span>
              </div>
              <Slider
                value={[preferences?.maxDailyPersonal ?? 3]}
                onValueChange={(value) => handleSliderChange("maxDailyPersonal", value)}
                min={1}
                max={10}
                step={1}
                disabled={updateMutation.isPending}
                data-testid="slider-max-daily"
              />
              <p className="text-sm text-muted-foreground">
                عدد الإشعارات التوصيات الشخصية يومياً
              </p>
            </div>

            {/* Cooldown Hours */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">
                  فترة الانتظار بين الإشعارات
                </Label>
                <span className="text-lg font-bold text-primary" data-testid="text-cooldown">
                  {preferences?.cooldownHours ?? 6} ساعات
                </span>
              </div>
              <Slider
                value={[preferences?.cooldownHours ?? 6]}
                onValueChange={(value) => handleSliderChange("cooldownHours", value)}
                min={1}
                max={24}
                step={1}
                disabled={updateMutation.isPending}
                data-testid="slider-cooldown"
              />
              <p className="text-sm text-muted-foreground">
                الوقت الأدنى بين إشعارين متتاليين
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Daily Digest */}
        <Card data-testid="card-daily-digest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              الملخص اليومي
            </CardTitle>
            <CardDescription>
              تلخيص يومي للمقالات الجديدة في اهتماماتك
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable Daily Digest */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="daily-digest" className="font-medium">
                  تفعيل الملخص اليومي
                </Label>
                <p className="text-sm text-muted-foreground">
                  احصل على ملخص يومي للمقالات الجديدة
                </p>
              </div>
              <Switch
                id="daily-digest"
                checked={preferences?.dailyDigest ?? false}
                onCheckedChange={(checked) => handleToggle("dailyDigest", checked)}
                disabled={updateMutation.isPending}
                data-testid="switch-daily-digest"
              />
            </div>

            {/* Digest Time */}
            {preferences?.dailyDigest && (
              <div className="space-y-2">
                <Label htmlFor="digest-time" className="font-medium">
                  وقت إرسال الملخص
                </Label>
                <Select
                  value={preferences?.digestTime ?? "20:30"}
                  onValueChange={handleTimeChange}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger id="digest-time" data-testid="select-digest-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="06:00">06:00 صباحاً</SelectItem>
                    <SelectItem value="07:00">07:00 صباحاً</SelectItem>
                    <SelectItem value="08:00">08:00 صباحاً</SelectItem>
                    <SelectItem value="09:00">09:00 صباحاً</SelectItem>
                    <SelectItem value="12:00">12:00 ظهراً</SelectItem>
                    <SelectItem value="18:00">06:00 مساءً</SelectItem>
                    <SelectItem value="19:00">07:00 مساءً</SelectItem>
                    <SelectItem value="20:00">08:00 مساءً</SelectItem>
                    <SelectItem value="20:30">08:30 مساءً</SelectItem>
                    <SelectItem value="21:00">09:00 مساءً</SelectItem>
                    <SelectItem value="22:00">10:00 مساءً</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  سيتم إرسال الملخص اليومي في الوقت المحدد
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            data-testid="button-back"
          >
            رجوع للصفحة الرئيسية
          </Button>
        </div>
      </div>
    </div>
  );
}
