import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { IFoxUploader } from "@/components/admin/ifox/IFoxUploader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import {
  Image,
  Video,
  FileAudio,
  FileText,
  Search,
  Filter,
  Upload,
  Trash2,
  Eye,
  Download,
  Copy,
  Edit,
  X,
  Grid,
  List,
  HardDrive,
  FolderOpen,
  Calendar,
  User,
  SortAsc,
  SortDesc,
  ImagePlus,
  Sparkles,
  Brain,
  MessageSquare,
  Cpu,
  GraduationCap,
  Users,
  Lightbulb
} from "lucide-react";

interface MediaFile {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "document";
  url: string;
  thumbnailUrl?: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  category: string;
  tags: string[];
  altText?: string;
  caption?: string;
  uploadedBy: string;
  uploadedAt: string;
  lastModified: string;
  usageCount: number;
}

interface StorageInfo {
  used: number;
  total: number;
  percentage: number;
}

const categoryIcons = {
  "ai-news": Sparkles,
  "ai-voice": MessageSquare,
  "ai-tools": Cpu,
  "ai-academy": GraduationCap,
  "ai-community": Users,
  "ai-insights": Lightbulb,
  "ai-opinions": Eye
};

const categoryColors = {
  "ai-news": "from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]",
  "ai-voice": "from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]",
  "ai-tools": "from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]",
  "ai-academy": "from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]",
  "ai-community": "from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]",
  "ai-insights": "from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]",
  "ai-opinions": "from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]"
};

export default function IFoxMedia() {
  useRoleProtection('admin');
  const { toast } = useToast();
  
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [editingFile, setEditingFile] = useState<MediaFile | null>(null);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Fetch media files
  const { data: filesRaw, isLoading, error: filesError } = useQuery<MediaFile[]>({
    queryKey: ["/api/admin/ifox/media", { type: selectedType, category: selectedCategory, search: searchQuery, sortBy, sortOrder }]
  });
  const files = Array.isArray(filesRaw) ? filesRaw : [];

  // Fetch storage info
  const { data: storageInfo, error: storageError } = useQuery<StorageInfo>({
    queryKey: ["/api/admin/ifox/media/storage"]
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest(`/api/admin/ifox/media/${fileId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/media"] });
      toast({
        title: "تم الحذف بنجاح",
        description: "تم حذف الملف بنجاح",
      });
      setSelectedFile(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف الملف",
        variant: "destructive",
      });
    }
  });

  // Update file mutation
  const updateFileMutation = useMutation({
    mutationFn: async (file: MediaFile) => {
      return apiRequest(`/api/admin/ifox/media/${file.id}`, {
        method: "PUT",
        body: JSON.stringify(file),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/media"] });
      toast({
        title: "تم التحديث بنجاح",
        description: "تم تحديث معلومات الملف بنجاح",
      });
      setEditingFile(null);
      setSelectedFile(null);
    }
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "image": return Image;
      case "video": return Video;
      case "audio": return FileAudio;
      case "document": return FileText;
      default: return FileText;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "تم النسخ",
      description: "تم نسخ الرابط إلى الحافظة",
    });
  };

  const filteredFiles = files.filter(file => {
    const matchesType = selectedType === "all" || file.type === selectedType;
    const matchesCategory = selectedCategory === "all" || file.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesType && matchesCategory && matchesSearch;
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "date":
        comparison = new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        break;
      case "size":
        comparison = b.size - a.size;
        break;
    }
    return sortOrder === "desc" ? comparison : -comparison;
  });

  const handleBulkDelete = () => {
    if (selectedFiles.size === 0) return;
    
    // Implement bulk delete
    selectedFiles.forEach(fileId => {
      deleteFileMutation.mutate(fileId);
    });
    setSelectedFiles(new Set());
  };

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6" dir="rtl">
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="space-y-3 sm:space-y-4"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-info)/1)] shadow-[0_10px_15px_hsl(var(--ifox-surface-overlay)/.1)] shadow-[hsl(var(--ifox-accent-primary)/.3)]">
                    <Image className="w-6 h-6 sm:w-8 sm:h-8 text-[hsl(var(--ifox-text-primary))]" data-testid="icon-media-library" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-info)/1)] bg-clip-text text-transparent truncate" data-testid="text-page-title">
                      مكتبة الوسائط
                    </h1>
                    <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] hidden sm:block" data-testid="text-page-description">إدارة ملفات الوسائط المتعددة</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {selectedFiles.size > 0 && (
                    <Button
                      variant="destructive"
                      onClick={handleBulkDelete}
                      className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm"
                      data-testid="button-bulk-delete"
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">حذف المحدد</span>
                      <span className="sm:hidden">حذف</span> ({selectedFiles.size})
                    </Button>
                  )}
                  <Button
                    onClick={() => setIsUploaderOpen(true)}
                    className="gap-1 sm:gap-2 bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-info)/1)] hover:from-[hsl(var(--ifox-accent-muted)/1)] hover:to-[hsl(var(--ifox-info-muted)/1)] flex-1 sm:flex-none text-xs sm:text-sm"
                    data-testid="button-upload-new"
                  >
                    <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">رفع ملفات جديدة</span>
                    <span className="sm:hidden">رفع</span>
                  </Button>
                </div>
              </div>

              {/* Storage Info */}
              {storageInfo && (
                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/.1)] to-[hsl(var(--ifox-info)/.1)] border-[hsl(var(--ifox-surface-overlay)/.1)]" data-testid="card-storage-info">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-accent-primary))]" data-testid="icon-storage" />
                        <span className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))]" data-testid="text-storage-label">استخدام المساحة</span>
                      </div>
                      <span className="text-[hsl(var(--ifox-text-secondary))] text-xs sm:text-sm" data-testid="text-storage-usage">
                        {formatFileSize(storageInfo.used)} من {formatFileSize(storageInfo.total)}
                      </span>
                    </div>
                    <Progress value={storageInfo.percentage} className="h-1.5 sm:h-2 bg-[hsl(var(--ifox-surface-overlay)/.1)]" data-testid="progress-storage" />
                  </CardContent>
                </Card>
              )}
            </motion.div>

            {/* Filters and Search */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="space-y-3 sm:space-y-4"
            >
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 md:gap-4">
                <div className="flex-1 min-w-0 sm:min-w-[200px] md:min-w-[300px] relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-text-secondary))]" data-testid="icon-search" />
                  <Input
                    placeholder="بحث بالاسم أو الكلمات المفتاحية..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10 text-xs sm:text-sm bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                    data-testid="input-search"
                  />
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="w-full sm:w-[120px] md:w-[150px] text-xs sm:text-sm bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))]" data-testid="select-type">
                      <SelectValue placeholder="النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأنواع</SelectItem>
                      <SelectItem value="image">صور</SelectItem>
                      <SelectItem value="video">فيديو</SelectItem>
                      <SelectItem value="audio">صوت</SelectItem>
                      <SelectItem value="document">مستندات</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-full sm:w-[140px] md:w-[180px] text-xs sm:text-sm bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))]" data-testid="select-category">
                      <SelectValue placeholder="التصنيف" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع التصنيفات</SelectItem>
                      <SelectItem value="ai-news">أخبار AI</SelectItem>
                      <SelectItem value="ai-voice">AI Voice</SelectItem>
                      <SelectItem value="ai-tools">AI Tools</SelectItem>
                      <SelectItem value="ai-academy">AI Academy</SelectItem>
                      <SelectItem value="ai-community">AI Community</SelectItem>
                      <SelectItem value="ai-insights">AI Insights</SelectItem>
                      <SelectItem value="ai-opinions">AI Opinions</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                    <SelectTrigger className="w-full sm:w-[120px] md:w-[150px] text-xs sm:text-sm bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))]" data-testid="select-sort">
                      <SelectValue placeholder="ترتيب حسب" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">الاسم</SelectItem>
                      <SelectItem value="date">التاريخ</SelectItem>
                      <SelectItem value="size">الحجم</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      className="text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-primary))] h-8 w-8 sm:h-9 sm:w-9"
                      data-testid="button-sort-order"
                    >
                      {sortOrder === "asc" ? <SortAsc className="w-3 h-3 sm:w-4 sm:h-4" /> : <SortDesc className="w-3 h-3 sm:w-4 sm:h-4" />}
                    </Button>

                    <div className="flex gap-1 bg-[hsl(var(--ifox-surface-overlay)/.05)] rounded-lg p-1">
                      <Button
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setViewMode("grid")}
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        data-testid="button-view-grid"
                      >
                        <Grid className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setViewMode("list")}
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        data-testid="button-view-list"
                      >
                        <List className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Media Grid/List */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-square rounded-lg sm:rounded-xl bg-[hsl(var(--ifox-surface-overlay)/.05)] animate-pulse" />
                  ))}
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {sortedFiles.map((file) => {
                    const Icon = getFileIcon(file.type);
                    const CategoryIcon = categoryIcons[file.category as keyof typeof categoryIcons];
                    const isSelected = selectedFiles.has(file.id);
                    
                    return (
                      <motion.div
                        key={file.id}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        whileHover={{ scale: 1.02 }}
                        className={cn(
                          "group relative rounded-lg sm:rounded-xl overflow-hidden bg-[hsl(var(--ifox-surface-overlay)/.05)] border border-[hsl(var(--ifox-surface-overlay)/.1)]",
                          "hover:border-[hsl(var(--ifox-surface-overlay)/.2)] transition-all duration-200 cursor-pointer",
                          isSelected && "border-[hsl(var(--ifox-accent-primary))] bg-[hsl(var(--ifox-accent-primary)/.1)]"
                        )}
                        onClick={() => setSelectedFile(file)}
                        data-testid={`card-media-${file.id}`}
                      >
                        <div className="aspect-square relative">
                          {file.type === "image" && file.thumbnailUrl ? (
                            <img
                              src={file.thumbnailUrl}
                              alt={file.altText || file.name}
                              className="w-full h-full object-cover"
                              data-testid={`img-thumbnail-${file.id}`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.05)] to-[hsl(var(--ifox-surface-overlay)/.1)]">
                              <Icon className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-[hsl(var(--ifox-text-secondary))]" data-testid={`icon-file-${file.id}`} />
                            </div>
                          )}
                          
                          {/* Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 space-y-1 sm:space-y-2">
                              <p className="text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm font-medium truncate min-w-0" data-testid={`text-filename-${file.id}`}>{file.name}</p>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[hsl(var(--ifox-text-secondary))] text-[10px] sm:text-xs truncate min-w-0" data-testid={`text-filesize-${file.id}`}>{formatFileSize(file.size)}</span>
                                {CategoryIcon && (
                                  <CategoryIcon className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-text-secondary))] flex-shrink-0" data-testid={`icon-category-${file.id}`} />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Selection Checkbox */}
                          <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                const newSelected = new Set(selectedFiles);
                                if (isSelected) {
                                  newSelected.delete(file.id);
                                } else {
                                  newSelected.add(file.id);
                                }
                                setSelectedFiles(newSelected);
                              }}
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-white/30 bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`checkbox-select-${file.id}`}
                            />
                          </div>

                          {/* Usage Badge */}
                          {file.usageCount > 0 && (
                            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                              <Badge variant="secondary" className="bg-black/50 text-[hsl(var(--ifox-text-primary))] text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5" data-testid={`badge-usage-${file.id}`}>
                                {file.usageCount}x
                              </Badge>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1.5 sm:space-y-2">
                  {sortedFiles.map((file) => {
                    const Icon = getFileIcon(file.type);
                    const CategoryIcon = categoryIcons[file.category as keyof typeof categoryIcons];
                    const isSelected = selectedFiles.has(file.id);
                    
                    return (
                      <motion.div
                        key={file.id}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className={cn(
                          "flex items-center gap-2 sm:gap-3 md:gap-4 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl bg-[hsl(var(--ifox-surface-overlay)/.05)] border border-[hsl(var(--ifox-surface-overlay)/.1)]",
                          "hover:border-[hsl(var(--ifox-surface-overlay)/.2)] transition-all duration-200 cursor-pointer",
                          isSelected && "border-[hsl(var(--ifox-accent-primary))] bg-[hsl(var(--ifox-accent-primary)/.1)]"
                        )}
                        onClick={() => setSelectedFile(file)}
                        data-testid={`list-item-${file.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newSelected = new Set(selectedFiles);
                            if (isSelected) {
                              newSelected.delete(file.id);
                            } else {
                              newSelected.add(file.id);
                            }
                            setSelectedFiles(newSelected);
                          }}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-white/30 bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`checkbox-list-${file.id}`}
                        />
                        
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-md sm:rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.1)] flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-[hsl(var(--ifox-text-secondary))]" data-testid={`icon-list-${file.id}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm md:text-base font-medium truncate" data-testid={`text-list-filename-${file.id}`}>{file.name}</p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4 mt-0.5 sm:mt-1">
                            <span className="text-[hsl(var(--ifox-text-secondary))] text-[10px] sm:text-xs md:text-sm" data-testid={`text-list-size-${file.id}`}>{formatFileSize(file.size)}</span>
                            <span className="text-[hsl(var(--ifox-text-secondary))] text-[10px] sm:text-xs md:text-sm hidden sm:inline" data-testid={`text-list-date-${file.id}`}>
                              {format(new Date(file.uploadedAt), "d MMM yyyy", { locale: ar })}
                            </span>
                            {CategoryIcon && (
                              <div className="flex items-center gap-1 hidden md:flex">
                                <CategoryIcon className="w-3 h-3 text-[hsl(var(--ifox-text-secondary))]" />
                                <span className="text-[hsl(var(--ifox-text-secondary))] text-xs">{file.category}</span>
                              </div>
                            )}
                            {file.usageCount > 0 && (
                              <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5" data-testid={`badge-list-usage-${file.id}`}>
                                <span className="hidden sm:inline">استخدم </span>{file.usageCount}<span className="hidden sm:inline"> مرة</span>
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 sm:gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(file.url);
                            }}
                            className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9"
                            data-testid={`button-copy-${file.id}`}
                          >
                            <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(file.url, "_blank");
                            }}
                            className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 hidden sm:flex"
                            data-testid={`button-download-${file.id}`}
                          >
                            <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
        </div>
      </ScrollArea>

      {/* Upload Dialog */}
      <Dialog open={isUploaderOpen} onOpenChange={setIsUploaderOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl bg-[hsl(var(--ifox-surface-primary))] border-[hsl(var(--ifox-surface-overlay)/.1)]" data-testid="dialog-upload">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg md:text-xl text-[hsl(var(--ifox-text-primary))]" data-testid="text-upload-title">رفع ملفات جديدة</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="text-upload-description">
              اسحب وأفلت الملفات أو انقر للاختيار
            </DialogDescription>
          </DialogHeader>
          <IFoxUploader
            onUploadComplete={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/media"] });
              setIsUploaderOpen(false);
            }}
            onCancel={() => setIsUploaderOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* File Details Dialog */}
      <AnimatePresence>
        {selectedFile && !editingFile && (
          <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
            <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto bg-[hsl(var(--ifox-surface-primary))] border-[hsl(var(--ifox-surface-overlay)/.1)]" data-testid="dialog-file-details">
              <DialogHeader>
                <DialogTitle className="text-base sm:text-lg md:text-xl text-[hsl(var(--ifox-text-primary))]" data-testid="text-details-title">تفاصيل الملف</DialogTitle>
              </DialogHeader>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Preview */}
                <div className="space-y-3 sm:space-y-4">
                  {selectedFile.type === "image" && selectedFile.url ? (
                    <img
                      src={selectedFile.url}
                      alt={selectedFile.altText || selectedFile.name}
                      className="w-full rounded-lg sm:rounded-xl aspect-square object-cover"
                      data-testid="img-preview"
                    />
                  ) : (
                    <div className="aspect-square rounded-lg sm:rounded-xl bg-[hsl(var(--ifox-surface-overlay)/.05)] flex items-center justify-center">
                      {(() => {
                        const Icon = getFileIcon(selectedFile.type);
                        return <Icon className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-[hsl(var(--ifox-text-secondary))]" data-testid="icon-preview" />;
                      })()}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-filename">اسم الملف</Label>
                    <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1 break-all" data-testid="text-filename">{selectedFile.name}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-size">الحجم</Label>
                      <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1" data-testid="text-size">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    {selectedFile.width && selectedFile.height && (
                      <div>
                        <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-dimensions">الأبعاد</Label>
                        <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1" data-testid="text-dimensions">{selectedFile.width} × {selectedFile.height}</p>
                      </div>
                    )}
                    {selectedFile.duration && (
                      <div>
                        <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-duration">المدة</Label>
                        <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1" data-testid="text-duration">{Math.floor(selectedFile.duration / 60)}:{(selectedFile.duration % 60).toString().padStart(2, '0')}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-category">التصنيف</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {(() => {
                        const CategoryIcon = categoryIcons[selectedFile.category as keyof typeof categoryIcons];
                        return CategoryIcon ? <CategoryIcon className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-text-secondary))]" data-testid="icon-category-details" /> : null;
                      })()}
                      <span className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))]" data-testid="text-category">{selectedFile.category}</span>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-tags">الكلمات المفتاحية</Label>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1">
                      {selectedFile.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="bg-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5" data-testid={`badge-tag-${tag}`}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {selectedFile.altText && (
                    <div>
                      <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-alt">النص البديل</Label>
                      <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1" data-testid="text-alt">{selectedFile.altText}</p>
                    </div>
                  )}

                  {selectedFile.caption && (
                    <div>
                      <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-caption">الوصف</Label>
                      <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1" data-testid="text-caption">{selectedFile.caption}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-uploaded-by">رفع بواسطة</Label>
                      <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1 truncate" data-testid="text-uploaded-by">{selectedFile.uploadedBy}</p>
                    </div>
                    <div>
                      <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-uploaded-at">تاريخ الرفع</Label>
                      <p className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] mt-1 truncate" data-testid="text-uploaded-at">
                        {format(new Date(selectedFile.uploadedAt), "d MMM yyyy, h:mm a", { locale: ar })}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-url">رابط الملف</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={selectedFile.url}
                        readOnly
                        className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm min-w-0"
                        data-testid="input-url"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(selectedFile.url)}
                        className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0"
                        data-testid="button-copy-url"
                      >
                        <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setEditingFile(selectedFile)}
                  className="gap-1 sm:gap-2 text-xs sm:text-sm w-full sm:w-auto"
                  data-testid="button-edit"
                >
                  <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                  تحرير
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirm("هل أنت متأكد من حذف هذا الملف؟")) {
                      deleteFileMutation.mutate(selectedFile.id);
                    }
                  }}
                  className="gap-1 sm:gap-2 text-xs sm:text-sm w-full sm:w-auto"
                  data-testid="button-delete"
                >
                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                  حذف
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedFile(null)}
                  className="text-xs sm:text-sm w-full sm:w-auto"
                  data-testid="button-close"
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Edit File Dialog */}
      <AnimatePresence>
        {editingFile && (
          <Dialog open={!!editingFile} onOpenChange={() => setEditingFile(null)}>
            <DialogContent className="max-w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto bg-[hsl(var(--ifox-surface-primary))] border-[hsl(var(--ifox-surface-overlay)/.1)]" data-testid="dialog-edit">
              <DialogHeader>
                <DialogTitle className="text-base sm:text-lg md:text-xl text-[hsl(var(--ifox-text-primary))]" data-testid="text-edit-title">تحرير معلومات الملف</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-edit-name">اسم الملف</Label>
                  <Input
                    value={editingFile.name}
                    onChange={(e) => setEditingFile({ ...editingFile, name: e.target.value })}
                    className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm mt-1"
                    data-testid="input-edit-name"
                  />
                </div>

                <div>
                  <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-edit-category">التصنيف</Label>
                  <Select
                    value={editingFile.category}
                    onValueChange={(value) => setEditingFile({ ...editingFile, category: value })}
                  >
                    <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm mt-1" data-testid="select-edit-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai-news">أخبار AI</SelectItem>
                      <SelectItem value="ai-voice">AI Voice</SelectItem>
                      <SelectItem value="ai-tools">AI Tools</SelectItem>
                      <SelectItem value="ai-academy">AI Academy</SelectItem>
                      <SelectItem value="ai-community">AI Community</SelectItem>
                      <SelectItem value="ai-insights">AI Insights</SelectItem>
                      <SelectItem value="ai-opinions">AI Opinions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-edit-tags">الكلمات المفتاحية</Label>
                  <Input
                    value={editingFile.tags.join(", ")}
                    onChange={(e) => setEditingFile({
                      ...editingFile,
                      tags: e.target.value.split(",").map(tag => tag.trim()).filter(tag => tag)
                    })}
                    placeholder="أدخل الكلمات مفصولة بفواصل"
                    className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm mt-1"
                    data-testid="input-edit-tags"
                  />
                </div>

                {editingFile.type === "image" && (
                  <div>
                    <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-edit-alt">النص البديل</Label>
                    <Input
                      value={editingFile.altText || ""}
                      onChange={(e) => setEditingFile({ ...editingFile, altText: e.target.value })}
                      className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm mt-1"
                      data-testid="input-edit-alt"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]" data-testid="label-edit-caption">الوصف</Label>
                  <Textarea
                    value={editingFile.caption || ""}
                    onChange={(e) => setEditingFile({ ...editingFile, caption: e.target.value })}
                    rows={3}
                    className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm resize-none mt-1"
                    data-testid="textarea-edit-caption"
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button
                  onClick={() => updateFileMutation.mutate(editingFile)}
                  className="gap-1 sm:gap-2 text-xs sm:text-sm w-full sm:w-auto bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-info)/1)] hover:from-[hsl(var(--ifox-accent-muted)/1)] hover:to-[hsl(var(--ifox-info-muted)/1)]"
                  data-testid="button-save-changes"
                >
                  حفظ التغييرات
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEditingFile(null)}
                  className="text-xs sm:text-sm w-full sm:w-auto"
                  data-testid="button-cancel-edit"
                >
                  إلغاء
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </IFoxLayout>
  );
}