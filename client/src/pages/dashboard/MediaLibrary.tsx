import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Search,
  Grid3x3,
  List,
  FolderPlus,
  Image as ImageIcon,
  Trash2,
  Star,
  TrendingUp,
  EyeOff,
  AlertCircle,
  Sparkles,
  FolderInput,
  Download,
  X,
  Wand2,
  Loader2,
} from "lucide-react";
import { MediaCard } from "@/components/dashboard/MediaCard";
import { FolderTree } from "@/components/dashboard/FolderTree";
import { MediaUploadDialog } from "@/components/dashboard/MediaUploadDialog";
import { MediaPreviewDialog } from "@/components/dashboard/MediaPreviewDialog";
import { CreateFolderDialog } from "@/components/dashboard/CreateFolderDialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { MediaFile, MediaFolder } from "@shared/schema";

type ViewMode = "grid" | "list";
type Collection = "" | "favorites" | "most_used" | "unused" | "no_alt" | "pending";

const PAGE_SIZE = 30;

const SMART_COLLECTIONS: { value: Collection; label: string; icon: typeof Star }[] = [
  { value: "", label: "الكل", icon: Sparkles },
  { value: "favorites", label: "المفضلة", icon: Star },
  { value: "most_used", label: "الأكثر استخداماً", icon: TrendingUp },
  { value: "unused", label: "غير المستخدمة", icon: EyeOff },
  { value: "no_alt", label: "بلا نص بديل", icon: AlertCircle },
  { value: "pending", label: "بانتظار التحليل", icon: Wand2 },
];

export default function MediaLibrary() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"literal" | "semantic">("literal");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [collection, setCollection] = useState<Collection>("");

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastIndexRef = useRef<number | null>(null);

  // Dialog State
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);

  // Auto-tag backfill state (Phase 2)
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; remaining: number } | null>(null);

  // Semantic-index backfill state (Phase 3)
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{ done: number; remaining: number } | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch folders (backend returns accurate per-folder fileCount)
  const { data: foldersRaw, isLoading: foldersLoading } = useQuery<MediaFolder[]>({
    queryKey: ["/api/media/folders"],
    enabled: !!user,
  });
  const folders = Array.isArray(foldersRaw) ? foldersRaw : [];
  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of folders as Array<MediaFolder & { fileCount?: number }>) {
      counts[f.id] = f.fileCount ?? 0;
    }
    return counts;
  }, [folders]);

  // Fetch media with infinite scroll
  const {
    data: mediaData,
    isLoading: mediaLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["/api/media", searchTerm, selectedFolderId, selectedCategory, collection],
    enabled: !!user,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("page", String(pageParam));
      params.set("limit", String(PAGE_SIZE));
      if (searchTerm) params.set("search", searchTerm);
      if (selectedFolderId) params.set("folderId", selectedFolderId);
      if (selectedCategory && selectedCategory !== "all") params.set("category", selectedCategory);
      if (collection) params.set("collection", collection);
      return apiRequest(`/api/media?${params.toString()}`, { method: "GET" }) as Promise<{
        files: MediaFile[];
        total: number;
        hasMore: boolean;
      }>;
    },
    getNextPageParam: (lastPage, pages) => (lastPage?.hasMore ? pages.length + 1 : undefined),
  });

  const files: MediaFile[] = useMemo(
    () => (mediaData?.pages ?? []).flatMap((p) => p.files ?? []),
    [mediaData],
  );
  const totalCount = mediaData?.pages?.[0]?.total ?? 0;

  // Semantic search (Phase 3) — ranks by meaning. Active only in "semantic" mode
  // with a query; otherwise the literal infinite list above is shown.
  const semanticActive = searchMode === "semantic" && !!searchTerm;
  const { data: semanticData, isLoading: semanticLoading } = useQuery({
    queryKey: ["/api/media/semantic-search", searchTerm, selectedFolderId, selectedCategory],
    enabled: !!user && semanticActive,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", searchTerm);
      params.set("limit", "60");
      if (selectedFolderId) params.set("folderId", selectedFolderId);
      if (selectedCategory && selectedCategory !== "all") params.set("category", selectedCategory);
      return apiRequest(`/api/media/semantic-search?${params.toString()}`, { method: "GET" }) as Promise<{
        files: (MediaFile & { relevanceScore: number })[];
        total: number;
        capped: boolean;
      }>;
    },
  });

  // What the grid/list actually renders — semantic results, or the infinite list.
  const displayFiles: MediaFile[] = semanticActive ? (semanticData?.files ?? []) : files;
  const displayLoading = semanticActive ? semanticLoading : mediaLoading;
  const relevanceById = useMemo(() => {
    const m = new Map<string, number>();
    if (semanticActive) for (const f of semanticData?.files ?? []) m.set(f.id, (f as any).relevanceScore);
    return m;
  }, [semanticActive, semanticData]);

  // Infinite-scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Permission gates
  const canUpload = hasPermission(user, "media.upload");
  const canManageMedia = hasPermission(user, "media.edit");
  const canDeleteFile = (file: MediaFile) =>
    file.uploadedBy === user?.id || hasPermission(user, "media.delete");

  // Filters reset selection
  const resetSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastIndexRef.current = null;
  }, []);

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setCollection("");
    resetSelection();
  };

  const handleSelectCollection = (c: Collection) => {
    setCollection(c);
    setSelectedFolderId(null);
    resetSelection();
  };

  // "تحليل تلقائي" — loop the backfill endpoint in batches until the archive is
  // fully tagged (or nothing remains). Bounded by a safety counter so a stuck
  // batch can't spin forever.
  const runBackfill = useCallback(async () => {
    if (backfilling) return;
    setBackfilling(true);
    setBackfillProgress(null);
    let totalDone = 0;
    try {
      for (let i = 0; i < 80; i++) {
        const r = (await apiRequest("/api/media/backfill-tags", {
          method: "POST",
          body: JSON.stringify({ batchSize: 6 }),
          headers: { "Content-Type": "application/json" },
        })) as { processed: number; done: number; remaining: number };
        totalDone += r.done;
        setBackfillProgress({ done: totalDone, remaining: r.remaining });
        if (r.processed === 0 || r.remaining === 0) break;
      }
      toast({ title: "اكتمل التحليل التلقائي", description: `حُلِّلت ${totalDone} صورة` });
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
    } catch (error: any) {
      toast({
        title: "تعذّر التحليل التلقائي",
        description: error?.message || "حدث خطأ أثناء تحليل الصور",
        variant: "destructive",
      });
    } finally {
      setBackfilling(false);
    }
  }, [backfilling, toast]);

  // "فهرسة دلالية" — embed not-yet-indexed images in batches until the library is
  // fully searchable by meaning. Stops on no-progress or empty (no infinite spin).
  const runEmbedBackfill = useCallback(async () => {
    if (indexing) return;
    setIndexing(true);
    setIndexProgress(null);
    let totalDone = 0;
    try {
      for (let i = 0; i < 120; i++) {
        const r = (await apiRequest("/api/media/embeddings/backfill", {
          method: "POST",
          body: JSON.stringify({ batchSize: 8 }),
          headers: { "Content-Type": "application/json" },
        })) as { processed: number; embedded: number; remaining: number };
        totalDone += r.embedded;
        setIndexProgress({ done: totalDone, remaining: r.remaining });
        if (r.processed === 0 || r.embedded === 0 || r.remaining === 0) break;
      }
      toast({ title: "اكتملت الفهرسة الدلالية", description: `فُهرست ${totalDone} صورة` });
    } catch (error: any) {
      toast({
        title: "تعذّرت الفهرسة الدلالية",
        description: error?.message || "حدث خطأ أثناء فهرسة الصور",
        variant: "destructive",
      });
    } finally {
      setIndexing(false);
    }
  }, [indexing, toast]);

  // Toggle favorite (single)
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (file: MediaFile) =>
      apiRequest(`/api/media/${file.id}`, {
        method: "PUT",
        body: JSON.stringify({ isFavorite: !file.isFavorite }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/media"] }),
  });

  // Delete (single)
  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => apiRequest(`/api/media/${fileId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({ title: "تم الحذف بنجاح", description: "تم حذف الملف من المكتبة" });
    },
    onError: (error: any) => {
      toast({
        title: "فشل الحذف",
        description: error.message || "حدث خطأ أثناء حذف الملف",
        variant: "destructive",
      });
    },
  });

  // Bulk operations
  const bulkMutation = useMutation({
    mutationFn: async (vars: { action: string; ids: string[]; folderId?: string | null }) =>
      apiRequest("/api/media/bulk", {
        method: "POST",
        body: JSON.stringify(vars),
        headers: { "Content-Type": "application/json" },
      }) as Promise<{ processed: number; skipped: number; blocked: string[] }>,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media/folders"] });
      resetSelection();
      const parts = [`تمت معالجة ${res.processed}`];
      if (res.skipped) parts.push(`تخطّي ${res.skipped} (صلاحية)`);
      if (res.blocked?.length) parts.push(`تعذّر حذف ${res.blocked.length} (مستخدمة في مقالات)`);
      toast({ title: "اكتملت العملية الجماعية", description: parts.join(" · ") });
    },
    onError: (error: any) => {
      toast({
        title: "فشل العملية الجماعية",
        description: error.message || "حدث خطأ",
        variant: "destructive",
      });
    },
  });

  const handlePreview = (file: MediaFile) => setPreviewFile(file);
  const handleToggleFavorite = (file: MediaFile) => toggleFavoriteMutation.mutate(file);
  const handleDelete = (file: MediaFile) => {
    if (confirm(`هل تريد حذف الملف "${file.title || file.originalName}"؟`)) {
      deleteMutation.mutate(file.id);
    }
  };

  // Selection: single toggle + shift-range over the flat ordered list
  const handleToggleSelect = (file: MediaFile, shiftKey: boolean) => {
    const index = files.findIndex((f) => f.id === file.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastIndexRef.current !== null && index >= 0) {
        const [a, b] = [lastIndexRef.current, index].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) next.add(files[i].id);
      } else if (next.has(file.id)) {
        next.delete(file.id);
      } else {
        next.add(file.id);
      }
      return next;
    });
    lastIndexRef.current = index;
  };

  const selectionMode = selectedIds.size > 0;

  const runBulk = (action: string, folderId?: string | null) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === "delete" && !confirm(`حذف ${ids.length} ملف؟ (لن يُحذف المستخدم في مقالات)`)) return;
    bulkMutation.mutate({ action, ids, folderId });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const gridClasses = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  const renderCard = (file: MediaFile) => (
    <MediaCard
      key={file.id}
      file={file}
      onPreview={handlePreview}
      onToggleFavorite={handleToggleFavorite}
      onDelete={handleDelete}
      canDelete={canDeleteFile(file)}
      layout="grid"
      selectionMode={selectionMode}
      selected={selectedIds.has(file.id)}
      onToggleSelect={handleToggleSelect}
      relevanceScore={relevanceById.get(file.id)}
    />
  );

  const isLoading = foldersLoading || displayLoading;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="heading-media-library">مكتبة الوسائط</h1>
            <p className="text-sm text-muted-foreground">إدارة الصور والملفات</p>
          </div>
          {canUpload && (
            <Button onClick={() => setUploadDialogOpen(true)} className="gap-2" data-testid="button-upload">
              <Upload className="h-4 w-4" />
              رفع ملف
            </Button>
          )}
        </div>

        {/* Filters Bar */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            <div className="relative flex-1 w-full md:max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchMode === "semantic" ? "ابحث بالمعنى… مثل: ملعب ليلي" : "بحث في الملفات..."}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pr-9"
                data-testid="input-search"
              />
            </div>

            {/* Literal / semantic search toggle (Phase 3) */}
            <div className="inline-flex rounded-md border p-0.5 gap-0.5" data-testid="toggle-search-mode">
              <Button
                size="sm"
                variant={searchMode === "literal" ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setSearchMode("literal")}
                data-testid="button-search-literal"
              >
                حرفي
              </Button>
              <Button
                size="sm"
                variant={searchMode === "semantic" ? "default" : "ghost"}
                className="h-8 px-3 gap-1.5"
                onClick={() => setSearchMode("semantic")}
                data-testid="button-search-semantic"
              >
                <Sparkles className="h-3.5 w-3.5" />
                دلالي
              </Button>
            </div>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-category-filter">
                <SelectValue placeholder="التصنيف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                <SelectItem value="مقالات">مقالات</SelectItem>
                <SelectItem value="شعارات">شعارات</SelectItem>
                <SelectItem value="صور المراسلين">صور المراسلين</SelectItem>
                <SelectItem value="بانرات">بانرات</SelectItem>
                <SelectItem value="عام">عام</SelectItem>
              </SelectContent>
            </Select>

            <Separator orientation="vertical" className="h-8 hidden md:block" />

            <div className="flex items-center gap-2">
              <Button variant={viewMode === "grid" ? "default" : "outline"} size="icon" onClick={() => setViewMode("grid")} data-testid="button-view-grid">
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === "list" ? "default" : "outline"} size="icon" onClick={() => setViewMode("list")} data-testid="button-view-list">
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Smart collections rail */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {SMART_COLLECTIONS.map(({ value, label, icon: Icon }) => (
              <Badge
                key={value || "all"}
                variant={collection === value && !selectedFolderId ? "default" : "outline"}
                className="cursor-pointer hover-elevate gap-1"
                onClick={() => handleSelectCollection(value)}
                data-testid={`chip-collection-${value || "all"}`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </Badge>
            ))}

            {canManageMedia && (
              <div className="flex items-center gap-2 mr-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 h-7"
                  onClick={runBackfill}
                  disabled={backfilling}
                  data-testid="button-backfill-tags"
                  title="تحليل الصور غير الموسومة بالذكاء وملء الوسوم والنص البديل تلقائياً"
                >
                  {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-purple-500" />}
                  {backfilling
                    ? backfillProgress
                      ? `جارٍ التحليل… (${backfillProgress.done} ✓ / ${backfillProgress.remaining} متبقٍ)`
                      : "جارٍ التحليل…"
                    : "تحليل تلقائي"}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 h-7"
                  onClick={runEmbedBackfill}
                  disabled={indexing}
                  data-testid="button-backfill-embeddings"
                  title="فهرسة الصور للبحث الدلالي (بالمعنى) — تشمل الأرشيف القديم"
                >
                  {indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-purple-500" />}
                  {indexing
                    ? indexProgress
                      ? `جارٍ الفهرسة… (${indexProgress.done} ✓ / ${indexProgress.remaining} متبقٍ)`
                      : "جارٍ الفهرسة…"
                    : "فهرسة دلالية"}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Sidebar */}
          <Card className="p-4 h-fit">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">المجلدات</h3>
                {canUpload && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFolderDialogOpen(true)} data-testid="button-create-folder">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {foldersLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <FolderTree
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={handleSelectFolder}
                  onSelectFavorites={() => handleSelectCollection("favorites")}
                  isFavoritesSelected={collection === "favorites"}
                  fileCounts={fileCounts}
                />
              )}
            </div>
          </Card>

          {/* Files Area */}
          <div className="space-y-4">
            {/* Results / selection bar */}
            {selectionMode ? (
              <Card className="p-3 flex flex-wrap items-center gap-2 sticky top-2 z-20">
                <span className="text-sm font-medium" data-testid="text-selected-count">
                  محدد {selectedIds.size}
                </span>
                <Separator orientation="vertical" className="h-6" />
                <Button size="sm" variant="outline" onClick={() => runBulk("favorite")} disabled={bulkMutation.isPending} data-testid="button-bulk-favorite">
                  <Star className="h-4 w-4 ml-1" /> تفضيل
                </Button>
                <Select onValueChange={(v) => runBulk("move", v === "root" ? null : v)} disabled={bulkMutation.isPending}>
                  <SelectTrigger className="w-40 h-9" data-testid="select-bulk-move">
                    <FolderInput className="h-4 w-4 ml-1" />
                    <SelectValue placeholder="نقل إلى مجلد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">بدون مجلد</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="destructive" onClick={() => runBulk("delete")} disabled={bulkMutation.isPending} data-testid="button-bulk-delete">
                  <Trash2 className="h-4 w-4 ml-1" /> حذف
                </Button>
                <Button size="sm" variant="ghost" onClick={resetSelection} className="mr-auto" data-testid="button-clear-selection">
                  <X className="h-4 w-4 ml-1" /> إلغاء
                </Button>
              </Card>
            ) : (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span data-testid="text-results-count">
                  {semanticActive
                    ? `${displayFiles.length} نتيجة دلالية`
                    : `${totalCount} ${totalCount === 1 ? "ملف" : "ملفات"}`}
                </span>
                {semanticActive && (
                  <span className="text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400">
                    <Sparkles className="h-3 w-3" /> مرتّبة حسب الملاءمة
                  </span>
                )}
              </div>
            )}

            {/* Loading skeletons */}
            {isLoading && displayFiles.length === 0 && (
              <div className={gridClasses}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && displayFiles.length === 0 && (
              <Card className="p-12">
                <div className="text-center">
                  <ImageIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  {semanticActive ? (
                    <>
                      <h3 className="text-lg font-medium mb-2">لا نتائج دلالية</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        جرّب صياغة أخرى، أو شغّل «فهرسة دلالية» إن لم تُفهرَس المكتبة بعد
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-medium mb-2">لا توجد ملفات</h3>
                      <p className="text-sm text-muted-foreground mb-4">جرّب تغيير الفلاتر أو ارفع ملفاً جديداً</p>
                      {canUpload && (
                        <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-first">
                          <Upload className="h-4 w-4 ml-2" /> ارفع أول ملف
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Grid view */}
            {viewMode === "grid" && displayFiles.length > 0 && (
              <div className={gridClasses}>{displayFiles.map(renderCard)}</div>
            )}

            {/* List view */}
            {viewMode === "list" && displayFiles.length > 0 && (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-right py-3 px-4 font-medium text-sm">معاينة</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">الاسم</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">الحجم</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">التاريخ</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">المجلد</th>
                        <th className="text-center py-3 px-4 font-medium text-sm">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayFiles.map((file) => (
                        <tr key={file.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => handlePreview(file)} data-testid={`row-media-${file.id}`}>
                          <td className="py-3 px-4">
                            {file.type === "image" ? (
                              <img src={file.thumbnailUrl || file.url} alt={file.altText || file.title || file.originalName} className="w-12 h-12 object-cover rounded" loading="lazy" />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-sm truncate max-w-[200px]">{file.title || file.originalName}</p>
                            {file.category && <Badge variant="outline" className="text-xs mt-1">{file.category}</Badge>}
                          </td>
                          <td className="py-3 px-4 text-sm">{formatFileSize(file.size)}</td>
                          <td className="py-3 px-4 text-sm">{format(new Date(file.createdAt), "yyyy/MM/dd")}</td>
                          <td className="py-3 px-4 text-sm">{file.folderId ? folders.find((f) => f.id === file.folderId)?.name || "-" : "-"}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); window.open(file.url, "_blank"); }} data-testid={`button-download-row-${file.id}`}>
                                <Download className="h-4 w-4" />
                              </Button>
                              {canDeleteFile(file) && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleDelete(file); }} data-testid={`button-delete-row-${file.id}`}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Infinite-scroll sentinel + loader (literal mode only — semantic
                returns a single ranked page) */}
            {!semanticActive && <div ref={sentinelRef} />}
            {!semanticActive && isFetchingNextPage && (
              <div className="text-center py-4 text-sm text-muted-foreground">جاري التحميل...</div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <MediaUploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} folders={folders} />
      <MediaPreviewDialog file={previewFile} open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)} folders={folders} />
      <CreateFolderDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen} folders={folders} />
    </DashboardLayout>
  );
}
