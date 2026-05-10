import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Image as ImageIcon,
  Upload,
  Sparkles,
  X,
  Check,
  Filter,
  Star,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { MediaFile } from "@shared/schema";

interface MediaLibraryPickerProps {
  onSelect: (media: MediaFile) => void;
  onClose: () => void;
  isOpen: boolean;
  articleTitle?: string;
  articleContent?: string;
  currentImageUrl?: string;
}

const uploadFormSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  isFavorite: z.boolean().default(false),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

const CATEGORIES = [
  { value: "all", label: "الكل" },
  { value: "مقالات", label: "مقالات" },
  { value: "شعارات", label: "شعارات" },
  { value: "صور المراسلين", label: "صور المراسلين" },
  { value: "بانرات", label: "بانرات" },
  { value: "عام", label: "عام" },
];

export function MediaLibraryPicker({
  onSelect,
  onClose,
  isOpen,
  articleTitle,
  articleContent,
  currentImageUrl,
}: MediaLibraryPickerProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [allFiles, setAllFiles] = useState<MediaFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      isFavorite: false,
    },
  });

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-focus search input when dialog opens
  useEffect(() => {
    if (isOpen && activeTab === "library") {
      setTimeout(() => {
        const searchInput = document.querySelector('[data-testid="input-search"]') as HTMLInputElement;
        searchInput?.focus();
      }, 100);
    }
  }, [isOpen, activeTab]);

  // Build query params for media API
  const mediaQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "20");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (selectedCategory !== "all") params.set("category", selectedCategory);
    if (showFavorites) params.set("isFavorite", "true");
    if (showRecent) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      params.set("since", sevenDaysAgo.toISOString());
    }
    return `/api/media?${params.toString()}`;
  }, [page, debouncedSearch, selectedCategory, showFavorites, showRecent]);

  // Fetch media library
  const { data: mediaData, isLoading: isLoadingMedia, isFetching } = useQuery<{
    files: MediaFile[];
    total: number;
    hasMore: boolean;
  }>({
    queryKey: [mediaQueryUrl],
    enabled: isOpen && activeTab === "library",
  });

  // Accumulate files across pages
  useEffect(() => {
    if (mediaData?.files) {
      if (page === 1) {
        setAllFiles(mediaData.files);
      } else {
        setAllFiles(prev => {
          const existingIds = new Set(prev.map(f => f.id));
          const newFiles = mediaData.files.filter(f => !existingIds.has(f.id));
          return [...prev, ...newFiles];
        });
      }
    }
  }, [mediaData?.files, page]);

  // Reset files when filters change
  useEffect(() => {
    setAllFiles([]);
    setPage(1);
  }, [debouncedSearch, selectedCategory, showFavorites, showRecent]);

  // Fetch AI suggestions (conditional)
  const suggestionsQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (articleTitle) params.set("title", articleTitle);
    if (articleContent) params.set("content", articleContent);
    params.set("limit", "12");
    return `/api/media/suggestions?${params.toString()}`;
  }, [articleTitle, articleContent]);

  const { data: suggestionsData, isLoading: isLoadingSuggestions } = useQuery<{
    suggestions: (MediaFile & { relevanceScore: number; keywords: string[] })[];
    extractedKeywords: string[];
  }>({
    queryKey: [suggestionsQueryUrl],
    enabled: isOpen && activeTab === "ai" && !!articleTitle,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormValues & { file: File }) => {
      const formData = new FormData();
      formData.append("file", data.file);
      if (data.title) formData.append("title", data.title);
      if (data.description) formData.append("description", data.description);
      if (data.category) formData.append("category", data.category);
      formData.append("isFavorite", String(data.isFavorite));

      return apiRequest<MediaFile>("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      });
    },
    onSuccess: (uploadedMedia) => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({
        title: "تم الرفع بنجاح",
        description: "تم رفع الملف ونجهزه للاختيار",
      });
      // Auto-select uploaded media and close
      onSelect(uploadedMedia);
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "فشل الرفع",
        description: error.message || "حدث خطأ أثناء رفع الملف",
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const handleClose = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setSelectedCategory("all");
    setShowFavorites(false);
    setShowRecent(false);
    setSelectedMediaId(null);
    setPage(1);
    setAllFiles([]);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadProgress(0);
    form.reset();
    onClose();
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast({
        title: "نوع ملف غير مدعوم",
        description: "يرجى اختيار صورة أو فيديو",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }

    if (!form.getValues("title")) {
      form.setValue("title", file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const onUploadSubmit = (data: UploadFormValues) => {
    if (!selectedFile) {
      toast({
        title: "لم يتم اختيار ملف",
        description: "يرجى اختيار ملف للرفع",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(0);
    uploadMutation.mutate({
      ...data,
      file: selectedFile,
    });

    // Simulate progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleMediaSelect = (media: MediaFile) => {
    onSelect(media);
    handleClose();
  };

  const handleMediaClick = (mediaId: string) => {
    setSelectedMediaId(mediaId);
  };

  const handleMediaDoubleClick = (media: MediaFile) => {
    handleMediaSelect(media);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setSelectedCategory("all");
    setShowFavorites(false);
    setShowRecent(false);
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== "all") count++;
    if (showFavorites) count++;
    if (showRecent) count++;
    return count;
  }, [selectedCategory, showFavorites, showRecent]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const renderMediaCard = (media: MediaFile, relevanceScore?: number) => {
    const isSelected = selectedMediaId === media.id;
    const isCurrent = currentImageUrl === media.url;

    return (
      <Card
        key={media.id}
        className={`overflow-hidden cursor-pointer transition-all hover-elevate ${
          isSelected || isCurrent ? "border-primary border-2" : ""
        }`}
        onClick={() => handleMediaClick(media.id)}
        onDoubleClick={() => handleMediaDoubleClick(media)}
        data-testid={`card-media-${media.id}`}
      >
        <div className="aspect-square bg-muted relative">
          {media.type === "image" ? (
            <img
              src={media.thumbnailUrl || media.url}
              alt={media.altText || media.title || media.fileName}
              className="w-full h-full object-cover"
              loading="lazy"
              data-testid={`img-media-${media.id}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          {(isSelected || isCurrent) && (
            <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
          {relevanceScore !== undefined && (
            <Badge className="absolute top-1 left-1 text-xs" variant="secondary">
              {Math.round(relevanceScore * 100)}%
            </Badge>
          )}
        </div>
        <div className="p-2 space-y-1.5">
          <p
            className="text-xs font-medium truncate"
            title={media.title || media.fileName}
            data-testid={`text-filename-${media.id}`}
          >
            {media.title || media.fileName}
          </p>
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            variant={isSelected || isCurrent ? "default" : "outline"}
            onClick={(e) => {
              e.stopPropagation();
              handleMediaSelect(media);
            }}
            data-testid={`button-select-${media.id}`}
          >
            {isSelected || isCurrent ? "محدد" : "اختيار"}
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-4xl max-h-[80vh] p-0 gap-0"
        dir="rtl"
        data-testid="dialog-media-picker"
      >
        <DialogHeader className="p-6 pb-4">
          <DialogTitle data-testid="heading-media-picker">
            اختر من مكتبة الوسائط
          </DialogTitle>
          <DialogDescription>
            تصفح المكتبة أو ارفع ملفًا جديدًا أو احصل على اقتراحات ذكية
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col"
        >
          <TabsList className="mx-6 grid w-auto grid-cols-3">
            <TabsTrigger value="library" data-testid="tab-library">
              <ImageIcon className="h-4 w-4 ml-2" />
              المكتبة
            </TabsTrigger>
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Upload className="h-4 w-4 ml-2" />
              رفع جديد
            </TabsTrigger>
            {articleTitle && (
              <TabsTrigger value="ai" data-testid="tab-ai">
                <Sparkles className="h-4 w-4 ml-2" />
                اقتراحات ذكية
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab 1: Library Browser */}
          <TabsContent value="library" className="flex-1 p-6 pt-4 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث في مكتبة الوسائط..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="input-search"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={showFavorites ? "default" : "outline"}
                className="cursor-pointer hover-elevate"
                onClick={() => {
                  setShowFavorites(!showFavorites);
                  setPage(1);
                }}
                data-testid="filter-favorites"
              >
                <Star className="h-3 w-3 ml-1" />
                المفضلة
              </Badge>
              <Badge
                variant={showRecent ? "default" : "outline"}
                className="cursor-pointer hover-elevate"
                onClick={() => {
                  setShowRecent(!showRecent);
                  setPage(1);
                }}
                data-testid="filter-recent"
              >
                <Clock className="h-3 w-3 ml-1" />
                الأخيرة
              </Badge>
              {CATEGORIES.map((cat) => (
                <Badge
                  key={cat.value}
                  variant={selectedCategory === cat.value ? "default" : "outline"}
                  className="cursor-pointer hover-elevate"
                  onClick={() => {
                    setSelectedCategory(cat.value);
                    setPage(1);
                  }}
                  data-testid={`filter-category-${cat.value}`}
                >
                  {cat.label}
                </Badge>
              ))}
              {activeFilterCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 ml-1" />
                  مسح ({activeFilterCount})
                </Button>
              )}
            </div>

            {/* Media Grid - with fixed height and scroll */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 280px)' }}>
              {isLoadingMedia ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                      <Skeleton className="aspect-square" />
                      <div className="p-2 space-y-1">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-6 w-full" />
                      </div>
                    </Card>
                  ))}
                </div>
              ) : allFiles.length === 0 && !isFetching ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ImageIcon className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium" data-testid="text-empty">
                    لا توجد ملفات
                  </p>
                  <p className="text-sm text-muted-foreground">
                    جرب تغيير الفلاتر أو ارفع ملفًا جديدًا
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {allFiles.map((media) => renderMediaCard(media))}
                  </div>
                  {mediaData?.hasMore && (
                    <div className="mt-4 text-center">
                      <Button
                        onClick={() => setPage((p) => p + 1)}
                        variant="outline"
                        disabled={isFetching}
                        data-testid="button-load-more"
                      >
                        {isFetching ? "جاري التحميل..." : "تحميل المزيد"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* Tab 2: Upload New */}
          <TabsContent value="upload" className="flex-1 p-6 pt-4 overflow-y-auto">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onUploadSubmit)} className="space-y-4">
                {/* Drag & Drop Zone */}
                {!selectedFile && (
                  <Card
                    className={`border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                      isDragging ? "border-primary bg-primary/5" : "border-border"
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => document.getElementById("file-input-picker")?.click()}
                    data-testid="drop-zone-upload"
                  >
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">اسحب وأفلت الملف هنا</p>
                    <p className="text-xs text-muted-foreground">
                      أو انقر لاختيار ملف من جهازك
                    </p>
                    <input
                      id="file-input-picker"
                      type="file"
                      className="hidden"
                      accept="image/*,video/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                      data-testid="input-file-upload"
                    />
                  </Card>
                )}

                {/* File Preview */}
                {selectedFile && (
                  <Card className="p-4">
                    <div className="flex items-start gap-4">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-24 h-24 object-cover rounded"
                          data-testid="img-preview"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-muted rounded flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-medium truncate"
                          data-testid="text-upload-filename"
                        >
                          {selectedFile.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewUrl(null);
                        }}
                        data-testid="button-remove-upload"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="mt-4">
                        <Progress value={uploadProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          جاري الرفع... {uploadProgress}%
                        </p>
                      </div>
                    )}
                  </Card>
                )}

                {/* Quick Metadata Form */}
                {selectedFile && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>العنوان (اختياري)</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-upload-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الوصف (اختياري)</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={3}
                              data-testid="input-upload-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>التصنيف</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-upload-category">
                                <SelectValue placeholder="اختر التصنيف" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CATEGORIES.filter((c) => c.value !== "all").map(
                                (cat) => (
                                  <SelectItem key={cat.value} value={cat.value}>
                                    {cat.label}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="isFavorite"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-upload-favorite"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">إضافة إلى المفضلة</FormLabel>
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!selectedFile || uploadMutation.isPending}
                      data-testid="button-upload-select"
                    >
                      {uploadMutation.isPending ? "جاري الرفع..." : "رفع واختيار"}
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          </TabsContent>

          {/* Tab 3: AI Suggestions */}
          {articleTitle && (
            <TabsContent value="ai" className="flex-1 p-6 pt-4 overflow-y-auto">
              <div className="space-y-4">
                {/* Extracted Keywords */}
                {suggestionsData?.extractedKeywords && (
                  <div>
                    <p className="text-sm font-medium mb-2">الكلمات المفتاحية:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestionsData.extractedKeywords.map((keyword, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          data-testid={`badge-keyword-${i}`}
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions Grid */}
                {isLoadingSuggestions ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Card key={i} className="overflow-hidden">
                        <Skeleton className="aspect-video" />
                        <div className="p-3 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-8 w-full" />
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : suggestionsData?.suggestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium" data-testid="text-no-suggestions">
                      لم يتم العثور على اقتراحات مناسبة
                    </p>
                    <p className="text-sm text-muted-foreground">
                      جرب المكتبة أو ارفع ملفًا جديدًا
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {suggestionsData?.suggestions.map((media) =>
                      renderMediaCard(media, media.relevanceScore)
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
