import { useState, useEffect, useRef, useMemo } from "react";
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
  PenSquare,
  Search,
  RefreshCcw,
  X,
  FolderOpen,
  Users,
  CalendarClock,
  CheckSquare,
} from "lucide-react";
import { ViewsCount } from "@/components/ViewsCount";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
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
import { Card, CardContent } from "@/components/ui/card";
import { EditorialDraftReviewCue } from "@/components/admin/EditorialDraftReviewCue";
import { isResubmittedAfterRevision } from "@/lib/articleRevision";
import { cn } from "@/lib/utils";

type OpinionArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  status: string;
  reviewStatus?: string;
  reviewedAt?: string | null;
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

type QuickFilterKey =
  | "all"
  | "pending_review"
  | "approved"
  | "published"
  | "needs_changes"
  | "rejected";

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

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
      className={cn(
        "border-b border-border/70 transition-colors hover:bg-muted/30 last:border-0",
        isDragging && "bg-primary/5",
      )}
      data-testid={`row-opinion-${article.id}`}
    >
      <td
        className="w-10 cursor-grab py-3.5 px-2 text-center active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical
          className="mx-auto h-4 w-4 text-muted-foreground hover:text-foreground"
          data-testid={`drag-handle-${article.id}`}
        />
      </td>
      {children}
    </tr>
  );
}

function OpinionStatusCards({
  metrics,
  activeStatus,
  onSelect,
}: {
  metrics: OpinionMetrics;
  activeStatus: StatusKey;
  onSelect: (status: StatusKey) => void;
}) {
  const totalSafe = Math.max(metrics.total || 0, 1);
  const statusConfigs: Record<
    StatusKey,
    {
      icon: typeof BookOpen;
      label: string;
      subtitle: string;
      cardClass: string;
      activeRing: string;
      valueColor: string;
      iconWrapClass: string;
    }
  > = {
    total: {
      icon: BookOpen,
      label: "إجمالي المقالات",
      subtitle: "جميع مقالات الرأي المسجلة",
      cardClass:
        "border-border/80 bg-gradient-to-br from-primary/[0.06] via-card to-card",
      activeRing: "ring-2 ring-primary/50",
      valueColor: "text-foreground",
      iconWrapClass: "bg-primary/10 text-primary border-primary/20",
    },
    pending_review: {
      icon: Clock,
      label: "قيد المراجعة",
      subtitle:
        metrics.pending_review > 0
          ? "تنتظر قرار التحرير والاعتماد"
          : "لا توجد مقالات معلّقة حالياً",
      cardClass:
        "border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] via-card to-card",
      activeRing: "ring-2 ring-amber-500/50",
      valueColor: "text-amber-700 dark:text-amber-300",
      iconWrapClass:
        "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
    approved: {
      icon: CheckCircle,
      label: "موافق عليه",
      subtitle: "معتمدة وجاهزة للنشر أو الجدولة",
      cardClass:
        "border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] via-card to-card",
      activeRing: "ring-2 ring-emerald-500/50",
      valueColor: "text-emerald-700 dark:text-emerald-300",
      iconWrapClass:
        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    published: {
      icon: Send,
      label: "منشور",
      subtitle: `${Math.round(((metrics.published || 0) / totalSafe) * 100)}% من إجمالي مقالات الرأي`,
      cardClass:
        "border-indigo-500/25 bg-gradient-to-br from-indigo-500/[0.07] via-card to-card",
      activeRing: "ring-2 ring-indigo-500/50",
      valueColor: "text-indigo-700 dark:text-indigo-300",
      iconWrapClass:
        "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    },
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {(Object.keys(statusConfigs) as StatusKey[]).map((status) => {
        const config = statusConfigs[status];
        const Icon = config.icon;
        const isActive = activeStatus === status;
        const count = metrics[status] ?? 0;

        return (
          <Card
            key={status}
            className={cn(
              "group cursor-pointer rounded-2xl shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
              config.cardClass,
              isActive && config.activeRing,
            )}
            onClick={() => onSelect(status)}
            data-testid={`card-status-${status}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  {config.label}
                </span>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-transform group-hover:scale-105",
                    config.iconWrapClass,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div
                className={cn(
                  "mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight",
                  config.valueColor,
                )}
              >
                {count.toLocaleString("en-US")}
              </div>
              <div className="mt-2.5 border-t border-border/50 pt-2 text-[11px] text-muted-foreground truncate">
                {config.subtitle}
              </div>
            </CardContent>
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
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [reviewingArticle, setReviewingArticle] = useState<OpinionArticle | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | "request_revision" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // حوار النشر: يُعبَّأ الموعد تلقائياً من اليوم المخصص للكاتب ويبقى قابلاً للتغيير
  const [publishingArticle, setPublishingArticle] = useState<OpinionArticle | null>(null);
  const [publishScheduledAt, setPublishScheduledAt] = useState("");
  const publishPrefilledForRef = useRef<string | null>(null);

  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [localArticles, setLocalArticles] = useState<OpinionArticle[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const {
    data,
    isLoading,
    isFetching,
    refetch: refetchOpinions,
  } = useQuery<{
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

  const articles = Array.isArray(data?.articles) ? data.articles : [];
  const metrics = data?.metrics || { total: 0, pending_review: 0, approved: 0, published: 0 };

  useEffect(() => {
    setLocalArticles(Array.isArray(data?.articles) ? data.articles : []);
  }, [data?.articles]);

  const availableAuthors = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of localArticles) {
      if (a.author?.id) {
        const name =
          `${a.author.firstName || ""} ${a.author.lastName || ""}`.trim() || "غير معروف";
        map.set(a.author.id, name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [localArticles]);

  const availableCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of localArticles) {
      if (a.category?.id && a.category?.nameAr) {
        map.set(a.category.id, a.category.nameAr);
      }
    }
    return Array.from(map.entries())
      .map(([id, nameAr]) => ({ id, nameAr }))
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
  }, [localArticles]);

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

  // Request a revision instead of outright rejecting. Sets reviewStatus to
  // `needs_changes` + carries the reviewer's note as feedback for the
  // author. The backend fires an editorial "needs_revision" push so the
  // writer sees it on iOS immediately.
  const requestRevisionMutation = useMutation({
    mutationFn: async ({ articleId, notes }: { articleId: string; notes: string }) => {
      await apiRequest(`/api/dashboard/opinion/${articleId}/request-revision`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes: notes }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/opinion"] });
      toast({
        title: "تم إرسال طلب التعديل",
        description: "وصل الكاتب إشعار بملاحظاتك",
      });
      setReviewingArticle(null);
      setReviewAction(null);
      setReviewNotes("");
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إرسال طلب التعديل",
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ articleId, scheduledAt }: { articleId: string; scheduledAt?: string }) => {
      if (scheduledAt) {
        await apiRequest(`/api/admin/opinion-writers/schedule-article/${articleId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt }),
        });
      } else {
        await apiRequest(`/api/dashboard/opinion/${articleId}/publish`, {
          method: "POST",
        });
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/opinion"] });
      setPublishingArticle(null);
      setPublishScheduledAt("");
      toast({
        title: variables.scheduledAt ? "تمت الجدولة" : "تم النشر",
        description: variables.scheduledAt
          ? "سيُنشر المقال تلقائياً في الموعد المحدد"
          : "تم نشر المقال بنجاح",
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

  // الموعد المقترح من اليوم المخصص لكاتب المقال قيد النشر
  const { data: nextSlotData } = useQuery<{
    suggestion: { weekday: number; publishTime: string; nextSlot: string } | null;
  }>({
    queryKey: [`/api/opinion-writers/${publishingArticle?.author?.id}/next-slot`],
    enabled: !!publishingArticle?.author?.id,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!publishingArticle || !nextSlotData?.suggestion?.nextSlot) return;
    if (publishPrefilledForRef.current === publishingArticle.id) return;
    publishPrefilledForRef.current = publishingArticle.id;
    const d = new Date(nextSlotData.suggestion.nextSlot);
    const pad = (n: number) => String(n).padStart(2, "0");
    setPublishScheduledAt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
  }, [publishingArticle, nextSlotData]);

  const handlePublishClick = (article: OpinionArticle) => {
    publishPrefilledForRef.current = null;
    setPublishScheduledAt("");
    setPublishingArticle(article);
  };

  const handleApprove = (article: OpinionArticle) => {
    setReviewingArticle(article);
    setReviewAction("approve");
  };

  const handleReject = (article: OpinionArticle) => {
    setReviewingArticle(article);
    setReviewAction("reject");
    setReviewNotes("");
  };

  const handleRequestRevision = (article: OpinionArticle) => {
    setReviewingArticle(article);
    setReviewAction("request_revision");
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
    } else if (reviewAction === "request_revision") {
      if (!reviewNotes.trim()) {
        toast({
          title: "خطأ",
          description: "اكتب الملاحظات التي تريد الكاتب يطّلع عليها",
          variant: "destructive",
        });
        return;
      }
      requestRevisionMutation.mutate({ articleId: reviewingArticle.id, notes: reviewNotes });
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
    setSelectedArticles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(articleId)) {
        newSet.delete(articleId);
      } else {
        newSet.add(articleId);
      }
      return newSet;
    });
  };


  const getReviewStatusBadge = (article: OpinionArticle) => {
    if (isResubmittedAfterRevision(article)) {
      return (
        <Badge
          variant="secondary"
          className="gap-1 border border-amber-400/60 bg-amber-100 text-amber-900 dark:border-amber-600/60 dark:bg-amber-900/40 dark:text-amber-100"
        >
          <PenSquare className="h-3 w-3" />
          مُعدَّل وفق التوجيه
        </Badge>
      );
    }

    switch (article.reviewStatus) {
      case "pending_review":
        return (
          <Badge
            variant="secondary"
            className="gap-1 border border-amber-500/25 bg-amber-500/15 text-amber-800 dark:text-amber-300"
          >
            <Clock className="h-3 w-3" />
            قيد المراجعة
          </Badge>
        );
      case "approved":
        return (
          <Badge
            variant="default"
            className="gap-1 border border-emerald-500/25 bg-emerald-600 text-white hover:bg-emerald-700"
          >
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
          <Badge
            variant="secondary"
            className="gap-1 bg-orange-600 text-white hover:bg-orange-700"
          >
            <Edit className="h-3 w-3" />
            يحتاج تعديل
          </Badge>
        );
      default:
        return <Badge variant="outline">—</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: (
        <Badge variant="secondary" className="font-medium">
          مسودة
        </Badge>
      ),
      scheduled: (
        <Badge
          variant="outline"
          className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
        >
          <CalendarClock className="h-3 w-3" />
          مجدول
        </Badge>
      ),
      published: (
        <Badge
          variant="default"
          className="border-indigo-500/25 bg-indigo-600 text-white hover:bg-indigo-700"
        >
          منشور
        </Badge>
      ),
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

  const activeQuickFilter: QuickFilterKey = useMemo(() => {
    if (statusFilter === "published" && reviewStatusFilter === "all") return "published";
    if (statusFilter === "all" && reviewStatusFilter === "pending_review") return "pending_review";
    if (statusFilter === "all" && reviewStatusFilter === "approved") return "approved";
    if (statusFilter === "all" && reviewStatusFilter === "needs_changes") return "needs_changes";
    if (statusFilter === "all" && reviewStatusFilter === "rejected") return "rejected";
    if (statusFilter === "all" && reviewStatusFilter === "all") return "all";
    return "all";
  }, [statusFilter, reviewStatusFilter]);

  const handleQuickFilterSelect = (pill: QuickFilterKey) => {
    if (pill === "all") {
      setActiveStatus("total");
      setStatusFilter("all");
      setReviewStatusFilter("all");
    } else if (pill === "published") {
      setActiveStatus("published");
      setStatusFilter("published");
      setReviewStatusFilter("all");
    } else if (pill === "pending_review") {
      setActiveStatus("pending_review");
      setStatusFilter("all");
      setReviewStatusFilter("pending_review");
    } else if (pill === "approved") {
      setActiveStatus("approved");
      setStatusFilter("all");
      setReviewStatusFilter("approved");
    } else {
      setActiveStatus("total");
      setStatusFilter("all");
      setReviewStatusFilter(pill);
    }
  };

  const filteredArticles = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return localArticles.filter((article) => {
      const authorName = article.author
        ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim().toLowerCase()
        : "";
      const matchesSearch =
        !q ||
        article.title.toLowerCase().includes(q) ||
        authorName.includes(q) ||
        (article.category?.nameAr?.toLowerCase().includes(q) ?? false);
      const matchesStatus = statusFilter === "all" || article.status === statusFilter;
      const matchesReviewStatus =
        reviewStatusFilter === "all" || article.reviewStatus === reviewStatusFilter;
      const matchesAuthor = authorFilter === "all" || article.author?.id === authorFilter;
      const matchesCategory = categoryFilter === "all" || article.category?.id === categoryFilter;
      return (
        matchesSearch &&
        matchesStatus &&
        matchesReviewStatus &&
        matchesAuthor &&
        matchesCategory
      );
    });
  }, [
    localArticles,
    searchTerm,
    statusFilter,
    reviewStatusFilter,
    authorFilter,
    categoryFilter,
  ]);

  const toggleSelectAll = () => {
    if (selectedArticles.size === filteredArticles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(filteredArticles.map((a) => a.id)));
    }
  };

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    statusFilter !== "all" ||
    reviewStatusFilter !== "all" ||
    authorFilter !== "all" ||
    categoryFilter !== "all";

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-3 pb-12 sm:px-6 space-y-5 sm:space-y-6"
      >
        <div dir="rtl" className="space-y-5 sm:space-y-6">
          <DashboardPageHeader
            icon={BookOpen}
            title="إدارة مقالات الرأي"
            description="مراجعة واعتماد ونشر مقالات الرأي وترتيب عرضها في الصفحة الرئيسية"
            titleTestId="heading-title"
            actions={
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchOpinions()}
                  disabled={isFetching}
                  className="no-min-touch-size h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                >
                  <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                  <span>تحديث</span>
                </Button>
                <Button
                  onClick={() => setLocation("/dashboard/article/new?type=opinion")}
                  className="no-min-touch-size h-9 gap-2 rounded-xl px-4 text-xs font-semibold sm:text-sm"
                  size="sm"
                  data-testid="button-create-opinion"
                >
                  <Plus className="h-4 w-4" />
                  مقال رأي جديد
                </Button>
              </div>
            }
          />

          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl border border-border/60 bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <OpinionStatusCards
              metrics={metrics}
              activeStatus={activeStatus}
              onSelect={handleStatusCardClick}
            />
          )}

          {/* شريط البحث والفلاتر السريعة */}
          <Card className="rounded-2xl border-border/80 shadow-xs">
            <CardContent className="space-y-3.5 p-3.5 sm:p-4">
              {/* الصف الأول: حقل البحث + الفلاتر المنسدلة */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <div className="relative sm:col-span-2 lg:col-span-2">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالعنوان أو اسم الكاتب..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-9 rounded-xl pr-9 pl-8 text-xs sm:text-sm"
                    data-testid="input-search"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="مسح البحث"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger
                      data-testid="select-status-filter"
                      className="h-9 rounded-xl text-xs sm:text-sm"
                    >
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
                    <SelectTrigger
                      data-testid="select-review-status-filter"
                      className="h-9 rounded-xl text-xs sm:text-sm"
                    >
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

                <div className="flex gap-2">
                  {availableAuthors.length > 0 && (
                    <Select value={authorFilter} onValueChange={setAuthorFilter}>
                      <SelectTrigger className="h-9 flex-1 rounded-xl text-xs sm:text-sm">
                        <div className="flex items-center gap-1.5 truncate">
                          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <SelectValue placeholder="كل الكتّاب" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الكتّاب</SelectItem>
                        {availableAuthors.map((author) => (
                          <SelectItem key={author.id} value={author.id}>
                            {author.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {availableCategories.length > 0 && (
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-9 flex-1 rounded-xl text-xs sm:text-sm">
                        <div className="flex items-center gap-1.5 truncate">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <SelectValue placeholder="كل التصنيفات" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل التصنيفات</SelectItem>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.nameAr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* الصف الثاني: أزرار الفلترة السريعة لحالات المراجعة والنشر */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ml-1 text-xs font-semibold text-muted-foreground">
                    تصفية سريعة:
                  </span>
                  {(
                    [
                      { id: "all" as const, label: `الكل (${metrics.total})` },
                      {
                        id: "pending_review" as const,
                        label: `قيد المراجعة (${metrics.pending_review})`,
                      },
                      { id: "approved" as const, label: `معتمد (${metrics.approved})` },
                      { id: "published" as const, label: `منشور (${metrics.published})` },
                      { id: "needs_changes" as const, label: "يحتاج تعديل" },
                      { id: "rejected" as const, label: "مرفوض" },
                    ] as const
                  ).map((pill) => {
                    const isActive = activeQuickFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => handleQuickFilterSelect(pill.id)}
                        className={cn(
                          "no-min-touch-size inline-flex items-center rounded-xl border px-3 py-1 text-xs font-semibold transition-all",
                          isActive
                            ? "border-primary bg-primary text-primary-foreground shadow-xs"
                            : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-lg border-border/70 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground"
                  >
                    النتائج المعروضة: {filteredArticles.length.toLocaleString("en-US")}
                  </Badge>
                  {hasActiveFilters && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchTerm("");
                        setActiveStatus("total");
                        setStatusFilter("all");
                        setReviewStatusFilter("all");
                        setAuthorFilter("all");
                        setCategoryFilter("all");
                      }}
                      className="no-min-touch-size h-7 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>إعادة ضبط</span>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* شريط الإجراءات الجماعية عند تحديد مقالات */}
          {selectedArticles.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span>
                  تم تحديد{" "}
                  <b className="tabular-nums text-primary">
                    {selectedArticles.size.toLocaleString("en-US")}
                  </b>{" "}
                  مقال
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedArticles(new Set())}
                className="no-min-touch-size h-8 rounded-xl text-xs font-medium"
                data-testid="button-clear-selection"
              >
                إلغاء التحديد
              </Button>
            </div>
          )}

          {/* جدول سطح المكتب (يدعم السحب والإفلات لترتيب العرض) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                جاري التحميل...
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                لا توجد مقالات رأي
              </div>
            ) : (
              <div className="overflow-x-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="w-10 py-3 px-2 text-center" data-testid="header-drag"></th>
                        <th className="w-12 py-3 px-4 text-center">
                          <Checkbox
                            checked={
                              filteredArticles.length > 0 &&
                              selectedArticles.size === filteredArticles.length
                            }
                            onCheckedChange={toggleSelectAll}
                            data-testid="checkbox-select-all"
                          />
                        </th>
                        <th className="py-3 px-4 text-right font-bold">العنوان</th>
                        <th className="py-3 px-4 text-right font-bold">الكاتب</th>
                        <th className="py-3 px-4 text-right font-bold">الحالة</th>
                        <th className="py-3 px-4 text-right font-bold">حالة المراجعة</th>
                        <th className="py-3 px-4 text-right font-bold">المشاهدات</th>
                        <th className="py-3 px-4 text-right font-bold">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      <SortableContext
                        items={filteredArticles.map((a) => a.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {filteredArticles.map((article) => {
                          const authorName = article.author
                            ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() ||
                              "غير معروف"
                            : "غير معروف";

                          return (
                            <SortableRow key={article.id} article={article}>
                              <td className="py-3.5 px-4 text-center">
                                <Checkbox
                                  checked={selectedArticles.has(article.id)}
                                  onCheckedChange={() => toggleArticleSelection(article.id)}
                                  data-testid={`checkbox-article-${article.id}`}
                                />
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="max-w-md space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className="truncate font-semibold text-foreground"
                                      title={article.title}
                                    >
                                      {article.title}
                                    </span>
                                    <EditorialDraftReviewCue
                                      article={article}
                                      layout="inline"
                                      testId={`badge-revised-opinion-${article.id}`}
                                    />
                                  </div>
                                  {article.category?.nameAr && (
                                    <div className="text-xs text-muted-foreground">
                                      {article.category.nameAr}
                                    </div>
                                  )}
                                  <EditorialDraftReviewCue
                                    article={article}
                                    layout="banner"
                                    testId={`banner-revised-opinion-${article.id}`}
                                  />
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-7 w-7 ring-1 ring-border/60">
                                    <AvatarImage src={article.author?.profileImageUrl || ""} />
                                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                      <User className="h-3.5 w-3.5" />
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="whitespace-nowrap text-sm font-medium">
                                    {authorName}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">{getStatusBadge(article.status)}</td>
                              <td className="py-3.5 px-4">{getReviewStatusBadge(article)}</td>
                              <td className="py-3.5 px-4 tabular-nums">
                                <ViewsCount views={article.views} iconClassName="h-4 w-4" />
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="no-min-touch-size h-8 w-8 rounded-lg"
                                    onClick={() =>
                                      setLocation(`/dashboard/article/${article.id}/edit`)
                                    }
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
                                        className="no-min-touch-size h-8 w-8 rounded-lg text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                        data-testid={`button-approve-${article.id}`}
                                        title="موافقة"
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRequestRevision(article)}
                                        className="no-min-touch-size h-8 w-8 rounded-lg text-orange-600 hover:bg-orange-500/10 hover:text-orange-700"
                                        data-testid={`button-request-revision-${article.id}`}
                                        title="طلب تعديل"
                                      >
                                        <PenSquare className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleReject(article)}
                                        className="no-min-touch-size h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive/90"
                                        data-testid={`button-reject-${article.id}`}
                                        title="رفض"
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}

                                  {article.reviewStatus === "approved" &&
                                    article.status === "draft" && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handlePublishClick(article)}
                                        className="no-min-touch-size h-8 w-8 rounded-lg text-indigo-600 hover:bg-indigo-500/10 hover:text-indigo-700"
                                        data-testid={`button-publish-${article.id}`}
                                        title="نشر"
                                      >
                                        <Send className="h-4 w-4" />
                                      </Button>
                                    )}

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="no-min-touch-size h-8 w-8 rounded-lg"
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

          {/* بطاقات الجوال المتجاوبة */}
          <div className="space-y-3 md:hidden">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                جاري التحميل...
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="rounded-2xl border border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
                لا توجد مقالات رأي
              </div>
            ) : (
              filteredArticles.map((article) => {
                const authorName = article.author
                  ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() ||
                    "غير معروف"
                  : "غير معروف";

                return (
                  <div
                    key={article.id}
                    className="space-y-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover-elevate"
                    data-testid={`card-opinion-${article.id}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        checked={selectedArticles.has(article.id)}
                        onCheckedChange={() => toggleArticleSelection(article.id)}
                        data-testid={`checkbox-article-mobile-${article.id}`}
                        className="mt-1"
                      />
                      <div className="flex flex-1 items-start justify-between gap-2">
                        <h3 className="flex-1 break-words text-sm font-bold leading-snug text-foreground">
                          {article.title}
                        </h3>
                        {getStatusBadge(article.status)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={article.author?.profileImageUrl || ""} />
                          <AvatarFallback className="text-xs">
                            <User className="h-3 w-3" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-muted-foreground">{authorName}</span>
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
                        {getReviewStatusBadge(article)}
                      </div>
                      <ViewsCount
                        views={article.views}
                        iconClassName="h-3.5 w-3.5"
                        className="text-xs tabular-nums text-muted-foreground"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-border/50 pt-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/dashboard/article/${article.id}/edit`)}
                        className="no-min-touch-size h-8 flex-1 rounded-xl text-xs"
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
                            className="no-min-touch-size h-8 flex-1 rounded-xl border-emerald-300 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
                            data-testid={`button-approve-mobile-${article.id}`}
                          >
                            <CheckCircle className="ml-1.5 h-3.5 w-3.5" />
                            موافقة
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRequestRevision(article)}
                            className="no-min-touch-size h-8 flex-1 rounded-xl border-orange-300 text-xs text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300"
                            data-testid={`button-request-revision-mobile-${article.id}`}
                          >
                            <PenSquare className="ml-1.5 h-3.5 w-3.5" />
                            طلب تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(article)}
                            className="no-min-touch-size h-8 flex-1 rounded-xl text-xs"
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
                          onClick={() => handlePublishClick(article)}
                          className="no-min-touch-size h-8 flex-1 rounded-xl text-xs"
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
      </DashboardPageShell>

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
              {reviewAction === "approve"
                ? "الموافقة على المقال"
                : reviewAction === "request_revision"
                  ? "طلب تعديل على المقال"
                  : "رفض المقال"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve"
                ? "هل أنت متأكد من الموافقة على هذا المقال؟"
                : reviewAction === "request_revision"
                  ? "اكتب الملاحظات/التعديلات المطلوبة — سيصل الكاتب إشعار فوري بالتفاصيل."
                  : "يرجى تقديم ملاحظات للكاتب حول سبب الرفض"}
            </DialogDescription>
          </DialogHeader>

          {(reviewAction === "reject" || reviewAction === "request_revision") && (
            <Textarea
              placeholder={
                reviewAction === "request_revision"
                  ? "مثال: راجع الفقرة الثانية، اختصر العنوان، أضف مصدراً للأرقام المذكورة..."
                  : "اكتب ملاحظاتك هنا..."
              }
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
              variant={
                reviewAction === "approve"
                  ? "default"
                  : reviewAction === "request_revision"
                    ? "default"
                    : "destructive"
              }
              className={
                reviewAction === "request_revision"
                  ? "bg-orange-600 hover:bg-orange-700 text-white"
                  : undefined
              }
              onClick={confirmReview}
              disabled={
                approveMutation.isPending ||
                rejectMutation.isPending ||
                requestRevisionMutation.isPending
              }
              data-testid="button-confirm-review"
            >
              {reviewAction === "approve"
                ? "تأكيد الموافقة"
                : reviewAction === "request_revision"
                  ? "إرسال طلب التعديل"
                  : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!publishingArticle}
        onOpenChange={(open) => {
          if (!open) {
            setPublishingArticle(null);
            setPublishScheduledAt("");
          }
        }}
      >
        <DialogContent data-testid="dialog-publish-opinion">
          <DialogHeader>
            <DialogTitle>نشر المقال</DialogTitle>
            <DialogDescription>{publishingArticle?.title}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {nextSlotData?.suggestion ? (
              <p className="text-sm text-muted-foreground">
                اليوم المخصص للكاتب هو{" "}
                <b className="text-foreground">
                  {WEEKDAYS_AR[nextSlotData.suggestion.weekday]} — {nextSlotData.suggestion.publishTime}
                </b>
                ، وعُبِّئ الموعد المقترح تلقائياً. يمكنك تعديله أو النشر فوراً.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                لا يوجد يوم نشر مخصص لهذا الكاتب — يمكنك النشر فوراً أو تحديد موعد يدوياً.
              </p>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block" htmlFor="publish-scheduled-at">
                موعد النشر
              </label>
              <Input
                id="publish-scheduled-at"
                type="datetime-local"
                value={publishScheduledAt}
                onChange={(e) => setPublishScheduledAt(e.target.value)}
                data-testid="input-publish-scheduled-at"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPublishingArticle(null);
                setPublishScheduledAt("");
              }}
              data-testid="button-cancel-publish"
            >
              إلغاء
            </Button>
            <Button
              variant="outline"
              disabled={publishMutation.isPending}
              onClick={() =>
                publishingArticle && publishMutation.mutate({ articleId: publishingArticle.id })
              }
              data-testid="button-publish-now"
            >
              نشر فوراً
            </Button>
            <Button
              disabled={
                publishMutation.isPending ||
                !publishScheduledAt ||
                new Date(publishScheduledAt).getTime() <= Date.now()
              }
              onClick={() =>
                publishingArticle &&
                publishMutation.mutate({
                  articleId: publishingArticle.id,
                  scheduledAt: new Date(publishScheduledAt).toISOString(),
                })
              }
              data-testid="button-publish-scheduled"
            >
              <Send className="ml-1.5 h-4 w-4" />
              جدولة للموعد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

