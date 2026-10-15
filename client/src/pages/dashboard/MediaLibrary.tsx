import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
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
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  ChevronDown,
  HardDrive,
  Folder,
  FolderOpen,
  SlidersHorizontal,
  CheckCircle2,
  FileText,
  Layers,
} from "lucide-react";
import { MediaCard } from "@/components/dashboard/MediaCard";
import { FolderTree } from "@/components/dashboard/FolderTree";
import { MediaUploadDialog } from "@/components/dashboard/MediaUploadDialog";
import { MediaPreviewDialog } from "@/components/dashboard/MediaPreviewDialog";
import { CreateFolderDialog } from "@/components/dashboard/CreateFolderDialog";
import { AIImageGeneratorDialog } from "@/components/AIImageGeneratorDialog";
import { cn } from "@/lib/utils";
import type { MediaFile, MediaFolder } from "@shared/schema";

type ViewMode = "grid" | "list";
type Collection = "" | "favorites" | "most_used" | "unused" | "no_alt" | "pending" | "no_rights";

const PAGE_SIZE = 30;

const SMART_COLLECTIONS: { value: Collection; label: string; icon: typeof Star }[] = [
  { value: "", label: "الكل", icon: Sparkles },
  { value: "favorites", label: "المفضلة", icon: Star },
  { value: "most_used", label: "الأكثر استخداماً", icon: TrendingUp },
  { value: "unused", label: "غير المستخدمة", icon: EyeOff },
  { value: "no_alt", label: "بلا نص بديل", icon: AlertCircle },
  { value: "pending", label: "بانتظار التحليل", icon: Wand2 },
  { value: "no_rights", label: "بلا حقوق موثّقة", icon: ShieldAlert },
];

interface MediaStats {
  totalImages: number;
  aiGenerated: number;
  rightsVerified: number;
  pendingAnalysis: number;
  indexed: number;
  sensitive: number;
  totalStorageBytes: number;
  byLicense: { licenseType: string; count: number }[];
  topUsed: { id: string; title: string | null; originalName: string; url: string; usage: number }[];
}

const LICENSE_LABELS: Record<string, string> = {
  own_work: "عمل خاص",
  agency: "وكالة",
  stock: "بنك صور",
  creative_commons: "مشاع إبداعي",
  public_domain: "ملكية عامة",
  unknown: "غير معروف",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 ب";
  const units = ["ب", "ك.ب", "م.ب", "ج.ب"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = Math.round((bytes / Math.pow(1024, i)) * 10) / 10;
  return `${value.toLocaleString("en-US")} ${units[i]}`;
}

const LATIN_DATE = "ar-SA-u-ca-gregory-nu-latn";

const STAT_TILE_STYLES = [
  "rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/50 via-card to-card dark:border-sky-900/35 dark:from-sky-950/15",
  "rounded-2xl border-emerald-200/55 bg-gradient-to-br from-emerald-50/50 via-card to-card dark:border-emerald-900/35 dark:from-emerald-950/15",
  "rounded-2xl border-cyan-200/55 bg-gradient-to-br from-cyan-50/50 via-card to-card dark:border-cyan-900/35 dark:from-cyan-950/15",
  "rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/50 via-card to-card dark:border-sky-900/35 dark:from-sky-950/15",
  "rounded-2xl border-amber-200/55 bg-gradient-to-br from-amber-50/50 via-card to-card dark:border-amber-900/35 dark:from-amber-950/15",
  "rounded-2xl border-rose-200/55 bg-gradient-to-br from-rose-50/45 via-card to-card dark:border-rose-900/35 dark:from-rose-950/15",
] as const;

export default function MediaLibrary() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"literal" | "semantic">("literal");
  const [statsOpen, setStatsOpen] = useState(false);
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [collection, setCollection] = useState<Collection>("");

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastIndexRef = useRef<number | null>(null);

  // Dialog State
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
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

  // Library governance stats (Phase 6) — fetched lazily when the panel is opened.
  const { data: stats } = useQuery<MediaStats>({
    queryKey: ["/api/media/stats"],
    enabled: !!user && statsOpen,
  });

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

  const hasActiveFilters = Boolean(
    searchInput || selectedFolderId || (selectedCategory && selectedCategory !== "all") || collection,
  );

  const clearAllFilters = () => {
    setSearchInput("");
    setSearchTerm("");
    setSelectedFolderId(null);
    setSelectedCategory("all");
    setCollection("");
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

  // Save an AI-generated image (Phase 5) into the library. The dialog auto-closes
  // on confirm; we persist + auto-tag/index in the background and toast on done.
  const handleSaveGenerated = useCallback(
    async (imageUrl: string, alt?: string) => {
      try {
        await apiRequest("/api/media/save-generated", {
          method: "POST",
          body: JSON.stringify({
            imageUrl,
            prompt: alt || "",
            folderId: selectedFolderId || undefined,
          }),
          headers: { "Content-Type": "application/json" },
        });
        toast({ title: "تمت إضافة الصورة المولّدة", description: "ستظهر في المكتبة ويُكمل تحليلها تلقائياً" });
        queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      } catch (error: any) {
        toast({
          title: "تعذّر حفظ الصورة",
          description: error?.message || "حدث خطأ أثناء حفظ الصورة المولّدة",
          variant: "destructive",
        });
      }
    },
    [selectedFolderId, toast],
  );

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
    const index = displayFiles.findIndex((f) => f.id === file.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastIndexRef.current !== null && index >= 0) {
        const [a, b] = [lastIndexRef.current, index].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) {
          if (displayFiles[i]) next.add(displayFiles[i].id);
        }
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
    const value = Math.round((bytes / Math.pow(k, i)) * 100) / 100;
    return `${value.toLocaleString("en-US")} ${sizes[i]}`;
  };

  const activeFolderName = useMemo(() => {
    if (!selectedFolderId) return null;
    return folders.find((f) => f.id === selectedFolderId)?.name || "مجلد";
  }, [folders, selectedFolderId]);

  const activeCollectionLabel = useMemo(() => {
    if (!collection) return null;
    return SMART_COLLECTIONS.find((c) => c.value === collection)?.label || null;
  }, [collection]);

  const gridClasses = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4";

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
      <DashboardPageShell contentClassName="space-y-4 sm:space-y-5">
        <DashboardPageHeader
          icon={ImageIcon}
          title="مكتبة الوسائط"
          description="إدارة الأصول البصرية، التراخيص وحقوق الاستخدام، والبحث الدلالي بالذكاء الاصطناعي"
          titleTestId="heading-media-library"
          actions={
            <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={statsOpen ? "secondary" : "outline"}
                size="sm"
                onClick={() => setStatsOpen((v) => !v)}
                className="no-min-touch-size gap-1.5 h-9 px-3"
                data-testid="button-toggle-stats"
              >
                <BarChart3 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>إحصائيات المكتبة</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", statsOpen && "rotate-180")} />
              </Button>
              {canUpload && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setGenerateDialogOpen(true)}
                    className="gap-2 flex-1 sm:flex-none border-purple-200/70 bg-purple-50/40 hover:bg-purple-100/50 dark:border-purple-900/50 dark:bg-purple-950/20"
                    data-testid="button-generate-ai"
                  >
                    <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    توليد بالذكاء
                  </Button>
                  <Button
                    onClick={() => setUploadDialogOpen(true)}
                    className="gap-2 flex-1 sm:flex-none shadow-sm"
                    data-testid="button-upload"
                  >
                    <Upload className="h-4 w-4" />
                    رفع ملف
                  </Button>
                </>
              )}
            </div>
          }
        />

        {/* Library stats (Phase 6) — collapsible governance dashboard */}
        {statsOpen && (
          <Card className="overflow-hidden rounded-2xl border-sky-200/60 bg-gradient-to-br from-sky-50/45 via-card to-card shadow-sm dark:border-sky-900/40 dark:from-sky-950/15 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-sky-200/40 dark:border-sky-900/30 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">مؤشرات حوكمة وأداء المكتبة</h3>
                    <p className="text-xs text-muted-foreground">نظرة شاملة على التوثيق، الفهرسة الدلالية، واستهلاك التخزين</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatsOpen(false)}
                  className="no-min-touch-size rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                  aria-label="إغلاق الإحصائيات"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      { label: "إجمالي الصور", value: stats.totalImages, icon: ImageIcon, tone: "text-sky-700 dark:text-sky-300", numeric: true },
                      { label: "حقوق موثّقة", value: stats.rightsVerified, icon: ShieldCheck, tone: "text-emerald-700 dark:text-emerald-300", numeric: true },
                      { label: "مولّدة بالذكاء", value: stats.aiGenerated, icon: Sparkles, tone: "text-cyan-700 dark:text-cyan-300", numeric: true },
                      { label: "مفهرسة دلالياً", value: stats.indexed, icon: Search, tone: "text-sky-600 dark:text-sky-300", numeric: true },
                      { label: "بانتظار التحليل", value: stats.pendingAnalysis, icon: Wand2, tone: "text-amber-700 dark:text-amber-300", numeric: true },
                      { label: "حجم التخزين", value: formatBytes(stats.totalStorageBytes ?? 0), icon: HardDrive, tone: "text-rose-700 dark:text-rose-300", numeric: false },
                    ].map((tile, index) => (
                      <div key={tile.label} className={cn("p-3.5 border shadow-sm transition-all", STAT_TILE_STYLES[index])} data-testid={`stat-${tile.label}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-muted-foreground">{tile.label}</span>
                          <tile.icon className={cn("h-4 w-4 shrink-0", tile.tone)} />
                        </div>
                        <div className="text-xl font-bold leading-tight tabular-nums">
                          {tile.numeric && typeof tile.value === "number"
                            ? tile.value.toLocaleString("en-US")
                            : tile.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                    {Array.isArray(stats.byLicense) && stats.byLicense.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          توزيع التراخيص وحقوق الملكية
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {stats.byLicense.map((l) => (
                            <Badge key={l.licenseType} variant="outline" className="gap-1.5 px-2.5 py-1 text-xs bg-card">
                              <span>{LICENSE_LABELS[l.licenseType] || l.licenseType}</span>
                              <span className="rounded bg-muted px-1.5 py-0.5 font-bold tabular-nums text-[11px]">
                                {l.count.toLocaleString("en-US")}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {Array.isArray(stats.topUsed) && stats.topUsed.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-sky-600" />
                          الأصول الأكثر استخداماً في الأخبار
                        </p>
                        <div className="flex flex-wrap gap-2.5">
                          {stats.topUsed.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center gap-2 rounded-lg border border-border/50 bg-card p-1.5 pr-2 text-xs shadow-2xs"
                              data-testid={`top-used-${t.id}`}
                            >
                              <img
                                src={t.url}
                                alt={t.title || t.originalName}
                                className="h-8 w-8 rounded-md object-cover shrink-0"
                                loading="lazy"
                              />
                              <div className="max-w-[130px]">
                                <div className="truncate font-medium leading-tight">{t.title || t.originalName}</div>
                                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                                  {t.usage.toLocaleString("en-US")} استخدام
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Streamlined Search, Filter & Smart Collections Toolbar */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card p-3.5 sm:p-4 shadow-sm dark:border-sky-900/35 dark:from-sky-950/15 space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 sm:gap-3">
            {/* Search Input + Literal/Semantic Mode Segmented Control */}
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={searchMode === "semantic" ? "ابحث بالمعنى… مثل: ملعب ليلي أو مؤتمر صحفي" : "ابحث باسم الملف، الوسوم، أو النص البديل..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pr-9 pl-8 bg-background/80"
                  data-testid="input-search"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setSearchTerm("");
                    }}
                    className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Literal / semantic search toggle (Phase 3) */}
              <div
                className="inline-flex items-center self-start sm:self-auto rounded-lg border bg-background/70 p-0.5 gap-0.5 shrink-0"
                data-testid="toggle-search-mode"
              >
                <button
                  type="button"
                  className={cn(
                    "no-min-touch-size inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    searchMode === "literal"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setSearchMode("literal")}
                  data-testid="button-search-literal"
                >
                  حرفي
                </button>
                <button
                  type="button"
                  className={cn(
                    "no-min-touch-size inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    searchMode === "semantic"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setSearchMode("semantic")}
                  data-testid="button-search-semantic"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  دلالي
                </button>
              </div>
            </div>

            {/* Category Select & View Mode Switcher */}
            <div className="flex items-center justify-between sm:justify-end gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-44 bg-background/80 h-9" data-testid="select-category-filter">
                  <SlidersHorizontal className="h-3.5 w-3.5 ml-1.5 text-muted-foreground shrink-0" />
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

              <div className="inline-flex items-center rounded-lg border bg-background/70 p-0.5 gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "no-min-touch-size inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                  title="عرض شبكي"
                  data-testid="button-view-grid"
                >
                  <Grid3x3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "no-min-touch-size inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    viewMode === "list"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                  title="عرض جدولي"
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Smart collections rail + AI maintenance actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-sky-200/40 dark:border-sky-900/30">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              {SMART_COLLECTIONS.map(({ value, label, icon: Icon }) => {
                const isActive = collection === value && !selectedFolderId;
                return (
                  <button
                    key={value || "all"}
                    type="button"
                    onClick={() => handleSelectCollection(value)}
                    className={cn(
                      "no-min-touch-size inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-all shrink-0",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                        : "border-border/70 bg-background/70 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                    data-testid={`chip-collection-${value || "all"}`}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {canManageMedia && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  className="no-min-touch-size inline-flex items-center gap-1.5 rounded-lg border border-purple-200/70 bg-purple-50/50 hover:bg-purple-100/60 dark:border-purple-900/50 dark:bg-purple-950/25 px-2.5 py-1 text-xs font-medium text-purple-800 dark:text-purple-200 transition-colors disabled:opacity-50"
                  onClick={runBackfill}
                  disabled={backfilling}
                  data-testid="button-backfill-tags"
                  title="تحليل الصور غير الموسومة بالذكاء وملء الوسوم والنص البديل تلقائياً"
                >
                  {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-purple-500" />}
                  <span>
                    {backfilling
                      ? backfillProgress
                        ? `جارٍ التحليل… (${backfillProgress.done} ✓ / ${backfillProgress.remaining} متبقٍ)`
                        : "جارٍ التحليل…"
                      : "تحليل تلقائي"}
                  </span>
                </button>

                <button
                  type="button"
                  className="no-min-touch-size inline-flex items-center gap-1.5 rounded-lg border border-sky-200/70 bg-sky-50/50 hover:bg-sky-100/60 dark:border-sky-900/50 dark:bg-sky-950/25 px-2.5 py-1 text-xs font-medium text-sky-800 dark:text-sky-200 transition-colors disabled:opacity-50"
                  onClick={runEmbedBackfill}
                  disabled={indexing}
                  data-testid="button-backfill-embeddings"
                  title="فهرسة الصور للبحث الدلالي (بالمعنى) — تشمل الأرشيف القديم"
                >
                  {indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-sky-500" />}
                  <span>
                    {indexing
                      ? indexProgress
                        ? `جارٍ الفهرسة… (${indexProgress.done} ✓ / ${indexProgress.remaining} متبقٍ)`
                        : "جارٍ الفهرسة…"
                      : "فهرسة دلالية"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* Main Content: Responsive Sidebar + Asset Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
          {/* Sidebar (Collapsible on mobile, sticky on desktop) */}
          <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card p-3.5 sm:p-4 shadow-sm dark:border-sky-900/35 dark:from-sky-950/15 lg:sticky lg:top-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMobileFoldersOpen((v) => !v)}
                  className="no-min-touch-size flex items-center gap-2 text-sm font-semibold lg:pointer-events-none"
                >
                  <FolderOpen className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <span>المجلدات</span>
                  {selectedFolderId && activeFolderName && (
                    <Badge variant="secondary" className="text-[11px] px-1.5 py-0 lg:hidden">
                      {activeFolderName}
                    </Badge>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform lg:hidden",
                      mobileFoldersOpen && "rotate-180",
                    )}
                  />
                </button>
                {canUpload && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="no-min-touch-size h-7 w-7 rounded-lg"
                    onClick={() => setFolderDialogOpen(true)}
                    title="إنشاء مجلد جديد"
                    data-testid="button-create-folder"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Quick Horizontal Folder Chips for Mobile when collapsed */}
              {!mobileFoldersOpen && folders.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar lg:hidden">
                  <button
                    type="button"
                    onClick={() => handleSelectFolder(null)}
                    className={cn(
                      "no-min-touch-size inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap shrink-0",
                      selectedFolderId === null && !collection
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/60 bg-background/60 text-muted-foreground",
                    )}
                  >
                    كل المجلدات
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleSelectFolder(f.id)}
                      className={cn(
                        "no-min-touch-size inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap shrink-0",
                        selectedFolderId === f.id
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border/60 bg-background/60 text-muted-foreground",
                      )}
                    >
                      <Folder className="h-3 w-3" />
                      <span>{f.name}</span>
                      <span className="text-[10px] opacity-75 tabular-nums">({fileCounts[f.id] ?? 0})</span>
                    </button>
                  ))}
                </div>
              )}

              <div className={cn("lg:block", mobileFoldersOpen ? "block pt-1 border-t border-border/50" : "hidden")}>
                {foldersLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
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
            </div>
          </Card>

          {/* Files Area */}
          <div className="space-y-3.5 min-w-0">
            {/* Results / selection bar */}
            {selectionMode ? (
              <Card className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border-sky-300/70 bg-sky-50/90 backdrop-blur-md p-3 shadow-md dark:border-sky-800/60 dark:bg-sky-950/85">
                <Badge variant="default" className="text-xs font-semibold tabular-nums px-2.5 py-1" data-testid="text-selected-count">
                  محدد {selectedIds.size.toLocaleString("en-US")}
                </Badge>
                <Separator orientation="vertical" className="h-6" />
                <Button
                  size="sm"
                  variant="outline"
                  className="no-min-touch-size h-8 bg-background/80"
                  onClick={() => runBulk("favorite")}
                  disabled={bulkMutation.isPending}
                  data-testid="button-bulk-favorite"
                >
                  <Star className="h-3.5 w-3.5 ml-1 text-amber-500" /> تفضيل
                </Button>
                <Select onValueChange={(v) => runBulk("move", v === "root" ? null : v)} disabled={bulkMutation.isPending}>
                  <SelectTrigger className="w-40 h-8 text-xs bg-background/80" data-testid="select-bulk-move">
                    <FolderInput className="h-3.5 w-3.5 ml-1" />
                    <SelectValue placeholder="نقل إلى مجلد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">بدون مجلد</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="destructive"
                  className="no-min-touch-size h-8"
                  onClick={() => runBulk("delete")}
                  disabled={bulkMutation.isPending}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="h-3.5 w-3.5 ml-1" /> حذف
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetSelection}
                  className="no-min-touch-size h-8 mr-auto"
                  data-testid="button-clear-selection"
                >
                  <X className="h-3.5 w-3.5 ml-1" /> إلغاء التحديد
                </Button>
              </Card>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/70 px-3.5 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground tabular-nums" data-testid="text-results-count">
                    {semanticActive
                      ? `${displayFiles.length.toLocaleString("en-US")} نتيجة دلالية`
                      : `${totalCount.toLocaleString("en-US")} ${totalCount === 1 ? "ملف" : "ملفات"}`}
                  </span>

                  {activeFolderName && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Folder className="h-3 w-3" />
                      {activeFolderName}
                    </Badge>
                  )}

                  {activeCollectionLabel && !selectedFolderId && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Layers className="h-3 w-3" />
                      {activeCollectionLabel}
                    </Badge>
                  )}

                  {selectedCategory !== "all" && (
                    <Badge variant="outline" className="text-xs">
                      التصنيف: {selectedCategory}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {semanticActive && (
                    <span className="text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
                      <Sparkles className="h-3.5 w-3.5" /> مرتّبة حسب الملاءمة الدلالية
                    </span>
                  )}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="no-min-touch-size inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                      مسح الفلاتر
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Loading skeletons */}
            {isLoading && displayFiles.length === 0 && (
              <div className={gridClasses}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-2xl" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && displayFiles.length === 0 && (
              <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card p-10 sm:p-12 shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
                <div className="text-center max-w-md mx-auto">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                  {semanticActive ? (
                    <>
                      <h3 className="text-lg font-semibold mb-1.5">لا توجد نتائج دلالية مطابقة</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        جرّب صياغة أخرى للبحث بالمعنى، أو شغّل «فهرسة دلالية» إن لم تُفهرَس المكتبة بعد.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold mb-1.5">لا توجد ملفات في هذا العرض</h3>
                      <p className="text-sm text-muted-foreground mb-5">
                        جرّب تغيير الفلاتر المختارة أو ارفع أصلاً بصرياً جديداً إلى مكتبة سبق.
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        {hasActiveFilters && (
                          <Button variant="outline" onClick={clearAllFilters}>
                            إعادة ضبط الفلاتر
                          </Button>
                        )}
                        {canUpload && (
                          <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-first">
                            <Upload className="h-4 w-4 ml-2" /> ارفع أول ملف
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Grid view */}
            {viewMode === "grid" && displayFiles.length > 0 && (
              <div className={gridClasses}>{displayFiles.map(renderCard)}</div>
            )}

            {/* List view with clear metadata badges */}
            {viewMode === "list" && displayFiles.length > 0 && (
              <Card className="overflow-hidden rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b text-xs text-muted-foreground">
                      <tr>
                        <th className="text-right py-3 px-4 font-semibold">معاينة</th>
                        <th className="text-right py-3 px-4 font-semibold">الأصل والبيانات الوصفية</th>
                        <th className="text-right py-3 px-4 font-semibold hidden sm:table-cell">الحجم والأبعاد</th>
                        <th className="text-right py-3 px-4 font-semibold hidden md:table-cell">التاريخ</th>
                        <th className="text-right py-3 px-4 font-semibold hidden lg:table-cell">المجلد</th>
                        <th className="text-center py-3 px-4 font-semibold">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {displayFiles.map((file) => {
                        const folderName = file.folderId ? folders.find((f) => f.id === file.folderId)?.name || "-" : "الجذر";
                        const hasAlt = Boolean(file.altText && file.altText.trim().length > 0);
                        const licenseKey = (file as any).licenseType as string | undefined;
                        return (
                          <tr
                            key={file.id}
                            className="hover:bg-muted/35 cursor-pointer transition-colors"
                            onClick={() => handlePreview(file)}
                            data-testid={`row-media-${file.id}`}
                          >
                            <td className="py-3 px-4 w-16">
                              {file.type === "image" ? (
                                <img
                                  src={file.thumbnailUrl || file.url}
                                  alt={file.altText || file.title || file.originalName}
                                  className="w-12 h-12 object-cover rounded-lg border border-border/50 shadow-2xs"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 min-w-[200px]">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-sm truncate max-w-[240px]">
                                  {file.title || file.originalName}
                                </p>
                                {file.isFavorite && (
                                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {file.category && (
                                  <Badge variant="outline" className="text-[11px] px-2 py-0 bg-background/70">
                                    {file.category}
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[11px] px-2 py-0 gap-1",
                                    hasAlt
                                      ? "border-emerald-300/70 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                                      : "border-amber-300/70 text-amber-700 dark:border-amber-800 dark:text-amber-300",
                                  )}
                                >
                                  {hasAlt ? (
                                    <>
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                      نص بديل
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle className="h-2.5 w-2.5" />
                                      بلا نص بديل
                                    </>
                                  )}
                                </Badge>
                                {licenseKey && licenseKey !== "unknown" && (
                                  <Badge variant="secondary" className="text-[11px] px-2 py-0">
                                    {LICENSE_LABELS[licenseKey] || licenseKey}
                                  </Badge>
                                )}
                                {(file as any).isAiGenerated && (
                                  <Badge variant="outline" className="text-[11px] px-2 py-0 border-purple-300/70 text-purple-700 dark:text-purple-300 gap-1">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    AI
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs tabular-nums hidden sm:table-cell">
                              <div className="font-medium text-foreground">{formatFileSize(file.size)}</div>
                              {file.width && file.height && (
                                <div className="text-muted-foreground mt-0.5">
                                  {file.width}×{file.height}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums hidden md:table-cell">
                              {new Date(file.createdAt).toLocaleDateString(LATIN_DATE)}
                            </td>
                            <td className="py-3 px-4 text-xs hidden lg:table-cell">
                              <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-muted-foreground">
                                <Folder className="h-3 w-3" />
                                {folderName}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="no-min-touch-size h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(file.url, "_blank");
                                  }}
                                  title="تنزيل / فتح الأصل"
                                  data-testid={`button-download-row-${file.id}`}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                {canDeleteFile(file) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="no-min-touch-size h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(file);
                                    }}
                                    title="حذف الملف"
                                    data-testid={`button-delete-row-${file.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Infinite-scroll sentinel + loader (literal mode only — semantic
                returns a single ranked page) */}
            {!semanticActive && <div ref={sentinelRef} />}
            {!semanticActive && isFetchingNextPage && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>جاري تحميل المزيد من الأصول...</span>
              </div>
            )}
          </div>
        </div>
      </DashboardPageShell>

      {/* Dialogs */}
      <MediaUploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} folders={folders} />
      <MediaPreviewDialog file={previewFile} open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)} folders={folders} />
      <CreateFolderDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen} folders={folders} />
      <AIImageGeneratorDialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        onImageGenerated={handleSaveGenerated}
        insertLabel="حفظ في المكتبة"
      />
    </DashboardLayout>
  );
}
