import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Brain, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Search, 
  Filter,
  ChevronLeft,
  ChevronRight,
  Share2,
  Download,
  FileText,
  Save,
  EyeOff,
  Globe,
  CheckCircle
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface DeepAnalysis {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  status: string;
  categoryId: string | null;
  slug: string | null;
  createdAt: string;
  gptAnalysis: string | null;
  geminiAnalysis: string | null;
  claudeAnalysis: string | null;
  mergedAnalysis: string | null;
  executiveSummary: string | null;
  recommendations: string | null;
}

interface Statistics {
  totalAnalyses: number;
  totalViews: number;
  totalShares: number;
  totalDownloads: number;
}

interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
}

// Helper function to get status badge variant and text
const getStatusConfig = (status: string) => {
  switch (status) {
    case 'draft':
      return { variant: 'secondary' as const, text: 'مسودة', icon: Edit };
    case 'completed':
      return { variant: 'default' as const, text: 'جاهز للنشر', icon: CheckCircle };
    case 'published':
      return { variant: 'default' as const, text: 'منشور', icon: Globe };
    case 'archived':
      return { variant: 'outline' as const, text: 'مؤرشف', icon: EyeOff };
    default:
      return { variant: 'secondary' as const, text: status, icon: FileText };
  }
};

const statusOptions = [
  { value: 'all', label: 'الكل' },
  { value: 'draft', label: 'مسودة' },
  { value: 'completed', label: 'جاهز للنشر' },
  { value: 'published', label: 'منشور' },
  { value: 'archived', label: 'مؤرشف' },
] as const;

export default function DeepAnalysisList() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  
  const limit = 10;

  // Fetch statistics
  const { data: statistics } = useQuery<Statistics>({
    queryKey: ['/api/deep-analysis/stats'],
    queryFn: async () => {
      const res = await fetch('/api/deep-analysis/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch statistics');
      return await res.json();
    },
  });

  // Fetch categories
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch categories');
      return await res.json();
    },
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch deep analyses list
  const { data: analysesData, isLoading, isError, refetch } = useQuery<{ analyses: DeepAnalysis[]; total: number }>({
    queryKey: ['/api/deep-analysis', page, searchQuery, statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (categoryFilter && categoryFilter !== 'all') params.append('categoryId', categoryFilter);

      const res = await fetch(`/api/deep-analysis?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analyses');
      return await res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/deep-analysis/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deep-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deep-analysis/stats'] });
      toast({
        title: "تم الحذف",
        description: "تم حذف التحليل بنجاح",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف التحليل",
        variant: "destructive",
      });
    },
  });

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return '-';
    const category = categories.find(c => c.id === categoryId);
    return category?.nameAr || '-';
  };

  const totalPages = Math.ceil((analysesData?.total || 0) / limit);

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold" data-testid="heading-deep-analysis">
                التحليل العميق
              </h1>
            </div>
            <p className="text-muted-foreground mt-2">
              إدارة ومتابعة التحليلات العميقة بالذكاء الاصطناعي
            </p>
          </div>
          <Button
            onClick={() => navigate('/dashboard/ai/deep')}
            data-testid="button-create-analysis"
          >
            <Plus className="h-4 w-4 ml-2" />
            تحليل جديد
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Brain className="h-4 w-4" />
                إجمالي التحليلات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-total">
                {(statistics?.totalAnalyses ?? 0).toLocaleString('ar-SA')}
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-stat-views">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Eye className="h-4 w-4" />
                المشاهدات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="text-stat-views">
                {(statistics?.totalViews ?? 0).toLocaleString('ar-SA')}
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-stat-shares">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                المشاركات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-stat-shares">
                {(statistics?.totalShares ?? 0).toLocaleString('ar-SA')}
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-stat-downloads">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Download className="h-4 w-4" />
                التنزيلات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600" data-testid="text-stat-downloads">
                {(statistics?.totalDownloads ?? 0).toLocaleString('ar-SA')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters Section */}
        <Card data-testid="card-filters">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              الفلاتر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث في التحليلات..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pr-9"
                  data-testid="input-search"
                />
              </div>

              {/* Status Filter */}
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} data-testid={`option-status-${option.value}`}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Category Filter */}
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-category-filter">
                  <SelectValue placeholder="التصنيف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-category-all">الكل</SelectItem>
                  {categories.map((category) => (
                    <SelectItem 
                      key={category.id} 
                      value={category.id}
                      data-testid={`option-category-${category.id}`}
                    >
                      {category.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table and Cards */}
        <Card data-testid="card-analyses-table">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
                </div>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center p-12">
                <p className="text-destructive mb-4">حدث خطأ أثناء تحميل التحليلات</p>
                <Button onClick={() => refetch()} variant="outline" data-testid="button-retry">
                  إعادة المحاولة
                </Button>
              </div>
            ) : !analysesData?.analyses || analysesData.analyses.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Brain className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-lg mb-2">لا توجد تحليلات</p>
                <p className="text-sm text-muted-foreground mb-4">ابدأ بإنشاء تحليل عميق جديد</p>
                <Button onClick={() => navigate('/dashboard/ai/deep')} data-testid="button-create-first">
                  <Plus className="h-4 w-4 ml-2" />
                  تحليل جديد
                </Button>
              </div>
            ) : (
              <TooltipProvider>
                {/* Mobile Cards View */}
                <div className="md:hidden space-y-4 p-4">
                  {analysesData.analyses.map((analysis) => {
                    const statusConfig = getStatusConfig(analysis.status);
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <Card key={analysis.id} className="p-4" data-testid={`card-analysis-${analysis.id}`}>
                        <div className="space-y-3">
                          {/* Status Badge and Date */}
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant={statusConfig.variant} className="flex items-center gap-1" data-testid={`badge-status-mobile-${analysis.id}`}>
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig.text}
                            </Badge>
                            <span className="text-sm text-muted-foreground" data-testid={`text-date-mobile-${analysis.id}`}>
                              {format(new Date(analysis.createdAt), 'dd MMM yyyy', { locale: ar })}
                            </span>
                          </div>
                          
                          {/* Title */}
                          <h3 className="font-semibold line-clamp-2" data-testid={`text-title-mobile-${analysis.id}`}>
                            {analysis.title}
                          </h3>
                          
                          {/* Topic */}
                          <p className="text-sm text-muted-foreground line-clamp-1" data-testid={`text-topic-mobile-${analysis.id}`}>
                            {analysis.topic}
                          </p>
                          
                          {/* Category */}
                          <div className="text-sm">
                            <span className="font-medium">التصنيف: </span>
                            <span data-testid={`text-category-mobile-${analysis.id}`}>{getCategoryName(analysis.categoryId)}</span>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-2 border-t">
                            {analysis.slug && (
                              <Button
                                size="sm"
                                onClick={() => navigate(`/omq/${analysis.slug}`)}
                                data-testid={`button-view-mobile-${analysis.id}`}
                              >
                                <Eye className="h-4 w-4 ml-1" />
                                عرض
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/dashboard/ai/deep?id=${analysis.id}`)}
                              data-testid={`button-edit-mobile-${analysis.id}`}
                            >
                              <Edit className="h-4 w-4 ml-1" />
                              تعديل
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteId(analysis.id)}
                              data-testid={`button-delete-mobile-${analysis.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">العنوان</TableHead>
                        <TableHead className="text-right">الموضوع</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">التصنيف</TableHead>
                        <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                        <TableHead className="text-right">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysesData.analyses.map((analysis) => {
                        const statusConfig = getStatusConfig(analysis.status);
                        const StatusIcon = statusConfig.icon;
                        
                        return (
                          <TableRow key={analysis.id} data-testid={`row-analysis-${analysis.id}`}>
                            <TableCell className="font-medium max-w-xs" data-testid={`text-title-${analysis.id}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="line-clamp-2 cursor-help">
                                    {analysis.title}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <p>{analysis.title}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="max-w-xs" data-testid={`text-topic-${analysis.id}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="line-clamp-1 cursor-help">
                                    {analysis.topic}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <p>{analysis.topic}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell data-testid={`badge-status-${analysis.id}`}>
                              <Badge variant={statusConfig.variant} className="flex items-center gap-1 w-fit">
                                <StatusIcon className="h-3 w-3" />
                                {statusConfig.text}
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-category-${analysis.id}`}>
                              {getCategoryName(analysis.categoryId)}
                            </TableCell>
                            <TableCell data-testid={`text-date-${analysis.id}`}>
                              {format(new Date(analysis.createdAt), 'dd MMM yyyy', { locale: ar })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {analysis.slug && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => navigate(`/omq/${analysis.slug}`)}
                                    title="عرض"
                                    data-testid={`button-view-${analysis.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => navigate(`/dashboard/ai/deep?id=${analysis.id}`)}
                                  title="تعديل"
                                  data-testid={`button-edit-${analysis.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteId(analysis.id)}
                                  title="حذف"
                                  data-testid={`button-delete-${analysis.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t p-4">
                    <div className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                      صفحة {page.toLocaleString('ar-SA')} من {totalPages.toLocaleString('ar-SA')}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                        السابق
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        التالي
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا التحليل؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
