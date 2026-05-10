import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  Settings,
  Bell,
  Heart,
  Eye,
  BookOpen,
  MessageSquare,
  TrendingUp,
  Users,
  Zap,
  Sparkles,
  BookMarked,
  Save,
  ArrowRight,
  Loader2,
  Tag,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Category } from "@shared/schema";

interface UserInterest {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
}

interface ActivitySummary {
  totalViews: number;
  totalLikes: number;
  totalBookmarks: number;
  totalComments: number;
  totalShares: number;
  readingStreak: number;
  articlesReadThisWeek: number;
  topCategories: Array<{ categoryId: string; categoryName: string; count: number }>;
}

interface UserSegment {
  id: string;
  name: string;
  description: string;
  type: string;
}

interface NotificationPrefs {
  breaking: boolean;
  interest: boolean;
  likedUpdates: boolean;
  mostRead: boolean;
  webPush: boolean;
  dailyDigest: boolean;
}

export default function PreferencesCenter() {
  const { toast } = useToast();
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  const { data: categoriesRaw, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories/all"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: userInterestsRaw, isLoading: interestsLoading } = useQuery<UserInterest[]>({
    queryKey: ["/api/user/interests"],
    enabled: !!user,
  });
  const userInterests = Array.isArray(userInterestsRaw) ? userInterestsRaw : [];

  const { data: activitySummary, isLoading: activityLoading } = useQuery<ActivitySummary>({
    queryKey: ["/api/user/activity-summary"],
    enabled: !!user,
  });

  const { data: userSegmentsRaw, isLoading: segmentsLoading } = useQuery<UserSegment[]>({
    queryKey: ["/api/user/segments"],
    enabled: !!user,
  });
  const userSegments = Array.isArray(userSegmentsRaw) ? userSegmentsRaw : [];

  const { data: notificationPrefs, isLoading: prefsLoading } = useQuery<NotificationPrefs>({
    queryKey: ["/api/me/notification-prefs"],
    enabled: !!user,
  });

  useEffect(() => {
    if (userInterests.length > 0) {
      setSelectedCategories(new Set(userInterests.map((i) => i.id)));
    }
  }, [userInterests]);

  const updateInterestsMutation = useMutation({
    mutationFn: async (categoryIds: string[]) => {
      return await apiRequest("/api/user/interests", {
        method: "PUT",
        body: JSON.stringify({ categoryIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/interests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setHasChanges(false);
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم تحديث اهتماماتك بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ الاهتمامات",
        variant: "destructive",
      });
    },
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: Partial<NotificationPrefs>) => {
      return await apiRequest("/api/me/notification-prefs", {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/notification-prefs"] });
      toast({
        title: "تم الحفظ",
        description: "تم تحديث إعدادات الإشعارات",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  const toggleCategory = (categoryId: string) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedCategories(newSelected);
    setHasChanges(true);
  };

  const handleSaveInterests = () => {
    if (selectedCategories.size < 1) {
      toast({
        title: "اختر اهتمامات",
        description: "يرجى اختيار اهتمام واحد على الأقل",
        variant: "destructive",
      });
      return;
    }
    updateInterestsMutation.mutate(Array.from(selectedCategories));
  };

  const handleNotificationToggle = (key: keyof NotificationPrefs, value: boolean) => {
    updateNotificationsMutation.mutate({ [key]: value });
  };

  const isLoading = isUserLoading || categoriesLoading || interestsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user || undefined} />
        <div className="container max-w-5xl mx-auto py-8 px-4">
          <div className="space-y-6">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user || undefined} />

      <main className="container max-w-5xl mx-auto py-8 px-4 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              مركز التفضيلات
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            خصص تجربة القراءة الخاصة بك وأدر إعداداتك
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="backdrop-blur-sm bg-card/80 border-card-border/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Heart className="h-5 w-5 text-primary" />
                      <CardTitle>اهتماماتي</CardTitle>
                    </div>
                    {hasChanges && (
                      <Button
                        onClick={handleSaveInterests}
                        disabled={updateInterestsMutation.isPending}
                        size="sm"
                        data-testid="button-save-interests"
                      >
                        {updateInterestsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        ) : (
                          <Save className="h-4 w-4 ml-2" />
                        )}
                        حفظ التغييرات
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    اختر الفئات التي تهمك لتحصل على محتوى مخصص
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {categories.map((category) => {
                      const isSelected = selectedCategories.has(category.id);
                      return (
                        <div
                          key={category.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover-elevate ${
                            isSelected
                              ? "bg-primary/10 border-primary"
                              : "bg-card border-border"
                          }`}
                          onClick={() => toggleCategory(category.id)}
                          data-testid={`category-toggle-${category.slug}`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleCategory(category.id)}
                            data-testid={`checkbox-${category.slug}`}
                          />
                          <span className="text-sm font-medium truncate">
                            {category.nameAr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    {selectedCategories.size} من {categories.length} فئة محددة
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="backdrop-blur-sm bg-card/80 border-card-border/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    <CardTitle>إعدادات الإشعارات</CardTitle>
                  </div>
                  <CardDescription>
                    تحكم في الإشعارات التي تتلقاها
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {prefsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-12" />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <Zap className="h-5 w-5 text-destructive" />
                          <div>
                            <Label className="text-base font-medium">
                              الأخبار العاجلة
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              إشعارات فورية بالأخبار العاجلة
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={notificationPrefs?.breaking ?? true}
                          onCheckedChange={(checked) =>
                            handleNotificationToggle("breaking", checked)
                          }
                          data-testid="switch-breaking"
                        />
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <Sparkles className="h-5 w-5 text-primary" />
                          <div>
                            <Label className="text-base font-medium">
                              مقالات تناسب اهتماماتك
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              مقالات جديدة في الفئات المفضلة
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={notificationPrefs?.interest ?? true}
                          onCheckedChange={(checked) =>
                            handleNotificationToggle("interest", checked)
                          }
                          data-testid="switch-interest"
                        />
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <TrendingUp className="h-5 w-5 text-chart-1" />
                          <div>
                            <Label className="text-base font-medium">
                              الأكثر قراءة
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              ملخص يومي للمقالات الأكثر قراءة
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={notificationPrefs?.mostRead ?? true}
                          onCheckedChange={(checked) =>
                            handleNotificationToggle("mostRead", checked)
                          }
                          data-testid="switch-most-read"
                        />
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <BookMarked className="h-5 w-5 text-accent" />
                          <div>
                            <Label className="text-base font-medium">
                              تحديثات المحفوظات
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              تحديثات على المقالات المحفوظة
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={notificationPrefs?.likedUpdates ?? true}
                          onCheckedChange={(checked) =>
                            handleNotificationToggle("likedUpdates", checked)
                          }
                          data-testid="switch-liked-updates"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className="backdrop-blur-sm bg-card/80 border-card-border/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <CardTitle>ملخص النشاط</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {activityLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-10" />
                      ))}
                    </div>
                  ) : activitySummary ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center p-3 rounded-lg bg-primary/5">
                          <BookOpen className="h-5 w-5 mx-auto mb-1 text-primary" />
                          <p className="text-2xl font-bold" data-testid="stat-views">
                            {activitySummary.totalViews || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">مشاهدة</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-destructive/5">
                          <Heart className="h-5 w-5 mx-auto mb-1 text-destructive" />
                          <p className="text-2xl font-bold" data-testid="stat-likes">
                            {activitySummary.totalLikes || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">إعجاب</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-accent/5">
                          <BookMarked className="h-5 w-5 mx-auto mb-1 text-accent" />
                          <p className="text-2xl font-bold" data-testid="stat-bookmarks">
                            {activitySummary.totalBookmarks || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">محفوظات</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-chart-1/5">
                          <MessageSquare className="h-5 w-5 mx-auto mb-1 text-chart-1" />
                          <p className="text-2xl font-bold" data-testid="stat-comments">
                            {activitySummary.totalComments || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">تعليق</p>
                        </div>
                      </div>

                      {activitySummary.readingStreak > 0 && (
                        <div className="p-3 rounded-lg bg-gradient-to-l from-primary/10 to-accent/10 text-center">
                          <p className="text-sm text-muted-foreground">سلسلة القراءة</p>
                          <p className="text-xl font-bold" data-testid="stat-streak">
                            {activitySummary.readingStreak} يوم
                          </p>
                        </div>
                      )}

                      {activitySummary.topCategories && activitySummary.topCategories.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">الفئات الأكثر قراءة</p>
                          <div className="flex flex-wrap gap-2">
                            {activitySummary.topCategories.slice(0, 3).map((cat) => (
                              <Badge key={cat.categoryId} variant="secondary">
                                {cat.categoryName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      لا توجد بيانات نشاط بعد
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card className="backdrop-blur-sm bg-card/80 border-card-border/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <CardTitle>شرائح القراء</CardTitle>
                  </div>
                  <CardDescription>
                    الشرائح التي تنتمي إليها بناءً على نشاطك
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {segmentsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8" />
                      <Skeleton className="h-8" />
                    </div>
                  ) : userSegments && userSegments.length > 0 ? (
                    <div className="space-y-2">
                      {userSegments.map((segment) => (
                        <div
                          key={segment.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                          data-testid={`segment-${segment.id}`}
                        >
                          <Tag className="h-4 w-4 text-primary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {segment.name}
                            </p>
                            {segment.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {segment.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4 text-sm">
                      لم يتم تحديد شرائح بعد
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Link href="/profile">
                <Button variant="outline" className="w-full gap-2" data-testid="button-go-profile">
                  <ArrowRight className="h-4 w-4" />
                  العودة للملف الشخصي
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
