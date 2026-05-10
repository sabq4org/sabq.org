import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
  Filter,
  Download,
  Trash2,
} from "lucide-react";
import { MediaCard } from "@/components/dashboard/MediaCard";
import { FolderTree } from "@/components/dashboard/FolderTree";
import { MediaUploadDialog } from "@/components/dashboard/MediaUploadDialog";
import { MediaPreviewDialog } from "@/components/dashboard/MediaPreviewDialog";
import { CreateFolderDialog } from "@/components/dashboard/CreateFolderDialog";
import { format } from "date-fns";
import type { MediaFile, MediaFolder } from "@shared/schema";

type ViewMode = "grid" | "list";

export default function MediaLibrary() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isFavoritesView, setIsFavoritesView] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Dialog State
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);

  // Fetch folders
  const { data: foldersRaw, isLoading: foldersLoading } = useQuery<MediaFolder[]>({
    queryKey: ["/api/media/folders"],
    enabled: !!user,
  });
  const folders = Array.isArray(foldersRaw) ? foldersRaw : [];

  // Fetch media files with filters
  const { data: mediaData, isLoading: mediaLoading } = useQuery({
    queryKey: [
      "/api/media",
      searchTerm,
      selectedFolderId,
      selectedCategory,
      isFavoritesView,
      page,
      limit,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", limit.toString());
      if (searchTerm) params.append("search", searchTerm);
      if (selectedFolderId) params.append("folderId", selectedFolderId);
      if (selectedCategory && selectedCategory !== "all") params.append("category", selectedCategory);
      if (isFavoritesView) params.append("isFavorite", "true");

      const response = await fetch(`/api/media?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch media files");
      }
      return response.json();
    },
    enabled: !!user,
  });

  const files: MediaFile[] = mediaData?.files || [];
  const totalCount = mediaData?.total || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Calculate file counts per folder
  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach((file) => {
      if (file.folderId) {
        counts[file.folderId] = (counts[file.folderId] || 0) + 1;
      }
    });
    return counts;
  }, [files]);

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (file: MediaFile) => {
      return apiRequest(`/api/media/${file.id}`, {
        method: "PUT",
        body: JSON.stringify({ isFavorite: !file.isFavorite }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest(`/api/media/${fileId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({
        title: "تم الحذف بنجاح",
        description: "تم حذف الملف من المكتبة",
      });
    },
    onError: (error: any) => {
      toast({
        title: "فشل الحذف",
        description: error.message || "حدث خطأ أثناء حذف الملف",
        variant: "destructive",
      });
    },
  });

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setIsFavoritesView(false);
    setPage(1);
  };

  const handleSelectFavorites = () => {
    setIsFavoritesView(true);
    setSelectedFolderId(null);
    setPage(1);
  };

  const handlePreview = (file: MediaFile) => {
    setPreviewFile(file);
  };

  const handleToggleFavorite = (file: MediaFile) => {
    toggleFavoriteMutation.mutate(file);
  };

  const handleDelete = (file: MediaFile) => {
    if (confirm(`هل تريد حذف الملف "${file.title || file.originalName}"؟`)) {
      deleteMutation.mutate(file.id);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const isLoading = foldersLoading || mediaLoading;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="heading-media-library">
              مكتبة الوسائط
            </h1>
            <p className="text-sm text-muted-foreground">
              إدارة الصور والفيديوهات والملفات
            </p>
          </div>
          <Button
            onClick={() => setUploadDialogOpen(true)}
            className="gap-2"
            data-testid="button-upload"
          >
            <Upload className="h-4 w-4" />
            رفع ملف
          </Button>
        </div>

        {/* Filters Bar */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            <div className="relative flex-1 w-full md:max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث في الملفات..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="pr-9"
                data-testid="input-search"
              />
            </div>

            <Select
              value={selectedCategory}
              onValueChange={(value) => {
                setSelectedCategory(value);
                setPage(1);
              }}
            >
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
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Sidebar */}
          <Card className="p-4 h-fit">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">المجلدات</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setFolderDialogOpen(true)}
                  data-testid="button-create-folder"
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
              </div>

              {foldersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <FolderTree
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={handleSelectFolder}
                  onSelectFavorites={handleSelectFavorites}
                  isFavoritesSelected={isFavoritesView}
                  fileCounts={fileCounts}
                />
              )}
            </div>
          </Card>

          {/* Files Area */}
          <div className="space-y-4">
            {/* Results Info */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span data-testid="text-results-count">
                {totalCount} {totalCount === 1 ? 'ملف' : 'ملفات'}
              </span>
              {totalPages > 1 && (
                <span>
                  صفحة {page} من {totalPages}
                </span>
              )}
            </div>

            {/* Loading State */}
            {isLoading && (
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                    : "space-y-2"
                }
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton
                    key={i}
                    className={viewMode === "grid" ? "aspect-square" : "h-20"}
                  />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && files.length === 0 && (
              <Card className="p-12">
                <div className="text-center">
                  <ImageIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">لا توجد ملفات بعد</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    ابدأ برفع ملفك الأول إلى المكتبة
                  </p>
                  <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-first">
                    <Upload className="h-4 w-4 ml-2" />
                    ارفع أول ملف
                  </Button>
                </div>
              </Card>
            )}

            {/* Grid View */}
            {!isLoading && viewMode === "grid" && files.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {files.map((file) => (
                  <MediaCard
                    key={file.id}
                    file={file}
                    onPreview={handlePreview}
                    onToggleFavorite={handleToggleFavorite}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {/* List View */}
            {!isLoading && viewMode === "list" && files.length > 0 && (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-right py-3 px-4 font-medium text-sm">معاينة</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">الاسم</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">الحجم</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">النوع</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">التاريخ</th>
                        <th className="text-right py-3 px-4 font-medium text-sm">المجلد</th>
                        <th className="text-center py-3 px-4 font-medium text-sm">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr
                          key={file.id}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => handlePreview(file)}
                          data-testid={`row-media-${file.id}`}
                        >
                          <td className="py-3 px-4">
                            {file.type === "image" ? (
                              <img
                                src={file.thumbnailUrl || file.url}
                                alt={file.altText || file.title || file.originalName}
                                className="w-12 h-12 object-cover rounded"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-sm truncate max-w-[200px]">
                                {file.title || file.originalName}
                              </p>
                              {file.category && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {file.category}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm">{formatFileSize(file.size)}</td>
                          <td className="py-3 px-4 text-sm">{file.type}</td>
                          <td className="py-3 px-4 text-sm">
                            {format(new Date(file.createdAt), 'yyyy/MM/dd')}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {file.folderId
                              ? folders.find((f) => f.id === file.folderId)?.name || '-'
                              : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(file.url, '_blank');
                                }}
                                data-testid={`button-download-row-${file.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(file);
                                }}
                                data-testid={`button-delete-row-${file.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  السابق
                </Button>
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages: (number | string)[] = [];
                    const showPages = 5;
                    const halfShow = Math.floor(showPages / 2);
                    
                    let startPage = Math.max(1, page - halfShow);
                    let endPage = Math.min(totalPages, page + halfShow);
                    
                    if (endPage - startPage + 1 < showPages) {
                      if (startPage === 1) {
                        endPage = Math.min(totalPages, startPage + showPages - 1);
                      } else {
                        startPage = Math.max(1, endPage - showPages + 1);
                      }
                    }
                    
                    if (startPage > 1) {
                      pages.push(1);
                      if (startPage > 2) pages.push('...');
                    }
                    
                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(i);
                    }
                    
                    if (endPage < totalPages) {
                      if (endPage < totalPages - 1) pages.push('...');
                      pages.push(totalPages);
                    }
                    
                    return pages.map((p, idx) => (
                      typeof p === 'number' ? (
                        <Button
                          key={`page-${p}`}
                          variant={page === p ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(p)}
                          className="min-w-[32px]"
                          data-testid={`button-page-${p}`}
                        >
                          {p}
                        </Button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      )
                    ));
                  })()}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  التالي
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <MediaUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        folders={folders}
      />

      <MediaPreviewDialog
        file={previewFile}
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        folders={folders}
      />

      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        folders={folders}
      />
    </DashboardLayout>
  );
}
