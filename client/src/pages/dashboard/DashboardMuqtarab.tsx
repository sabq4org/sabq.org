import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  FileText,
  Upload,
  X,
  Search,
  Check,
  Newspaper,
  LineChart,
  BookOpenCheck,
  TrendingUp,
  Lightbulb,
  Target,
  Layers,
  Compass,
  Globe,
  Radio,
  Megaphone,
  Award,
  Flame,
  Zap,
  Star,
  Heart,
  MessageCircle,
  Users,
  Building,
  Briefcase,
  GraduationCap,
  Microscope,
  Landmark,
  Scale,
  Hammer,
  Shield,
  Leaf,
  Sun,
  Moon,
  Cloud,
  Droplet,
  Mountain,
  Waves,
  HelpCircle,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getCsrfToken } from "@/lib/queryClient";
import { insertAngleSchema } from "@shared/schema";
import type { Angle } from "@/lib/muqtarab";
import { DashboardLayout } from "@/components/DashboardLayout";

// Form schema - extends insertAngleSchema with validation
const angleFormSchema = insertAngleSchema.extend({
  nameAr: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  slug: z.string().min(2, "المعرف يجب أن يكون حرفين على الأقل")
    .regex(/^[a-z0-9-]+$/, "المعرف يجب أن يحتوي على أحرف صغيرة وأرقام وشرطات فقط"),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "اللون يجب أن يكون بصيغة hex (#RRGGBB)"),
  iconKey: z.string().min(1, "رمز الأيقونة مطلوب"),
  nameEn: z.string().optional(),
  coverImageUrl: z.string().optional().or(z.literal("")),
  shortDesc: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

type AngleFormValues = z.infer<typeof angleFormSchema>;

// Section type
interface Section {
  id: string;
  name: string;
  slug: string;
}

/**
 * توليد المعرّف (slug) — يأخذ الأحرف اللاتينية والأرقام فقط ويتجاهل العربية تماماً.
 * لا تحويل صوتي للكلمات العربية (لا نريد كلمات مثل rydkast/alshaar في المعرّف).
 *
 * يُفضّل الاسم الإنجليزي إن وُجد، وإلا يستخرج الجزء اللاتيني من الاسم العربي
 * (مثل "READCAST | ريدكاست" → "readcast"). إن لم يكن في الاسمين أي حرف لاتيني،
 * يُترك فارغاً ليُدخله المستخدم يدوياً.
 */
function latinSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // أي شيء غير لاتيني/رقم (عربي، |، مسافات...) → شرطة
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateSlug(nameAr: string, nameEn?: string): string {
  const fromEn = nameEn ? latinSlug(nameEn) : "";
  if (fromEn.length >= 2) return fromEn;
  return latinSlug(nameAr);
}

// Available icons for the picker
const AVAILABLE_ICONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "Newspaper", icon: Newspaper, label: "صحيفة" },
  { key: "LineChart", icon: LineChart, label: "مخطط" },
  { key: "BookOpenCheck", icon: BookOpenCheck, label: "كتاب" },
  { key: "TrendingUp", icon: TrendingUp, label: "صاعد" },
  { key: "Lightbulb", icon: Lightbulb, label: "فكرة" },
  { key: "Target", icon: Target, label: "هدف" },
  { key: "Layers", icon: Layers, label: "طبقات" },
  { key: "Compass", icon: Compass, label: "بوصلة" },
  { key: "Globe", icon: Globe, label: "عالم" },
  { key: "Radio", icon: Radio, label: "راديو" },
  { key: "Megaphone", icon: Megaphone, label: "مكبر" },
  { key: "Award", icon: Award, label: "جائزة" },
  { key: "Flame", icon: Flame, label: "نار" },
  { key: "Zap", icon: Zap, label: "برق" },
  { key: "Star", icon: Star, label: "نجمة" },
  { key: "Heart", icon: Heart, label: "قلب" },
  { key: "MessageCircle", icon: MessageCircle, label: "رسالة" },
  { key: "Users", icon: Users, label: "مستخدمين" },
  { key: "Building", icon: Building, label: "مبنى" },
  { key: "Briefcase", icon: Briefcase, label: "حقيبة" },
  { key: "GraduationCap", icon: GraduationCap, label: "تعليم" },
  { key: "Microscope", icon: Microscope, label: "علوم" },
  { key: "Landmark", icon: Landmark, label: "معلم" },
  { key: "Scale", icon: Scale, label: "ميزان" },
  { key: "Hammer", icon: Hammer, label: "مطرقة" },
  { key: "Shield", icon: Shield, label: "درع" },
  { key: "Leaf", icon: Leaf, label: "ورقة" },
  { key: "Sun", icon: Sun, label: "شمس" },
  { key: "Moon", icon: Moon, label: "قمر" },
  { key: "Cloud", icon: Cloud, label: "سحابة" },
  { key: "Droplet", icon: Droplet, label: "قطرة" },
  { key: "Mountain", icon: Mountain, label: "جبل" },
  { key: "Waves", icon: Waves, label: "أمواج" },
];

// Icon Picker Component
interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
  colorHex?: string;
}

function IconPicker({ value, onChange, colorHex = "#3b82f6" }: IconPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredIcons = AVAILABLE_ICONS.filter(
    (item) =>
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.label.includes(searchQuery)
  );

  const selectedIcon = AVAILABLE_ICONS.find((item) => item.key === value);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث عن أيقونة..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
          data-testid="input-icon-search"
        />
      </div>
      
      {selectedIcon && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
          <div 
            className="p-2 rounded-md" 
            style={{ backgroundColor: colorHex }}
          >
            <selectedIcon.icon className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">{selectedIcon.label}</span>
          <span className="text-xs text-muted-foreground">({selectedIcon.key})</span>
        </div>
      )}

      <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1">
        {filteredIcons.map((item) => {
          const IconComponent = item.icon;
          const isSelected = value === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={`
                p-2 rounded-md border transition-all hover-elevate
                ${isSelected 
                  ? "border-primary bg-primary/10" 
                  : "border-transparent hover:border-muted-foreground/20"
                }
              `}
              title={item.label}
              data-testid={`icon-option-${item.key}`}
            >
              <IconComponent 
                className="h-5 w-5 mx-auto" 
                style={isSelected ? { color: colorHex } : undefined}
              />
              {isSelected && (
                <Check className="h-3 w-3 mx-auto mt-1 text-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Cover Image Upload Component
interface CoverImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

function CoverImageUpload({ value, onChange, disabled }: CoverImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setPreviewUrl(value || null);
  }, [value]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار ملف صورة صالح",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "خطأ",
        description: "حجم الصورة يجب أن لا يتجاوز 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const csrfToken = getCsrfToken();
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "فشل رفع الصورة");
      }

      const data = await response.json();
      const imageUrl = data.url || data.publicUrl;
      setPreviewUrl(imageUrl);
      onChange(imageUrl);
      
      toast({
        title: "تم الرفع بنجاح",
        description: "تم رفع صورة الغلاف بنجاح",
      });
    } catch (error: any) {
      toast({
        title: "خطأ في رفع الصورة",
        description: error.message || "حدث خطأ أثناء رفع الصورة",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3" data-testid="cover-image-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
        data-testid="input-cover-file"
      />

      {previewUrl ? (
        <div className="relative rounded-lg overflow-hidden border">
          <img 
            src={previewUrl} 
            alt="صورة الغلاف" 
            className="w-full h-40 object-cover"
            data-testid="img-cover-preview"
          />
          <div className="absolute top-2 left-2 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              data-testid="button-change-cover"
            >
              <Upload className="h-4 w-4 ml-1" />
              تغيير
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={disabled || uploading}
              data-testid="button-remove-cover"
            >
              <X className="h-4 w-4 ml-1" />
              إزالة
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-colors hover:border-primary/50 hover:bg-muted/50
            ${disabled || uploading ? "opacity-50 cursor-not-allowed" : ""}
          `}
          data-testid="dropzone-cover"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">جاري الرفع...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">اضغط لرفع صورة الغلاف</span>
              <span className="text-xs text-muted-foreground">
                PNG, JPG أو WebP (الحد الأقصى 10 ميجابايت)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardMuqtarab() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // State for dialogs
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAngle, setEditingAngle] = useState<Angle | null>(null);
  const [deletingAngle, setDeletingAngle] = useState<Angle | null>(null);

  // Form - MUST be before early returns
  const form = useForm<AngleFormValues>({
    resolver: zodResolver(angleFormSchema),
    defaultValues: {
      nameAr: "",
      nameEn: "",
      slug: "",
      colorHex: "#3b82f6",
      iconKey: "Newspaper",
      coverImageUrl: "",
      shortDesc: "",
      sortOrder: 0,
      isActive: true,
      sectionId: "", // Will be set when muqtarab section is fetched
    },
  });

  // Fetch muqtarab section
  const { data: muqtarabSection } = useQuery<Section>({
    queryKey: ["/api/muqtarab/section"],
    queryFn: async () => {
      const res = await fetch("/api/muqtarab/section");
      if (!res.ok) throw new Error("Failed to fetch section");
      return res.json();
    },
  });

  // Fetch all angles (including inactive for admin)
  const { data: anglesRaw, isLoading } = useQuery<Angle[]>({
    queryKey: ["/api/muqtarab/angles"],
    queryFn: async () => {
      const res = await fetch("/api/muqtarab/angles");
      if (!res.ok) throw new Error("Failed to fetch angles");
      return res.json();
    },
  });
  const angles = Array.isArray(anglesRaw) ? anglesRaw : [];

  // إحصاءات المواضيع لكل زاوية (عدد + بانتظار المراجعة)
  type AngleStat = { total: number; pending_review: number; published: number; draft: number; needs_revision: number };
  const { data: anglesStatsRaw } = useQuery<Record<string, AngleStat>>({
    queryKey: ["/api/admin/muqtarab/angles/stats"],
    queryFn: async () => apiRequest("/api/admin/muqtarab/angles/stats"),
    refetchInterval: 60000,
  });
  const anglesStats = anglesStatsRaw || {};
  const totalPendingReview = Object.values(anglesStats).reduce(
    (sum, s) => sum + (s?.pending_review || 0),
    0,
  );

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: AngleFormValues) => {
      return await apiRequest("/api/admin/muqtarab/angles", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/angles"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "تم إنشاء الزاوية",
        description: "تم إضافة الزاوية بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الزاوية",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AngleFormValues> }) => {
      return await apiRequest(`/api/admin/muqtarab/angles/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/angles"] });
      setEditingAngle(null);
      form.reset();
      toast({
        title: "تم تحديث الزاوية",
        description: "تم تحديث الزاوية بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الزاوية",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/muqtarab/angles/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/angles"] });
      setDeletingAngle(null);
      toast({
        title: "تم حذف الزاوية",
        description: "تم حذف الزاوية بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الزاوية",
        variant: "destructive",
      });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest(`/api/admin/muqtarab/angles/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/angles"] });
      toast({
        title: "تم تحديث الحالة",
        description: "تم تحديث حالة الزاوية بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الحالة",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleCreate = () => {
    if (muqtarabSection) {
      form.reset({
        nameAr: "",
        nameEn: "",
        slug: "",
        colorHex: "#3b82f6",
        iconKey: "Newspaper",
        coverImageUrl: "",
        shortDesc: "",
        sortOrder: 0,
        isActive: true,
        sectionId: muqtarabSection.id,
      });
      setIsCreateDialogOpen(true);
    }
  };

  const handleEdit = (angle: Angle) => {
    setEditingAngle(angle);
    form.reset({
      nameAr: angle.nameAr,
      nameEn: angle.nameEn || "",
      slug: angle.slug,
      colorHex: angle.colorHex,
      iconKey: angle.iconKey,
      coverImageUrl: angle.coverImageUrl || "",
      shortDesc: angle.shortDesc || "",
      sortOrder: angle.sortOrder || 0,
      isActive: angle.isActive,
      sectionId: angle.sectionId,
    });
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (editingAngle) {
      updateMutation.mutate({ id: editingAngle.id, data });
    } else {
      createMutation.mutate(data);
    }
  });

  const handleToggleActive = (angle: Angle) => {
    toggleActiveMutation.mutate({ id: angle.id, isActive: !angle.isActive });
  };

  // Auto-generate slug from nameEn/nameAr (latin-only) — للزوايا الجديدة فقط
  const nameAr = form.watch("nameAr");
  const nameEn = form.watch("nameEn");
  useEffect(() => {
    if (nameAr && !editingAngle) {
      form.setValue("slug", generateSlug(nameAr, nameEn));
    }
  }, [nameAr, nameEn, editingAngle, form]);

  // إعادة توليد المعرّف يدوياً (يعمل في وضعي الإنشاء والتعديل)
  const handleRegenerateSlug = () => {
    const generated = generateSlug(form.getValues("nameAr") || "", form.getValues("nameEn") || "");
    if (generated) {
      form.setValue("slug", generated, { shouldValidate: true, shouldDirty: true });
    }
  };

  // Get icon component
  const getIconComponent = (iconKey: string) => {
    return AVAILABLE_ICONS.find((item) => item.key === iconKey)?.icon || HelpCircle;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">إدارة مُقترب</h1>
            <p className="text-muted-foreground mt-1">إدارة الزوايا التحليلية والمواضيع</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/muqtarab/submissions">
              <Button variant="outline" data-testid="button-view-submissions">
                <FileText className="h-4 w-4 ml-2" />
                طلبات الزوايا
              </Button>
            </Link>
            <Button
              onClick={handleCreate}
              disabled={!muqtarabSection}
              data-testid="button-create-angle"
            >
              <Plus className="h-4 w-4 ml-2" />
              زاوية جديدة
            </Button>
          </div>
        </div>

        {/* تنبيه: مواضيع بانتظار المراجعة */}
        {totalPendingReview > 0 && (
          <Link href="/dashboard/muqtarab/review">
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 cursor-pointer hover:bg-blue-100 transition-colors dark:border-blue-900 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
              data-testid="banner-pending-review"
            >
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
                <FileText className="h-5 w-5" />
                <span className="font-medium">
                  {totalPendingReview} موضوع بانتظار المراجعة من الكتّاب
                </span>
              </div>
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                مراجعة الآن ←
              </span>
            </div>
          </Link>
        )}

        {/* Angles Table */}
        <Card data-testid="card-angles-table">
          <CardHeader>
            <CardTitle>الزوايا ({angles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8" data-testid="loader-angles">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : angles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-angles">
                لا توجد زوايا. ابدأ بإنشاء زاوية جديدة.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الأيقونة</TableHead>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">المعرف</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">المواضيع</TableHead>
                      <TableHead className="text-right">الترتيب</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {angles.map((angle) => {
                      const IconComponent = getIconComponent(angle.iconKey);
                      return (
                        <TableRow key={angle.id} data-testid={`row-angle-${angle.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-10 h-10 rounded-md flex items-center justify-center"
                                style={{ backgroundColor: angle.colorHex }}
                                data-testid={`icon-preview-${angle.id}`}
                              >
                                <IconComponent className="h-5 w-5 text-white" />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div data-testid={`text-angle-name-${angle.id}`}>
                              <div className="font-medium">{angle.nameAr}</div>
                              {angle.nameEn && (
                                <div className="text-sm text-muted-foreground">{angle.nameEn}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <code
                              className="text-sm bg-muted px-2 py-1 rounded"
                              data-testid={`text-angle-slug-${angle.id}`}
                            >
                              {angle.slug}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={angle.isActive ? "default" : "secondary"}
                              data-testid={`badge-status-${angle.id}`}
                            >
                              {angle.isActive ? "نشط" : "غير نشط"}
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`text-topics-${angle.id}`}>
                            {(() => {
                              const s = anglesStats[angle.id];
                              const total = s?.total || 0;
                              const pending = s?.pending_review || 0;
                              return (
                                <div className="flex items-center gap-2">
                                  <Link href={`/dashboard/muqtarab/angles/${angle.id}/topics`}>
                                    <span className="text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer">
                                      {total} موضوع
                                    </span>
                                  </Link>
                                  {pending > 0 && (
                                    <Badge
                                      className="bg-blue-500 hover:bg-blue-600 text-white"
                                      data-testid={`badge-pending-${angle.id}`}
                                    >
                                      {pending} بانتظار المراجعة
                                    </Badge>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell data-testid={`text-sort-order-${angle.id}`}>
                            {angle.sortOrder}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                asChild
                                data-testid={`button-topics-${angle.id}`}
                              >
                                <Link href={`/dashboard/muqtarab/angles/${angle.id}/topics`}>
                                  <FileText className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleActive(angle)}
                                disabled={toggleActiveMutation.isPending}
                                data-testid={`button-toggle-active-${angle.id}`}
                              >
                                {angle.isActive ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEdit(angle)}
                                data-testid={`button-edit-${angle.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeletingAngle(angle)}
                                data-testid={`button-delete-${angle.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog
          open={isCreateDialogOpen || !!editingAngle}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setEditingAngle(null);
              form.reset();
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">
                {editingAngle ? "تعديل الزاوية" : "زاوية جديدة"}
              </DialogTitle>
              <DialogDescription>
                {editingAngle
                  ? "تعديل معلومات الزاوية التحليلية"
                  : "إضافة زاوية تحليلية جديدة إلى مُقترب"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name Arabic */}
                <FormField
                  control={form.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالعربية *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: النشر الرقمي"
                          data-testid="input-name-ar"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Name English */}
                <FormField
                  control={form.control}
                  name="nameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالإنجليزية</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Example: Digital Publishing"
                          data-testid="input-name-en"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Slug */}
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المعرف (Slug) *</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="digital-publishing"
                            dir="ltr"
                            data-testid="input-slug"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={handleRegenerateSlug}
                          title="إعادة توليد من الاسم (إنجليزي فقط)"
                          data-testid="button-regenerate-slug"
                        >
                          <Wand2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormDescription>
                        يُولَّد من الجزء الإنجليزي للاسم (بلا أحرف عربية). عدّله يدوياً أو أعد توليده بالزر.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Color */}
                <FormField
                  control={form.control}
                  name="colorHex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اللون *</FormLabel>
                      <div className="flex items-center gap-3">
                        <FormControl>
                          <Input
                            {...field}
                            type="color"
                            className="w-20 h-10"
                            data-testid="input-color"
                          />
                        </FormControl>
                        <Input
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="#3b82f6"
                          className="font-mono"
                          data-testid="input-color-hex"
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Icon Key */}
                <FormField
                  control={form.control}
                  name="iconKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رمز الأيقونة *</FormLabel>
                      <FormControl>
                        <IconPicker
                          value={field.value}
                          onChange={field.onChange}
                          colorHex={form.watch("colorHex")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cover Image Upload */}
                <FormField
                  control={form.control}
                  name="coverImageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>صورة الغلاف</FormLabel>
                      <FormControl>
                        <CoverImageUpload
                          value={field.value}
                          onChange={(url) => field.onChange(url || "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Short Description */}
                <FormField
                  control={form.control}
                  name="shortDesc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>وصف مختصر</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="وصف قصير للزاوية"
                          rows={3}
                          data-testid="input-short-desc"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Sort Order */}
                <FormField
                  control={form.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ترتيب العرض</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-sort-order"
                        />
                      </FormControl>
                      <FormDescription>
                        رقم أقل = يظهر أولاً
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Is Active */}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-is-active"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">
                        الزاوية نشطة وظاهرة للعامة
                      </FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingAngle(null);
                      form.reset();
                    }}
                    data-testid="button-cancel"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    )}
                    {editingAngle ? "تحديث" : "إنشاء"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deletingAngle}
          onOpenChange={(open) => !open && setDeletingAngle(null)}
        >
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="text-delete-title">
                هل أنت متأكد من الحذف؟
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف الزاوية "{deletingAngle?.nameAr}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-delete-cancel">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingAngle && deleteMutation.mutate(deletingAngle.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-confirm"
              >
                {deleteMutation.isPending && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
