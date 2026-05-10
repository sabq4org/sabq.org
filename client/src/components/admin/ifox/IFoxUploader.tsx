import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  X,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Plus,
  Sparkles,
  Brain,
  MessageSquare,
  Cpu,
  GraduationCap,
  Users,
  Lightbulb,
  Eye,
  ImagePlus
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadFile {
  id: string;
  file: File;
  preview?: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  category?: string;
  tags?: string[];
  altText?: string;
  caption?: string;
}

interface IFoxUploaderProps {
  onUploadComplete?: () => void;
  onCancel?: () => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
  acceptedTypes?: string[];
}

const categoryOptions = [
  { value: "ai-news", label: "أخبار AI", icon: Sparkles },
  { value: "ai-voice", label: "AI Voice", icon: MessageSquare },
  { value: "ai-tools", label: "AI Tools", icon: Cpu },
  { value: "ai-academy", label: "AI Academy", icon: GraduationCap },
  { value: "ai-community", label: "AI Community", icon: Users },
  { value: "ai-insights", label: "AI Insights", icon: Lightbulb },
  { value: "ai-opinions", label: "AI Opinions", icon: Eye },
];

const defaultAcceptedTypes = {
  'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
  'video/*': ['.mp4', '.webm', '.ogg', '.mov'],
  'audio/*': ['.mp3', '.wav', '.ogg', '.m4a'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

export function IFoxUploader({
  onUploadComplete,
  onCancel,
  maxFiles = 10,
  maxSize = 100 * 1024 * 1024, // 100MB
  acceptedTypes = defaultAcceptedTypes
}: IFoxUploaderProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [globalCategory, setGlobalCategory] = useState<string>("");
  const [globalTags, setGlobalTags] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle rejected files
    rejectedFiles.forEach((rejection) => {
      const errors = rejection.errors.map((e: any) => e.message).join(", ");
      toast({
        title: "فشل رفع الملف",
        description: `${rejection.file.name}: ${errors}`,
        variant: "destructive",
      });
    });

    // Add accepted files
    const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      progress: 0,
      status: "pending" as const,
    }));

    setFiles((prev) => [...prev, ...newFiles].slice(0, maxFiles));
  }, [maxFiles, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes,
    maxSize,
    maxFiles: maxFiles - files.length,
    disabled: files.length >= maxFiles || isUploading,
  });

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, updates: Partial<UploadFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return FileImage;
    if (file.type.startsWith("video/")) return FileVideo;
    if (file.type.startsWith("audio/")) return FileAudio;
    return FileText;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  };

  const uploadFile = async (uploadFile: UploadFile) => {
    // Simulate upload progress
    const interval = setInterval(() => {
      updateFile(uploadFile.id, {
        progress: Math.min(uploadFile.progress + 10, 90),
      });
    }, 200);

    try {
      // Simulate API call
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() > 0.1) {
            resolve(true);
          } else {
            reject(new Error("فشل الرفع"));
          }
        }, 2000);
      });

      clearInterval(interval);
      updateFile(uploadFile.id, {
        progress: 100,
        status: "success",
      });
    } catch (error: any) {
      clearInterval(interval);
      updateFile(uploadFile.id, {
        status: "error",
        error: error.message,
      });
      throw error;
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    // Apply global settings to pending files
    const updatedFiles = files.map((f) => ({
      ...f,
      category: f.category || globalCategory,
      tags: f.tags || (globalTags ? globalTags.split(",").map(t => t.trim()) : []),
      status: f.status === "pending" ? "uploading" as const : f.status,
    }));
    setFiles(updatedFiles);

    // Upload files
    const uploadPromises = updatedFiles
      .filter((f) => f.status === "uploading")
      .map((f) => uploadFile(f));

    try {
      await Promise.allSettled(uploadPromises);
      
      const allSuccess = files.every((f) => f.status === "success");
      if (allSuccess) {
        toast({
          title: "تم الرفع بنجاح",
          description: `تم رفع ${files.length} ملف بنجاح`,
        });
        onUploadComplete?.();
      }
    } catch (error) {
      toast({
        title: "خطأ في الرفع",
        description: "فشل رفع بعض الملفات",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const canUpload = files.length > 0 && !isUploading && files.some(f => f.status === "pending");
  const uploadProgress = files.length > 0
    ? files.reduce((acc, f) => acc + f.progress, 0) / files.length
    : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Global Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-white/60">التصنيف العام</Label>
          <Select value={globalCategory} onValueChange={setGlobalCategory}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="اختر تصنيف لجميع الملفات" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-white/60">الكلمات المفتاحية العامة</Label>
          <Input
            value={globalTags}
            onChange={(e) => setGlobalTags(e.target.value)}
            placeholder="أدخل كلمات مفصولة بفواصل"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-all duration-200",
          isDragActive
            ? "border-violet-500 bg-violet-500/10"
            : "border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10",
          (files.length >= maxFiles || isUploading) && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        
        <div className="p-8 text-center">
          <motion.div
            animate={{
              scale: isDragActive ? 1.1 : 1,
            }}
            className="inline-flex p-4 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 mb-4"
          >
            <Upload className="w-8 h-8 text-violet-400" />
          </motion.div>
          
          <p className="text-white text-lg font-medium mb-2">
            {isDragActive ? "أفلت الملفات هنا" : "اسحب وأفلت الملفات هنا"}
          </p>
          <p className="text-white/60 text-sm mb-4">
            أو انقر لاختيار الملفات من جهازك
          </p>
          
          <div className="flex items-center justify-center gap-4 text-xs text-white/40">
            <span>الحد الأقصى: {maxFiles} ملف</span>
            <span>•</span>
            <span>حجم الملف: {formatFileSize(maxSize)}</span>
          </div>
        </div>
      </div>

      {/* Files List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium">الملفات المختارة ({files.length})</h3>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="flex items-center gap-2">
                <Progress value={uploadProgress} className="w-24 h-2" />
                <span className="text-white/60 text-sm">{Math.round(uploadProgress)}%</span>
              </div>
            )}
          </div>

          <AnimatePresence>
            {files.map((uploadFile) => {
              const Icon = getFileIcon(uploadFile.file);
              return (
                <motion.div
                  key={uploadFile.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex items-start gap-4">
                    {/* Preview or Icon */}
                    {uploadFile.preview ? (
                      <img
                        src={uploadFile.preview}
                        alt={uploadFile.file.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center">
                        <Icon className="w-8 h-8 text-white/40" />
                      </div>
                    )}

                    {/* File Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{uploadFile.file.name}</p>
                          <p className="text-white/60 text-sm">{formatFileSize(uploadFile.file.size)}</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {uploadFile.status === "pending" && (
                            <Badge variant="secondary" className="bg-white/10">
                              في الانتظار
                            </Badge>
                          )}
                          {uploadFile.status === "uploading" && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              جاري الرفع
                            </Badge>
                          )}
                          {uploadFile.status === "success" && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              تم الرفع
                            </Badge>
                          )}
                          {uploadFile.status === "error" && (
                            <Badge variant="destructive">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              فشل الرفع
                            </Badge>
                          )}
                          
                          {uploadFile.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFile(uploadFile.id)}
                              className="h-8 w-8"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {uploadFile.status === "uploading" && (
                        <Progress value={uploadFile.progress} className="h-1" />
                      )}

                      {uploadFile.status === "error" && uploadFile.error && (
                        <p className="text-red-400 text-sm">{uploadFile.error}</p>
                      )}

                      {uploadFile.status === "pending" && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="النص البديل"
                            value={uploadFile.altText || ""}
                            onChange={(e) => updateFile(uploadFile.id, { altText: e.target.value })}
                            className="bg-white/5 border-white/10 text-white text-sm h-8"
                          />
                          <Select
                            value={uploadFile.category || globalCategory}
                            onValueChange={(value) => updateFile(uploadFile.id, { category: value })}
                          >
                            <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm h-8">
                              <SelectValue placeholder="التصنيف" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryOptions.map((option) => {
                                const Icon = option.icon;
                                return (
                                  <SelectItem key={option.value} value={option.value}>
                                    <div className="flex items-center gap-2">
                                      <Icon className="w-3 h-3" />
                                      {option.label}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={isUploading}
        >
          إلغاء
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!canUpload}
          className="gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري الرفع...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              رفع الملفات ({files.filter(f => f.status === "pending").length})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}