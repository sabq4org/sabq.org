import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Eye,
  Edit,
  FileText,
  User,
  Trash2,
  Loader2,
} from "lucide-react";
import { formatDateShort, formatNumber, formatTime } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";

interface Article {
  id: string;
  title: string;
  status: string;
  englishSlug: string | null;
  publisherStatus: string | null;
  publisherReviewNotes: string | null;
  publisherSubmittedAt: string | null;
  publisherApprovedAt: string | null;
  views: number | null;
  createdAt: string;
  publishedAt: string | null;
  categoryName: string | null;
  authorName: string | null;
}

function deriveState(article: Article): "published" | "pending" | "needs_changes" | "rejected" | "draft" {
  if (article.status === "published") return "published";
  if (article.status === "archived" || article.publisherStatus === "rejected") return "rejected";
  if (article.publisherStatus === "needs_changes") return "needs_changes";
  if (article.publisherStatus === "pending") return "pending";
  return "draft";
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  return `${formatDateShort(value)} ${formatTime(value, { format24: true })}`;
}

export default function PublisherArticles() {
  usePublisherAccess();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [deletingArticle, setDeletingArticle] = useState<Article | null>(null);
  const limit = 10;

  const { data: overview } = useQuery<{ publisher: { autoPublish: boolean } }>({
    queryKey: ["/api/publisher/portal/overview"],
  });
  const autoPublish = overview?.publisher?.autoPublish === true;

  const articlesQueryKey = [
    "/api/publisher/portal/articles",
    {
      status: statusFilter !== "all" ? statusFilter : undefined,
      searchQuery,
      page,
      limit,
    },
  ] as const;

  const { data, isLoading, error } = useQuery<{ articles: Article[]; total: number }>({
    queryKey: articlesQueryKey,
  });

  const deleteMutation = useMutation({
    mutationFn: async (articleId: string) =>
      apiRequest(`/api/publisher/portal/articles/${articleId}`, { method: "DELETE" }),
    onSuccess: async (res: { message?: string }) => {
      toast({
        title: "تم الحذف",
        description: res?.message || "تم حذف المادة بنجاح",
      });
      setDeletingArticle(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/articles"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/overview"] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "تعذر الحذف",
        description: err.message || "فشل حذف المادة",
      });
    },
  });

  if (error) {
    toast({
      variant: "destructive",
      title: "خطأ",
      description: "حدث خطأ أثناء تحميل المقالات",
    });
  }

  const getStatusBadge = (state: ReturnType<typeof deriveState>) => {
    const variants: Record<string, { label: string; className: string }> = {
      draft: { label: "مسودة", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
      pending: {
        label: "قيد المراجعة",
        className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200",
      },
      needs_changes: {
        label: "تحتاج تعديلات",
        className: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200",
      },
      published: {
        label: "منشور",
        className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
      },
      rejected: {
        label: "مرفوض",
        className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
      },
    };
    const config = variants[state];
    return (
      <Badge variant="outline" className={config.className} data-testid={`badge-status-${state}`}>
        {config.label}
      </Badge>
    );
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const articles = Array.isArray(data?.articles) ? data!.articles : [];

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              إدارة المقالات
            </h1>
            <p className="mt-1 text-muted-foreground">إدارة وتتبع مقالات وكالتكم</p>
          </div>
          <Link href={autoPublish ? "/dashboard/articles/new" : "/dashboard/publisher/article/new"}>
            <Button data-testid="button-create-article">
              <Plus className="ml-2 h-4 w-4" />
              مقال جديد
            </Button>
          </Link>
        </div>

        <Card data-testid="card-filters">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="البحث في العنوان..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="pr-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-[200px]" data-testid="select-status-filter">
                  <SelectValue placeholder="فلترة حسب الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="draft">مسودة / قيد المراجعة</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                  <SelectItem value="archived">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-articles-table">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              قائمة المقالات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : articles.length === 0 ? (
              <div className="py-12 text-center" data-testid="text-no-articles">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">لا توجد مقالات</p>
                <p className="mt-1 text-muted-foreground">ابدأ بإنشاء أول مقال لك</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[320px] text-right">العنوان</TableHead>
                        <TableHead className="w-[120px] text-right">المشاهدات</TableHead>
                        <TableHead className="w-[140px] text-right">الحالة</TableHead>
                        <TableHead className="w-[180px] text-right">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {articles.map((article) => {
                        const state = deriveState(article);
                        const canPortalEdit =
                          state === "draft" || state === "needs_changes" || state === "pending";
                        const canMainEdit = state === "published" && autoPublish;
                        const canEdit = canPortalEdit || canMainEdit;
                        const canDelete =
                          state === "draft" ||
                          state === "needs_changes" ||
                          state === "pending" ||
                          (state === "published" && autoPublish);
                        const editHref = canMainEdit
                          ? `/dashboard/articles/${article.id}/edit`
                          : `/dashboard/publisher/article/${article.id}/edit`;
                        const viewHref = article.englishSlug
                          ? `/article/${article.englishSlug}`
                          : `/article/${article.id}`;
                        const publishedAt = formatDateTime(article.publishedAt || article.createdAt);

                        return (
                          <TableRow key={article.id} data-testid={`row-article-${article.id}`}>
                            <TableCell>
                              <p className="text-base font-semibold leading-snug">{article.title}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                {article.categoryName ? (
                                  <Badge variant="secondary" className="rounded-md font-normal">
                                    {article.categoryName}
                                  </Badge>
                                ) : null}
                                {publishedAt ? <span>{publishedAt}</span> : null}
                                {article.authorName ? (
                                  <span className="inline-flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {article.authorName}
                                  </span>
                                ) : null}
                              </div>
                              {(state === "needs_changes" || state === "rejected") &&
                                article.publisherReviewNotes && (
                                  <p className="mt-1.5 line-clamp-2 text-xs text-orange-700 dark:text-orange-300">
                                    {article.publisherReviewNotes}
                                  </p>
                                )}
                            </TableCell>
                            <TableCell className="text-base font-medium tabular-nums">
                              {state === "published" ? formatNumber(article.views) : "—"}
                            </TableCell>
                            <TableCell>{getStatusBadge(state)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                {state === "published" ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    asChild
                                    data-testid={`button-view-${article.id}`}
                                    title="عرض"
                                  >
                                    <a href={viewHref} target="_blank" rel="noreferrer">
                                      <Eye className="h-4 w-4" />
                                    </a>
                                  </Button>
                                ) : null}
                                {canEdit ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid={`button-edit-${article.id}`}
                                    title="تعديل"
                                    onClick={() => navigate(editHref)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                ) : null}
                                {canDelete ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid={`button-delete-${article.id}`}
                                    title="حذف"
                                    onClick={() => setDeletingArticle(article)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                      صفحة {page} من {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        السابق
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        التالي
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <AlertDialog
          open={!!deletingArticle}
          onOpenChange={(open) => {
            if (!open && !deleteMutation.isPending) setDeletingArticle(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-2">
                <span className="block">
                  {deletingArticle?.status === "published"
                    ? "ستُأرشف المادة وتُزال من الموقع. لا يمكن التراجع بسهولة."
                    : "سيتم حذف هذه المسودة من قائمة موادكم."}
                </span>
                {deletingArticle ? (
                  <span className="block font-medium text-foreground">
                    «{deletingArticle.title}»
                  </span>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={deleteMutation.isPending}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending || !deletingArticle}
                onClick={(e) => {
                  e.preventDefault();
                  if (deletingArticle) deleteMutation.mutate(deletingArticle.id);
                }}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري الحذف...
                  </>
                ) : (
                  <>
                    <Trash2 className="ml-2 h-4 w-4" />
                    حذف
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PublisherLayout>
  );
}
