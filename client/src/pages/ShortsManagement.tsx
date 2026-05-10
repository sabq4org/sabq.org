import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Film, Plus, Edit, Trash2, BarChart3, Eye, ThumbsUp, Play } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";

type Short = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  coverImage: string;
  hlsUrl: string | null;
  mp4Url: string | null;
  duration: number | null;
  status: string;
  publishType: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: string;
    nameAr: string;
    nameEn: string;
  } | null;
  reporter?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    profileImageUrl: string | null;
  } | null;
};

type Category = {
  id: string;
  nameAr: string;
  nameEn: string;
};

type ShortsMetrics = {
  total: number;
  published: number;
  draft: number;
  scheduled: number;
  archived: number;
  totalViews: number;
  totalLikes: number;
};

export default function ShortsManagement() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // State for dialogs and filters
  const [deletingShort, setDeletingShort] = useState<Short | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [reporterFilter, setReporterFilter] = useState("all");

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery<ShortsMetrics>({
    queryKey: ["/api/admin/shorts/metrics"],
    enabled: !!user,
  });

  // Fetch shorts with filters
  const { data: shortsRaw, isLoading: shortsLoading } = useQuery<Short[]>({
    queryKey: ["/api/admin/shorts", searchTerm, statusFilter, categoryFilter, reporterFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
      if (categoryFilter && categoryFilter !== "all") params.append("categoryId", categoryFilter);
      if (reporterFilter && reporterFilter !== "all") params.append("reporterId", reporterFilter);
      
      const url = `/api/admin/shorts${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Failed to fetch shorts: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user,
  });
  const shorts = Array.isArray(shortsRaw) ? shortsRaw : [];

  // Fetch categories for filter
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch reporters for filter (users with reporter role)
  const { data: reportersRaw } = useQuery<Array<{ id: string; firstName: string | null; lastName: string | null; email: string }>>({
    queryKey: ["/api/admin/reporters"],
    enabled: !!user,
  });
  const reporters = Array.isArray(reportersRaw) ? reportersRaw : [];

  // Delete mutation (soft delete - changes status to archived)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/shorts/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shorts/metrics"] });
      setDeletingShort(null);
      toast({
        title: "تم الأرشفة",
        description: "تم أرشفة المقطع القصير بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشلت عملية الأرشفة",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: <Badge variant="secondary" data-testid="badge-draft">مسودة</Badge>,
      scheduled: <Badge variant="outline" data-testid="badge-scheduled">مجدول</Badge>,
      published: <Badge variant="default" data-testid="badge-published">منشور</Badge>,
      archived: <Badge variant="destructive" data-testid="badge-archived">مؤرشف</Badge>,
    };
    return badges[status as keyof typeof badges] || <Badge>{status}</Badge>;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getReporterName = (reporter: Short['reporter']) => {
    if (!reporter) return "غير محدد";
    if (reporter.firstName && reporter.lastName) {
      return `${reporter.firstName} ${reporter.lastName}`;
    }
    return reporter.email;
  };

  // Check permissions
  const canView = user && (
    user.role === "admin" || 
    user.role === "system_admin" ||
    user.role === "editor"
  );

  const canManage = user && (
    user.role === "admin" || 
    user.role === "system_admin"
  );

  if (!user || !canView) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle data-testid="heading-unauthorized">غير مصرح</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-unauthorized-message">
              لا تملك صلاحية الوصول إلى إدارة المقاطع القصيرة
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 p-3 md:p-0" dir="rtl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Film className="h-7 w-7 md:h-8 md:w-8 text-primary" data-testid="icon-film" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold" data-testid="heading-title">
                إدارة المقاطع القصيرة
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                إدارة محتوى سبق شورتس (Reels)
              </p>
            </div>
          </div>
          {canManage && (
            <Button
              onClick={() => setLocation("/dashboard/shorts/new")}
              className="gap-2 w-full sm:w-auto"
              size="sm"
              data-testid="button-create-short"
            >
              <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
              مقطع قصير جديد
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        {metricsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : metrics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Card data-testid="card-total-shorts">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                  إجمالي المقاطع
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold" data-testid="text-total-shorts">
                  {metrics.total.toLocaleString("en-US")}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-published-shorts">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                  المنشورة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold text-green-600" data-testid="text-published-shorts">
                  {metrics.published.toLocaleString("en-US")}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-views">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                  إجمالي المشاهدات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold text-blue-600" data-testid="text-total-views">
                  {metrics.totalViews.toLocaleString("en-US")}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-likes">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                  إجمالي الإعجابات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold text-pink-600" data-testid="text-total-likes">
                  {metrics.totalLikes.toLocaleString("en-US")}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Filters */}
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                placeholder="بحث بالعنوان..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 md:h-10 text-sm"
                data-testid="input-search"
              />

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="scheduled">مجدول</SelectItem>
                  <SelectItem value="archived">مؤرشف</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger data-testid="select-category-filter" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="التصنيف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل التصنيفات</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={reporterFilter} onValueChange={setReporterFilter}>
                <SelectTrigger data-testid="select-reporter-filter" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="المراسل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المراسلين</SelectItem>
                  {reporters.map((reporter) => (
                    <SelectItem key={reporter.id} value={reporter.id}>
                      {reporter.firstName && reporter.lastName 
                        ? `${reporter.firstName} ${reporter.lastName}`
                        : reporter.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Shorts Table */}
        <Card>
          <CardContent className="p-0">
            {shortsLoading ? (
              <div className="p-4 md:p-8 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-16 w-16 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : shorts.length === 0 ? (
              <div className="p-8 md:p-12 text-center" data-testid="empty-state">
                <Film className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">لا توجد مقاطع قصيرة</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== "all" || categoryFilter !== "all" || reporterFilter !== "all"
                    ? "لا توجد نتائج تطابق البحث"
                    : "ابدأ بإنشاء أول مقطع قصير"}
                </p>
                {canManage && !searchTerm && statusFilter === "all" && (
                  <Button onClick={() => setLocation("/dashboard/shorts/new")} data-testid="button-create-first">
                    <Plus className="h-4 w-4 ml-2" />
                    إنشاء مقطع قصير
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right w-20">الغلاف</TableHead>
                      <TableHead className="text-right min-w-[200px]">العنوان</TableHead>
                      <TableHead className="text-right">المراسل</TableHead>
                      <TableHead className="text-right">التصنيف</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">المدة</TableHead>
                      <TableHead className="text-right">المشاهدات</TableHead>
                      <TableHead className="text-right">الإعجابات</TableHead>
                      <TableHead className="text-right">تاريخ النشر</TableHead>
                      <TableHead className="text-right w-32">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shorts.map((short) => (
                      <TableRow key={short.id} data-testid={`row-short-${short.id}`}>
                        {/* Cover Image */}
                        <TableCell>
                          <div className="relative w-12 h-16 rounded-md overflow-hidden bg-muted">
                            <img
                              src={short.coverImage}
                              alt={short.title}
                              className="w-full h-full object-cover"
                              data-testid={`img-cover-${short.id}`}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <Play className="h-5 w-5 text-white" />
                            </div>
                          </div>
                        </TableCell>

                        {/* Title & Description */}
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium" data-testid={`text-title-${short.id}`}>
                              {short.title}
                            </div>
                            {short.description && (
                              <div className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-description-${short.id}`}>
                                {short.description}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Reporter */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={short.reporter?.profileImageUrl || undefined} />
                              <AvatarFallback className="text-xs">
                                {short.reporter?.firstName?.[0] || short.reporter?.email[0] || "؟"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm" data-testid={`text-reporter-${short.id}`}>
                              {getReporterName(short.reporter)}
                            </span>
                          </div>
                        </TableCell>

                        {/* Category */}
                        <TableCell>
                          {short.category ? (
                            <Badge variant="outline" data-testid={`badge-category-${short.id}`}>
                              {short.category.nameAr}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {getStatusBadge(short.status)}
                        </TableCell>

                        {/* Duration */}
                        <TableCell>
                          <span className="text-sm" data-testid={`text-duration-${short.id}`}>
                            {formatDuration(short.duration)}
                          </span>
                        </TableCell>

                        {/* Views */}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm" data-testid={`text-views-${short.id}`}>
                              {short.views.toLocaleString("en-US")}
                            </span>
                          </div>
                        </TableCell>

                        {/* Likes */}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm" data-testid={`text-likes-${short.id}`}>
                              {short.likes.toLocaleString("en-US")}
                            </span>
                          </div>
                        </TableCell>

                        {/* Published Date */}
                        <TableCell>
                          <span className="text-sm" data-testid={`text-published-${short.id}`}>
                            {short.publishedAt
                              ? formatDistanceToNow(new Date(short.publishedAt), {
                                  addSuffix: true,
                                  locale: arSA,
                                })
                              : "-"}
                          </span>
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {canManage && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setLocation(`/dashboard/shorts/${short.id}`)}
                                data-testid={`button-edit-${short.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                toast({
                                  title: "قريباً",
                                  description: "صفحة التحليلات قيد التطوير",
                                });
                              }}
                              data-testid={`button-analytics-${short.id}`}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>

                            {canManage && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setDeletingShort(short)}
                                data-testid={`button-delete-${short.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingShort} onOpenChange={() => setDeletingShort(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="heading-delete-confirm">تأكيد الأرشفة</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-delete-confirm">
              هل أنت متأكد من أرشفة هذا المقطع القصير؟ سيتم تغيير حالته إلى "مؤرشف" ولن يظهر للمستخدمين.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingShort && deleteMutation.mutate(deletingShort.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "جاري الأرشفة..." : "أرشفة"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
