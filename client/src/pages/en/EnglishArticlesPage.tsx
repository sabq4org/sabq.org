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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Edit, Trash2, Send, Star, Bell, Plus, Archive, Trash, GripVertical } from "lucide-react";
import { ViewsCount } from "@/components/ViewsCount";
import { EnglishDashboardLayout } from "@/components/en/EnglishDashboardLayout";
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
  articleType: string;
  newsType: string;
  isFeatured: boolean;
  views: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: string;
    nameAr: string;
    nameEn: string;
  } | null;
  author?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    firstNameEn: string | null;
    lastNameEn: string | null;
    email: string;
    profileImageUrl: string | null;
  } | null;
};

type Category = {
  id: string;
  nameAr: string;
  nameEn: string;
};

function SortableRow({ article, children }: { article: Article; children: React.ReactNode }) {
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
      data-testid={`row-en-article-${article.id}`}
    >
      <td className="py-3 px-2 text-center cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 mx-auto text-muted-foreground" data-testid={`drag-handle-en-${article.id}`} />
      </td>
      {children}
    </tr>
  );
}

export default function EnglishArticlesPage() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // State for dialogs and filters
  const [deletingArticle, setDeletingArticle] = useState<Article | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState<"published" | "scheduled" | "draft" | "archived">("published");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // State for bulk selection
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // State for drag and drop
  const [localArticles, setLocalArticles] = useState<Article[]>([]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ["/api/en/dashboard/articles/metrics"],
    queryFn: async () => {
      const response = await fetch("/api/en/dashboard/articles/metrics", { credentials: "include" });
      if (!response.ok) {
        console.error("Metrics fetch failed:", response.status, response.statusText);
        throw new Error("Failed to fetch metrics");
      }
      const data = await response.json();
      console.log("English metrics loaded:", data);
      return data;
    },
    enabled: !!user,
  });

  // Fetch articles with filters
  const { data: articlesRaw, isLoading: articlesLoading } = useQuery<Article[]>({
    queryKey: ["/api/en/dashboard/articles", searchTerm, activeStatus, typeFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (activeStatus) params.append("status", activeStatus);
      if (typeFilter && typeFilter !== "all") params.append("articleType", typeFilter);
      if (categoryFilter && categoryFilter !== "all") params.append("categoryId", categoryFilter);
      
      const url = `/api/en/dashboard/articles${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Failed to fetch articles: ${response.statusText}`);
      }
      const data = await response.json();
      // API returns { articles: [...], total, page, limit, totalPages }
      return data.articles || data;
    },
    enabled: !!user,
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  // Fetch categories for filter
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Update local articles when articles change
  useEffect(() => {
    setLocalArticles(articles);
  }, [articles]);

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/en/dashboard/articles/${id}/publish`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles"] });
      toast({
        title: "Published",
        description: "Article published successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to publish article",
        variant: "destructive",
      });
    },
  });

  // Feature mutation
  const featureMutation = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      return await apiRequest(`/api/en/dashboard/articles/${id}/feature`, {
        method: "POST",
        body: JSON.stringify({ featured }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles"] });
      toast({
        title: "Updated",
        description: "Feature status updated successfully",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/en/dashboard/articles/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles"] });
      setDeletingArticle(null);
      toast({
        title: "Archived",
        description: "Article archived successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to archive article",
        variant: "destructive",
      });
    },
  });

  // Resend notifications mutation
  const resendNotificationsMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/en/dashboard/articles/${id}/resend-notification`, {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "✅ Notifications Sent",
        description: data.message || "Notifications sent successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send notifications",
        variant: "destructive",
      });
    },
  });

  // Toggle breaking news mutation
  const toggleBreakingMutation = useMutation({
    mutationFn: async ({ id, currentState }: { id: string; currentState: boolean }) => {
      return await apiRequest(`/api/en/dashboard/articles/${id}/toggle-breaking`, {
        method: "POST",
      });
    },
    onMutate: async ({ id, currentState }) => {
      const queryKey = ["/api/en/dashboard/articles", searchTerm, activeStatus, typeFilter, categoryFilter];
      
      await queryClient.cancelQueries({ queryKey: ["/api/en/dashboard/articles"] });
      
      const previousArticles = queryClient.getQueryData(queryKey);
      
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
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles"] });
      const isNowBreaking = !currentState;
      toast({
        title: isNowBreaking ? "Marked as Breaking News" : "Unmarked as Breaking News",
        description: isNowBreaking 
          ? "Article marked as breaking news successfully"
          : "Article unmarked as breaking news successfully",
      });
    },
    onError: (error: any, variables, context) => {
      if (context?.previousArticles && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousArticles);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update breaking news status",
        variant: "destructive",
      });
    },
  });

  // Bulk archive mutation
  const bulkArchiveMutation = useMutation({
    mutationFn: async (articleIds: string[]) => {
      return await apiRequest("/api/en/dashboard/articles/bulk-archive", {
        method: "POST",
        body: JSON.stringify({ articleIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles/metrics"] });
      setSelectedArticles(new Set());
      toast({
        title: "Archived",
        description: "Selected articles archived successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to archive articles",
        variant: "destructive",
      });
    },
  });

  // Bulk permanent delete mutation
  const bulkPermanentDeleteMutation = useMutation({
    mutationFn: async (articleIds: string[]) => {
      return await apiRequest("/api/en/dashboard/articles/bulk-delete-permanent", {
        method: "POST",
        body: JSON.stringify({ articleIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles/metrics"] });
      setSelectedArticles(new Set());
      setShowBulkDeleteDialog(false);
      toast({
        title: "Deleted",
        description: "Selected articles permanently deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete articles",
        variant: "destructive",
      });
    },
  });

  // Update articles order mutation
  const updateOrderMutation = useMutation({
    mutationFn: async (articleOrders: Array<{ id: string; displayOrder: number }>) => {
      return await apiRequest("/api/en/dashboard/articles/update-order", {
        method: "POST",
        body: JSON.stringify({ articleOrders }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["/api/en/dashboard/articles"] });
      await queryClient.refetchQueries({ queryKey: ["/api/en/dashboard/articles"] });
      toast({
        title: "Updated",
        description: "Articles order updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive",
      });
      setLocalArticles(articles);
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
    bulkArchiveMutation.mutate(Array.from(selectedArticles));
  };

  const handleBulkPermanentDelete = () => {
    if (selectedArticles.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const handleEdit = (article: Article) => {
    setLocation(`/en/dashboard/articles/${article.id}/edit`);
  };

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = localArticles.findIndex((article) => article.id === active.id);
    const newIndex = localArticles.findIndex((article) => article.id === over.id);

    const newArticles = arrayMove(localArticles, oldIndex, newIndex);
    setLocalArticles(newArticles);

    const articleOrders = newArticles.map((article, index) => ({
      id: article.id,
      displayOrder: newArticles.length - index,
    }));

    updateOrderMutation.mutate(articleOrders);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: <Badge variant="secondary" data-testid="badge-en-draft">Draft</Badge>,
      scheduled: <Badge variant="outline" data-testid="badge-en-scheduled">Scheduled</Badge>,
      published: <Badge variant="default" data-testid="badge-en-published">Published</Badge>,
      archived: <Badge variant="destructive" data-testid="badge-en-archived">Archived</Badge>,
    };
    return badges[status as keyof typeof badges] || <Badge>{status}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const badges = {
      news: <Badge variant="secondary">News</Badge>,
      opinion: <Badge variant="outline">Opinion</Badge>,
      analysis: <Badge variant="default">Analysis</Badge>,
      column: <Badge variant="default">Column</Badge>,
    };
    return badges[type as keyof typeof badges] || <Badge>{type}</Badge>;
  };

  const StatusCards = ({ 
    metrics, 
    activeStatus, 
    onSelect 
  }: { 
    metrics: any; 
    activeStatus: string; 
    onSelect: (status: "published" | "scheduled" | "draft" | "archived") => void 
  }) => {
    const cards = [
      { status: "published" as const, label: "Published", count: metrics.published || 0 },
      { status: "scheduled" as const, label: "Scheduled", count: metrics.scheduled || 0 },
      { status: "draft" as const, label: "Draft", count: metrics.draft || 0 },
      { status: "archived" as const, label: "Archived", count: metrics.archived || 0 },
    ];

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {cards.map(({ status, label, count }) => (
          <button
            key={status}
            onClick={() => onSelect(status)}
            className={`p-3 md:p-4 rounded-lg border transition-colors hover-elevate ${
              activeStatus === status
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border"
            }`}
            data-testid={`status-card-en-${status}`}
          >
            <div className="text-xl md:text-2xl font-bold">{count}</div>
            <div className="text-xs md:text-sm">{label}</div>
          </button>
        ))}
      </div>
    );
  };

  const BreakingSwitch = ({ 
    articleId, 
    initialValue 
  }: { 
    articleId: string; 
    initialValue: boolean 
  }) => {
    return (
      <button
        onClick={() => toggleBreakingMutation.mutate({ id: articleId, currentState: initialValue })}
        disabled={toggleBreakingMutation.isPending}
        className={`px-2 py-1 rounded text-xs font-medium ${
          initialValue
            ? "bg-destructive text-destructive-foreground"
            : "bg-muted text-muted-foreground"
        }`}
        data-testid={`breaking-switch-en-${articleId}`}
      >
        {initialValue ? "Breaking" : "Regular"}
      </button>
    );
  };

  const RowActions = ({ 
    articleId, 
    status, 
    onEdit, 
    isFeatured, 
    onDelete 
  }: { 
    articleId: string; 
    status: string; 
    onEdit: () => void; 
    isFeatured: boolean; 
    onDelete: () => void 
  }) => {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          data-testid={`button-edit-en-${articleId}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => featureMutation.mutate({ id: articleId, featured: !isFeatured })}
          disabled={featureMutation.isPending}
          data-testid={`button-feature-en-${articleId}`}
        >
          <Star className={`h-4 w-4 ${isFeatured ? 'text-yellow-500 fill-yellow-500' : ''}`} />
        </Button>
        {status === "draft" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => publishMutation.mutate(articleId)}
            disabled={publishMutation.isPending}
            data-testid={`button-publish-en-${articleId}`}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          data-testid={`button-delete-en-${articleId}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <EnglishDashboardLayout>
      <div className="space-y-4 md:space-y-6 p-3 md:p-0" dir="ltr">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold" data-testid="heading-en-title">
              News & Articles Management
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Manage news content and articles
            </p>
          </div>
          <Button
            onClick={() => setLocation("/en/dashboard/articles/new")}
            className="gap-2 w-full sm:w-auto"
            size="sm"
            data-testid="button-create-en-article"
          >
            <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
            New Article
          </Button>
        </div>

        {/* Status Cards */}
        {metricsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : metrics ? (
          <StatusCards
            metrics={metrics}
            activeStatus={activeStatus}
            onSelect={setActiveStatus}
          />
        ) : (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            Error loading metrics: {metricsError?.message || "Unknown"}
          </div>
        )}

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-3 md:p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div>
              <Input
                placeholder="Search by title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 md:h-10 text-sm"
                data-testid="input-en-search"
              />
            </div>

            <div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-en-type-filter" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="news">News</SelectItem>
                  <SelectItem value="opinion">Opinion</SelectItem>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="column">Column</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger data-testid="select-en-category-filter" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedArticles.size > 0 && (
          <div className="bg-card rounded-lg border border-border p-3 md:p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {selectedArticles.size} article{selectedArticles.size > 1 ? 's' : ''} selected
              </div>
              <div className="flex items-center gap-2">
                {activeStatus !== "archived" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkArchive}
                    disabled={bulkArchiveMutation.isPending}
                    data-testid="button-bulk-archive-en"
                    className="gap-2"
                  >
                    <Archive className="h-4 w-4" />
                    Archive Selected
                  </Button>
                )}
                {activeStatus === "archived" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkPermanentDelete}
                    disabled={bulkPermanentDeleteMutation.isPending}
                    data-testid="button-bulk-delete-permanent-en"
                    className="gap-2"
                  >
                    <Trash className="h-4 w-4" />
                    Delete Permanently
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedArticles(new Set())}
                  data-testid="button-clear-selection-en"
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Articles Table - Desktop View */}
        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          {articlesLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : localArticles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No articles found
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
                      <th className="text-center py-3 px-2 w-10" data-testid="header-en-drag"></th>
                      <th className="text-center py-3 px-4 w-12">
                        <Checkbox
                          checked={localArticles.length > 0 && selectedArticles.size === localArticles.length}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all-en"
                        />
                      </th>
                      <th className="text-left py-3 px-4 font-medium">Title</th>
                      <th className="text-left py-3 px-4 font-medium">Type</th>
                      <th className="text-left py-3 px-4 font-medium">Author</th>
                      <th className="text-left py-3 px-4 font-medium">Category</th>
                      <th className="text-left py-3 px-4 font-medium">Breaking</th>
                      <th className="text-left py-3 px-4 font-medium">Views</th>
                      <th className="text-left py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext
                      items={localArticles.map(a => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localArticles.map((article) => (
                        <SortableRow key={article.id} article={article}>
                          <td className="py-3 px-4 text-center">
                            <Checkbox
                              checked={selectedArticles.has(article.id)}
                              onCheckedChange={() => toggleArticleSelection(article.id)}
                              data-testid={`checkbox-en-article-${article.id}`}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium max-w-md truncate inline-block">{article.title}</span>
                          </td>
                          <td className="py-3 px-4">
                            {getTypeBadge(article.articleType || "news")}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={article.author?.profileImageUrl || ""} />
                                <AvatarFallback className="text-xs">
                                  {(article.author?.firstNameEn || article.author?.firstName)?.[0] || article.author?.email?.[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">
                                {article.author?.firstNameEn && article.author?.lastNameEn
                                  ? `${article.author.firstNameEn} ${article.author.lastNameEn}`
                                  : article.author?.firstName || article.author?.email}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm">{article.category?.nameEn || "-"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <BreakingSwitch 
                              articleId={article.id}
                              initialValue={article.newsType === "breaking"}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <ViewsCount 
                              views={article.views}
                              iconClassName="h-4 w-4"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <RowActions 
                              articleId={article.id}
                              status={article.status}
                              onEdit={() => handleEdit(article)}
                              isFeatured={article.isFeatured}
                              onDelete={() => setDeletingArticle(article)}
                            />
                          </td>
                        </SortableRow>
                      ))}
                    </SortableContext>
                  </tbody>
                </table>
              </DndContext>
            </div>
          )}
        </div>

        {/* Articles Cards - Mobile View */}
        <div className="md:hidden space-y-3">
          {articlesLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Loading...
            </div>
          ) : articles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No articles found
            </div>
          ) : (
            articles.map((article) => (
              <div 
                key={article.id} 
                className="bg-card border rounded-lg p-3 space-y-3 hover-elevate"
                data-testid={`card-en-article-${article.id}`}
              >
                {/* Checkbox and Title */}
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedArticles.has(article.id)}
                    onCheckedChange={() => toggleArticleSelection(article.id)}
                    data-testid={`checkbox-en-article-mobile-${article.id}`}
                    className="mt-0.5"
                  />
                  <div className="flex-1 flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm flex-1 break-words leading-snug">
                      {article.title}
                    </h3>
                    {getStatusBadge(article.status)}
                  </div>
                </div>

                {/* Author and Category */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={article.author?.profileImageUrl || ""} />
                      <AvatarFallback className="text-xs">
                        {(article.author?.firstNameEn || article.author?.firstName)?.[0] || article.author?.email?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-muted-foreground">
                      {article.author?.firstNameEn && article.author?.lastNameEn
                        ? `${article.author.firstNameEn} ${article.author.lastNameEn}`
                        : article.author?.firstName || article.author?.email}
                    </span>
                  </div>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    {article.category?.nameEn || "-"}
                  </span>
                </div>

                {/* Article Type */}
                <div>
                  {getTypeBadge(article.articleType || "news")}
                </div>

                {/* Badges and Views */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {article.newsType === "breaking" && (
                      <Badge variant="destructive" className="text-xs">Breaking</Badge>
                    )}
                    {article.isFeatured && (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        Featured
                      </Badge>
                    )}
                  </div>
                  <ViewsCount 
                    views={article.views}
                    iconClassName="h-3.5 w-3.5"
                    className="text-xs text-muted-foreground"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(article)}
                    className="flex-1"
                    data-testid={`button-edit-mobile-en-${article.id}`}
                  >
                    <Edit className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  
                  {article.newsType !== "breaking" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleBreakingMutation.mutate({ 
                        id: article.id, 
                        currentState: false 
                      })}
                      disabled={toggleBreakingMutation.isPending}
                      className="flex-1"
                      data-testid={`button-breaking-mobile-en-${article.id}`}
                    >
                      <Bell className="mr-1.5 h-3.5 w-3.5" />
                      Breaking
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => toggleBreakingMutation.mutate({ 
                        id: article.id, 
                        currentState: true 
                      })}
                      disabled={toggleBreakingMutation.isPending}
                      className="flex-1"
                      data-testid={`button-unbreaking-mobile-en-${article.id}`}
                    >
                      Unmark Breaking
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => featureMutation.mutate({ id: article.id, featured: !article.isFeatured })}
                    disabled={featureMutation.isPending}
                    data-testid={`button-feature-mobile-en-${article.id}`}
                  >
                    <Star className={`h-3.5 w-3.5 ${article.isFeatured ? 'text-yellow-500 fill-yellow-500' : ''}`} />
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeletingArticle(article)}
                    data-testid={`button-delete-mobile-en-${article.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingArticle} onOpenChange={() => setDeletingArticle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Archive</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive the article "{deletingArticle?.title}"? You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-en">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingArticle && deleteMutation.mutate(deletingArticle.id)}
              data-testid="button-confirm-delete-en"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Permanent Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Permanent Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {selectedArticles.size} article{selectedArticles.size > 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete-en">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkPermanentDeleteMutation.mutate(Array.from(selectedArticles))}
              data-testid="button-confirm-bulk-delete-en"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EnglishDashboardLayout>
  );
}
