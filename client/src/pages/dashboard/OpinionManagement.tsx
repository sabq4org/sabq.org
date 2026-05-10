import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BookOpen,
  Plus,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  User,
  Eye,
  GripVertical,
} from "lucide-react";
import { ViewsCount } from "@/components/ViewsCount";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";

type OpinionArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  status: string;
  reviewStatus?: string;
  reviewNotes?: string;
  views: number;
  publishedAt?: string;
  createdAt: string;
  category?: {
    id: string;
    nameAr: string;
  };
  author?: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
  reviewer?: {
    id: string;
    firstName?: string;
    lastName?: string;
  };
};

type OpinionMetrics = {
  total: number;
  pending_review: number;
  approved: number;
  published: number;
};

type StatusKey = "total" | "pending_review" | "approved" | "published";

function SortableRow({ article, children }: { article: OpinionArticle; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-border hover:bg-muted/30"
      data-testid={`row-opinion-${article.id}`}
    >
      <td className="py-3 px-2 text-center cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 mx-auto text-muted-foreground" data-testid={`drag-handle-${article.id}`} />
      </td>
      {children}
    </tr>
  );
}

function OpinionStatusCards({ metrics, activeStatus, onSelect }: {
  metrics: OpinionMetrics;
  activeStatus: StatusKey;
  onSelect: (status: StatusKey) => void;
}) {
  const statusConfigs = {
    total: {
      icon: BookOpen,
      label: "إجمالي المقالات",
      bgColor: "bg-blue-50 dark:bg-blue-950",
      textColor: "text-blue-700 dark:text-blue-300",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    pending_review: {
      icon: Clock,
      label: "قيد المراجعة",
      bgColor: "bg-amber-50 dark:bg-amber-950",
      textColor: "text-amber-700 dark:text-amber-300",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    approved: {
      icon: CheckCircle,
      label: "موافق عليه",
      bgColor: "bg-emerald-50 dark:bg-emerald-950",
      textColor: "text-emerald-700 dark:text-emerald-300",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    published: {
      icon: Send,
      label: "منشور",
      bgColor: "bg-indigo-50 dark:bg-indigo-950",
      textColor: "text-indigo-700 dark:text-indigo-300",
      iconColor: "text-indigo-600 dark:text-indigo-400",
    },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {(Object.keys(statusConfigs) as StatusKey[]).map((status) => {
        const config = statusConfigs[status];
        const Icon = config.icon;
        const isActive = activeStatus === status;
        const count = metrics[status];

        return (
          <Card
            key={status}
            className={`
              p-4 cursor-pointer transition-all hover-elevate
              ${config.bgColor}
              ${isActive ? "ring-2 ring-primary" : ""}
            `}
            onClick={() => onSelect(status)}
            data-testid={`card-status-${status}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-2">
                <span className={`text-sm font-medium ${config.textColor}`}>
                  {config.label}
                </span>
                <span className={`text-2xl font-bold ${config.textColor}`}>
                  {count.toLocaleString('en-US')}
                </span>
              </div>
              <div className={`p-3 rounded-lg ${config.iconColor}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function OpinionManagement() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState<StatusKey>("total");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>("all");

  const [reviewingArticle, setReviewingArticle] = useState<OpinionArticle | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [localArticles, setLocalArticles] = useState<OpinionArticle[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data, isLoading } = useQuery<{
    articles: OpinionArticle[];
    metrics: OpinionMetrics;
    pagination: {
      page: number;
      limit: number;
    };
  }>({
    queryKey: ["/api/dashboard/opinion", searchTerm, statusFilter, reviewStatusFilter],
    enabled: !!user,
  });

  const articles = data?.articles || [];
  const metrics = data?.metrics || { total: 0, pending_review: 0, approved: 0, published: 0 };

  useEffect(() => {
    setLocalArticles(articles);
  }, [articles]);

  const approveMutation = useMutation({
    mutationFn: async (articleId: string) => {
      await apiRequest(`/api/dashboard/opinion/${articleId}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/opinion"] });
      toast({
        title: "تم الموافقة",
        description: "تمت الموافقة على المقال بنجاح",
      });
      setReviewingArticle(null);
      setReviewAction(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء الموافقة على المقال",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ articleId, notes }: { articleId: string; notes: string }) => {
      await apiRequest(`/api/dashboard/opinion/${articleId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes: notes }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/opinion"] });
      toast({
        title: "تم الرفض",
        description: "تم رفض المقال وإرسال الملاحظات للكاتب",
      });
      setReviewingArticle(null);
      setReviewAction(null);
      setReviewNotes("");
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء رفض المقال",
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (articleId: string) => {
      await apiRequest(`/api/dashboard/opinion/${articleId}/publish`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/opinion"] });
      toast({
        title: "تم النشر",
        description: "تم نشر المقال بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء نشر المقال",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (article: OpinionArticle) => {
    setReviewingArticle(article);
    setReviewAction("approve");
  };

  const handleReject = (article: OpinionArticle) => {
    setReviewingArticle(article);
    setReviewAction("reject");
    setReviewNotes("");
  };

  const confirmReview = () => {
    if (!reviewingArticle) return;

    if (reviewAction === "approve") {
      approveMutation.mutate(reviewingArticle.id);
    } else if (reviewAction === "reject") {
      if (!reviewNotes.trim()) {
        toast({
          title: "خطأ",
          description: "يجب إدخال سبب الرفض",
          variant: "destructive",
        });
        return;
      }
      rejectMutation.mutate({ articleId: reviewingArticle.id, notes: reviewNotes });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = localArticles.findIndex((article) => article.id === active.id);
    const newIndex = localArticles.findIndex((article) => article.id === over.id);

    const newArticles = arrayMove(localArticles, oldIndex, newIndex);
    setLocalArticles(newArticles);
  };

  const toggleArticleSelection = (articleId: string) => {
    setSelectedArticles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(articleId)) {
        newSet.delete(articleId);
      } else {
        newSet.add(articleId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedArticles.size === localArticles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(localArticles.map(a => a.id)));
    }
  };

  const getReviewStatusBadge = (reviewStatus?: string) => {
    switch (reviewStatus) {
      case "pending_review":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            قيد المراجعة
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
            <CheckCircle className="h-3 w-3" />
            موافق عليه
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            مرفوض
          </Badge>
        );
      case "needs_changes":
        return (
          <Badge variant="secondary" className="gap-1 bg-orange-600 hover:bg-orange-700 text-white">
            <Edit className="h-3 w-3" />
            يحتاج تعديل
          </Badge>
        );
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: <Badge variant="secondary">مسودة</Badge>,
      scheduled: <Badge variant="outline">مجدول</Badge>,
      published: <Badge variant="default">منشور</Badge>,
      archived: <Badge variant="destructive">مؤرشف</Badge>,
    };
    return badges[status as keyof typeof badges] || <Badge>{status}</Badge>;
  };

  const handleStatusCardClick = (status: StatusKey) => {
    setActiveStatus(status);
    
    if (status === "total") {
      setStatusFilter("all");
      setReviewStatusFilter("all");
    } else if (status === "pending_review" || status === "approved") {
      setReviewStatusFilter(status);
      setStatusFilter("all");
    } else if (status === "published") {
      setStatusFilter("published");
      setReviewStatusFilter("all");
    }
  };

  const filteredArticles = localArticles.filter((article) => {
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || article.status === statusFilter;
    const matchesReviewStatus = reviewStatusFilter === "all" || article.reviewStatus === reviewStatusFilter;
    return matchesSearch && matchesStatus && matchesReviewStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 p-3 md:p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold" data-testid="heading-title">
              إدارة مقالات الرأي
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              إدارة ومراجعة مقالات الرأي
            </p>
          </div>
          <Button
            onClick={() => setLocation("/dashboard/article/new?type=opinion")}
            className="gap-2 w-full sm:w-auto"
            size="sm"
            data-testid="button-create-opinion"
          >
            <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
            مقال جديد
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <OpinionStatusCards
            metrics={metrics}
            activeStatus={activeStatus}
            onSelect={handleStatusCardClick}
          />
        )}

        <div className="bg-card rounded-lg border border-border p-3 md:p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div>
              <Input
                placeholder="بحث بالعنوان..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 md:h-10 text-sm"
                data-testid="input-search"
              />
            </div>

            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                  <SelectItem value="scheduled">مجدول</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
                <SelectTrigger data-testid="select-review-status-filter" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="حالة المراجعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع حالات المراجعة</SelectItem>
                  <SelectItem value="pending_review">قيد المراجعة</SelectItem>
                  <SelectItem value="approved">موافق عليه</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                  <SelectItem value="needs_changes">يحتاج تعديل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {selectedArticles.size > 0 && (
          <div className="bg-card rounded-lg border border-border p-3 md:p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                تم تحديد {selectedArticles.size.toLocaleString('en-US')} مقال
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedArticles(new Set())}
                data-testid="button-clear-selection"
              >
                إلغاء التحديد
              </Button>
            </div>
          </div>
        )}

        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              جاري التحميل...
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              لا توجد مقالات رأي
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-center py-3 px-2 w-10" data-testid="header-drag"></th>
                      <th className="text-center py-3 px-4 w-12">
                        <Checkbox
                          checked={filteredArticles.length > 0 && selectedArticles.size === filteredArticles.length}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="text-right py-3 px-4 font-medium">العنوان</th>
                      <th className="text-right py-3 px-4 font-medium">الكاتب</th>
                      <th className="text-right py-3 px-4 font-medium">الحالة</th>
                      <th className="text-right py-3 px-4 font-medium">حالة المراجعة</th>
                      <th className="text-right py-3 px-4 font-medium">المشاهدات</th>
                      <th className="text-right py-3 px-4 font-medium">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext
                      items={filteredArticles.map(a => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredArticles.map((article) => {
                        const authorName = article.author
                          ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || "غير معروف"
                          : "غير معروف";

                        return (
                          <SortableRow key={article.id} article={article}>
                            <td className="py-3 px-4 text-center">
                              <Checkbox
                                checked={selectedArticles.has(article.id)}
                                onCheckedChange={() => toggleArticleSelection(article.id)}
                                data-testid={`checkbox-article-${article.id}`}
                              />
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-medium max-w-md truncate inline-block">
                                {article.title}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={article.author?.profileImageUrl || ""} />
                                  <AvatarFallback className="text-xs">
                                    <User className="h-3 w-3" />
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{authorName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {getStatusBadge(article.status)}
                            </td>
                            <td className="py-3 px-4">
                              {getReviewStatusBadge(article.reviewStatus)}
                            </td>
                            <td className="py-3 px-4">
                              <ViewsCount 
                                views={article.views}
                                iconClassName="h-4 w-4"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setLocation(`/dashboard/article/${article.id}/edit`)}
                                  data-testid={`button-edit-${article.id}`}
                                  title="تعديل"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>

                                {article.reviewStatus === "pending_review" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleApprove(article)}
                                      className="text-green-600 hover:text-green-700"
                                      data-testid={`button-approve-${article.id}`}
                                      title="موافقة"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleReject(article)}
                                      className="text-destructive hover:text-destructive/90"
                                      data-testid={`button-reject-${article.id}`}
                                      title="رفض"
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}

                                {article.reviewStatus === "approved" && article.status === "draft" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => publishMutation.mutate(article.id)}
                                    className="text-indigo-600 hover:text-indigo-700"
                                    data-testid={`button-publish-${article.id}`}
                                    title="نشر"
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => window.open(`/opinion/${article.slug}`, "_blank")}
                                  data-testid={`button-view-${article.id}`}
                                  title="عرض"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </SortableRow>
                        );
                      })}
                    </SortableContext>
                  </tbody>
                </table>
              </DndContext>
            </div>
          )}
        </div>

        <div className="md:hidden space-y-3">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              جاري التحميل...
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              لا توجد مقالات رأي
            </div>
          ) : (
            filteredArticles.map((article) => {
              const authorName = article.author
                ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || "غير معروف"
                : "غير معروف";

              return (
                <div
                  key={article.id}
                  className="bg-card border rounded-lg p-3 space-y-3 hover-elevate"
                  data-testid={`card-opinion-${article.id}`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selectedArticles.has(article.id)}
                      onCheckedChange={() => toggleArticleSelection(article.id)}
                      data-testid={`checkbox-article-mobile-${article.id}`}
                      className="mt-0.5"
                    />
                    <div className="flex-1 flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm flex-1 break-words leading-snug">
                        {article.title}
                      </h3>
                      {getStatusBadge(article.status)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={article.author?.profileImageUrl || ""} />
                        <AvatarFallback className="text-xs">
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground">{authorName}</span>
                    </div>
                    {article.category && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{article.category.nameAr}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getReviewStatusBadge(article.reviewStatus)}
                    </div>
                    <ViewsCount
                      views={article.views}
                      iconClassName="h-3.5 w-3.5"
                      className="text-xs text-muted-foreground"
                    />
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLocation(`/dashboard/article/${article.id}/edit`)}
                      className="flex-1"
                      data-testid={`button-edit-mobile-${article.id}`}
                    >
                      <Edit className="ml-1.5 h-3.5 w-3.5" />
                      تعديل
                    </Button>

                    {article.reviewStatus === "pending_review" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApprove(article)}
                          className="flex-1"
                          data-testid={`button-approve-mobile-${article.id}`}
                        >
                          <CheckCircle className="ml-1.5 h-3.5 w-3.5" />
                          موافقة
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(article)}
                          className="flex-1"
                          data-testid={`button-reject-mobile-${article.id}`}
                        >
                          <XCircle className="ml-1.5 h-3.5 w-3.5" />
                          رفض
                        </Button>
                      </>
                    )}

                    {article.reviewStatus === "approved" && article.status === "draft" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => publishMutation.mutate(article.id)}
                        className="flex-1"
                        data-testid={`button-publish-mobile-${article.id}`}
                      >
                        <Send className="ml-1.5 h-3.5 w-3.5" />
                        نشر
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog
        open={!!reviewingArticle && !!reviewAction}
        onOpenChange={(open) => {
          if (!open) {
            setReviewingArticle(null);
            setReviewAction(null);
            setReviewNotes("");
          }
        }}
      >
        <DialogContent data-testid="dialog-review-opinion">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "الموافقة على المقال" : "رفض المقال"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve"
                ? "هل أنت متأكد من الموافقة على هذا المقال؟"
                : "يرجى تقديم ملاحظات للكاتب حول سبب الرفض"}
            </DialogDescription>
          </DialogHeader>

          {reviewAction === "reject" && (
            <Textarea
              placeholder="اكتب ملاحظاتك هنا..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={5}
              data-testid="textarea-review-notes"
            />
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewingArticle(null);
                setReviewAction(null);
                setReviewNotes("");
              }}
              data-testid="button-cancel-review"
            >
              إلغاء
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={confirmReview}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewAction === "approve" ? "تأكيد الموافقة" : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
