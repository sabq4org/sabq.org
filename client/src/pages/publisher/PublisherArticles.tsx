import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Eye,
  Edit,
  FileText,
  Calendar,
} from "lucide-react";

interface Article {
  id: string;
  title: string;
  status: string;
  publisherStatus: string | null;
  publisherReviewNotes: string | null;
  publisherSubmittedAt: string | null;
  publisherApprovedAt: string | null;
  views: number | null;
  createdAt: string;
  publishedAt: string | null;
}

/** الحالة المعروضة تُشتق من status + publisherStatus */
function deriveState(article: Article): "published" | "pending" | "needs_changes" | "rejected" | "draft" {
  if (article.status === "published") return "published";
  if (article.status === "archived" || article.publisherStatus === "rejected") return "rejected";
  if (article.publisherStatus === "needs_changes") return "needs_changes";
  if (article.publisherStatus === "pending") return "pending";
  return "draft";
}

export default function PublisherArticles() {
  usePublisherAccess();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 10;

  // بوابة الناشر الجديدة: تعيد مواد المستخدم + كل مواد الوكالة المنسوبة
  // إليها (publisherId) — يشمل الأرشيف المرحَّل، مع ترقيم فعلي في الخادم.
  const { data, isLoading, error } = useQuery<{ articles: Article[]; total: number }>({
    queryKey: ["/api/publisher/portal/articles", { status: statusFilter !== "all" ? statusFilter : undefined, searchQuery, page, limit }],
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
      pending: { label: "قيد المراجعة", className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200" },
      needs_changes: { label: "تحتاج تعديلات", className: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200" },
      published: { label: "منشور", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
      rejected: { label: "مرفوض", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
    };
    const config = variants[state];
    return (
      <Badge variant="outline" className={config.className} data-testid={`badge-status-${state}`}>
        {config.label}
      </Badge>
    );
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <PublisherLayout>
      <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">إدارة المقالات</h1>
          <p className="text-muted-foreground mt-1">إدارة وتتبع مقالاتك</p>
        </div>
        <Link href="/dashboard/publisher/article/new">
          <Button data-testid="button-create-article">
            <Plus className="ml-2 h-4 w-4" />
            مقال جديد
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="البحث في العنوان..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                  data-testid="input-search"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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

      {/* Articles Table */}
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
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !data || data.articles.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-articles">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">لا توجد مقالات</p>
              <p className="text-muted-foreground mt-1">ابدأ بإنشاء أول مقال لك</p>
              <Link href="/dashboard/publisher/article/new">
                <Button className="mt-4" data-testid="button-create-first">
                  <Plus className="ml-2 h-4 w-4" />
                  إنشاء مقال
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">العنوان</TableHead>
                      <TableHead className="text-right">المشاهدات</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">تاريخ الإرسال</TableHead>
                      <TableHead className="text-right">تاريخ الموافقة/الرفض</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.articles?.map((article) => {
                      const state = deriveState(article);
                      return (
                      <TableRow key={article.id} data-testid={`row-article-${article.id}`}>
                        <TableCell className="font-medium">
                          <p>{article.title}</p>
                          {(state === "needs_changes" || state === "rejected") && article.publisherReviewNotes && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              💬 {article.publisherReviewNotes}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {state === "published" ? `${Number(article.views) || 0} مشاهدة` : "—"}
                        </TableCell>
                        <TableCell>{getStatusBadge(state)}</TableCell>
                        <TableCell>
                          {article.publisherSubmittedAt ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {new Date(article.publisherSubmittedAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {article.publisherApprovedAt ? (
                            <div className="flex items-center gap-1 text-sm text-green-600">
                              <Calendar className="h-3 w-3" />
                              {new Date(article.publisherApprovedAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {article.status === "draft" ? (
                              <Link href={`/dashboard/publisher/article/${article.id}/edit`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid={`button-edit-${article.id}`}
                                >
                                  <Edit className="h-4 w-4 ml-1" />
                                  تعديل
                                </Button>
                              </Link>
                            ) : (
                              <Link href={`/article/${article.id}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid={`button-view-${article.id}`}
                                >
                                  <Eye className="h-4 w-4 ml-1" />
                                  عرض
                                </Button>
                              </Link>
                            )}
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
                <div className="flex items-center justify-between mt-4">
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
      </div>
    </PublisherLayout>
  );
}
