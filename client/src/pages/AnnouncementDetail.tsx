import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRight, 
  Edit, 
  Trash2, 
  Archive, 
  Eye, 
  MousePointer, 
  XCircle,
  Users,
  Calendar,
  Radio,
  Target,
  User,
  Link
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useState } from "react";
import DOMPurify from "isomorphic-dompurify";

interface AnnouncementDetails {
  id: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  channels: string[];
  audienceRoles: string[] | null;
  audienceUserIds: string[] | null;
  startAt: string | null;
  endAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  publisher?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

interface Analytics {
  totalImpressions: number;
  uniqueViews: number;
  dismissals: number;
  clicks: number;
  viewsByChannel: { channel: string; count: number }[];
  viewsByDay: { date: string; count: number }[];
}

export default function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: announcement, isLoading } = useQuery<AnnouncementDetails>({
    queryKey: ['/api/announcements', id],
  });

  const { data: analytics, isLoading: isLoadingAnalytics, isError: isErrorAnalytics } = useQuery<Analytics>({
    queryKey: [`/api/announcements/${id}/analytics`],
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/api/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم حذف الإعلان بنجاح" });
      setLocation('/dashboard/announcements');
    },
    onError: () => {
      toast({ title: "❌ فشل حذف الإعلان", variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest(`/api/announcements/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم أرشفة الإعلان بنجاح" });
    },
    onError: () => {
      toast({ title: "❌ فشل أرشفة الإعلان", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: any; label: string }> = {
      draft: { variant: "secondary" as any, label: "مسودة" },
      scheduled: { variant: "default" as any, label: "مجدول" },
      published: { variant: "default" as any, label: "منشور" },
      expired: { variant: "destructive" as any, label: "منتهي" },
      archived: { variant: "outline" as any, label: "مؤرشف" },
    };
    const config = configs[status] || configs.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const configs: Record<string, { variant: any; label: string }> = {
      low: { variant: "secondary" as any, label: "منخفض" },
      normal: { variant: "outline" as any, label: "عادي" },
      high: { variant: "destructive" as any, label: "عالي" },
    };
    const config = configs[priority] || configs.normal;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getChannelLabel = (channel: string) => {
    const labels: Record<string, string> = {
      dashboardBanner: "بانر لوحة التحكم",
      inbox: "صندوق الوارد",
      toast: "إشعار منبثق",
    };
    return labels[channel] || channel;
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: "مدير النظام",
      editor: "محرر",
      reporter: "مراسل",
      reader: "قارئ",
    };
    return labels[role] || role;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!announcement) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">الإعلان غير موجود</p>
          <Button
            onClick={() => setLocation('/dashboard/announcements')}
            className="mt-4"
          >
            العودة للقائمة
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6" dir="rtl">
        {/* Header */}
        <div className="space-y-3">
          {/* Title Row */}
          <div className="flex items-start gap-2 md:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/dashboard/announcements')}
              data-testid="button-back"
              className="shrink-0"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-2xl font-bold break-words">{announcement.title}</h1>
              <div className="flex items-center gap-2 mt-2">
                {getStatusBadge(announcement.status)}
                {getPriorityBadge(announcement.priority)}
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-2 pr-12 md:pr-0 md:justify-end flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/dashboard/announcements/${id}/edit`)}
              data-testid="button-edit"
              className="flex-1 md:flex-none"
            >
              <Edit className="ml-2 h-4 w-4" />
              <span className="hidden sm:inline">تعديل</span>
              <span className="sm:hidden">تعديل</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              data-testid="button-archive"
              className="flex-1 md:flex-none"
            >
              <Archive className="ml-2 h-4 w-4" />
              <span className="hidden sm:inline">أرشفة</span>
              <span className="sm:hidden">أرشفة</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              data-testid="button-delete"
              className="flex-1 md:flex-none"
            >
              <Trash2 className="ml-2 h-4 w-4" />
              <span className="hidden sm:inline">حذف</span>
              <span className="sm:hidden">حذف</span>
            </Button>
          </div>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {isLoadingAnalytics ? (
            <>
              <Skeleton className="h-24 md:h-32" />
              <Skeleton className="h-24 md:h-32" />
              <Skeleton className="h-24 md:h-32" />
              <Skeleton className="h-24 md:h-32" />
            </>
          ) : isErrorAnalytics ? (
            <Card className="col-span-2 md:col-span-4">
              <CardContent className="py-6 md:py-8 text-center">
                <p className="text-sm md:text-base text-muted-foreground">فشل تحميل الإحصائيات</p>
              </CardContent>
            </Card>
          ) : analytics ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">المشاهدات الكلية</CardTitle>
                  <Eye className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg md:text-2xl font-bold">{analytics.totalImpressions.toLocaleString('en-US')}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">المشاهدات الفريدة</CardTitle>
                  <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg md:text-2xl font-bold">{analytics.uniqueViews.toLocaleString('en-US')}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">النقرات</CardTitle>
                  <MousePointer className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg md:text-2xl font-bold">{analytics.clicks.toLocaleString('en-US')}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">معدل النقر (CTR)</CardTitle>
                  <Target className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg md:text-2xl font-bold">
                    {analytics.uniqueViews > 0 
                      ? ((analytics.clicks / analytics.uniqueViews) * 100).toFixed(2)
                      : '0.00'}%
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle>محتوى الإعلان</CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none dark:prose-invert"
              dir="rtl"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(announcement.message) }}
            />
          </CardContent>
        </Card>

        {/* Compact Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {/* Targeting Card - Compact */}
          <Card className="hover-elevate transition-all duration-300 bg-blue-50/30 dark:bg-blue-950/20">
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="text-xs md:text-sm font-semibold flex items-center gap-2">
                <Target className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-600 dark:text-blue-400" />
                الاستهداف
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {announcement.channels.map(channel => (
                  <Badge key={channel} variant="outline" className="text-xs">
                    {getChannelLabel(channel)}
                  </Badge>
                ))}
              </div>
              {announcement.audienceRoles && announcement.audienceRoles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {announcement.audienceRoles.map(role => (
                    <Badge key={role} variant="secondary" className="text-xs">
                      {getRoleLabel(role)}
                    </Badge>
                  ))}
                </div>
              )}
              {announcement.audienceUserIds && announcement.audienceUserIds.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground">
                    مستخدمون محددون: {announcement.audienceUserIds.length}
                  </p>
                </div>
              )}
              {!announcement.audienceRoles && !announcement.audienceUserIds && (
                <p className="text-xs text-muted-foreground">جميع المستخدمين</p>
              )}
            </CardContent>
          </Card>

          {/* Scheduling Card - Compact */}
          <Card className="hover-elevate transition-all duration-300 bg-purple-50/30 dark:bg-purple-950/20">
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="text-xs md:text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4 text-purple-600 dark:text-purple-400" />
                الجدولة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {announcement.publishedAt && (
                <div>
                  <p className="text-xs text-muted-foreground">النشر</p>
                  <p className="text-sm font-medium">
                    {format(new Date(announcement.publishedAt), "PPP", { locale: ar })}
                  </p>
                </div>
              )}
              {announcement.endAt && (
                <div>
                  <p className="text-xs text-muted-foreground">الانتهاء</p>
                  <p className="text-sm font-medium">
                    {format(new Date(announcement.endAt), "PPP", { locale: ar })}
                  </p>
                </div>
              )}
              {!announcement.publishedAt && !announcement.endAt && (
                <p className="text-xs text-muted-foreground">غير مجدول</p>
              )}
            </CardContent>
          </Card>

          {/* Creator Card - Compact */}
          <Card className="hover-elevate transition-all duration-300 bg-green-50/30 dark:bg-green-950/20">
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="text-xs md:text-sm font-semibold flex items-center gap-2">
                <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-green-600 dark:text-green-400" />
                المنشئ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {announcement.creator && (
                <div>
                  <p className="text-xs text-muted-foreground">أنشأه</p>
                  <p className="text-sm font-medium">
                    {announcement.creator.firstName && announcement.creator.lastName
                      ? `${announcement.creator.firstName} ${announcement.creator.lastName}`
                      : announcement.creator.email}
                  </p>
                </div>
              )}
              {announcement.publisher && (
                <div>
                  <p className="text-xs text-muted-foreground">نشره</p>
                  <p className="text-sm font-medium">
                    {announcement.publisher.firstName && announcement.publisher.lastName
                      ? `${announcement.publisher.firstName} ${announcement.publisher.lastName}`
                      : announcement.publisher.email}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Links Card - Compact */}
          <Card className="hover-elevate transition-all duration-300 bg-orange-50/30 dark:bg-orange-950/20 sm:col-span-2 lg:col-span-3">
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="text-xs md:text-sm font-semibold flex items-center gap-2">
                <Link className="h-3.5 w-3.5 md:h-4 md:w-4 text-orange-600 dark:text-orange-400" />
                روابط سريعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation(`/dashboard/announcements/${id}/versions`)}
                  data-testid="button-versions"
                  className="text-xs"
                >
                  <Radio className="ml-2 h-3 w-3" />
                  سجل الإصدارات
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation(`/dashboard/announcements/${id}/analytics`)}
                  data-testid="button-full-analytics"
                  className="text-xs"
                >
                  <Target className="ml-2 h-3 w-3" />
                  التحليلات التفصيلية
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف الإعلان نهائياً. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
