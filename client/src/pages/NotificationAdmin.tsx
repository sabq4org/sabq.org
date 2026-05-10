import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Bell, 
  AlertTriangle, 
  CheckCircle2, 
  Users, 
  Settings as SettingsIcon,
  MessageSquare,
  Plus,
  Sparkles
} from "lucide-react";

interface NotificationStatus {
  totalUsers: number;
  usersWithSettings: number;
  usersWithoutSettings: number;
  totalNotificationsSent: number;
  systemStatus: "healthy" | "needs_fix";
}

interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
}

interface UserInterest {
  id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  heroImageUrl?: string;
}

export default function NotificationAdmin() {
  const { toast } = useToast();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  // Fetch notification system status
  const { 
    data: status, 
    isLoading: statusLoading,
    error: statusError 
  } = useQuery<NotificationStatus>({
    queryKey: ["/api/admin/notification-status"],
  });

  // Fetch categories for interests
  const { 
    data: categoriesRaw, 
    isLoading: categoriesLoading 
  } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch user's current interests
  const { 
    data: userInterestsRaw, 
    isLoading: interestsLoading 
  } = useQuery<UserInterest[]>({
    queryKey: ["/api/interests"],
  });
  const userInterests = Array.isArray(userInterestsRaw) ? userInterestsRaw : [];

  // Fix notification settings mutation
  const fixSettingsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/fix-notification-settings", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-status"] });
      toast({
        title: "✅ تم الإصلاح بنجاح",
        description: "تم إصلاح إعدادات الإشعارات لجميع المستخدمين",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ خطأ في الإصلاح",
        description: error.message || "فشل في إصلاح إعدادات الإشعارات",
        variant: "destructive",
      });
    },
  });

  // Add interest mutation
  const addInterestMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      return await apiRequest("/api/admin/add-my-interest", {
        method: "POST",
        body: JSON.stringify({ categoryId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interests"] });
      setSelectedCategoryId("");
      toast({
        title: "✅ تم إضافة الاهتمام",
        description: "تم إضافة الاهتمام إلى حسابك بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ خطأ في الإضافة",
        description: error.message || "فشل في إضافة الاهتمام",
        variant: "destructive",
      });
    },
  });

  const handleFixSettings = () => {
    fixSettingsMutation.mutate();
  };

  const handleAddInterest = () => {
    if (!selectedCategoryId) {
      toast({
        title: "⚠️ تنبيه",
        description: "الرجاء اختيار تصنيف أولاً",
        variant: "destructive",
      });
      return;
    }
    addInterestMutation.mutate(selectedCategoryId);
  };

  // Filter out categories that are already interests
  const availableCategories = categories.filter(
    cat => !userInterests.some(interest => interest.categoryId === cat.id)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            إدارة نظام الإشعارات
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            مراقبة وإصلاح نظام الإشعارات وإدارة الاهتمامات
          </p>
        </div>

        {/* System Status Alert */}
        {statusLoading ? (
          <div className="animate-pulse">
            <div className="h-24 bg-muted rounded-lg"></div>
          </div>
        ) : statusError ? (
          <Alert variant="destructive" data-testid="alert-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>خطأ في تحميل البيانات</AlertTitle>
            <AlertDescription>
              فشل في تحميل حالة نظام الإشعارات
            </AlertDescription>
          </Alert>
        ) : status && (
          <Alert 
            variant={status.systemStatus === "healthy" ? "default" : "destructive"}
            data-testid="alert-system-status"
          >
            {status.systemStatus === "healthy" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertTitle data-testid="text-system-status">
              {status.systemStatus === "healthy" ? "النظام يعمل بشكل سليم" : "النظام بحاجة إلى إصلاح"}
            </AlertTitle>
            <AlertDescription data-testid="text-system-description">
              {status.systemStatus === "healthy" 
                ? "جميع المستخدمين لديهم إعدادات إشعارات صحيحة" 
                : `يوجد ${status.usersWithoutSettings} مستخدم بدون إعدادات إشعارات`}
            </AlertDescription>
          </Alert>
        )}

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-total-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المستخدمين</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <div className="h-8 bg-muted rounded animate-pulse"></div>
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-users">
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {status?.totalUsers || 0}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-users-with-settings">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">مع إعدادات</CardTitle>
              <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <div className="h-8 bg-muted rounded animate-pulse"></div>
              ) : (
                <div className="text-2xl font-bold" data-testid="text-users-with-settings">
                  <Badge variant="default" className="text-lg px-3 py-1">
                    {status?.usersWithSettings || 0}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-users-without-settings">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">بدون إعدادات</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <div className="h-8 bg-muted rounded animate-pulse"></div>
              ) : (
                <div className="text-2xl font-bold" data-testid="text-users-without-settings">
                  <Badge 
                    variant={status?.usersWithoutSettings === 0 ? "outline" : "destructive"} 
                    className="text-lg px-3 py-1"
                  >
                    {status?.usersWithoutSettings || 0}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-total-notifications">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الإشعارات</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <div className="h-8 bg-muted rounded animate-pulse"></div>
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-notifications">
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {status?.totalNotificationsSent || 0}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Fix Settings Card */}
        <Card data-testid="card-fix-settings">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              إصلاح إعدادات الإشعارات
            </CardTitle>
            <CardDescription>
              إنشاء إعدادات إشعارات افتراضية للمستخدمين الذين ليس لديهم إعدادات
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleFixSettings}
              disabled={fixSettingsMutation.isPending || status?.usersWithoutSettings === 0}
              data-testid="button-fix-settings"
            >
              {fixSettingsMutation.isPending ? "جاري الإصلاح..." : "إصلاح إعدادات الإشعارات"}
            </Button>
            {status?.usersWithoutSettings === 0 && (
              <p className="text-sm text-muted-foreground mt-2" data-testid="text-no-fix-needed">
                لا يوجد مستخدمين بحاجة للإصلاح
              </p>
            )}
          </CardContent>
        </Card>

        {/* Add Interest Section */}
        <Card data-testid="card-add-interest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              إضافة اهتمام لحسابي
            </CardTitle>
            <CardDescription>
              أضف تصنيفات جديدة إلى اهتماماتك الشخصية
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                {categoriesLoading ? (
                  <div className="h-10 bg-muted rounded animate-pulse"></div>
                ) : (
                  <Select
                    value={selectedCategoryId}
                    onValueChange={setSelectedCategoryId}
                    disabled={availableCategories.length === 0}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="اختر تصنيفاً" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                onClick={handleAddInterest}
                disabled={addInterestMutation.isPending || !selectedCategoryId || availableCategories.length === 0}
                data-testid="button-add-interest"
              >
                <Plus className="h-4 w-4 ml-2" />
                {addInterestMutation.isPending ? "جاري الإضافة..." : "إضافة اهتمام"}
              </Button>
            </div>
            {availableCategories.length === 0 && !categoriesLoading && (
              <p className="text-sm text-muted-foreground mt-2" data-testid="text-no-categories">
                لقد أضفت جميع التصنيفات المتاحة
              </p>
            )}
          </CardContent>
        </Card>

        {/* Current Interests */}
        <Card data-testid="card-current-interests">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              الاهتمامات الحالية
            </CardTitle>
            <CardDescription>
              التصنيفات التي أضفتها إلى اهتماماتك
            </CardDescription>
          </CardHeader>
          <CardContent>
            {interestsLoading ? (
              <div className="space-y-2">
                <div className="h-8 bg-muted rounded animate-pulse"></div>
                <div className="h-8 bg-muted rounded animate-pulse"></div>
                <div className="h-8 bg-muted rounded animate-pulse"></div>
              </div>
            ) : userInterests.length === 0 ? (
              <p className="text-muted-foreground" data-testid="text-no-interests">
                لا توجد اهتمامات بعد. أضف اهتماماتك أعلاه.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" data-testid="list-interests">
                {userInterests.map((interest) => (
                  <Badge 
                    key={interest.id} 
                    variant="secondary"
                    className="text-sm px-3 py-1"
                    data-testid={`badge-interest-${interest.id}`}
                  >
                    {interest.nameAr}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
