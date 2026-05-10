import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { updateMediaFileSchema } from "@shared/schema";
import type { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { Download, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import type { MediaFile, MediaFolder } from "@shared/schema";

type UpdateFormValues = z.infer<typeof updateMediaFileSchema>;

interface MediaPreviewDialogProps {
  file: MediaFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: MediaFolder[];
}

export function MediaPreviewDialog({
  file,
  open,
  onOpenChange,
  folders,
}: MediaPreviewDialogProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const form = useForm<UpdateFormValues>({
    resolver: zodResolver(updateMediaFileSchema),
    defaultValues: {
      title: "",
      description: "",
      altText: "",
      keywords: [],
      category: "",
      isFavorite: false,
      folderId: null,
    },
  });

  // Update form when file changes - using useEffect to prevent infinite loop
  useEffect(() => {
    if (file && open) {
      form.reset({
        title: file.title || "",
        description: file.description || "",
        altText: file.altText || "",
        keywords: file.keywords || [],
        category: file.category || "",
        isFavorite: file.isFavorite,
        folderId: file.folderId || null,
      });
    }
  }, [file?.id, open]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateFormValues) => {
      return apiRequest(`/api/media/${file?.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({
        title: "تم التحديث بنجاح",
        description: "تم تحديث معلومات الملف",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "فشل التحديث",
        description: error.message || "حدث خطأ أثناء تحديث الملف",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/media/${file?.id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({
        title: "تم الحذف بنجاح",
        description: "تم حذف الملف من المكتبة",
      });
      setShowDeleteDialog(false);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "فشل الحذف",
        description: error.message || "حدث خطأ أثناء حذف الملف",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UpdateFormValues) => {
    updateMutation.mutate(data);
  };

  if (!file) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="heading-preview-media">معاينة وتعديل الملف</DialogTitle>
            <DialogDescription>
              معاينة الملف وتحرير المعلومات المرتبطة به
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Preview Section */}
            <div className="space-y-4">
              <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                {file.type === "image" ? (
                  <img
                    src={`/api/media/proxy/${file.id}`}
                    alt={file.altText || file.title || file.originalName}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <X className="h-16 w-16 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        معاينة غير متاحة
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">اسم الملف:</span>
                  <span className="font-medium truncate max-w-[200px]" title={file.originalName}>
                    {file.originalName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">الحجم:</span>
                  <span>{formatFileSize(file.size)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">النوع:</span>
                  <span>{file.mimeType}</span>
                </div>
                {file.width && file.height && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">الأبعاد:</span>
                    <span>{file.width} × {file.height}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">تاريخ الرفع:</span>
                  <span>{new Date(file.createdAt).toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                </div>
              </div>

              <Separator />

              {/* Usage Info */}
              <div>
                <h4 className="text-sm font-medium mb-2">معلومات الاستخدام</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    مستخدم في {file.usageCount} {file.usageCount === 1 ? 'مقال' : 'مقالات'}
                  </Badge>
                  {file.isFavorite && (
                    <Badge variant="default">مفضل</Badge>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(`/api/media/proxy/${file.id}`, '_blank')}
                  data-testid="button-download"
                >
                  <Download className="h-4 w-4 ml-2" />
                  تحميل
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setShowDeleteDialog(true)}
                  data-testid="button-delete"
                >
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف
                </Button>
              </div>
            </div>

            {/* Edit Form */}
            <div>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>العنوان</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-title" />
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
                        <FormLabel>الوصف</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} data-testid="input-edit-description" />
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
                        <FormLabel>النص البديل</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-alt-text" />
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
                        <FormLabel>الكلمات المفتاحية</FormLabel>
                        <FormControl>
                          <Input
                            value={field.value?.join(', ') || ''}
                            onChange={(e) => {
                              const keywords = e.target.value
                                .split(',')
                                .map(k => k.trim())
                                .filter(Boolean);
                              field.onChange(keywords);
                            }}
                            placeholder="مثال: رياضة, كرة قدم, بطولة"
                            data-testid="input-edit-keywords"
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
                        <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? "" : value)} 
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-category">
                              <SelectValue placeholder="اختر التصنيف" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">بدون تصنيف</SelectItem>
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
                        <FormLabel>المجلد</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "null" ? null : value)}
                          value={field.value?.toString() || "null"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-folder">
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
                            data-testid="checkbox-edit-favorite"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">إضافة إلى المفضلة</FormLabel>
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={updateMutation.isPending}
                      data-testid="button-close"
                    >
                      إغلاق
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      data-testid="button-save-changes"
                    >
                      {updateMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذا الملف نهائياً ولن تتمكن من استرجاعه.
              {file.usageCount > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  تحذير: هذا الملف مستخدم في {file.usageCount} {file.usageCount === 1 ? 'مقال' : 'مقالات'}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
