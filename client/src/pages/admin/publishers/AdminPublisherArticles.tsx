import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  Building2,
  Calendar,
  Loader2,
  MessageSquareWarning
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { Article, Publisher } from "@shared/schema";

interface PublisherArticle extends Article {
  publisher?: Publisher;
  publisherName?: string;
}

/** مؤقت SLA للمواد المعلقة: أخضر <4 ساعات، كهرماني <24، أحمر بعدها */
function SlaChip({ submittedAt }: { submittedAt: string | Date | null }) {
  if (!submittedAt) return null;
  const hours = (Date.now() - new Date(submittedAt).getTime()) / 3_600_000;
  const className = hours < 4
    ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200"
    : hours < 24
      ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200"
      : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200";
  const label = hours < 1
    ? `${Math.max(1, Math.round(hours * 60))} دقيقة`
    : hours < 48
      ? `${Math.round(hours)} ساعة`
      : `${Math.round(hours / 24)} يوم`;
  return (
    <Badge variant="outline" className={`gap-1 ${className}`} data-testid="badge-sla">
      <Clock className="h-3 w-3" />
      بانتظار المراجعة منذ {label}
    </Badge>
  );
}

export default function AdminPublisherArticles() {
  useRoleProtection('admin');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "archived">("all");
  const [publisherFilter, setPublisherFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: "approve" | "reject" | "request_changes" | null;
    article: PublisherArticle | null;
    reason: string;
  }>({
    open: false,
    action: null,
    article: null,
    reason: "",
  });

  // Fetch publisher articles
  const { data: articlesData, isLoading } = useQuery<{
    articles: PublisherArticle[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["/api/admin/publishers/articles", { page, status: statusFilter === "all" ? undefined : statusFilter }],
  });

  // Fetch publishers for filter
  const { data: publishersData } = useQuery<{
    publishers: Publisher[];
  }>({
    queryKey: ["/api/admin/publishers", { limit: 1000 }],
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ articleId }: { articleId: string }) => {
      return apiRequest(`/api/admin/publishers/articles/${articleId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/articles"] });
      toast({
        title: "تمت الموافقة",
        description: "تم الموافقة على المقال ونشره بنجاح",
      });
      setActionDialog({ open: false, action: null, article: null, reason: "" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في الموافقة على المقال",
        variant: "destructive",
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ articleId, reason }: { articleId: string; reason: string }) => {
      return apiRequest(`/api/admin/publishers/articles/${articleId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/articles"] });
      toast({
        title: "تم الرفض",
        description: "تم رفض المقال",
      });
      setActionDialog({ open: false, action: null, article: null, reason: "" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في رفض المقال",
        variant: "destructive",
      });
    },
  });

  // إعادة المادة للناشر بملاحظات («تحتاج تعديلات») بدل الرفض النهائي
  const requestChangesMutation = useMutation({
    mutationFn: async ({ articleId, notes }: { articleId: string; notes: string }) => {
      return apiRequest(`/api/admin/publishers/articles/${articleId}/request-changes`, {
        method: "POST",
        body: JSON.stringify({ notes }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/articles"] });
      toast({
        title: "أُعيدت للناشر",
        description: "أُرسلت الملاحظات للناشر وسيعدّل المادة ويعيد إرسالها",
      });
      setActionDialog({ open: false, action: null, article: null, reason: "" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إعادة المادة للناشر",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (article: PublisherArticle) => {
    setActionDialog({
      open: true,
      action: "approve",
      article,
      reason: "",
    });
  };

  const handleReject = (article: PublisherArticle) => {
    setActionDialog({
      open: true,
      action: "reject",
      article,
      reason: "",
    });
  };

  const handleRequestChanges = (article: PublisherArticle) => {
    setActionDialog({ open: true, action: "request_changes", article, reason: "" });
  };

  const confirmAction = () => {
    if (!actionDialog.article) return;

    if (actionDialog.action === "approve") {
      approveMutation.mutate({ articleId: actionDialog.article.id });
    } else if (actionDialog.action === "reject") {
      if (!actionDialog.reason.trim()) {
        toast({
          title: "خطأ",
          description: "يرجى إدخال سبب الرفض",
          variant: "destructive",
        });
        return;
      }
      rejectMutation.mutate({
        articleId: actionDialog.article.id,
        reason: actionDialog.reason
      });
    } else if (actionDialog.action === "request_changes") {
      if (actionDialog.reason.trim().length < 5) {
        toast({
          title: "خطأ",
          description: "اكتب ملاحظات واضحة للناشر (٥ أحرف على الأقل)",
          variant: "destructive",
        });
        return;
      }
      requestChangesMutation.mutate({
        articleId: actionDialog.article.id,
        notes: actionDialog.reason,
      });
    }
  };

  const filteredArticles = articlesData?.articles.filter((article) => {
    const matchesSearch = search
      ? article.title.toLowerCase().includes(search.toLowerCase())
      : true;
    
    const matchesPublisher = publisherFilter === "all" 
      ? true 
      : article.authorId === publisherFilter;
    
    return matchesSearch && matchesPublisher;
  });

  const isProcessing = approveMutation.isPending || rejectMutation.isPending || requestChangesMutation.isPending;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
      <DashboardPageHeader
        icon={FileText}
        title="مراجعة مقالات الناشرين"
        description="راجع المقالات المقدمة من الناشرين واتخذ الإجراء المناسب."
        titleTestId="text-page-title"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            المقالات المقدمة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث عن مقال..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                  dir="rtl"
                  data-testid="input-search"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                  <SelectItem value="archived">مؤرشف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-48">
              <Select value={publisherFilter} onValueChange={setPublisherFilter}>
                <SelectTrigger data-testid="select-publisher-filter">
                  <SelectValue placeholder="جميع الناشرين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الناشرين</SelectItem>
                  {publishersData?.publishers.map((publisher) => (
                    <SelectItem key={publisher.id} value={publisher.userId}>
                      {publisher.agencyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">عنوان المقال</TableHead>
                  <TableHead className="text-right">الناشر</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">تاريخ التقديم</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      جاري التحميل...
                    </TableCell>
                  </TableRow>
                ) : filteredArticles && filteredArticles.length > 0 ? (
                  filteredArticles.map((article) => (
                    <TableRow key={article.id} data-testid={`row-article-${article.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                          <div>
                            <p className="line-clamp-2">{article.title}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {article.publisherName || article.publisher?.agencyName || "غير محدد"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {article.status === "published" && (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            منشور
                          </Badge>
                        )}
                        {article.status === "draft" && (
                          <div className="flex flex-col items-start gap-1">
                            {article.publisherStatus === "pending" ? (
                              <SlaChip submittedAt={article.publisherSubmittedAt as any} />
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <Clock className="h-3 w-3" />
                                مسودة
                              </Badge>
                            )}
                            {article.publisherStatus === "needs_changes" && (
                              <Badge variant="outline" className="gap-1 bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200">
                                <MessageSquareWarning className="h-3 w-3" />
                                أُعيدت للناشر
                              </Badge>
                            )}
                          </div>
                        )}
                        {article.status === "archived" && (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            مرفوض
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(article.createdAt), "dd/MM/yyyy", { locale: ar })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link href={`/article/${article.englishSlug || article.slug}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-view-${article.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          
                          {article.status === "draft" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleApprove(article)}
                                disabled={isProcessing}
                                title="موافقة ونشر"
                                data-testid={`button-approve-${article.id}`}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRequestChanges(article)}
                                disabled={isProcessing}
                                title="طلب تعديلات من الناشر"
                                data-testid={`button-request-changes-${article.id}`}
                              >
                                <MessageSquareWarning className="h-4 w-4 text-orange-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReject(article)}
                                disabled={isProcessing}
                                title="رفض نهائي"
                                data-testid={`button-reject-${article.id}`}
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      لا توجد مقالات
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {articlesData && articlesData.total > articlesData.limit && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                عرض {Math.min(page * articlesData.limit, articlesData.total)} من {articlesData.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * articlesData.limit >= articlesData.total}
                  data-testid="button-next-page"
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve/Reject Dialog */}
      <AlertDialog open={actionDialog.open} onOpenChange={(open) => {
        if (!open) {
          setActionDialog({ open: false, action: null, article: null, reason: "" });
        }
      }}>
        <AlertDialogContent data-testid="dialog-confirm-action">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog.action === "approve"
                ? "تأكيد الموافقة"
                : actionDialog.action === "request_changes"
                  ? "طلب تعديلات من الناشر"
                  : "تأكيد الرفض"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  {actionDialog.action === "approve"
                    ? `هل أنت متأكد من الموافقة على المقال "${actionDialog.article?.title}"؟ سيتم نشر المقال وخصم رصيد من حساب الناشر.`
                    : actionDialog.action === "request_changes"
                      ? `ستُعاد "${actionDialog.article?.title}" إلى الناشر مع ملاحظاتك ليعدّلها ويعيد إرسالها — دون رفضها نهائياً.`
                      : `هل أنت متأكد من رفض المقال "${actionDialog.article?.title}"؟`}
                </p>

                {(actionDialog.action === "reject" || actionDialog.action === "request_changes") && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {actionDialog.action === "reject" ? "سبب الرفض *" : "الملاحظات للناشر *"}
                    </label>
                    <Textarea
                      value={actionDialog.reason}
                      onChange={(e) => setActionDialog({ ...actionDialog, reason: e.target.value })}
                      placeholder={actionDialog.action === "reject"
                        ? "أدخل سبب رفض المقال..."
                        : "مثال: العنوان طويل، والصورة منخفضة الجودة — يرجى استبدالها..."}
                      dir="rtl"
                      rows={4}
                      data-testid="textarea-reject-reason"
                    />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing} data-testid="button-cancel">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              disabled={isProcessing}
              data-testid="button-confirm"
            >
              {isProcessing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {actionDialog.action === "approve"
                ? "موافقة ونشر"
                : actionDialog.action === "request_changes"
                  ? "إعادة للناشر"
                  : "تأكيد الرفض"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
