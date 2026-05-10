import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Trash2, Upload, Loader2, Camera, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/queryClient";

export interface WeeklyPhotoItem {
  imageUrl: string;
  caption: string;
  credit?: string;
}

interface WeeklyPhotosEditorProps {
  photos: WeeklyPhotoItem[];
  onChange: (photos: WeeklyPhotoItem[]) => void;
}

export function WeeklyPhotosEditor({ photos, onChange }: WeeklyPhotosEditorProps) {
  const { toast } = useToast();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const getPhotoLabel = (index: number) => {
    const labels = [
      "الصورة الأولى",
      "الصورة الثانية",
      "الصورة الثالثة",
      "الصورة الرابعة",
      "الصورة الخامسة",
      "الصورة السادسة",
      "الصورة السابعة",
      "الصورة الثامنة",
      "الصورة التاسعة",
      "الصورة العاشرة",
    ];
    return labels[index] || `الصورة ${index + 1}`;
  };

  const handleImageUpload = useCallback(async (index: number, file: File) => {
    setUploadingIndex(index);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "weekly-photos");
      
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/media/upload", {
        method: "POST",
        headers: csrfToken ? {
          "X-CSRF-Token": csrfToken,
        } : undefined,
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "فشل رفع الصورة");
      }
      
      const data = await response.json();
      const newPhotos = [...photos];
      newPhotos[index] = {
        ...newPhotos[index],
        imageUrl: data.url || data.proxyUrl,
      };
      onChange(newPhotos);
      
      toast({
        title: "تم رفع الصورة",
        description: `تم رفع ${getPhotoLabel(index)} بنجاح`,
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "خطأ",
        description: "فشل رفع الصورة، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setUploadingIndex(null);
    }
  }, [photos, onChange, toast]);

  const handleCaptionChange = useCallback((index: number, caption: string) => {
    const newPhotos = [...photos];
    newPhotos[index] = {
      ...newPhotos[index],
      caption,
    };
    onChange(newPhotos);
  }, [photos, onChange]);

  const handleCreditChange = useCallback((index: number, credit: string) => {
    const newPhotos = [...photos];
    newPhotos[index] = {
      ...newPhotos[index],
      credit,
    };
    onChange(newPhotos);
  }, [photos, onChange]);

  const handleRemoveImage = useCallback((index: number) => {
    const newPhotos = [...photos];
    newPhotos[index] = {
      ...newPhotos[index],
      imageUrl: "",
    };
    onChange(newPhotos);
  }, [photos, onChange]);

  const handleAddPhoto = useCallback(() => {
    const newPhotos = [...photos, { imageUrl: "", caption: "", credit: "" }];
    onChange(newPhotos);
  }, [photos, onChange]);

  const handleDeletePhotoSlot = useCallback((index: number) => {
    if (photos.length <= 1) {
      toast({
        title: "تنبيه",
        description: "يجب أن تحتوي المجموعة على صورة واحدة على الأقل",
        variant: "destructive",
      });
      return;
    }
    const newPhotos = photos.filter((_, i) => i !== index);
    onChange(newPhotos);
  }, [photos, onChange, toast]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Camera className="h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">صور</h3>
            <p className="text-sm text-muted-foreground">
              أضف الصور مع تعليق لكل صورة ({photos.length} صورة)
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddPhoto}
          className="gap-2"
          data-testid="button-add-photo"
        >
          <Plus className="h-4 w-4" />
          إضافة صورة
        </Button>
      </div>

      <div className="grid gap-6">
        {photos.map((photo, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="bg-muted/30 py-3">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">
                    {index + 1}
                  </span>
                  {getPhotoLabel(index)}
                </div>
                {photos.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePhotoSlot(index)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    data-testid={`button-delete-slot-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {photo?.imageUrl ? (
                    <div className="relative group">
                      <img
                        src={photo.imageUrl}
                        alt={getPhotoLabel(index)}
                        className="w-full h-48 object-cover rounded-lg border"
                        data-testid={`img-weekly-photo-${index}`}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(index, file);
                            }}
                            disabled={uploadingIndex === index}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            asChild
                          >
                            <span>
                              <Upload className="h-4 w-4 ml-1" />
                              تغيير
                            </span>
                          </Button>
                        </label>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveImage(index)}
                          data-testid={`button-remove-photo-${index}`}
                        >
                          <Trash2 className="h-4 w-4 ml-1" />
                          حذف
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(index, file);
                        }}
                        disabled={uploadingIndex === index}
                      />
                      <div 
                        className="w-full h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
                        data-testid={`upload-weekly-photo-${index}`}
                      >
                        {uploadingIndex === index ? (
                          <>
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">جاري الرفع...</span>
                          </>
                        ) : (
                          <>
                            <ImagePlus className="h-8 w-8 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">انقر لرفع الصورة</span>
                          </>
                        )}
                      </div>
                    </label>
                  )}
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor={`caption-${index}`}>التعليق *</Label>
                    <Textarea
                      id={`caption-${index}`}
                      value={photo?.caption || ""}
                      onChange={(e) => handleCaptionChange(index, e.target.value)}
                      placeholder="أدخل تعليقاً وصفياً للصورة..."
                      className="mt-1 min-h-[100px] resize-none"
                      data-testid={`input-caption-${index}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`credit-${index}`}>المصدر (اختياري)</Label>
                    <Input
                      id={`credit-${index}`}
                      value={photo?.credit || ""}
                      onChange={(e) => handleCreditChange(index, e.target.value)}
                      placeholder="مصدر الصورة أو المصور"
                      className="mt-1"
                      data-testid={`input-credit-${index}`}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={handleAddPhoto}
          className="gap-2"
          data-testid="button-add-photo-bottom"
        >
          <Plus className="h-4 w-4" />
          إضافة صورة جديدة
        </Button>
      </div>
    </div>
  );
}
