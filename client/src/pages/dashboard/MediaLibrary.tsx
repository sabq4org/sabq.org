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
type Collection = "" | "favorites" | "most_used" | "unused" | "no_alt";

const PAGE_SIZE = 30;

const SMART_COLLECTIONS: { value: Collection; label: string; icon: typeof Star }[] = [
  { value: "", label: "الكل", icon: Sparkles },
  { value: "favorites", label: "المفضلة", icon: Star },
  { value: "most_used", label: "الأكثر استخداماً", icon: TrendingUp },
  { value: "unused", label: "غير المستخدمة", icon: EyeOff },
  { value: "no_alt", label: "بلا نص بديل", icon: AlertCircle },
];

// Group label for a media file's creation date (newest buckets first).
function dateBucket(value: string | Date): string {
  const d = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDays <= 0) return "اليوم";
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return "هذا الأسبوع";
  if (diffDays < 30) return "هذا الشهر";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "long", year: "numeric" }).format(d);
}

export default function MediaLibrary() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
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

  // Group by date (grid view, recency-ordered collections only)
  const groupByDate = viewMode === "grid" && collection !== "most_used";
  const grouped = useMemo(() => {
    if (!groupByDate) return null;
    const map = new Map<string, MediaFile[]>();
    for (const f of files) {
      const key = dateBucket(f.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries());
  }, [files, groupByDate]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const masonryClasses = "columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3";

  const renderCard = (file: MediaFile) => (
    <MediaCard
      key={file.id}
      file={file}
      onPreview={handlePreview}
      onToggleFavorite={handleToggleFavorite}
      onDelete={handleDelete}
      canDelete={canDeleteFile(file)}
      layout="masonry"
      selectionMode={selectionMode}
      selected={selectedIds.has(file.id)}
      onToggleSelect={handleToggleSelect}
    />
  );

  const isLoading = foldersLoading || mediaLoading;

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
                placeholder="بحث في الملفات..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pr-9"
                data-testid="input-search"
              />
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
                  {totalCount} {totalCount === 1 ? "ملف" : "ملفات"}
                </span>
              </div>
            )}

            {/* Loading skeletons */}
            {isLoading && files.length === 0 && (
              <div className={masonryClasses}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="mb-3 w-full break-inside-avoid" style={{ height: 120 + (i % 4) * 60 }} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && files.length === 0 && (
              <Card className="p-12">
                <div className="text-center">
                  <ImageIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">لا توجد ملفات</h3>
                  <p className="text-sm text-muted-foreground mb-4">جرّب تغيير الفلاتر أو ارفع ملفاً جديداً</p>
                  {canUpload && (
                    <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-first">
                      <Upload className="h-4 w-4 ml-2" /> ارفع أول ملف
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {/* Grid (masonry) view */}
            {viewMode === "grid" && files.length > 0 && (
              groupByDate && grouped ? (
                <div className="space-y-6">
                  {grouped.map(([label, items]) => (
                    <section key={label} className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
                      <div className={masonryClasses}>{items.map(renderCard)}</div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className={masonryClasses}>{files.map(renderCard)}</div>
              )
            )}

            {/* List view */}
            {viewMode === "list" && files.length > 0 && (
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
                      {files.map((file) => (
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

            {/* Infinite-scroll sentinel + loader */}
            <div ref={sentinelRef} />
            {isFetchingNextPage && (
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
