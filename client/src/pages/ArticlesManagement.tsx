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
import { Edit, Trash2, Send, Star, Bell, Plus, Archive, Trash, GripVertical, Sparkles, Newspaper, Clock, FilePenLine, Brain, PenLine, MessageCircle, Mail, ChevronLeft, ChevronRight, Camera, BarChart3, Images, Building2, Languages, Loader2, Smartphone, Share2, Tag } from "lucide-react";
import { SocialPublishDialog } from "@/components/social/SocialPublishDialog";
import { ViewsCount } from "@/components/ViewsCount";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { BreakingSwitch } from "@/components/admin/BreakingSwitch";
import { RowActions } from "@/components/admin/RowActions";
import { EditorialDraftReviewCue } from "@/components/admin/EditorialDraftReviewCue";
import { isAwaitingContributorRevision, isResubmittedAfterRevision } from "@/lib/articleRevision";
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
  views: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

function SortableRow({
  article,
  children,
  isSaving,
  highlightResubmitted,
}: {
  article: Article;
  children: React.ReactNode;
  isSaving?: boolean;
  highlightResubmitted?: false | "resubmitted" | "awaiting";
}) {
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
    zIndex: isDragging ? 999 : 'auto',
    position: isDragging ? 'relative' as const : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border/80 hover:bg-muted/25 odd:bg-muted/[0.12] ${isDragging ? 'bg-primary/10 shadow-lg' : ''} ${isSaving ? 'opacity-70' : ''} ${highlightResubmitted === 'resubmitted' ? 'bg-amber-50/80 dark:bg-muted/60 border-r-4 border-r-amber-500' : ''} ${highlightResubmitted === 'awaiting' ? 'bg-orange-50/80 dark:bg-muted/60 border-r-4 border-r-orange-500' : ''}`}
      data-testid={`row-article-${article.id}`}
    >
      <td 
        className="hidden md:table-cell py-3 px-2 text-center cursor-grab active:cursor-grabbing touch-none select-none" 
        {...attributes} 
        {...listeners}
      >
        <GripVertical 
          className={`h-4 w-4 mx-auto ${isDragging ? 'text-primary' : 'text-muted-foreground'} ${isSaving ? 'animate-pulse' : ''}`} 
          data-testid={`drag-handle-${article.id}`} 
        />
      </td>
      {children}
    </tr>
  );
}

const TYPE_CHIP: Record<string, { label: string; className: string; icon?: typeof Camera }> = {
  news: {
    label: "خبر",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  opinion: {
    label: "رأي",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  analysis: {
    label: "تحليل",
    className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  },
  column: {
    label: "عمود",
    className: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  },
  weekly_photos: {
    label: "صور",
    className: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    icon: Camera,
  },
  infographic: {
    label: "إنفوجرافيك",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
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
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionNotesError, setRevisionNotesError] = useState<string | null>(null);
  // Reason captured in the archive dialog. Required by the backend
  // (`PATCH /api/admin/articles/:id` with status='archived'), and used as
  // the editorial-notification body for the author/reporter.
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveReasonError, setArchiveReasonError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState<"published" | "scheduled" | "draft" | "archived">("published");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  
  // State for bulk selection
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState("");
  const [bulkDeleteReasonError, setBulkDeleteReasonError] = useState<string | null>(null);
  const [showBulkArchiveDialog, setShowBulkArchiveDialog] = useState(false);
  const [bulkArchiveReason, setBulkArchiveReason] = useState("");
  const [bulkArchiveReasonError, setBulkArchiveReasonError] = useState<string | null>(null);

  // State for drag and drop
  const [localArticles, setLocalArticles] = useState<Article[]>([]);

  // State for AI classification
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [showClassificationDialog, setShowClassificationDialog] = useState(false);

  // State for mobile detection
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  // Mobile detection effect
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    queryKey: ["/api/admin/articles/metrics"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/admin/articles/metrics"), { credentials: "include" });
      if (!response.ok) {
        console.error("Metrics fetch failed:", response.status, response.statusText);
        throw new Error("Failed to fetch metrics");
      }
      const data = await response.json();
      return data;
    },
    enabled: !!user,
  });

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeStatus, typeFilter, categoryFilter]);

  // Fetch articles with filters and pagination
  const { data: articlesData, isLoading: articlesLoading } = useQuery<{
    articles: Article[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    queryKey: ["/api/admin/articles", searchTerm, activeStatus, typeFilter, categoryFilter, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (activeStatus) params.append("status", activeStatus);
      if (typeFilter && typeFilter !== "all") params.append("articleType", typeFilter);
      if (categoryFilter && categoryFilter !== "all") params.append("categoryId", categoryFilter);
      params.append("page", currentPage.toString());
      params.append("limit", "30");
      
      const url = `/api/admin/articles?${params.toString()}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Failed to fetch articles: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user,
  });

  const articles = useMemo(() => articlesData?.articles || [], [articlesData?.articles]);
  const totalPages = articlesData?.totalPages || 1;

  // Fetch categories for filter
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Update local articles when articles change
  useEffect(() => {
    if (articlesData?.articles) {
      setLocalArticles(articlesData.articles);
    }
  }, [articlesData?.articles]);

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
      const queryKey = ["/api/admin/articles", searchTerm, activeStatus, typeFilter, categoryFilter];
      
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/articles"] });
      
      // Snapshot the previous value with its query key
      const previousArticles = queryClient.getQueryData(queryKey);
      
      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old: Article[] | undefined) => {
        if (!old) return old;
        return old.map(article => 
          article.id === id 
            ? { ...article, newsType: currentState ? "regular" : "breaking" }
            : article
        );
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
      const previousData = queryClient.getQueryData<{ articles: Article[]; total: number; page: number; limit: number; totalPages: number }>(data.queryKey);
      const previousLocalArticles = [...localArticles];

      // Optimistically update the cache, preserving the paginated response shape
      if (previousData) {
        queryClient.setQueryData(data.queryKey, { ...previousData, articles: [...data.newOrderedArticles] });
      }

      return { previousData, previousLocalArticles, queryKey: data.queryKey };
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
      if (context?.previousLocalArticles) {
        setLocalArticles([...context.previousLocalArticles]);
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

  // Selection handlers
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
    if (selectedArticles.size === articles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(articles.map(a => a.id)));
    }
  };

  const handleBulkArchive = () => {
    if (selectedArticles.size === 0) return;
    setBulkArchiveReason("");
    setBulkArchiveReasonError(null);
    setShowBulkArchiveDialog(true);
  };

  const handleBulkPermanentDelete = () => {
    if (selectedArticles.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const handleEdit = (article: Article) => {
    setLocation(`/dashboard/articles/${article.id}`);
  };

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = localArticles.findIndex((article) => article.id === active.id);
    const newIndex = localArticles.findIndex((article) => article.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Create a new array with the reordered items
    const newArticles = arrayMove([...localArticles], oldIndex, newIndex);
    setLocalArticles(newArticles);

    // Generate unique descending displayOrder values using high-precision timestamp
    // Each article gets a unique value: baseTimestamp * 1000 - (index * 1000) ensures no collisions
    const baseTimestamp = Date.now();
    const articleOrders = newArticles.map((article, index) => ({
      id: article.id,
      displayOrder: Math.floor((baseTimestamp - index * 1000) / 1000),
    }));

    // Build the current query key at call time to avoid stale closures
    const currentQueryKey = ["/api/admin/articles", searchTerm, activeStatus, typeFilter, categoryFilter, currentPage];

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
    try {
      return new Date(date).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  };

  const formatScheduledDate = formatArticleDate;
  const formatDraftDate = formatArticleDate;
  const formatPublishedDate = formatArticleDate;

  const getTypeBadge = (type: string) => {
    const meta = TYPE_CHIP[type] ?? { label: type, className: "bg-muted text-muted-foreground" };
    const Icon = meta.icon;
    return (
      <Badge
        className={cn(
          "gap-1 border-0 px-2 py-0.5 text-xs font-semibold",
          meta.className,
        )}
      >
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {meta.label}
      </Badge>
    );
  };

  const getCategoryChip = (nameAr?: string | null) => {
    if (!nameAr) return null;
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground/80">
        <Tag className="h-3 w-3 text-muted-foreground" />
        {nameAr}
      </span>
    );
  };

  const getSourceBadge = (source?: string) => {
    const badges = {
      manual: (
        <Badge variant="outline" className="gap-1 border-blue-200/80 bg-blue-50/80 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300" data-testid="badge-source-manual">
          <PenLine className="h-3 w-3" />
          المحرر
        </Badge>
      ),
      whatsapp: (
        <Badge variant="outline" className="gap-1 border-green-200/80 bg-green-50/80 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300" data-testid="badge-source-whatsapp">
          <MessageCircle className="h-3 w-3" />
          واتساب
        </Badge>
      ),
      email: (
        <Badge variant="outline" className="gap-1 border-purple-200/80 bg-purple-50/80 text-xs font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300" data-testid="badge-source-email">
          <Mail className="h-3 w-3" />
          البريد الذكي
        </Badge>
      ),
      "ios-app": (
        <Badge variant="outline" className="gap-1 border-slate-300/80 bg-slate-100/80 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200" data-testid="badge-source-ios">
          <Smartphone className="h-3 w-3" />
          تطبيق iOS
        </Badge>
      ),
      "android-app": (
        <Badge variant="outline" className="gap-1 border-emerald-200/80 bg-emerald-50/80 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" data-testid="badge-source-android">
          <Smartphone className="h-3 w-3" />
          تطبيق Android
        </Badge>
      ),
    };
    return badges[(source || "manual") as keyof typeof badges] || badges.manual;
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="rounded-xl border-border/60 shadow-none">
                <CardContent className="p-3">
                  <Skeleton className="mb-2 h-3.5 w-14" />
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : metrics ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="تصفية حسب الحالة">
            {([
              {
                key: "published" as const,
                label: "منشورة",
                value: metrics.published,
                Icon: Newspaper,
                idle: "border-emerald-200/70 bg-emerald-50/40 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100",
                active: "border-emerald-700 bg-emerald-700 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-600",
                iconIdle: "bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                iconActive: "bg-white/20 text-white",
                testId: "card-stat-published",
              },
              {
                key: "scheduled" as const,
                label: "مجدولة",
                value: metrics.scheduled,
                Icon: Clock,
                idle: "border-sky-200/70 bg-sky-50/40 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100",
                active: "border-sky-700 bg-sky-700 text-white shadow-sm dark:border-sky-500 dark:bg-sky-600",
                iconIdle: "bg-sky-100/90 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
                iconActive: "bg-white/20 text-white",
                testId: "card-stat-scheduled",
              },
              {
                key: "draft" as const,
                label: "مسودة",
                value: metrics.draft,
                Icon: FilePenLine,
                idle: "border-amber-200/70 bg-amber-50/40 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100",
                active: "border-amber-700 bg-amber-700 text-white shadow-sm dark:border-amber-500 dark:bg-amber-600",
                iconIdle: "bg-amber-100/90 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
                iconActive: "bg-white/20 text-white",
                testId: "card-stat-draft",
              },
              {
                key: "archived" as const,
                label: "مؤرشفة",
                value: metrics.archived,
                Icon: Archive,
                idle: "border-rose-200/70 bg-rose-50/40 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-100",
                active: "border-rose-800 bg-rose-800 text-white shadow-sm dark:border-rose-500 dark:bg-rose-700",
                iconIdle: "bg-rose-100/90 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
                iconActive: "bg-white/20 text-white",
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
                  onClick={() => setActiveStatus(card.key)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-start transition-colors",
                    isActive ? card.active : card.idle,
                  )}
                  data-testid={card.testId}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{card.label}</span>
                    <span className={cn("rounded-lg p-1.5", isActive ? card.iconActive : card.iconIdle)}>
                      <card.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight leading-none">
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
              <Select value={typeFilter} onValueChange={setTypeFilter}>
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

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
                  setTypeFilter("all");
                  setCategoryFilter("all");
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
                  : `${articlesTotal.toLocaleString("en-US")} نتيجة · الصفحة ${currentPage.toLocaleString("en-US")}`}
              </p>
            </div>
          </div>

          {/* Bulk Actions Toolbar */}
          {selectedArticles.size > 0 && (
            <div className="rounded-2xl border border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card p-3 shadow-sm dark:border-sky-900/35 dark:from-sky-950/15 md:p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground tabular-nums">
                  تم تحديد {selectedArticles.size.toLocaleString("en-US")} مقال
                </div>
                <div className="flex items-center gap-2">
                  {activeStatus !== "archived" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkArchive}
                      disabled={bulkArchiveMutation.isPending}
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
                      disabled={bulkPermanentDeleteMutation.isPending}
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
          <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-card shadow-none md:block">
            {articlesLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                جاري التحميل...
              </div>
            ) : localArticles.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                لا توجد مقالات
              </div>
            ) : (
              <DndContext
                sensors={isMobile ? [] : sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <table className="w-full table-fixed">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className="w-9 px-1 py-3 text-center" data-testid="header-drag"></th>
                      <th className="w-11 px-2 py-3 text-center">
                        <Checkbox
                          checked={localArticles.length > 0 && selectedArticles.size === localArticles.length}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="px-3 py-3 text-right text-sm font-semibold">الخبر</th>
                      <th className="w-[72px] px-2 py-3 text-center text-sm font-semibold">عاجل</th>
                      <th className="w-[88px] px-2 py-3 text-center text-sm font-semibold">المشاهدات</th>
                      <th className="w-[300px] px-2 py-3 text-center text-sm font-semibold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext
                      items={localArticles.map((a) => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localArticles.map((article) => (
                        <SortableRow
                          key={article.id}
                          article={article}
                          isSaving={updateOrderMutation.isPending}
                          highlightResubmitted={
                            isResubmittedAfterRevision(article)
                              ? "resubmitted"
                              : isAwaitingContributorRevision(article)
                                ? "awaiting"
                                : false
                          }
                        >
                          <td className="px-2 py-3.5 text-center align-top">
                            <Checkbox
                              checked={selectedArticles.has(article.id)}
                              onCheckedChange={() => toggleArticleSelection(article.id)}
                              data-testid={`checkbox-article-${article.id}`}
                            />
                          </td>
                          <td className="min-w-0 px-3 py-3.5 align-top">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                {((article as any).albumImages?.length > 0 ||
                                  (article as any).mediaAssetsCount > 0) && (
                                  <Images className="h-4 w-4 shrink-0 text-sky-500" />
                                )}
                                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <h3
                                    title={article.title}
                                    className="min-w-0 truncate text-[15px] font-bold leading-snug tracking-tight text-foreground sm:text-base"
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

                              <div className="flex flex-wrap items-center gap-1.5">
                                {getTypeBadge(article.articleType || "news")}
                                {getCategoryChip(article.category?.nameAr)}
                                {getSourceBadge(article.source)}
                                {(article.isAiGeneratedThumbnail ||
                                  (article as any).isAiGeneratedImage) && (
                                  <span
                                    className="inline-flex items-center"
                                    title="صورة مولدة بالذكاء الاصطناعي"
                                    data-testid={`badge-ai-image-${article.id}`}
                                  >
                                    <Brain className="h-4 w-4 text-purple-500" />
                                  </span>
                                )}
                              </div>

                              <EditorialDraftReviewCue
                                article={article}
                                layout="banner"
                                testId={`banner-review-desktop-${article.id}`}
                              />

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                                  {article.source === "email" ? (
                                    <>
                                      <Mail className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        أُرسل بواسطة:{" "}
                                        {article.sourceMetadata?.senderName ||
                                          article.sourceMetadata?.from ||
                                          "بريد إلكتروني"}
                                      </span>
                                    </>
                                  ) : article.source === "whatsapp" ? (
                                    <>
                                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        أُرسل بواسطة:{" "}
                                        {article.sourceMetadata?.senderName ||
                                          article.sourceMetadata?.from ||
                                          "واتساب"}
                                      </span>
                                    </>
                                  ) : isMobileAppSource(article.source) ? (
                                    <>
                                      <Smartphone className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        أُرسل من {getMobilePlatformLabel(article.source)}:{" "}
                                        {getMobileSenderName(article)}
                                      </span>
                                    </>
                                  ) : (article as any).publisher?.companyName ? (
                                    <>
                                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        أُرسل بواسطة: {(article as any).publisher.companyName}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <PenLine className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        نُشر بواسطة:{" "}
                                        {article.author?.firstName && article.author?.lastName
                                          ? `${article.author.firstName} ${article.author.lastName}`
                                          : article.author?.firstName ||
                                            article.author?.email ||
                                            "المحرر"}
                                      </span>
                                    </>
                                  )}
                                </span>
                                {article.status === "scheduled" && (article as any).scheduledAt && (
                                  <span
                                    className="inline-flex items-center gap-1 text-green-700 dark:text-green-300"
                                    data-testid={`scheduled-label-desktop-${article.id}`}
                                  >
                                    <Clock className="h-3.5 w-3.5 shrink-0" />
                                    {formatScheduledDate((article as any).scheduledAt)}
                                  </span>
                                )}
                                {article.status === "draft" && article.createdAt && (
                                  <span
                                    className="inline-flex items-center gap-1 text-green-700 dark:text-green-300"
                                    data-testid={`draft-date-desktop-${article.id}`}
                                  >
                                    <Clock className="h-3.5 w-3.5 shrink-0" />
                                    {formatDraftDate(article.createdAt)}
                                  </span>
                                )}
                                {article.status === "published" && article.publishedAt && (
                                  <span
                                    className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"
                                    data-testid={`published-date-desktop-${article.id}`}
                                  >
                                    <Clock className="h-3.5 w-3.5 shrink-0" />
                                    <span dir="ltr" className="font-medium tabular-nums">
                                      {formatPublishedDate(article.publishedAt)}
                                    </span>
                                  </span>
                                )}
                              </div>

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
                          <td className="px-2 py-3.5 text-center align-top">
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
                          <td className="px-2 py-3.5 text-center align-top">
                            <ViewsCount views={article.views} iconClassName="h-4 w-4" />
                          </td>
                          <td className="px-2 py-3.5 align-top">
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

          {/* Articles Cards - Mobile View */}
          <div className="md:hidden space-y-2">
            {articlesLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                جاري التحميل...
              </div>
            ) : articles.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                لا توجد مقالات
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
                  <div className="flex items-start gap-2">
                    <Checkbox 
                      className="mt-0.5"
                      checked={selectedArticles.has(article.id)}
                      onCheckedChange={() => toggleArticleSelection(article.id)}
                      data-testid={`checkbox-article-mobile-${article.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base break-words leading-snug flex items-center gap-1.5 flex-wrap">
                            {((article as any).albumImages?.length > 0 || (article as any).mediaAssetsCount > 0) && (
                              <Images className="h-4 w-4 text-blue-500 flex-shrink-0" />
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
                          <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                            {article.source === 'email' ? (
                              <>
                                <Mail className="h-3 w-3" />
                                <span>أُرسل بواسطة: {article.sourceMetadata?.senderName || article.sourceMetadata?.from || 'بريد إلكتروني'}</span>
                              </>
                            ) : article.source === 'whatsapp' ? (
                              <>
                                <MessageCircle className="h-3 w-3" />
                                <span>أُرسل بواسطة: {article.sourceMetadata?.senderName || article.sourceMetadata?.from || 'واتساب'}</span>
                              </>
                            ) : isMobileAppSource(article.source) ? (
                              <>
                                <Smartphone className="h-3 w-3" />
                                <span>أُرسل من {getMobilePlatformLabel(article.source)}: {getMobileSenderName(article)}</span>
                              </>
                            ) : (article as any).publisher?.companyName ? (
                              <>
                                <Building2 className="h-3 w-3" />
                                <span>أُرسل بواسطة: {(article as any).publisher.companyName}</span>
                              </>
                            ) : (
                              <>
                                <PenLine className="h-3 w-3" />
                                <span>نُشر بواسطة: {article.author?.firstName && article.author?.lastName 
                                  ? `${article.author.firstName} ${article.author.lastName}` 
                                  : article.author?.firstName || article.author?.email || 'المحرر'}</span>
                              </>
                            )}
                          </div>
                          {article.status === "scheduled" && (article as any).scheduledAt && (
                            <div className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1 mt-1" data-testid={`scheduled-label-${article.id}`}>
                              <Clock className="h-3 w-3" />
                              <span>تمت الجدولة في: {formatScheduledDate((article as any).scheduledAt)}</span>
                            </div>
                          )}
                          {article.status === "draft" && article.createdAt && (
                            <div className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1 mt-1" data-testid={`draft-date-${article.id}`}>
                              <Clock className="h-3 w-3" />
                              <span>أُرسلت بتاريخ: {formatDraftDate(article.createdAt)}</span>
                            </div>
                          )}
                          {article.status === "published" && article.publishedAt && (
                            <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1" data-testid={`published-date-${article.id}`}>
                              <Clock className="h-3 w-3" />
                              <span dir="ltr" className="font-medium">{formatPublishedDate(article.publishedAt)}</span>
                            </div>
                          )}
                          {article.status === "archived" && (article as any).reviewNotes && (
                            <div
                              className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1 mt-1"
                              data-testid={`archive-reason-${article.id}`}
                            >
                              <Archive className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              <span>
                                <span className="font-semibold">سبب الأرشفة:</span>{" "}
                                {(article as any).reviewNotes}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {getTypeBadge(article.articleType || "news")}
                        {getCategoryChip(article.category?.nameAr)}
                        {getSourceBadge(article.source)}
                      </div>
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
                  <div className="flex gap-2 pt-2 border-t">
                    {canEditArticle(article) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(article)}
                        className="flex-1"
                        data-testid={`button-edit-mobile-${article.id}`}
                      >
                        <Edit className="ml-2 h-3.5 w-3.5" />
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
                        className="flex-1"
                        data-testid={`button-breaking-mobile-${article.id}`}
                      >
                        <Bell className="ml-2 h-3.5 w-3.5" />
                        {article.newsType === "breaking" ? "إلغاء العاجل" : "عاجل"}
                      </Button>
                    )}
                    
                    {canFeatureArticle && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => featureMutation.mutate({ id: article.id, featured: !article.isFeatured })}
                        disabled={featureMutation.isPending}
                        data-testid={`button-feature-mobile-${article.id}`}
                      >
                        <Star className={`h-4 w-4 ${article.isFeatured ? 'text-yellow-500 fill-yellow-500' : ''}`} />
                      </Button>
                    )}
                    
                    {article.status === "published" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => translateMutation.mutate(article.id)}
                        disabled={translateMutation.isPending}
                        data-testid={`button-translate-mobile-${article.id}`}
                        title="ترجم للإنجليزية"
                      >
                        {translateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                        ) : (
                          <Languages className="h-4 w-4 text-emerald-500" />
                        )}
                      </Button>
                    )}
                    {canSocialPublish && article.status === "published" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setSocialPublishArticle(article)}
                        data-testid={`button-social-publish-mobile-${article.id}`}
                        title="النشر على X"
                      >
                        <Share2 className="h-4 w-4 text-sky-600" />
                      </Button>
                    )}
                    {canArchiveArticle && article.status !== "archived" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        // Route through the same confirmation dialog as the
                        // desktop trash button so the editor is forced to
                        // capture an archive reason. The previous direct
                        // POST to `/archive` was silent — the author got
                        // zero feedback when their content disappeared.
                        onClick={() => setDeletingArticle(article)}
                        data-testid={`button-archive-mobile-${article.id}`}
                        title="أرشفة"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                    {canDeleteArticle && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeletingArticle(article)}
                        data-testid={`button-delete-mobile-${article.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-4 border-t mt-4" data-testid="pagination-container">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || articlesLoading}
                data-testid="button-pagination-prev"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                السابق
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground" data-testid="text-pagination-info">
                الصفحة {currentPage.toLocaleString("en-US")} من {totalPages.toLocaleString("en-US")}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || totalPages <= 1 || articlesLoading}
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
      {selectedArticles.size > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg p-3 z-50">
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
                disabled={bulkArchiveMutation.isPending}
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
                onClick={() => setShowBulkDeleteDialog(true)}
                className="flex-1"
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
              disabled={bulkArchiveMutation.isPending}
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
              disabled={bulkPermanentDeleteMutation.isPending}
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
    </DashboardLayout>
  );
}
