import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth, hasAnyPermission } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Edit, Trash2, Send, Star, Bell, Plus, Archive, Trash, GripVertical, Sparkles, Newspaper, Clock, CalendarClock, FilePenLine, Brain, PenLine, MessageCircle, Mail, ChevronLeft, ChevronRight, Camera, BarChart3, Images, Building2, Languages, Loader2, Smartphone, Share2, Tag, BookOpen, HeartPulse, Zap } from "lucide-react";
import { SocialPublishDialog } from "@/components/social/SocialPublishDialog";
import { ViewsCount } from "@/components/ViewsCount";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { BreakingSwitch } from "@/components/admin/BreakingSwitch";
import { RowActions } from "@/components/admin/RowActions";
import { EditorialDraftReviewCue } from "@/components/admin/EditorialDraftReviewCue";
import { isAwaitingContributorRevision, isResubmittedAfterRevision } from "@/lib/articleRevision";
import { fmtSocialDateTime } from "@/components/social/socialFormat";
import { cn } from "@/lib/utils";
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

type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  reviewStatus?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  articleType: string;
  newsType: string;
  isFeatured: boolean;
  isReading?: boolean;
  views: number;
  publishedAt: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  writerWeeklySlot?: {
    weekday: number;
    publishTime: string;
    nextSlot: string;
  } | null;
  isAiGeneratedThumbnail?: boolean;
  source?: string;
  sourceMetadata?: {
    type?: 'email' | 'whatsapp' | 'manual' | 'mobile';
    from?: string;
    senderName?: string;
    senderId?: string;
    platform?: 'ios' | 'android' | string;
    firstName?: string;
    lastName?: string;
  } | null;
  category?: {
    id: string;
    nameAr: string;
    nameEn: string;
    color?: string | null;
  } | null;
  author?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    profileImageUrl: string | null;
  } | null;
  publisher?: {
    id: string;
    companyName: string | null;
  } | null;
  authorId?: string | null;
};

type Category = {
  id: string;
  nameAr: string;
  nameEn: string;
};

type ArticlesPage = {
  articles: Article[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// جوال = عرض أقل من md، أو هاتف بالوضع الأفقي (شاشة لمس قصيرة الارتفاع
// يتجاوز عرضها 768 فتُعامَل خطأً كديسكتوب لو اعتمدنا على العرض وحده)
function isMobileViewport() {
  if (typeof window === "undefined") return false;
  if (window.innerWidth < 768) return true;
  return window.matchMedia("(pointer: coarse)").matches && window.innerHeight < 500;
}

function SortableRow({
  article,
  children,
  isSaving,
  disableSorting,
  highlightResubmitted,
}: {
  article: Article;
  children: React.ReactNode;
  isSaving?: boolean;
  disableSorting?: boolean;
  highlightResubmitted?: false | "resubmitted" | "awaiting";
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id, disabled: disableSorting });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
    position: isDragging ? 'relative' as const : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-border/80 transition-colors",
        "bg-card even:bg-muted/40 hover:bg-muted/60 dark:even:bg-muted/20 dark:hover:bg-muted/40",
        isDragging ? "bg-primary/15 shadow-lg" : "",
        isSaving ? "opacity-70" : "",
        highlightResubmitted === "resubmitted" ? "bg-amber-50/90 dark:bg-amber-950/30 border-r-4 border-r-amber-500" : "",
        highlightResubmitted === "awaiting" ? "bg-orange-50/90 dark:bg-orange-950/30 border-r-4 border-r-orange-500" : ""
      )}
      data-testid={`row-article-${article.id}`}
    >
      <td 
        className={cn("hidden md:table-cell w-9 py-3 px-1 text-center", !disableSorting && "cursor-grab active:cursor-grabbing touch-none select-none")}
        {...attributes} 
        {...listeners}
      >
        {!disableSorting && <GripVertical
          className={`h-4 w-4 mx-auto ${isDragging ? 'text-primary' : 'text-muted-foreground'} ${isSaving ? 'animate-pulse' : ''}`} 
          data-testid={`drag-handle-${article.id}`} 
        />}
      </td>
      {children}
    </tr>
  );
}

const TYPE_CHIP: Record<string, { label: string; className: string; icon?: typeof Camera }> = {
  news: {
    label: "خبر",
    className: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  opinion: {
    label: "رأي",
    className: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  analysis: {
    label: "تحليل",
    className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  },
  column: {
    label: "عمود",
    className: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  },
  weekly_photos: {
    label: "صور",
    className: "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    icon: Camera,
  },
  infographic: {
    label: "إنفوجرافيك",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: BarChart3,
  },
};

export default function ArticlesManagement() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Permission check: require articles.view or any create/edit permission
  const canViewArticles = user && hasAnyPermission(user, "articles.view", "articles.create", "articles.edit", "articles.edit_any", "articles.edit_own");
  const canCreateArticle = user && hasAnyPermission(user, "articles.create");
  const canEditAny = user && hasAnyPermission(user, "articles.edit", "articles.edit_any");
  const canEditOwn = user && hasAnyPermission(user, "articles.edit_own");
  const canDeleteArticle = user && hasAnyPermission(user, "articles.delete");
  const canPublishArticle = user && hasAnyPermission(user, "articles.publish");
  const canFeatureArticle = user && hasAnyPermission(user, "articles.feature");
  const canArchiveArticle = user && hasAnyPermission(user, "articles.archive");
  const canSocialPublish = user && hasAnyPermission(user, "social_publish.view", "social_publish.create");

  // Helper function to check if user can edit a specific article
  // Reporters cannot edit articles after publication
  const isReporter = user?.role === "reporter";
  const canEditArticle = (article: Article) => {
    // Reporters cannot edit published articles
    if (isReporter && article.status === "published") return false;
    if (canEditAny) return true;
    // Check both author object and authorId field (for publisher articles where reporter is different)
    if (canEditOwn && (article.author?.id === user?.id || article.authorId === user?.id)) return true;
    return false;
  };

  // Redirect to dashboard if user doesn't have permission
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!isUserLoading && user && !canViewArticles && !hasRedirected.current) {
      hasRedirected.current = true;
      toast({
        title: "غير مصرح",
        description: "ليس لديك صلاحية عرض المقالات",
        variant: "destructive",
      });
      setLocation("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoading, canViewArticles]);

  // State for dialogs and filters
  const [deletingArticle, setDeletingArticle] = useState<Article | null>(null);
  const [revisionArticle, setRevisionArticle] = useState<Article | null>(null);
  const [socialPublishArticle, setSocialPublishArticle] = useState<Article | null>(null);
  const [notifyArticle, setNotifyArticle] = useState<Article | null>(null);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionNotesError, setRevisionNotesError] = useState<string | null>(null);
  // Reason captured in the archive dialog. Required by the backend
  // (`PATCH /api/admin/articles/:id` with status='archived'), and used as
  // the editorial-notification body for the author/reporter.
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveReasonError, setArchiveReasonError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Commit filters and page together: never fetch a new filter on the old page.
  const [listParams, setListParams] = useState({
    search: "",
    status: "published" as "published" | "scheduled" | "draft" | "archived",
    type: "all",
    category: "all",
    page: 1,
  });
  const { status: activeStatus, type: typeFilter, category: categoryFilter, page: currentPage } = listParams;
  const changeFilters = (filters: Partial<Omit<typeof listParams, "page">>) => {
    setListParams(previous => ({ ...previous, search: searchTerm, ...filters, page: 1 }));
  };
  useEffect(() => {
    if (searchTerm === listParams.search) return;
    const timer = window.setTimeout(() => {
      setListParams(previous => ({ ...previous, search: searchTerm, page: 1 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm, listParams.search]);
  
  // State for bulk selection
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState("");
  const [bulkDeleteReasonError, setBulkDeleteReasonError] = useState<string | null>(null);
  const [showBulkArchiveDialog, setShowBulkArchiveDialog] = useState(false);
  const [bulkArchiveReason, setBulkArchiveReason] = useState("");
  const [bulkArchiveReasonError, setBulkArchiveReasonError] = useState<string | null>(null);

  // State for AI classification
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [showClassificationDialog, setShowClassificationDialog] = useState(false);

  // State for mobile detection
  const [isMobile, setIsMobile] = useState(isMobileViewport);

  // Mobile detection effect
  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileViewport());
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ["/api/admin/articles/metrics", user?.id],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/admin/articles/metrics"), { credentials: "include" });
      if (!response.ok) {
        console.error("Metrics fetch failed:", response.status, response.statusText);
        throw new Error("Failed to fetch metrics");
      }
      const data = await response.json();
      return data;
    },
    enabled: !!canViewArticles,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  // Selection belongs only to the visible account/filter/page.
  useEffect(() => {
    setSelectedArticles(new Set());
  }, [user?.id, searchTerm, activeStatus, typeFilter, categoryFilter, currentPage]);

  // Fetch articles with filters and pagination
  const articlesQueryKey = ["/api/admin/articles", user?.id, listParams.search, activeStatus, typeFilter, categoryFilter, currentPage];
  const { data: articlesData, isLoading: articlesLoading, isFetching: articlesFetching, isPlaceholderData, isError: articlesError, refetch: refetchArticles } = useQuery<ArticlesPage>({
    queryKey: articlesQueryKey,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (listParams.search) params.append("search", listParams.search);
      if (activeStatus) params.append("status", activeStatus);
      if (typeFilter && typeFilter !== "all") params.append("articleType", typeFilter);
      if (categoryFilter && categoryFilter !== "all") params.append("categoryId", categoryFilter);
      params.append("page", currentPage.toString());
      params.append("limit", "30");
      
      const url = `/api/admin/articles?${params.toString()}`;
      const response = await fetch(apiUrl(url), { credentials: "include", signal });
      if (!response.ok) {
        // Preserve the HTTP status for the shared retry policy (4xx must fail fast).
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!canViewArticles,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: activeStatus === "published" || activeStatus === "scheduled" ? 60_000 : false,
    // Keep the table in place during transitions, but never carry another account's rows.
    placeholderData: (previousData, previousQuery) =>
      user?.id && previousQuery?.queryKey[1] === user.id ? previousData : undefined,
  });

  const articles = useMemo(() => canViewArticles && Array.isArray(articlesData?.articles) ? articlesData.articles : [], [canViewArticles, articlesData?.articles]);
  const articlesBusy = articlesFetching || isPlaceholderData || searchTerm !== listParams.search;
  const displayedPage = articlesData?.page ?? currentPage;
  const totalPages = articlesData?.totalPages || 1;

  // A scheduled row may publish, or move to another page, during a refresh.
  // Bulk actions must never retain IDs that are no longer in the visible result.
  useEffect(() => {
    if (articlesFetching || isPlaceholderData || articlesError) return;
    const visible = new Set(articles.map(article => article.id));
    setSelectedArticles(previous => {
      const next = new Set(Array.from(previous).filter(id => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [articles, articlesFetching, isPlaceholderData, articlesError]);
  useEffect(() => {
    if (selectedArticles.size > 0) return;
    setShowBulkArchiveDialog(false);
    setShowBulkDeleteDialog(false);
  }, [selectedArticles]);

  // Fetch categories for filter
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/articles/${id}/publish`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      toast({
        title: "تم النشر",
        description: "تم نشر المقال بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل نشر المقال",
        variant: "destructive",
      });
    },
  });

  // Feature mutation
  const featureMutation = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      return await apiRequest(`/api/admin/articles/${id}/feature`, {
        method: "POST",
        body: JSON.stringify({ featured }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة التمييز بنجاح",
      });
    },
  });

  // Archive mutation (formerly "delete"). Goes through PATCH so the
  // backend's editorial-notification trigger fires: the author/reporter
  // receives a push with the archive reason instead of seeing their
  // article silently vanish. The dedicated DELETE endpoint still exists
  // for hard-deletes but is intentionally not wired up to this dialog.
  const requestRevisionMutation = useMutation({
    mutationFn: async ({ id, reviewNotes: notes }: { id: string; reviewNotes: string }) => {
      return await apiRequest(`/api/admin/articles/${id}/request-revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: notes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      setRevisionArticle(null);
      setRevisionNotes("");
      setRevisionNotesError(null);
      toast({
        title: "تم إرسال طلب التعديل",
        description: "عاد المحتوى لمسودات الكاتب/المراسل مع الملاحظات",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال طلب التعديل",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: string; reviewNotes: string }) => {
      return await apiRequest(`/api/admin/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived", reviewNotes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      setDeletingArticle(null);
      setArchiveReason("");
      setArchiveReasonError(null);
      toast({
        title: "تم الأرشفة",
        description: "تم إبلاغ الكاتب/المراسل بعدم النشر مع ذكر السبب",
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

  // AI Classification mutation
  const classifyMutation = useMutation({
    mutationFn: async (articleId: string) => {
      return await apiRequest(`/api/articles/${articleId}/auto-categorize`, {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      setClassificationResult(data);
      setShowClassificationDialog(true);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في التصنيف",
        description: error.message || "فشل تصنيف المقال تلقائياً",
        variant: "destructive",
      });
    },
  });

  // Resend notifications mutation
  const resendNotificationsMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/articles/${id}/resend-notification`, {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "✅ تم إرسال الإشعارات",
        description: data.message || "تم إرسال الإشعارات بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال الإشعارات",
        variant: "destructive",
      });
    },
  });

  // Toggle breaking news mutation
  const toggleBreakingMutation = useMutation({
    mutationFn: async ({ id, currentState }: { id: string; currentState: boolean }) => {
      return await apiRequest(`/api/admin/articles/${id}/toggle-breaking`, {
        method: "POST",
      });
    },
    onMutate: async ({ id, currentState }) => {
      // Store the exact query key being modified
      const queryKey = articlesQueryKey;
      
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/articles"] });
      
      // Snapshot the previous value with its query key
      const previousArticles = queryClient.getQueryData<ArticlesPage>(queryKey);
      
      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old: ArticlesPage | undefined) => {
        if (!old) return old;
        return { ...old, articles: old.articles.map(article =>
          article.id === id 
            ? { ...article, newsType: currentState ? "regular" : "breaking" }
            : article
        ) };
      });
      
      return { previousArticles, queryKey };
    },
    onSuccess: (data: any, { currentState }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      const isNowBreaking = !currentState;
      toast({
        title: isNowBreaking ? "تم التمييز كخبر عاجل" : "تم إلغاء التمييز كخبر عاجل",
        description: isNowBreaking 
          ? "تم تمييز المقال كخبر عاجل بنجاح"
          : "تم إلغاء تمييز المقال كخبر عاجل بنجاح",
      });
    },
    onError: (error: any, variables, context) => {
      // Rollback on error using the original query key
      if (context?.previousArticles && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousArticles);
      }
      toast({
        title: "خطأ",
        description: error.message || "فشل تحديث حالة الخبر العاجل",
        variant: "destructive",
      });
    },
  });

  // Bulk archive mutation — sends `reviewNotes` so every reporter/opinion
  // author in the batch sees the same archive reason in the iOS push.
  const bulkArchiveMutation = useMutation({
    mutationFn: async ({ articleIds, reviewNotes }: { articleIds: string[]; reviewNotes?: string }) => {
      return await apiRequest("/api/admin/articles/bulk-archive", {
        method: "POST",
        body: JSON.stringify(reviewNotes ? { articleIds, reviewNotes } : { articleIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles/metrics"] });
      setSelectedArticles(new Set());
      setShowBulkArchiveDialog(false);
      setBulkArchiveReason("");
      setBulkArchiveReasonError(null);
      toast({
        title: "تم الأرشفة",
        description: "تم أرشفة المقالات المحددة بنجاح",
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

  // Bulk permanent delete mutation. Mirrors the bulk-archive shape:
  // the reason is required by the dashboard (5+ chars) so that every
  // affected reporter/author gets a push + email with a meaningful
  // "why your content is gone" message.
  const bulkPermanentDeleteMutation = useMutation({
    mutationFn: async (args: { articleIds: string[]; deletionReason: string }) => {
      return await apiRequest("/api/admin/articles/bulk-delete-permanent", {
        method: "POST",
        body: JSON.stringify(args),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles/metrics"] });
      setSelectedArticles(new Set());
      setShowBulkDeleteDialog(false);
      setBulkDeleteReason("");
      setBulkDeleteReasonError(null);
      toast({
        title: "تم الحذف النهائي",
        description: "تم حذف المقالات المحددة نهائياً، وأُرسل للكتّاب/المراسلين إشعار + إيميل بالسبب.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشلت عملية الحذف",
        variant: "destructive",
      });
    },
  });

  // Update articles order mutation with optimistic updates
  const updateOrderMutation = useMutation({
    mutationFn: async (data: {
      articleOrders: Array<{ id: string; displayOrder: number }>;
      newOrderedArticles: Article[];
      queryKey: (string | number | undefined)[];
    }) => {
      return await apiRequest("/api/admin/articles/update-order", {
        method: "POST",
        body: JSON.stringify({ articleOrders: data.articleOrders }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onMutate: async (data) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/articles"] });

      // Store the previous state for rollback
      const previousData = queryClient.getQueryData<ArticlesPage>(data.queryKey);

      // Optimistically update the cache, preserving the paginated response shape
      if (previousData) {
        queryClient.setQueryData(data.queryKey, { ...previousData, articles: [...data.newOrderedArticles] });
      }

      return { previousData, queryKey: data.queryKey };
    },
    onSuccess: () => {
      // Invalidate homepage and related caches for instant update
      queryClient.invalidateQueries({ queryKey: ["/api/homepage-lite"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/breaking"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      
      toast({
        title: "تم التحديث",
        description: "تم تحديث ترتيب المقالات بنجاح",
      });
    },
    onError: (error: any, _variables, context) => {
      // Rollback to the previous state with fresh copies
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, { ...context.previousData, articles: [...context.previousData.articles] });
      }
      toast({
        title: "خطأ في حفظ الترتيب",
        description: error.message || "فشل تحديث الترتيب. تم استعادة الترتيب السابق.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  const translateMutation = useMutation({
    mutationFn: async (articleId: string) => {
      return await apiRequest<{ message: string; enArticleId: string; enArticleTitle: string }>(`/api/admin/articles/${articleId}/translate-to-english`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      toast({
        title: "تمت الترجمة بنجاح",
        description: `تم نشر الخبر في النسخة الإنجليزية: "${data.enArticleTitle}"`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في الترجمة",
        description: error.message || "فشلت عملية الترجمة",
        variant: "destructive",
      });
    },
  });

  const resurfaceMutation = useMutation({
    mutationFn: async (articleId: string) => {
      return await apiRequest(`/api/articles/${articleId}/resurface`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
      toast({
        title: "تم الإنعاش",
        description: "عاد الخبر إلى صدارة الموجز وبدأ دورة جديدة",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إنعاش الخبر",
        variant: "destructive",
      });
    },
  });

  const handleSendNotification = async (article: Article) => {
    setIsSendingNotification(true);
    try {
      const data = await apiRequest<{ message?: string }>(`/api/admin/push/quick-send`, {
        method: "POST",
        body: JSON.stringify({ articleId: article.id }),
        headers: { "Content-Type": "application/json" },
      });

      toast({
        title: "بدأ الإرسال",
        description: data?.message || "جارٍ إرسال الإشعار للمستخدمين في الخلفية",
      });
      setNotifyArticle(null);
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال الإشعار",
        variant: "destructive",
      });
    } finally {
      setIsSendingNotification(false);
    }
  };

  // Selection handlers
  const toggleArticleSelection = (articleId: string) => {
    if (articlesBusy) return;
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
    if (articlesBusy) return;
    if (selectedArticles.size === articles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(articles.map(a => a.id)));
    }
  };

  const handleBulkArchive = () => {
    if (articlesBusy || selectedArticles.size === 0) return;
    setBulkArchiveReason("");
    setBulkArchiveReasonError(null);
    setShowBulkArchiveDialog(true);
  };

  const handleBulkPermanentDelete = () => {
    if (articlesBusy || selectedArticles.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const handleEdit = (article: Article) => {
    if (articlesBusy) return;
    setLocation(`/dashboard/articles/${article.id}`);
  };

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    if (articlesBusy || updateOrderMutation.isPending || activeStatus === "scheduled") return;
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = articles.findIndex((article) => article.id === active.id);
    const newIndex = articles.findIndex((article) => article.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Create a new array with the reordered items
    const newArticles = arrayMove([...articles], oldIndex, newIndex);

    // Every manual rank must exceed every publication second on this page;
    // otherwise a just-published row could snap back above its drag target.
    const publicationSeconds = newArticles.map(article => {
      const time = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
      return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
    });
    const baseOrder = Math.max(Math.floor(Date.now() / 1000), ...publicationSeconds) + newArticles.length;
    const articleOrders = newArticles.map((article, index) => ({
      id: article.id,
      displayOrder: baseOrder - index,
    }));

    // Build the current query key at call time to avoid stale closures
    const currentQueryKey = articlesQueryKey;

    updateOrderMutation.mutate({
      articleOrders,
      newOrderedArticles: newArticles,
      queryKey: currentQueryKey,
    });
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: <Badge variant="secondary" data-testid="badge-draft">مسودة</Badge>,
      scheduled: <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700 gap-1" data-testid="badge-scheduled"><Clock className="h-3 w-3" /> مجدول</Badge>,
      published: <Badge variant="default" data-testid="badge-published">منشور</Badge>,
      archived: <Badge variant="secondary" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 gap-1" data-testid="badge-archived"><Archive className="h-3 w-3" /> مؤرشف</Badge>,
    };
    return badges[status as keyof typeof badges] || <Badge>{status}</Badge>;
  };

  const formatArticleDate = (date: string | Date | null | undefined) => {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;

    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Riyadh",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  };

  const formatScheduledDate = formatArticleDate;
  const formatDraftDate = formatArticleDate;
  const formatPublishedDate = formatArticleDate;

  const getTypeBadge = (type: string) => {
    const meta = TYPE_CHIP[type] ?? { label: type, className: "border-border/70 bg-muted text-muted-foreground" };
    const Icon = meta.icon;
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border shadow-xs",
          meta.className,
        )}
      >
        {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
        <span>{meta.label}</span>
      </Badge>
    );
  };

  const getCategoryChip = (category?: { nameAr?: string | null; color?: string | null } | null) => {
    if (!category?.nameAr) return null;
    const catColor = category.color && /^#([0-9a-fA-F]{6})$/.test(category.color) ? category.color : null;
    
    if (catColor) {
      return (
        <Badge
          variant="outline"
          className="gap-1 rounded-md font-semibold px-2.5 py-0.5 text-xs shadow-xs transition-colors"
          style={{
            borderColor: `${catColor}55`,
            backgroundColor: `${catColor}18`,
            color: catColor,
          }}
        >
          <Tag className="h-3 w-3 shrink-0" style={{ color: catColor }} />
          <span>{category.nameAr}</span>
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className="gap-1 rounded-md border-primary/25 bg-primary/10 text-primary hover:bg-primary/15 font-semibold px-2.5 py-0.5 text-xs shadow-xs"
      >
        <Tag className="h-3 w-3 opacity-75 shrink-0" />
        <span>{category.nameAr}</span>
      </Badge>
    );
  };

  const isMobileAppSource = (source?: string) => source === 'ios-app' || source === 'android-app';
  const getMobileSenderName = (article: Article) => {
    const meta = article.sourceMetadata;
    if (meta?.firstName || meta?.lastName) {
      return `${meta.firstName || ''} ${meta.lastName || ''}`.trim();
    }
    if (meta?.senderName) return meta.senderName;
    if (article.author?.firstName && article.author?.lastName) {
      return `${article.author.firstName} ${article.author.lastName}`;
    }
    return article.author?.firstName || article.author?.email || 'مراسل';
  };
  const getMobilePlatformLabel = (source?: string) =>
    source === 'android-app' ? 'تطبيق Android' : 'تطبيق iOS';

  const getAuthorOrSourceBadge = (article: Article) => {
    if (article.source === "email") {
      const sender = article.sourceMetadata?.senderName || article.sourceMetadata?.from || "بريد إلكتروني";
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/25 bg-purple-50/70 dark:bg-purple-950/30 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300"
          data-testid="badge-source-email"
        >
          <Mail className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
          <span>البريد الذكي: {sender}</span>
        </span>
      );
    }
    if (article.source === "whatsapp") {
      const sender = article.sourceMetadata?.senderName || article.sourceMetadata?.from || "واتساب";
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-50/70 dark:bg-emerald-950/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          data-testid="badge-source-whatsapp"
        >
          <MessageCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>واتساب: {sender}</span>
        </span>
      );
    }
    if (isMobileAppSource(article.source)) {
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-400/25 bg-slate-100/70 dark:bg-slate-900/40 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          data-testid={article.source === "android-app" ? "badge-source-android" : "badge-source-ios"}
        >
          <Smartphone className="h-3 w-3 text-slate-600 dark:text-slate-400 shrink-0" />
          <span>{getMobilePlatformLabel(article.source)}: {getMobileSenderName(article)}</span>
        </span>
      );
    }
    if ((article as any).publisher?.companyName) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-50/70 dark:bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <Building2 className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>وكالة: {(article as any).publisher.companyName}</span>
        </span>
      );
    }
    const authorName =
      article.author?.firstName && article.author?.lastName
        ? `${article.author.firstName} ${article.author.lastName}`
        : article.author?.firstName || article.author?.email || "المحرر";

    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/25 bg-blue-50/70 dark:bg-blue-950/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300"
        data-testid="badge-source-manual"
      >
        <PenLine className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>المحرر: {authorName}</span>
      </span>
    );
  };

  const getDateBadge = (article: Article, isDesktop = true) => {
    if (article.status === "scheduled" && (article as any).scheduledAt) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-50/60 dark:bg-sky-950/25 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300"
          data-testid={isDesktop ? `scheduled-label-desktop-${article.id}` : `scheduled-label-${article.id}`}
        >
          <Clock className="h-3 w-3 text-sky-600 dark:text-sky-400 shrink-0" />
          <span dir="ltr" className="tabular-nums font-mono text-[11px]">
            {formatScheduledDate((article as any).scheduledAt)}
          </span>
        </span>
      );
    }
    if (article.status === "draft") {
      const weeklyAt =
        article.articleType === "opinion"
          ? article.scheduledAt || article.writerWeeklySlot?.nextSlot || null
          : null;
      const weeklyFormatted = weeklyAt ? formatArticleDate(weeklyAt) : null;
      if (weeklyFormatted) {
        return (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/25 bg-violet-50/60 dark:bg-violet-950/25 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300"
            title="موعد الجدول الأسبوعي للكاتب"
            data-testid={isDesktop ? `weekly-slot-desktop-${article.id}` : `weekly-slot-${article.id}`}
          >
            <CalendarClock className="h-3 w-3 text-violet-600 dark:text-violet-400 shrink-0" />
            <span>أسبوعي</span>
            <span dir="ltr" className="tabular-nums font-mono text-[11px]">
              {weeklyFormatted}
            </span>
          </span>
        );
      }
      if (article.createdAt) {
        return (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-50/60 dark:bg-amber-950/25 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
            data-testid={isDesktop ? `draft-date-desktop-${article.id}` : `draft-date-${article.id}`}
          >
            <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span dir="ltr" className="tabular-nums font-mono text-[11px]">
              {formatDraftDate(article.createdAt)}
            </span>
          </span>
        );
      }
    }
    if (article.status === "published" && article.publishedAt) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground"
          data-testid={isDesktop ? `published-date-desktop-${article.id}` : `published-date-${article.id}`}
        >
          <Clock className="h-3 w-3 shrink-0 opacity-70" />
          <span dir="ltr" className="tabular-nums font-mono text-[11px]">
            {formatPublishedDate(article.publishedAt)}
          </span>
        </span>
      );
    }
    return null;
  };

  const articlesTotal = articlesData?.total ?? 0;

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="overflow-x-hidden px-4 pb-10 sm:px-6 space-y-4">
        {/* Header */}
        <DashboardPageHeader
          icon={Newspaper}
          title="إدارة الأخبار والمقالات"
          description="غرفة تحرير المحتوى — بحث سريع، فرز بالحالة، وإجراءات ظاهرة لكل خبر"
          titleTestId="heading-title"
          className="p-4 sm:p-4"
          actions={canCreateArticle ? (
            <Button
              onClick={() => setLocation("/dashboard/articles/new")}
              className="gap-2 w-full sm:w-auto"
              data-testid="button-create-article"
            >
              <Plus className="h-4 w-4" />
              مقال جديد
            </Button>
          ) : undefined}
        />

        {/* Status KPIs — compact selectable chips */}
        {metricsLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="rounded-2xl border-border/80 bg-card shadow-xs">
                <CardContent className="p-3.5">
                  <Skeleton className="mb-2 h-3.5 w-14" />
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : metrics ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="tablist" aria-label="تصفية حسب الحالة">
            {([
              {
                key: "published" as const,
                label: "منشورة",
                value: metrics.published,
                Icon: Newspaper,
                idle: "border-border/80 bg-card/90 hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] text-foreground",
                active: "border-emerald-500/50 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/20 shadow-xs",
                iconIdle: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                iconActive: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white shadow-xs",
                valueClass: "text-emerald-600 dark:text-emerald-400",
                testId: "card-stat-published",
              },
              {
                key: "scheduled" as const,
                label: "مجدولة",
                value: metrics.scheduled,
                Icon: Clock,
                idle: "border-border/80 bg-card/90 hover:border-sky-500/40 hover:bg-sky-500/[0.04] text-foreground",
                active: "border-sky-500/50 bg-sky-500/10 text-sky-950 dark:text-sky-100 ring-2 ring-sky-500/20 shadow-xs",
                iconIdle: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                iconActive: "bg-sky-500 text-white dark:bg-sky-500 dark:text-white shadow-xs",
                valueClass: "text-sky-600 dark:text-sky-400",
                testId: "card-stat-scheduled",
              },
              {
                key: "draft" as const,
                label: "مسودة",
                value: metrics.draft,
                Icon: FilePenLine,
                idle: "border-border/80 bg-card/90 hover:border-amber-500/40 hover:bg-amber-500/[0.04] text-foreground",
                active: "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/20 shadow-xs",
                iconIdle: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                iconActive: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white shadow-xs",
                valueClass: "text-amber-600 dark:text-amber-400",
                testId: "card-stat-draft",
              },
              {
                key: "archived" as const,
                label: "مؤرشفة",
                value: metrics.archived,
                Icon: Archive,
                idle: "border-border/80 bg-card/90 hover:border-rose-500/40 hover:bg-rose-500/[0.04] text-foreground",
                active: "border-rose-500/50 bg-rose-500/10 text-rose-950 dark:text-rose-100 ring-2 ring-rose-500/20 shadow-xs",
                iconIdle: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                iconActive: "bg-rose-500 text-white dark:bg-rose-500 dark:text-white shadow-xs",
                valueClass: "text-rose-600 dark:text-rose-400",
                testId: "card-stat-archived",
              },
            ]).map((card) => {
              const isActive = activeStatus === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => changeFilters({ status: card.key })}
                  className={cn(
                    "rounded-2xl border p-3.5 sm:p-4 text-start transition-all duration-200 cursor-pointer select-none",
                    isActive ? card.active : card.idle,
                  )}
                  data-testid={card.testId}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs sm:text-sm font-semibold text-muted-foreground">{card.label}</span>
                    <span className={cn("rounded-xl p-1.5 transition-colors", isActive ? card.iconActive : card.iconIdle)}>
                      <card.Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                  <div
                    className={cn(
                      "mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight leading-none transition-colors",
                      isActive ? card.valueClass : "text-foreground"
                    )}
                  >
                    {card.value.toLocaleString("en-US")}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
            خطأ في تحميل الإحصائيات: {metricsError?.message || "غير معروف"}
          </div>
        )}

        {/* Search + filters — single compact toolbar */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none sm:p-3.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              placeholder="البحث عن مقال..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-articles"
              className="h-10 flex-1 text-sm"
            />
            <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
              <Select value={typeFilter} onValueChange={type => changeFilters({ type })}>
                <SelectTrigger data-testid="select-type-filter" className="h-10 lg:w-[140px]">
                  <SelectValue placeholder="النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="news">خبر</SelectItem>
                  <SelectItem value="opinion">رأي</SelectItem>
                  <SelectItem value="analysis">تحليل</SelectItem>
                  <SelectItem value="column">عمود</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={category => changeFilters({ category })}>
                <SelectTrigger data-testid="select-category-filter" className="h-10 lg:w-[150px]">
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

              <Button
                variant="outline"
                className="h-10"
                onClick={() => {
                  setSearchTerm("");
                  changeFilters({ search: "", type: "all", category: "all" });
                }}
                data-testid="button-clear-filters"
              >
                مسح
              </Button>
            </div>
          </div>
        </div>

        {/* Articles List Section */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
            <div>
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">قائمة المقالات</h2>
              <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                {articlesLoading
                  ? "جاري التحميل…"
                  : `${articlesTotal.toLocaleString("en-US")} نتيجة · الصفحة ${displayedPage.toLocaleString("en-US")}`}
              </p>
            </div>
          </div>

          {articlesBusy && !articlesLoading && (
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="articles-updating">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              جارٍ تحديث النتائج…
            </div>
          )}
          {articlesError && (
            <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
              تعذّر تحديث قائمة المقالات. حاول مرة أخرى.
              <Button variant="outline" size="sm" disabled={articlesBusy} onClick={() => void refetchArticles()}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {/* Bulk Actions Toolbar — الجوال يكتفي بالشريط السفلي الثابت */}
          {selectedArticles.size > 0 && !isMobile && (
            <div className="rounded-2xl border border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card p-3 shadow-sm dark:border-sky-900/35 dark:from-sky-950/15 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 md:gap-4">
                <div className="text-sm text-muted-foreground tabular-nums">
                  تم تحديد {selectedArticles.size.toLocaleString("en-US")} مقال
                </div>
                <div className="flex items-center gap-2">
                  {activeStatus !== "archived" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkArchive}
                      disabled={articlesBusy || bulkArchiveMutation.isPending}
                      data-testid="button-bulk-archive"
                      className="gap-2"
                    >
                      <Archive className="h-4 w-4" />
                      أرشفة المحدد
                    </Button>
                  )}
                  {activeStatus === "archived" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkPermanentDelete}
                      disabled={articlesBusy || bulkPermanentDeleteMutation.isPending}
                      data-testid="button-bulk-delete-permanent"
                      className="gap-2"
                    >
                      <Trash className="h-4 w-4" />
                      حذف نهائي
                    </Button>
                  )}
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
            </div>
          )}

          {/* Articles Table - Desktop View */}
          {!isMobile && (
          <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-none"
            data-testid="articles-desktop-results" aria-busy={articlesBusy}
            {...(articlesBusy ? { inert: "" } : {})}>
            {articlesLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                جاري التحميل...
              </div>
            ) : articles.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {articlesError ? "تعذّر تحميل المقالات" : "لا توجد مقالات"}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <table className="w-full min-w-[920px] table-fixed">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="w-8 px-1 py-3 text-center" data-testid="header-drag"></th>
                      <th className="w-10 px-2 py-3 text-center">
                        <Checkbox
                          checked={articles.length > 0 && selectedArticles.size === articles.length}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="min-w-[340px] px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">الخبر</th>
                      <th className="w-20 px-2 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">عاجل</th>
                      <th className="w-28 px-2 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">المشاهدات</th>
                      <th className="w-72 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext
                      items={articles.map((a) => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {articles.map((article) => (
                        <SortableRow
                          key={article.id}
                          article={article}
                          isSaving={updateOrderMutation.isPending}
                          disableSorting={activeStatus === "scheduled"}
                          highlightResubmitted={
                            isResubmittedAfterRevision(article)
                              ? "resubmitted"
                              : isAwaitingContributorRevision(article)
                                ? "awaiting"
                                : false
                          }
                        >
                          <td className="px-2 py-3.5 text-center align-middle">
                            <Checkbox
                              checked={selectedArticles.has(article.id)}
                              onCheckedChange={() => toggleArticleSelection(article.id)}
                              data-testid={`checkbox-article-${article.id}`}
                            />
                          </td>
                          <td className="min-w-[340px] px-4 py-3.5 align-middle">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                {((article as any).albumImages?.length > 0 ||
                                  (article as any).mediaAssetsCount > 0) && (
                                  <span title="يحتوي على ألبوم صور" className="inline-flex">
                                    <Images className="h-4 w-4 shrink-0 text-sky-500" />
                                  </span>
                                )}
                                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <h3
                                    title={article.title}
                                    onClick={() => canEditArticle(article) ? handleEdit(article) : undefined}
                                    className={cn(
                                      "min-w-0 truncate text-[15px] sm:text-base font-normal sm:font-medium leading-relaxed tracking-normal text-foreground/90 hover:text-primary transition-colors",
                                      canEditArticle(article) ? "cursor-pointer" : ""
                                    )}
                                  >
                                    {article.title}
                                  </h3>
                                  <EditorialDraftReviewCue
                                    article={article}
                                    layout="inline"
                                    testId={`badge-review-desktop-${article.id}`}
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {getCategoryChip(article.category)}
                                {getTypeBadge(article.articleType || "news")}
                                {getAuthorOrSourceBadge(article)}
                                {getDateBadge(article, true)}
                                {(article.isAiGeneratedThumbnail ||
                                  (article as any).isAiGeneratedImage) && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 rounded-md border-purple-500/25 bg-purple-50/70 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-medium px-2 py-0.5 text-[11px] shadow-xs"
                                    title="صورة مولدة بالذكاء الاصطناعي"
                                    data-testid={`badge-ai-image-${article.id}`}
                                  >
                                    <Brain className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
                                    <span>AI</span>
                                  </Badge>
                                )}
                              </div>

                              <EditorialDraftReviewCue
                                article={article}
                                layout="banner"
                                testId={`banner-review-desktop-${article.id}`}
                              />


                              {article.status === "draft" && (
                                <EditorialDraftReviewCue
                                  article={article}
                                  layout="meta"
                                  testId={`meta-review-desktop-${article.id}`}
                                />
                              )}
                              {article.status === "archived" && (article as any).reviewNotes && (
                                <div
                                  className="flex items-start gap-1 text-sm text-red-600 dark:text-red-400"
                                  data-testid={`archive-reason-desktop-${article.id}`}
                                >
                                  <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <span>
                                    <span className="font-semibold">سبب الأرشفة:</span>{" "}
                                    {(article as any).reviewNotes}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="w-[72px] px-2 py-3.5 text-center align-top">
                            {canPublishArticle ? (
                              <BreakingSwitch
                                articleId={article.id}
                                initialValue={article.newsType === "breaking"}
                              />
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {article.newsType === "breaking" ? "عاجل" : "-"}
                              </span>
                            )}
                          </td>
                          <td className="w-[88px] px-2 py-3.5 text-center align-top">
                            <ViewsCount views={article.views} iconClassName="h-4 w-4" />
                          </td>
                          <td className="w-[280px] px-2 py-3.5 align-top">
                            <RowActions
                              articleId={article.id}
                              articleTitle={article.title}
                              status={article.status}
                              onEdit={() => handleEdit(article)}
                              isFeatured={article.isFeatured}
                              onDelete={() => setDeletingArticle(article)}
                              onRequestRevision={
                                activeStatus !== "archived"
                                  ? () => setRevisionArticle(article)
                                  : undefined
                              }
                              onSocialPublish={() => setSocialPublishArticle(article)}
                              canEdit={canEditArticle(article)}
                              canDelete={!!(canDeleteArticle || canArchiveArticle)}
                              canFeature={!!canFeatureArticle}
                              canPublish={!!canPublishArticle}
                              canSocialPublish={!!canSocialPublish}
                            />
                          </td>
                        </SortableRow>
                      ))}
                    </SortableContext>
                  </tbody>
                </table>
              </DndContext>
            )}
          </div>
          )}

          {/* Articles Cards - Mobile View (عمود واحد رأسيًا، وعمودان على الجوال الأفقي) */}
          {isMobile && (
          <div className="grid grid-cols-1 items-start gap-2.5 min-[820px]:grid-cols-2"
            data-testid="articles-mobile-results" aria-busy={articlesBusy}
            {...(articlesBusy ? { inert: "" } : {})}>
            {articlesLoading ? (
              <div className="col-span-full p-8 text-center text-muted-foreground text-sm">
                جاري التحميل...
              </div>
            ) : articles.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground text-sm">
                {articlesError ? "تعذّر تحميل المقالات" : "لا توجد مقالات"}
              </div>
            ) : (
              articles.map((article) => (
                <div 
                  key={article.id} 
                  className={`space-y-2 rounded-2xl border p-3 shadow-sm transition-all hover-elevate active-elevate-2 ${
                    isResubmittedAfterRevision(article)
                      ? "border-amber-300 bg-amber-50 dark:border-border dark:bg-card"
                      : isAwaitingContributorRevision(article)
                        ? "border-orange-300 bg-orange-50 dark:border-border dark:bg-card"
                        : "border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card dark:border-sky-900/35 dark:from-sky-950/15"
                  }`}
                  data-testid={`card-article-${article.id}`}
                >
                  {/* Header: Checkbox + Title + Status */}
                  <div className="flex items-start gap-2.5">
                    {/* هدف اللمس 44px يوفره الغلاف؛ بدونه قاعدة الـWCAG العامة
                        تضخّم المربع نفسه إلى 44px فيبدو كصورة مكسورة */}
                    <div
                      className="-m-2.5 shrink-0 cursor-pointer p-2.5"
                      onClick={(e) => {
                        // نقرات الفأرة/اللمس تصل للغلاف فقط (المربع pointer-events-none)،
                        // أما click المصطنع من كيبورد المربع فيتكفل به onCheckedChange
                        if (e.target === e.currentTarget) toggleArticleSelection(article.id);
                      }}
                    >
                      <Checkbox
                        className="no-min-touch-size pointer-events-none mt-1"
                        checked={selectedArticles.has(article.id)}
                        onCheckedChange={() => toggleArticleSelection(article.id)}
                        data-testid={`checkbox-article-mobile-${article.id}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <h3
                          className={cn(
                            "font-normal sm:font-medium text-[15px] sm:text-base break-words leading-relaxed text-foreground flex items-center gap-1.5 flex-wrap",
                            canEditArticle(article) ? "cursor-pointer hover:text-primary transition-colors" : ""
                          )}
                          onClick={() => canEditArticle(article) ? handleEdit(article) : undefined}
                        >
                          {((article as any).albumImages?.length > 0 || (article as any).mediaAssetsCount > 0) && (
                            <Images className="h-4 w-4 text-sky-500 flex-shrink-0" />
                          )}
                          {article.title}
                          <EditorialDraftReviewCue
                            article={article}
                            layout="inline"
                            testId={`badge-review-mobile-${article.id}`}
                          />
                        </h3>
                        <EditorialDraftReviewCue
                          article={article}
                          layout="banner"
                          testId={`banner-review-mobile-${article.id}`}
                        />
                      </div>

                      {/* Distinct Meta Strip */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {getCategoryChip(article.category)}
                        {getTypeBadge(article.articleType || "news")}
                        {getAuthorOrSourceBadge(article)}
                        {getDateBadge(article, false)}
                      </div>

                      {article.status === "archived" && (article as any).reviewNotes && (
                        <div
                          className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-2 flex items-start gap-1 mt-1"
                          data-testid={`archive-reason-${article.id}`}
                        >
                          <Archive className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          <span>
                            <span className="font-semibold">سبب الأرشفة:</span>{" "}
                            {(article as any).reviewNotes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Meta Info: Author + Publisher */}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={article.author?.profileImageUrl || ""} />
                        <AvatarFallback className="text-xs">
                          {article.author?.firstName?.[0] || article.author?.email?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{article.author?.firstName || article.author?.email}</span>
                    </div>
                    {article.publisher?.companyName && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          <span>{article.publisher.companyName}</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {article.newsType === "breaking" && (
                        <Badge variant="destructive" className="text-xs">
                          <Bell className="h-3 w-3 ml-1" />
                          عاجل
                        </Badge>
                      )}
                      {article.isFeatured && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 ml-1 fill-current" />
                          مميز
                        </Badge>
                      )}
                      {article.isReading && (
                        <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                          <BookOpen className="h-3 w-3 ml-1" />
                          قراءة
                        </Badge>
                      )}
                      {(article.isAiGeneratedThumbnail || (article as any).isAiGeneratedImage) && (
                        <Badge className="text-xs bg-violet-500/90 hover:bg-violet-600 text-white border-0">
                          <Brain className="h-3 w-3 ml-1" />
                          صورة AI
                        </Badge>
                      )}
                    </div>
                    <ViewsCount 
                      views={article.views}
                      iconClassName="h-4 w-4"
                      className="text-sm text-muted-foreground"
                    />
                  </div>
                  
                  {/* Action Buttons - Permission-based visibility */}
                  <div className="space-y-2 pt-2 border-t">
                    {/* Primary Action Buttons Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {canEditArticle(article) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(article)}
                          className="h-9 font-medium text-xs sm:text-sm"
                          data-testid={`button-edit-mobile-${article.id}`}
                        >
                          <Edit className="ml-1.5 h-3.5 w-3.5" />
                          تعديل
                        </Button>
                      )}
                      
                      {canPublishArticle && (
                        <Button
                          size="sm"
                          variant={article.newsType === "breaking" ? "destructive" : "outline"}
                          onClick={() => toggleBreakingMutation.mutate({ 
                            id: article.id, 
                            currentState: article.newsType === "breaking"
                          })}
                          disabled={toggleBreakingMutation.isPending}
                          className="h-9 font-medium text-xs sm:text-sm"
                          data-testid={`button-breaking-mobile-${article.id}`}
                        >
                          <Zap className="ml-1.5 h-3.5 w-3.5" />
                          {article.newsType === "breaking" ? "إلغاء العاجل" : "عاجل"}
                        </Button>
                      )}

                      {canSocialPublish && article.status === "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSocialPublishArticle(article)}
                          className="h-9 font-medium text-xs sm:text-sm text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/50"
                          data-testid={`button-social-publish-mobile-${article.id}`}
                        >
                          <Share2 className="ml-1.5 h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                          نشر على X
                        </Button>
                      )}

                      {canPublishArticle && article.status === "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setNotifyArticle(article)}
                          className="h-9 font-medium text-xs sm:text-sm text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                          data-testid={`button-notify-mobile-${article.id}`}
                        >
                          <Bell className="ml-1.5 h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          إرسال إشعار
                        </Button>
                      )}
                    </div>

                    {/* Secondary Action Icons Row */}
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40">
                      <div className="flex items-center gap-1">
                        {canFeatureArticle && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => featureMutation.mutate({ id: article.id, featured: !article.isFeatured })}
                            disabled={featureMutation.isPending}
                            data-testid={`button-feature-mobile-${article.id}`}
                            title={article.isFeatured ? "إلغاء التمييز" : "تمييز"}
                          >
                            <Star className={`h-4 w-4 ${article.isFeatured ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} />
                          </Button>
                        )}
                        
                        {article.status === "published" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => translateMutation.mutate(article.id)}
                            disabled={translateMutation.isPending}
                            data-testid={`button-translate-mobile-${article.id}`}
                            title="ترجم للإنجليزية"
                          >
                            {translateMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                            ) : (
                              <Languages className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            )}
                          </Button>
                        )}

                        {canPublishArticle && article.status === "published" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => resurfaceMutation.mutate(article.id)}
                            disabled={resurfaceMutation.isPending}
                            data-testid={`button-resurface-mobile-${article.id}`}
                            title="إنعاش (عودة لصدارة الموجز)"
                          >
                            {resurfaceMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                            ) : (
                              <HeartPulse className="h-4 w-4 text-rose-500" />
                            )}
                          </Button>
                        )}

                        {activeStatus !== "archived" && article.status !== "archived" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setRevisionArticle(article)}
                            data-testid={`button-revision-mobile-${article.id}`}
                            title="طلب تعديل"
                          >
                            <FilePenLine className="h-4 w-4 text-amber-600" />
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {canArchiveArticle && article.status !== "archived" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setDeletingArticle(article)}
                            data-testid={`button-archive-mobile-${article.id}`}
                            title="أرشفة"
                          >
                            <Archive className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
                        
                        {canDeleteArticle && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setDeletingArticle(article)}
                            data-testid={`button-delete-mobile-${article.id}`}
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-4 border-t mt-4" data-testid="pagination-container">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setListParams(previous => ({ ...previous, page: Math.max(1, previous.page - 1) }))}
                disabled={currentPage === 1 || articlesBusy || articlesLoading}
                data-testid="button-pagination-prev"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                السابق
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground" data-testid="text-pagination-info">
                الصفحة {displayedPage.toLocaleString("en-US")} من {totalPages.toLocaleString("en-US")}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setListParams(previous => ({ ...previous, page: Math.min(totalPages, previous.page + 1) }))}
                disabled={currentPage >= totalPages || totalPages <= 1 || articlesBusy || articlesLoading}
                data-testid="button-pagination-next"
              >
                التالي
                <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            </div>
          )}
        </div>
      </DashboardPageShell>

      {/* Bulk Action Bar - Mobile Only */}
      {selectedArticles.size > 0 && isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg p-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium tabular-nums">
              {selectedArticles.size.toLocaleString("en-US")} مقال محدد
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedArticles(new Set())}
              data-testid="button-clear-selection-mobile"
            >
              إلغاء التحديد
            </Button>
          </div>
          <div className="flex gap-2">
            {activeStatus !== "archived" && (
              <Button
                size="default"
                variant="outline"
                onClick={handleBulkArchive}
                disabled={articlesBusy || bulkArchiveMutation.isPending}
                className="flex-1"
                data-testid="button-bulk-archive-mobile"
              >
                <Archive className="ml-2 h-4 w-4" />
                أرشفة ({selectedArticles.size})
              </Button>
            )}
            {activeStatus === "archived" && (
              <Button
                size="default"
                variant="destructive"
                onClick={handleBulkPermanentDelete}
                className="flex-1"
                disabled={articlesBusy || bulkPermanentDeleteMutation.isPending}
                data-testid="button-bulk-delete-mobile"
              >
                <Trash className="ml-2 h-4 w-4" />
                حذف ({selectedArticles.size})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Archive Confirmation Dialog — captures the reason that's pushed
          back to the author/reporter as a notification body. */}
      <AlertDialog
        open={!!deletingArticle}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingArticle(null);
            setArchiveReason("");
            setArchiveReasonError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>أرشفة — عدم النشر</AlertDialogTitle>
            <AlertDialogDescription>
              يُرسل للكاتب/المراسل: «يؤسفنا إبلاغكم بعدم نشر المقال/الخبر» مع السبب (إشعار + إيميل). هذا قرار نهائي وليس طلب تعديل — استخدم زر «طلب تعديل» إذا أردت إعادة المحتوى للكاتب.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <div className="text-sm font-medium">المقال:</div>
            <div className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
              {deletingArticle?.title}
            </div>
            <label htmlFor="archive-reason" className="text-sm font-medium block pt-2">
              السبب <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="archive-reason"
              data-testid="textarea-archive-reason"
              placeholder="اكتب سبب عدم النشر بوضوح..."
              value={archiveReason}
              onChange={(e) => {
                setArchiveReason(e.target.value);
                if (archiveReasonError) setArchiveReasonError(null);
              }}
              rows={4}
              className="resize-none"
            />
            {archiveReasonError && (
              <p className="text-xs text-destructive">{archiveReasonError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                const trimmed = archiveReason.trim();
                if (trimmed.length < 5) {
                  setArchiveReasonError("اكتب سبباً واضحاً للأرشفة (5 أحرف على الأقل)");
                  return;
                }
                if (deletingArticle) {
                  deleteMutation.mutate({
                    id: deletingArticle.id,
                    reviewNotes: trimmed,
                  });
                }
              }}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "جاري الأرشفة..." : "أرشفة وإرسال الإشعار"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Request revision — returns article to author/reporter as draft */}
      <AlertDialog
        open={!!revisionArticle}
        onOpenChange={(open) => {
          if (!open) {
            setRevisionArticle(null);
            setRevisionNotes("");
            setRevisionNotesError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>طلب تعديل</AlertDialogTitle>
            <AlertDialogDescription>
              يُرسل للكاتب/المراسل: «يؤسفنا إبلاغكم بوجود بعض الملاحظات» مع الملاحظات أدناه.
              يعود المحتوى لمسوداته ويستطيع التعديل ثم الضغط على «إرسال».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <div className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
              {revisionArticle?.title}
            </div>
            <label htmlFor="revision-notes" className="text-sm font-medium block">
              الملاحظات <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="revision-notes"
              data-testid="textarea-revision-notes"
              placeholder="اكتب ملاحظات التحرير التي يحتاج الكاتب/المراسل لمعالجتها..."
              value={revisionNotes}
              onChange={(e) => {
                setRevisionNotes(e.target.value);
                if (revisionNotesError) setRevisionNotesError(null);
              }}
              rows={4}
              className="resize-none"
            />
            {revisionNotesError && (
              <p className="text-xs text-destructive">{revisionNotesError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={requestRevisionMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                const trimmed = revisionNotes.trim();
                if (trimmed.length < 5) {
                  setRevisionNotesError("اكتب ملاحظات واضحة (5 أحرف على الأقل)");
                  return;
                }
                if (revisionArticle) {
                  requestRevisionMutation.mutate({
                    id: revisionArticle.id,
                    reviewNotes: trimmed,
                  });
                }
              }}
              data-testid="button-confirm-revision"
            >
              {requestRevisionMutation.isPending ? "جاري الإرسال..." : "إرسال طلب التعديل"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Archive Confirmation Dialog — captures the reason that's
          pushed to every reporter/author in the batch (in-app + email).
          Backend treats the body field as optional, but we strongly
          prompt for one so colleagues don't get a faceless "تم أرشفة
          المقال" ping. */}
      <AlertDialog
        open={showBulkArchiveDialog}
        onOpenChange={(open) => {
          setShowBulkArchiveDialog(open);
          if (!open) {
            setBulkArchiveReason("");
            setBulkArchiveReasonError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الأرشفة الجماعية</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم أرشفة {selectedArticles.size} مقال. عند الأرشفة، يصل لكل كاتب/مراسل إشعار داخل التطبيق + إيميل بالسبب الذي تكتبه أدناه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="bulk-archive-reason" className="text-sm font-medium block">
              سبب الأرشفة <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="bulk-archive-reason"
              data-testid="textarea-bulk-archive-reason"
              placeholder="مثال: تكرار الموضوع، تجاوز الفترة الزمنية، حملة تحديث محتوى..."
              value={bulkArchiveReason}
              onChange={(e) => {
                setBulkArchiveReason(e.target.value);
                if (bulkArchiveReasonError) setBulkArchiveReasonError(null);
              }}
              rows={4}
              maxLength={1000}
              className="resize-none"
              dir="rtl"
            />
            {bulkArchiveReasonError && (
              <p className="text-xs text-destructive">{bulkArchiveReasonError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-archive">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={articlesBusy || bulkArchiveMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                const trimmed = bulkArchiveReason.trim();
                if (trimmed.length < 5) {
                  setBulkArchiveReasonError("اكتب سبباً واضحاً للأرشفة (5 أحرف على الأقل)");
                  return;
                }
                bulkArchiveMutation.mutate({
                  articleIds: Array.from(selectedArticles),
                  reviewNotes: trimmed,
                });
              }}
              data-testid="button-confirm-bulk-archive"
              className="bg-amber-600 hover:bg-amber-700"
            >
              {bulkArchiveMutation.isPending ? "جاري الأرشفة..." : "أرشفة وإرسال الإشعار"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Permanent Delete Confirmation Dialog — like archive, the
          reason captured here is sent (in-app push + email) to every
          affected reporter/author. Required so colleagues never get a
          faceless "content deleted" notification. */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={(open) => {
          setShowBulkDeleteDialog(open);
          if (!open) {
            setBulkDeleteReason("");
            setBulkDeleteReasonError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف النهائي</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف {selectedArticles.size} مقال نهائياً ولن يمكن استرجاعها.
              يصل لكل كاتب/مراسل إشعار داخل التطبيق + إيميل اعتذاري بالسبب الذي تكتبه أدناه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="bulk-delete-reason" className="text-sm font-medium block">
              سبب الحذف النهائي <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="bulk-delete-reason"
              data-testid="textarea-bulk-delete-reason"
              placeholder="مثال: محتوى غير دقيق، طلب من جهة رسمية، انتهاك سياسة، تكرار نهائي..."
              value={bulkDeleteReason}
              onChange={(e) => {
                setBulkDeleteReason(e.target.value);
                if (bulkDeleteReasonError) setBulkDeleteReasonError(null);
              }}
              rows={4}
              maxLength={1000}
              className="resize-none"
              dir="rtl"
            />
            {bulkDeleteReasonError && (
              <p className="text-xs text-destructive">{bulkDeleteReasonError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={articlesBusy || bulkPermanentDeleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                const trimmed = bulkDeleteReason.trim();
                if (trimmed.length < 5) {
                  setBulkDeleteReasonError("اكتب سبباً واضحاً للحذف النهائي (5 أحرف على الأقل)");
                  return;
                }
                bulkPermanentDeleteMutation.mutate({
                  articleIds: Array.from(selectedArticles),
                  deletionReason: trimmed,
                });
              }}
              data-testid="button-confirm-bulk-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkPermanentDeleteMutation.isPending ? "جاري الحذف..." : "حذف نهائي وإرسال الإشعار"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Classification Results Dialog */}
      <Dialog open={showClassificationDialog} onOpenChange={setShowClassificationDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-classification-results">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              نتائج التصنيف الذكي
            </DialogTitle>
            <DialogDescription>
              تم تحليل المقال بواسطة الذكاء الاصطناعي وتصنيفه تلقائياً
            </DialogDescription>
          </DialogHeader>
          
          {classificationResult && (
            <div className="space-y-4">
              {/* Primary Category */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">التصنيف الأساسي</h3>
                  <Badge variant="default" data-testid="badge-primary-category">
                    {Math.round(classificationResult.primaryCategory.confidence * 100)}% ثقة
                  </Badge>
                </div>
                <p className="text-xl font-bold text-primary mb-2" data-testid="text-primary-category-name">
                  {classificationResult.primaryCategory.categoryName}
                </p>
                <p className="text-sm text-muted-foreground" data-testid="text-primary-reasoning">
                  {classificationResult.primaryCategory.reasoning}
                </p>
              </div>

              {/* Suggested Categories */}
              {classificationResult.suggestedCategories && classificationResult.suggestedCategories.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">تصنيفات مقترحة إضافية</h3>
                  <div className="space-y-3">
                    {classificationResult.suggestedCategories.map((cat: any, index: number) => (
                      <div 
                        key={cat.categoryId} 
                        className="bg-muted/50 border rounded-lg p-3"
                        data-testid={`suggested-category-${index}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium">{cat.categoryName}</p>
                          <Badge variant="secondary">
                            {Math.round(cat.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{cat.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Model Info */}
              <div className="text-xs text-muted-foreground border-t pt-3">
                النموذج المستخدم: {classificationResult.model} ({classificationResult.provider})
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* النشر على X */}
      {socialPublishArticle && (
        <SocialPublishDialog
          articleId={socialPublishArticle.id}
          articleTitle={socialPublishArticle.title}
          open={!!socialPublishArticle}
          onOpenChange={(open) => {
            if (!open) setSocialPublishArticle(null);
          }}
        />
      )}

      {/* إرسال إشعار للمستخدمين - موبايل */}
      <AlertDialog
        open={!!notifyArticle}
        onOpenChange={(open) => {
          if (!open && !isSendingNotification) {
            setNotifyArticle(null);
          }
        }}
      >
        <AlertDialogContent dir="rtl" className="sm:max-w-md w-[95vw] rounded-2xl p-4 sm:p-6">
          <AlertDialogHeader className="text-right space-y-1.5">
            <AlertDialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-600" />
              <span>إرسال إشعار للمستخدمين</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-muted-foreground text-right">
              سيتم إرسال إشعار فوري بهذا الخبر لجميع مستخدمي التطبيق ومتابعي سبق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {notifyArticle && (
            <div className="py-2">
              <div className="p-3 rounded-xl border bg-muted/40 text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                "{notifyArticle.title}"
              </div>
            </div>
          )}
          <AlertDialogFooter className="flex flex-row items-center justify-end gap-2 pt-2 border-t border-border/60">
            <AlertDialogCancel disabled={isSendingNotification} className="text-xs h-9 px-3 mt-0">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (notifyArticle) {
                  handleSendNotification(notifyArticle);
                }
              }}
              disabled={isSendingNotification}
              className="text-xs font-bold h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-confirm-send-notification"
            >
              {isSendingNotification ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5 ml-1.5" />
                  إرسال الإشعار
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
