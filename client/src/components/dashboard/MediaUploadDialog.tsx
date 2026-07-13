import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Progress } from "@/components/ui/progress";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { MediaFolder } from "@shared/schema";

const uploadFormSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  altText: z.string().optional(),
  keywords: z.string().optional(),
  category: z.string().optional(),
  folderId: z.string().nullable().optional(),
  isFavorite: z.boolean().default(false),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

interface MediaUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: MediaFolder[];
}

export function MediaUploadDialog({ open, onOpenChange, folders }: MediaUploadDialogProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      title: "",
      description: "",
      altText: "",
      keywords: "",
      category: "",
      folderId: null,
      isFavorite: false,
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormValues & { file: File }) => {
      const formData = new FormData();
      formData.append("file", data.file);
      if (data.title) formData.append("title", data.title);
      if (data.description) formData.append("description", data.description);
      if (data.altText) formData.append("altText", data.altText);
      if (data.keywords) formData.append("keywords", data.keywords);
      if (data.category) formData.append("category", data.category);
      if (data.folderId) formData.append("folderId", data.folderId);
      formData.append("isFavorite", String(data.isFavorite));

      return apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
        onUploadProgress: (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setUploadProgress(percent);
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({
        title: "تم الرفع بنجاح",
        description: "تم رفع الملف إلى مكتبة الوسائط",
      });
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

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // matches the server's 10MB cap
  const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
  ]);

  const handleFileSelect = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      toast({
        title: "نوع ملف غير مدعوم",
        description: "يرجى اختيار صورة (JPEG أو PNG أو WEBP أو AVIF)",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: "الملف كبير جداً",
        description: "الحد الأقصى لحجم الصورة 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    // Auto-fill title with filename
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

  const handleClose = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadProgress(0);
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = (data: UploadFormValues) => {
    if (!selectedFile) {
      toast({
        title: "لم يتم اختيار ملف",
        description: "يرجى اختيار ملف للرفع",
        variant: "destructive",
      });
      return;
    }

    // Convert comma-separated keywords to array
    const keywords = data.keywords
      ? data.keywords.split(',').map(k => k.trim()).filter(Boolean)
      : undefined;

    setUploadProgress(0);
    // Real progress comes from apiRequest's onUploadProgress (XHR) in the
    // mutation — no fake simulated interval needed.
    uploadMutation.mutate({
      ...data,
      keywords: keywords?.join(','),
      file: selectedFile,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle data-testid="heading-upload-media">رفع ملف جديد</DialogTitle>
          <DialogDescription>
            قم برفع صورة إلى مكتبة الوسائط
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Drag & Drop Zone */}
            {!selectedFile && (
              <Card
                className={`border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-border"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => document.getElementById("file-input")?.click()}
                data-testid="drop-zone"
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">
                  اسحب وأفلت الملف هنا
                </p>
                <p className="text-xs text-muted-foreground">
                  أو انقر لاختيار ملف من جهازك
                </p>
                <input
                  id="file-input"
                  type="file"
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                  data-testid="input-file"
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
                    />
                  ) : (
                    <div className="w-24 h-24 bg-muted rounded flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" data-testid="text-selected-file">
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
                    data-testid="button-remove-file"
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

            {/* Metadata Fields */}
            {selectedFile && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العنوان (اختياري)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-title" />
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
                        <Textarea {...field} rows={3} data-testid="input-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="altText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>النص البديل (اختياري)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-alt-text" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="keywords"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الكلمات المفتاحية (افصل بفاصلة)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: رياضة, كرة قدم, بطولة"
                          data-testid="input-keywords"
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
                      <FormLabel>التصنيف (اختياري)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="اختر التصنيف" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="مقالات">مقالات</SelectItem>
                          <SelectItem value="شعارات">شعارات</SelectItem>
                          <SelectItem value="صور المراسلين">صور المراسلين</SelectItem>
                          <SelectItem value="بانرات">بانرات</SelectItem>
                          <SelectItem value="عام">عام</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="folderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المجلد (اختياري)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-folder">
                            <SelectValue placeholder="اختر المجلد" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">بدون مجلد</SelectItem>
                          {folders.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                              {folder.name}
                            </SelectItem>
                          ))}
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
                          data-testid="checkbox-favorite"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">إضافة إلى المفضلة</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={uploadMutation.isPending}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={!selectedFile || uploadMutation.isPending}
                data-testid="button-upload"
              >
                {uploadMutation.isPending ? "جاري الرفع..." : "رفع"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
