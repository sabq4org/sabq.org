import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Share2,
} from "lucide-react";
import { formatDateShort, formatNumber, formatTime } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";
import { PublisherPageHeader, PublisherStatusStrip } from "@/components/publisher/PublisherPageHeader";
import { cn } from "@/lib/utils";
import {
  PlacementChips,
  UsualBar,
  type ArticlePlacements,
  type VsUsual,
} from "@/components/publisher/ArticleInsights";

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
  vsUsual?: VsUsual | null;
  placements?: ArticlePlacements | null;
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

  const { data: overview } = useQuery<{
    publisher: { autoPublish: boolean; agencyName?: string | null };
    stats?: {
      publishedArticles: number;
      publishedThisMonth: number;
      draftArticles: number;
      needsChanges: number;
      pendingReview: number;
    };
  }>({
    queryKey: ["/api/publisher/portal/overview"],
  });
  const autoPublish = overview?.publisher?.autoPublish === true;
  const agencyName = overview?.publisher?.agencyName ?? null;
  const stats = overview?.stats ?? null;
  const { data: socialSettings } = useQuery<{ mode: "off" | "approval" | "direct" }>({
    queryKey: ["/api/publisher/portal/social/settings"],
    staleTime: 5 * 60_000,
  });
  const socialEnabled = Boolean(socialSettings && socialSettings.mode !== "off");
  // مهلة طلب التغريدة: 48 ساعة من نشر الخبر (نفس قاعدة الخادم). null = انتهت.
  const socialHoursRemaining = (publishedAt: string | null) => {
    if (!publishedAt) return null;
    const left = 48 * 3600_000 - (Date.now() - new Date(publishedAt).getTime());
    return left > 0 ? Math.max(1, Math.ceil(left / 3600_000)) : null;
  };

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
        label: "عند المحرر",
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
      <Badge variant="outline" className={cn("rounded-full border-0 font-semibold", config.className)} data-testid={`badge-status-${state}`}>
        {config.label}
      </Badge>
    );
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const articles = Array.isArray(data?.articles) ? data!.articles : [];

  const filters: Array<{ value: string; label: string; count?: number }> = [
    { value: "all", label: "الكل" },
    { value: "published", label: "منشور", count: stats?.publishedArticles },
    { value: "draft", label: "مسودة / عند المحرر", count: stats ? stats.draftArticles : undefined },
    { value: "archived", label: "مرفوض" },
  ];

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <PublisherPageHeader
          icon={FileText}
          eyebrow="أخباري"
          title={agencyName ? `أخبار ${agencyName} في سبق` : "أخباري"}
          description="كل ما أرسلتموه، وأين وصل، وكيف قُرئ."
          actions={
            <Link href={autoPublish ? "/dashboard/articles/new" : "/dashboard/publisher/article/new"}>
              <Button className="rounded-xl shadow-sm" data-testid="button-create-article">
                <Plus className="ml-2 h-4 w-4" />
                خبر جديد
              </Button>
            </Link>
          }
        />

        {stats ? (
          <PublisherStatusStrip
            testId="articles-status-strip"
            items={[
              { label: "منشور", value: formatNumber(stats.publishedArticles) },
              { label: "هذا الشهر", value: formatNumber(stats.publishedThisMonth) },
              { label: "تحتاج تعديلاتك", value: formatNumber(stats.needsChanges) },
              { label: "عند المحرر", value: formatNumber(stats.pendingReview) },
            ]}
          />
        ) : null}

        <Card className="overflow-hidden border-border/60 shadow-sm" data-testid="card-articles-table">
          <div
            className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 md:flex-row md:items-center md:justify-between"
            data-testid="card-filters"
          >
            <div className="flex flex-wrap gap-0.5 rounded-xl bg-muted/70 p-1" role="group" aria-label="الحالة">
              {filters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={statusFilter === f.value}
                  onClick={() => {
                    setStatusFilter(f.value);
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    statusFilter === f.value
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`filter-${f.value}`}
                >
                  {f.label}
                  {typeof f.count === "number" ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{formatNumber(f.count)}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ابحث في العناوين"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl pr-10"
                data-testid="input-search"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="py-14 text-center" data-testid="text-no-articles">
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">لا توجد أخبار هنا</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {statusFilter === "all" && !searchQuery ? "ابدؤوا بإرسال أول خبر" : "جرّبوا حالة أخرى أو كلمة بحث مختلفة"}
              </p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border/60">
                {articles.map((article) => {
                  const state = deriveState(article);
                  const canPortalEdit = state === "draft" || state === "needs_changes" || state === "pending";
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
                  const viewHref = article.englishSlug ? `/article/${article.englishSlug}` : `/article/${article.id}`;
                  const publishedAt = formatDateTime(article.publishedAt || article.createdAt);
                  const socialHoursLeft =
                    state === "published" && socialEnabled ? socialHoursRemaining(article.publishedAt) : null;

                  return (
                    <li
                      key={article.id}
                      className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_150px] lg:grid-cols-[minmax(0,1fr)_170px_120px_auto] lg:items-center lg:gap-5"
                      data-testid={`row-article-${article.id}`}
                    >
                      <div className="min-w-0">
                        {state === "published" ? (
                          <button
                            type="button"
                            className="text-start font-semibold leading-relaxed hover:text-primary hover:underline"
                            onClick={() => navigate(`/dashboard/publisher/articles/${article.id}/report`)}
                            data-testid={`link-report-${article.id}`}
                          >
                            {article.title}
                          </button>
                        ) : (
                          <p className="font-semibold leading-relaxed">{article.title}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                          {article.categoryName ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                              {article.categoryName}
                            </span>
                          ) : null}
                          {publishedAt ? <span className="tabular-nums">{publishedAt}</span> : null}
                          {article.authorName ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {article.authorName}
                            </span>
                          ) : null}
                          {state === "published" ? <PlacementChips value={article.placements} /> : null}
                        </div>
                        {(state === "needs_changes" || state === "rejected") && article.publisherReviewNotes && (
                          <p className="mt-2 line-clamp-2 rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
                            {article.publisherReviewNotes}
                          </p>
                        )}
                      </div>

                      <div className="sm:row-span-2 lg:row-span-1">
                        {state === "published" ? (
                          <UsualBar views={article.views} value={article.vsUsual} />
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>

                      <div>{getStatusBadge(state)}</div>

                      <div className="flex flex-wrap items-center gap-1 lg:justify-end">
                        {socialHoursLeft !== null ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 rounded-lg border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
                            data-testid={`button-social-${article.id}`}
                            title="نشر اجتماعي على X"
                            onClick={() => navigate(`/dashboard/publisher/articles/${article.id}/social`)}
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            نشر اجتماعي
                            <span className="text-[11px] tabular-nums opacity-75">باقي {socialHoursLeft} س</span>
                          </Button>
                        ) : null}
                        {state === "published" ? (
                          <Button variant="ghost" size="icon" asChild data-testid={`button-view-${article.id}`} title="عرض">
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
                    </li>
                  );
                })}
              </ul>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
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
        </Card>
        <p className="text-xs text-muted-foreground">
          الخط الداكن على شريط القراءات هو المعتاد في قسم الخبر داخل سبق. يمكن طلب تغريدة للخبر خلال 48 ساعة من نشره.
        </p>

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
