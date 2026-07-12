import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { 
  Upload, 
  Image as ImageIcon, 
  Video, 
  Trash2, 
  Eye, 
  ArrowRight,
  Loader2,
  X,
  FileUp,
  Code
} from "lucide-react";
import { insertCreativeSchema } from "@shared/schema";
import type { AdGroup } from "@shared/schema";

// Banner size options
const BANNER_SIZES = [
  { value: "728x90", label: "لوحة إعلانية (728x90)", width: 728, height: 90 },
  { value: "300x250", label: "مستطيل متوسط (300x250)", width: 300, height: 250 },
  { value: "160x600", label: "ناطحة سحاب عريضة (160x600)", width: 160, height: 600 },
  { value: "970x250", label: "لوحة كبيرة (970x250)", width: 970, height: 250 },
  { value: "300x600", label: "نصف صفحة (300x600)", width: 300, height: 600 },
  { value: "320x50", label: "بانر موبايل (320x50)", width: 320, height: 50 },
  { value: "340x604", label: "سويب موبايل 9:16 (340x604)", width: 340, height: 604 },
];

// File validation
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/avi", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

// Form schema extending insertCreativeSchema
const formSchema = insertCreativeSchema.extend({
  file: z.any().optional(),
  content: z.string().min(1, "يجب رفع ملف إعلاني أو إدخال كود HTML"),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreativesManagement() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [creativeType, setCreativeType] = useState<"image" | "video" | "html">("image");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string>("");
  const [fileType, setFileType] = useState<"image" | "video" | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [htmlCode, setHtmlCode] = useState<string>("");
  
  // Get campaignId from URL query params
  const searchParams = new URLSearchParams(window.location.search);
  const campaignId = searchParams.get("campaignId");

  useEffect(() => {
    document.title = "إنشاء إعلان جديد - لوحة تحكم الإعلانات";
  }, []);

  // Fetch ad groups for the campaign
  const { data: adGroupsRaw, isLoading: isLoadingAdGroups } = useQuery<AdGroup[]>({
    queryKey: ["/api/ads/ad-groups", { campaignId }],
    queryFn: async () => {
      const res = await fetch(`/api/ads/ad-groups?campaignId=${campaignId}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب المجموعات الإعلانية");
      return res.json();
    },
    enabled: !!campaignId,
  });
  const adGroups = Array.isArray(adGroupsRaw) ? adGroupsRaw : [];

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "image",
      content: "",
      destinationUrl: "",
      size: "728x90",
      description: "",
      adGroupId: "",
      status: "active",
    },
  });

  // Set default ad group when loaded
  useEffect(() => {
    if (adGroups.length > 0 && !form.getValues("adGroupId")) {
      form.setValue("adGroupId", adGroups[0].id);
    }
  }, [adGroups, form]);

  // File upload handler
  const handleFileChange = async (file: File) => {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "حجم الملف كبير جداً",
        description: "الحد الأقصى لحجم الملف هو 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: "نوع الملف غير مدعوم",
        description: "الأنواع المسموحة: JPG, PNG, GIF, WEBP, MP4, WEBM, AVI, MOV",
        variant: "destructive",
      });
      return;
    }

    // Determine file type
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const type = isImage ? "image" : "video";
    
    setUploadedFile(file);
    setFileType(type);
    form.setValue("type", type);

    // Upload file
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ads/creatives/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "فشل في رفع الملف");
      }

      const data = await response.json();
      setUploadedUrl(data.url);
      form.setValue("content", data.url);

      toast({
        title: "تم رفع الملف بنجاح",
        description: `تم رفع ${type === "image" ? "الصورة" : "الفيديو"} بنجاح`,
      });
    } catch (error: any) {
      console.error("[Upload] خطأ:", error);
      toast({
        title: "خطأ في رفع الملف",
        description: error.message || "حدث خطأ أثناء رفع الملف",
        variant: "destructive",
      });
      setUploadedFile(null);
      setFileType(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileChange(files[0]);
    }
  }, []);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return await apiRequest("/api/ads/creatives", {
        method: "POST",
        body: JSON.stringify(values),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns"] });
      toast({
        title: "تم إنشاء الإعلان",
        description: "تم إنشاء الإعلان بنجاح",
      });
      
      // Navigate back to campaign detail
      if (campaignId) {
        setLocation(`/dashboard/ads/campaigns/${campaignId}`);
      } else {
        setLocation("/dashboard/ads/campaigns");
      }
    },
    onError: (error: any) => {
      console.error("[Create Creative] خطأ:", error);
      toast({
        title: "حدث خطأ",
        description: error.message || "فشل في إنشاء الإعلان",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    // For HTML type, validate HTML code
    if (creativeType === "html") {
      if (!htmlCode || htmlCode.trim() === "") {
        toast({
          title: "يجب إدخال كود HTML",
          description: "الرجاء إدخال كود HTML للإعلان",
          variant: "destructive",
        });
        return;
      }
      // Set content to HTML code and type to html
      values.content = htmlCode;
      values.type = "html";
    } else {
      // For image/video, validate file upload
      if (!uploadedUrl) {
        toast({
          title: "يجب رفع ملف",
          description: "الرجاء رفع صورة أو فيديو للإعلان",
          variant: "destructive",
        });
        return;
      }
    }

    createMutation.mutate(values);
  };

  // Get selected size dimensions
  const selectedSize = BANNER_SIZES.find(s => s.value === form.watch("size"));

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        {/* Header */}
        <DashboardPageHeader
          icon={ImageIcon}
          title="إنشاء إعلان جديد"
          description="ارفع ملف الإعلان وأدخل التفاصيل المطلوبة."
          titleTestId="heading-create-creative"
          actions={<Button
            variant="ghost"
            onClick={() => {
              if (campaignId) {
                setLocation(`/dashboard/ads/campaigns/${campaignId}`);
              } else {
                setLocation("/dashboard/ads/campaigns");
              }
            }}
            data-testid="button-back"
          >
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Column */}
          <div className="space-y-6">
            {/* Creative Type Selection Card */}
            <Card>
              <CardHeader>
                <CardTitle>نوع الإعلان</CardTitle>
                <CardDescription>
                  اختر نوع الإعلان الذي تريد إنشاءه
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={creativeType}
                  onValueChange={(value: "image" | "video" | "html") => {
                    setCreativeType(value);
                    form.setValue("type", value);
                    // Reset uploaded file when switching types
                    if (value === "html") {
                      setUploadedFile(null);
                      setUploadedUrl("");
                      setFileType(null);
                      form.setValue("content", "");
                    } else {
                      setHtmlCode("");
                      form.setValue("content", "");
                    }
                  }}
                  className="grid grid-cols-3 gap-4"
                >
                  <div>
                    <RadioGroupItem
                      value="image"
                      id="type-image"
                      className="peer sr-only"
                      data-testid="radio-creative-type-image"
                    />
                    <Label
                      htmlFor="type-image"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover-elevate cursor-pointer peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <ImageIcon className="mb-2 h-6 w-6" />
                      <span className="text-sm font-medium">صورة</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem
                      value="video"
                      id="type-video"
                      className="peer sr-only"
                      data-testid="radio-creative-type-video"
                    />
                    <Label
                      htmlFor="type-video"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover-elevate cursor-pointer peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <Video className="mb-2 h-6 w-6" />
                      <span className="text-sm font-medium">فيديو</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem
                      value="html"
                      id="type-html"
                      className="peer sr-only"
                      data-testid="radio-creative-type-html"
                    />
                    <Label
                      htmlFor="type-html"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover-elevate cursor-pointer peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <Code className="mb-2 h-6 w-6" />
                      <span className="text-sm font-medium">HTML</span>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* File Upload Card (for Image/Video) */}
            {creativeType !== "html" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileUp className="h-5 w-5" />
                    رفع الملف
                  </CardTitle>
                  <CardDescription>
                    قم برفع صورة أو فيديو الإعلان (الحد الأقصى: 10 ميجابايت)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                {!uploadedFile ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    data-testid="dropzone-upload"
                  >
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm mb-2">
                      اسحب وأفلت الملف هنا أو
                    </p>
                    <Label htmlFor="file-upload">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploading}
                        onClick={() => document.getElementById("file-upload")?.click()}
                        data-testid="button-select-file"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                            جاري الرفع...
                          </>
                        ) : (
                          "اختر ملف"
                        )}
                      </Button>
                    </Label>
                    <Input
                      id="file-upload"
                      type="file"
                      accept={ALLOWED_TYPES.join(",")}
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files[0]) {
                          handleFileChange(files[0]);
                        }
                      }}
                      className="hidden"
                      data-testid="input-file"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      JPG, PNG, GIF, WEBP, MP4, WEBM, AVI, MOV (حتى 10 ميجابايت)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4" data-testid="uploaded-file-info">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        {fileType === "image" ? (
                          <ImageIcon className="h-8 w-8 text-primary" />
                        ) : (
                          <Video className="h-8 w-8 text-primary" />
                        )}
                        <div>
                          <p className="font-medium">{uploadedFile.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(uploadedFile.size / 1024 / 1024).toFixed(2)} ميجابايت
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setUploadedFile(null);
                          setUploadedUrl("");
                          setFileType(null);
                          form.setValue("content", "");
                        }}
                        data-testid="button-remove-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowPreview(true)}
                      data-testid="button-preview"
                    >
                      <Eye className="h-4 w-4 ml-2" />
                      معاينة
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {/* HTML Code Input Card (for HTML type) */}
            {creativeType === "html" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    كود HTML
                  </CardTitle>
                  <CardDescription>
                    أدخل كود HTML للإعلان
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="html-code">كود HTML*</Label>
                    <Textarea
                      id="html-code"
                      value={htmlCode}
                      onChange={(e) => {
                        setHtmlCode(e.target.value);
                        form.setValue("content", e.target.value);
                      }}
                      placeholder="أدخل كود HTML هنا..."
                      className="font-mono text-sm min-h-[300px] resize-y"
                      data-testid="textarea-html-code"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      أدخل كود HTML كامل للإعلان. سيتم عرضه في إطار آمن (sandbox).
                    </p>
                  </div>
                  
                  {htmlCode && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowPreview(true)}
                      data-testid="button-preview-html"
                    >
                      <Eye className="h-4 w-4 ml-2" />
                      معاينة HTML
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Form Card */}
            <Card>
              <CardHeader>
                <CardTitle>تفاصيل الإعلان</CardTitle>
                <CardDescription>
                  أدخل المعلومات الأساسية للإعلان
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Name */}
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>اسم الإعلان*</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="مثال: إعلان المنتج الجديد"
                              data-testid="input-creative-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Description */}
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الوصف</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              value={field.value || ""}
                              placeholder="وصف قصير للإعلان..."
                              rows={3}
                              data-testid="textarea-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Size */}
                    <FormField
                      control={form.control}
                      name="size"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>حجم الإعلان*</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-creative-size">
                                <SelectValue placeholder="اختر الحجم" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {BANNER_SIZES.map((size) => (
                                <SelectItem key={size.value} value={size.value}>
                                  {size.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            الأبعاد: {selectedSize?.width} × {selectedSize?.height} بكسل
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Destination URL */}
                    <FormField
                      control={form.control}
                      name="destinationUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رابط الوجهة*</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="url"
                              placeholder="https://example.com"
                              data-testid="input-destination-url"
                            />
                          </FormControl>
                          <FormDescription>
                            الرابط الذي سيتم التوجيه إليه عند النقر على الإعلان
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Ad Group */}
                    <FormField
                      control={form.control}
                      name="adGroupId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>المجموعة الإعلانية*</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            disabled={isLoadingAdGroups || adGroups.length === 0}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-ad-group">
                                <SelectValue placeholder="اختر المجموعة" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {adGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {adGroups.length === 0 && (
                            <FormDescription className="text-destructive">
                              يجب إنشاء مجموعة إعلانية أولاً
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Submit Button */}
                    <div className="flex gap-3 pt-4">
                      <Button
                        type="submit"
                        disabled={
                          createMutation.isPending || 
                          (creativeType === "html" ? !htmlCode.trim() : !uploadedUrl) || 
                          adGroups.length === 0
                        }
                        className="flex-1"
                        data-testid="button-create-creative"
                      >
                        {createMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                            جاري الإنشاء...
                          </>
                        ) : (
                          "إنشاء الإعلان"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (campaignId) {
                            setLocation(`/dashboard/ads/campaigns/${campaignId}`);
                          } else {
                            setLocation("/dashboard/ads/campaigns");
                          }
                        }}
                        data-testid="button-cancel"
                      >
                        إلغاء
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          {/* Preview Column */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  المعاينة
                </CardTitle>
                <CardDescription>
                  معاينة حية للإعلان
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(creativeType === "html" && htmlCode && selectedSize) ? (
                  <div className="space-y-4">
                    <div className="bg-muted rounded-lg p-4 flex items-center justify-center">
                      <div
                        className="border border-border bg-background rounded overflow-hidden"
                        style={{
                          width: `${selectedSize.width}px`,
                          height: `${selectedSize.height}px`,
                        }}
                      >
                        <iframe
                          srcDoc={htmlCode}
                          sandbox="allow-scripts"
                          className="w-full h-full"
                          title="معاينة HTML"
                          data-testid="preview-iframe-html"
                        />
                      </div>
                    </div>
                    <div className="text-sm text-center text-muted-foreground">
                      <p data-testid="text-preview-size">
                        الأبعاد: {selectedSize.width} × {selectedSize.height} بكسل
                      </p>
                      <p className="mt-1">
                        النوع: HTML
                      </p>
                    </div>
                  </div>
                ) : (uploadedUrl && selectedSize) ? (
                  <div className="space-y-4">
                    <div className="bg-muted rounded-lg p-4 flex items-center justify-center min-h-[300px]">
                      {fileType === "image" ? (
                        <img
                          src={uploadedUrl}
                          alt="معاينة الإعلان"
                          className="max-w-full h-auto rounded"
                          style={{
                            maxWidth: `${selectedSize.width}px`,
                            aspectRatio: `${selectedSize.width} / ${selectedSize.height}`
                          }}
                          data-testid="preview-image"
                        />
                      ) : (
                        <video
                          src={uploadedUrl}
                          controls
                          className="max-w-full h-auto rounded"
                          style={{
                            maxWidth: `${selectedSize.width}px`,
                            aspectRatio: `${selectedSize.width} / ${selectedSize.height}`
                          }}
                          data-testid="preview-video"
                        />
                      )}
                    </div>
                    <div className="text-sm text-center text-muted-foreground">
                      <p data-testid="text-preview-size">
                        الأبعاد: {selectedSize.width} × {selectedSize.height} بكسل
                      </p>
                      <p className="mt-1">
                        النوع: {fileType === "image" ? "صورة" : "فيديو"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-6 mb-4">
                      <Eye className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                      {creativeType === "html" ? "أدخل كود HTML لمعاينة الإعلان" : "قم برفع ملف لمعاينة الإعلان"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Preview Dialog */}
        <AlertDialog open={showPreview} onOpenChange={setShowPreview}>
          <AlertDialogContent className="max-w-4xl">
            <AlertDialogHeader>
              <AlertDialogTitle>معاينة الإعلان</AlertDialogTitle>
              <AlertDialogDescription>
                معاينة بالحجم الكامل
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4 flex items-center justify-center bg-muted rounded-lg p-6">
              {creativeType === "html" && htmlCode && selectedSize ? (
                <div
                  className="border border-border bg-background rounded overflow-hidden"
                  style={{
                    width: `${selectedSize.width}px`,
                    height: `${selectedSize.height}px`,
                  }}
                >
                  <iframe
                    srcDoc={htmlCode}
                    sandbox="allow-scripts"
                    className="w-full h-full"
                    title="معاينة HTML"
                    data-testid="preview-dialog-iframe-html"
                  />
                </div>
              ) : uploadedUrl && fileType === "image" ? (
                <img
                  src={uploadedUrl}
                  alt="معاينة الإعلان"
                  className="max-w-full h-auto rounded"
                />
              ) : uploadedUrl && fileType === "video" ? (
                <video
                  src={uploadedUrl}
                  controls
                  className="max-w-full h-auto rounded"
                />
              ) : null}
            </div>
            <AlertDialogFooter>
              <AlertDialogAction>إغلاق</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
