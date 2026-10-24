import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FolderOpen,
  PlusCircle,
  Edit,
  Trash2,
  Search,
  ImagePlus,
  Loader2,
  Upload,
  GripVertical,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  FileText,
  Layers,
  Sparkles,
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import type { Category } from "@shared/schema";
import { insertCategorySchema } from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Form schema for client-side validation
const categoryFormSchema = insertCategorySchema.extend({
  nameAr: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  slug: z.string().min(2, "المعرف يجب أن يكون حرفين على الأقل")
    .regex(/^[a-z0-9-]+$/, "المعرف يجب أن يحتوي على أحرف صغيرة وأرقام وشرطات فقط"),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;
type CategoryStatusFilter = "all" | "visible" | "active" | "inactive" | "with_hero";

function getCategoryArticleCount(category: Category): number | null {
  const record = category as unknown as Record<string, unknown>;
  const raw = record.articleCount ?? record.articlesCount ?? record.usageCount;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

// Sortable category item component
function SortableCategoryItem({
  category,
  index,
  onEdit,
  onDelete,
}: {
  category: Category;
  index: number;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  const articleCount = getCategoryArticleCount(category);
  const accentColor =
    category.color && category.color.trim() !== ""
      ? category.color
      : category.status === "visible"
      ? "#10b981"
      : category.status === "active"
      ? "#0284c7"
      : "#94a3b8";

  const statusBadgeClass =
    category.status === "visible"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
      : category.status === "active"
      ? "border-sky-200/80 bg-sky-50/90 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300"
      : "border-border bg-muted/70 text-muted-foreground";

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderRightColor: accentColor,
      }}
      className={`group relative flex flex-col justify-between gap-3.5 border-b border-border/60 border-r-4 bg-card px-3.5 py-3.5 transition-all last:border-b-0 hover:bg-muted/30 sm:flex-row sm:items-center sm:px-5 sm:py-4 ${
        isDragging ? "z-10 shadow-lg ring-2 ring-primary/20" : ""
      }`}
      data-testid={`category-row-${category.id}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0 sm:items-center">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 sm:mt-0 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted/60 hover:text-foreground active:cursor-grabbing"
          title="اسحب لإعادة الترتيب"
          data-testid={`drag-handle-${category.id}`}
        >
          <GripVertical className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>

        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 shadow-xs"
          style={{
            backgroundColor: category.color ? `${category.color}18` : undefined,
            borderColor: category.color ? `${category.color}40` : undefined,
          }}
        >
          {category.icon ? (
            <span className="text-2xl leading-none" data-testid={`icon-${category.id}`}>
              {category.icon}
            </span>
          ) : (
            <FolderOpen
              className="h-5 w-5 text-muted-foreground"
              style={{ color: category.color || undefined }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="font-bold text-base sm:text-lg text-foreground leading-snug"
              data-testid={`name-ar-${category.id}`}
            >
              {category.nameAr}
            </h3>
            {category.nameEn && (
              <span
                className="text-xs sm:text-sm text-muted-foreground font-medium"
                dir="ltr"
                data-testid={`name-en-${category.id}`}
              >
                {category.nameEn}
              </span>
            )}
            <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
              #{(category.displayOrder ?? index + 1).toLocaleString("en-US")}
            </span>
          </div>

          {category.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-2xl">
              {category.description}
            </p>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap pt-0.5">
            <Badge
              variant="outline"
              className="font-mono text-xs bg-muted/35 px-2 py-0.5"
              dir="ltr"
              data-testid={`slug-${category.id}`}
            >
              {category.slug}
            </Badge>

            <Badge
              variant="outline"
              className={`gap-1.5 text-xs font-medium ${statusBadgeClass}`}
              data-testid={`status-${category.id}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  category.status === "visible"
                    ? "bg-emerald-500"
                    : category.status === "active"
                    ? "bg-sky-500"
                    : "bg-muted-foreground/60"
                }`}
              />
              {category.status === "visible"
                ? "ظاهر للزوار"
                : category.status === "active"
                ? "نشط (غير ظاهر في /categories)"
                : "معطل"}
            </Badge>

            {articleCount !== null && (
              <Badge variant="secondary" className="gap-1 text-xs font-normal tabular-nums">
                <FileText className="h-3 w-3 text-muted-foreground" />
                {articleCount.toLocaleString("en-US")} مقال
              </Badge>
            )}

            {category.color && (
              <Badge
                variant="outline"
                className="gap-1.5 text-xs font-mono bg-background"
                dir="ltr"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full border border-black/10 shrink-0"
                  style={{ backgroundColor: category.color }}
                />
                {category.color}
              </Badge>
            )}

            {category.heroImageUrl && (
              <Badge
                variant="outline"
                className="gap-1.5 border-violet-200/80 bg-violet-50/70 text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-violet-300 text-xs"
              >
                <ImagePlus className="h-3 w-3" />
                صورة بطل
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 border-t border-border/40 pt-2.5 sm:border-t-0 sm:pt-0 sm:self-center shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70"
          onClick={() => onEdit(category)}
          title="تعديل التصنيف"
          data-testid={`button-edit-${category.id}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-destructive/80 hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(category)}
          title="حذف التصنيف"
          data-testid={`button-delete-${category.id}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function CategoriesManagement() {
  const { toast } = useToast();

  // State for dialogs
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CategoryStatusFilter>("all");
  const [isUploadingHeroImage, setIsUploadingHeroImage] = useState(false);

  // Local state for sorting
  const [localCategories, setLocalCategories] = useState<Category[]>([]);

  // Form
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema) as Resolver<CategoryFormValues>,
    defaultValues: {
      nameAr: "",
      nameEn: "",
      slug: "",
      description: "",
      icon: "",
      color: "",
      heroImageUrl: "",
      displayOrder: 0,
      status: "active",
    },
  });

  // Fetch categories
  const { data: categoriesRaw, isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Update local categories when data changes
  useEffect(() => {
    if (Array.isArray(categoriesRaw)) {
      const sorted = [...categoriesRaw].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      setLocalCategories(sorted);
    }
  }, [categoriesRaw]);

  // KPI metrics
  const stats = useMemo(() => {
    const total = localCategories.length;
    const visible = localCategories.filter((c) => c.status === "visible").length;
    const activeInternal = localCategories.filter((c) => c.status === "active").length;
    const inactive = localCategories.filter((c) => c.status === "inactive").length;
    const withHero = localCategories.filter((c) => Boolean(c.heroImageUrl)).length;
    const withVisuals = localCategories.filter((c) => Boolean(c.icon || c.color)).length;
    return { total, visible, activeInternal, inactive, withHero, withVisuals };
  }, [localCategories]);

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (categoryIds: string[]) => {
      return await apiRequest("/api/categories/reorder", {
        method: "POST",
        body: JSON.stringify({ categoryIds }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "تم تحديث الترتيب",
        description: "تم حفظ الترتيب الجديد بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الترتيب",
        variant: "destructive",
      });
      // Revert to original order on error
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      return await apiRequest("/api/categories", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "تم إنشاء التصنيف",
        description: "تم إضافة التصنيف بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء التصنيف",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CategoryFormValues> }) => {
      return await apiRequest(`/api/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setEditingCategory(null);
      form.reset();
      toast({
        title: "تم تحديث التصنيف",
        description: "تم تحديث التصنيف بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث التصنيف",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/categories/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setDeletingCategory(null);
      toast({
        title: "تم حذف التصنيف",
        description: "تم حذف التصنيف بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف التصنيف",
        variant: "destructive",
      });
    },
  });

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localCategories.findIndex((cat) => cat.id === active.id);
      const newIndex = localCategories.findIndex((cat) => cat.id === over.id);

      const newOrder = arrayMove(localCategories, oldIndex, newIndex);
      setLocalCategories(newOrder);

      // Update on server
      const categoryIds = newOrder.map((cat) => cat.id);
      reorderMutation.mutate(categoryIds);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      nameAr: category.nameAr,
      nameEn: category.nameEn || "",
      slug: category.slug,
      description: category.description || "",
      icon: category.icon || "",
      color: category.color || "",
      heroImageUrl: category.heroImageUrl || "",
      displayOrder: category.displayOrder || 0,
      // Preserve the category's real status (e.g. "visible") as-is. Coercing it to
      // active/inactive here used to silently flip "visible" categories to "active"
      // on every save (rename, recolor, image upload, etc.), which removed them from
      // the public /categories page, homepage, and SEO routes (all of which check
      // status === "visible"). There is no UI control for status in this form, so we
      // just round-trip whatever value the category already has.
      status: category.status as CategoryFormValues["status"],
    });
  };

  const handleHeroImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "خطأ",
        description: "الرجاء اختيار ملف صورة فقط",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "خطأ",
        description: "حجم الصورة يجب أن يكون أقل من 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploadingHeroImage(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "category-hero");
      const uploaded = (await apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      })) as { id: string; url: string };

      form.setValue("heroImageUrl", uploaded.url);

      toast({
        title: "تم رفع الصورة",
        description: "تم رفع صورة البطل بنجاح",
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل في رفع الصورة",
        variant: "destructive",
      });
    } finally {
      setIsUploadingHeroImage(false);
    }
  };

  const onSubmit = (data: CategoryFormValues) => {
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Filter categories
  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return localCategories.filter((cat) => {
      const matchesSearch = query
        ? cat.nameAr.toLowerCase().includes(query) ||
          (cat.nameEn && cat.nameEn.toLowerCase().includes(query)) ||
          cat.slug.toLowerCase().includes(query)
        : true;

      const matchesFilter =
        statusFilter === "all"
          ? true
          : statusFilter === "with_hero"
          ? Boolean(cat.heroImageUrl)
          : cat.status === statusFilter;

      return matchesSearch && matchesFilter;
    });
  }, [localCategories, searchQuery, statusFilter]);

  const filterPills: Array<{ id: CategoryStatusFilter; label: string; count: number }> = [
    { id: "all", label: "الكل", count: stats.total },
    { id: "visible", label: "ظاهر للزوار", count: stats.visible },
    { id: "active", label: "نشط داخلياً", count: stats.activeInternal },
    { id: "inactive", label: "معطل", count: stats.inactive },
    { id: "with_hero", label: "بصورة بطل", count: stats.withHero },
  ];

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="pb-10 space-y-5">
        <DashboardPageHeader
          icon={FolderOpen}
          title="إدارة التصنيفات"
          description="تنظيم أقسام الصحيفة التحريرية وضبط ظهورها وهويتها البصرية وترتيبها للزوار"
          titleTestId="heading-categories"
          actions={
            <Button
              onClick={() => {
                setIsCreateDialogOpen(true);
                form.reset();
              }}
              className="w-full gap-2 sm:w-auto shadow-xs"
              data-testid="button-add-category"
            >
              <PlusCircle className="h-4 w-4" />
              تصنيف جديد
            </Button>
          }
        />

        {/* Top KPI Summary Strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
          <Card className="rounded-2xl border-border/70 bg-card shadow-xs">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">إجمالي التصنيفات</p>
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  {stats.total.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {stats.withVisuals.toLocaleString("en-US")} بهوية بصرية (أيقونة/لون)
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Layers className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 via-card to-card shadow-xs dark:border-emerald-900/40 dark:from-emerald-950/20">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">ظاهر للزوار</p>
                <p className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {stats.visible.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  معروض في الرئيسية وصفحة الأقسام
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Eye className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 bg-card shadow-xs">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">نشط داخلياً</p>
                <p className="text-2xl font-bold tracking-tight text-sky-700 dark:text-sky-300 tabular-nums">
                  {stats.activeInternal.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  متاح للتصنيف دون الظهور في /categories
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 bg-card shadow-xs">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">معطل / صور الغلاف</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold tracking-tight tabular-nums">
                    {stats.inactive.toLocaleString("en-US")}
                  </p>
                  <span className="text-xs text-muted-foreground">معطل</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {stats.withHero.toLocaleString("en-US")} تصنيف بصورة بطل (Hero)
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Sparkles className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Quick Filter Pills */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="ابحث باسم التصنيف أو المعرّف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 pl-8 bg-background/80"
                  data-testid="input-search-categories"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="مسح البحث"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 no-scrollbar">
                {filterPills.map((pill) => {
                  const isActive = statusFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setStatusFilter(pill.id)}
                      className={`no-min-touch-size inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                          isActive
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-background/80 text-muted-foreground"
                        }`}
                      >
                        {pill.count.toLocaleString("en-US")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Categories List Card */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-sky-200/40 px-4 py-3.5 sm:px-5 sm:py-4 dark:border-sky-900/30">
            <div>
              <CardTitle className="text-base font-bold">ترتيب التصنيفات</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                اسحب أي تصنيف من مقبض الترتيب لتغيير أولوية ظهوره في الصحيفة.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {reorderMutation.isPending && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  جاري حفظ الترتيب...
                </span>
              )}
              <Badge variant="secondary" className="font-medium tabular-nums">
                {filteredCategories.length.toLocaleString("en-US")} تصنيف
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y divide-border/60">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3.5 px-4 py-4">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-11 w-11 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-8 w-16 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : filteredCategories.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredCategories.map((cat) => cat.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div>
                    {filteredCategories.map((category, idx) => (
                      <SortableCategoryItem
                        key={category.id}
                        category={category}
                        index={idx}
                        onEdit={handleEdit}
                        onDelete={setDeletingCategory}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  {statusFilter === "inactive" ? (
                    <EyeOff className="h-6 w-6" />
                  ) : (
                    <FolderOpen className="h-6 w-6" />
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">
                  {searchQuery || statusFilter !== "all" ? "لا توجد نتائج" : "لا توجد تصنيفات"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                  {searchQuery || statusFilter !== "all"
                    ? "جرّب تعديل عبارة البحث أو تغيير فلتر الحالة لعرض التصنيفات الأخرى."
                    : "ابدأ بإضافة أول تصنيف لتنظيم أقسام الصحيفة."}
                </p>
                {(searchQuery || statusFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                    className="no-min-touch-size mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                  >
                    إعادة ضبط الفلاتر
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardPageShell>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!editingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingCategory(null);
            form.reset();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "تعديل التصنيف" : "تصنيف جديد"}
            </DialogTitle>
            <DialogDescription>
              {editingCategory ? "تعديل بيانات التصنيف" : "أضف تصنيفاً جديداً للمقالات"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالعربية *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالإنجليزية</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} dir="ltr" data-testid="input-name-en" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المعرف (Slug) *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="technology" dir="ltr" data-testid="input-slug" />
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
                      <Textarea {...field} value={field.value || ""} rows={3} data-testid="input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>أيقونة (Emoji)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="📱" data-testid="input-icon" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اللون</FormLabel>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-9 w-9 shrink-0 rounded-md border border-border shadow-2xs"
                          style={{ backgroundColor: field.value || "#3b82f6" }}
                        />
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="#3b82f6"
                            dir="ltr"
                            data-testid="input-color"
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="displayOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الترتيب</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-display-order"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الحالة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "active"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="اختر الحالة" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="visible">ظاهر للزوار (يظهر في /categories والصفحة الرئيسية)</SelectItem>
                        <SelectItem value="active">نشط (غير ظاهر للزوار)</SelectItem>
                        <SelectItem value="inactive">معطل</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="heroImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>صورة البطل (Hero Image)</FormLabel>
                    <div className="space-y-2">
                      {field.value && (
                        <div className="relative w-full h-48 rounded-lg overflow-hidden border">
                          <img
                            src={field.value}
                            alt="Hero"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="https://..."
                            dir="ltr"
                            data-testid="input-hero-url"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isUploadingHeroImage}
                          onClick={() => document.getElementById("hero-upload")?.click()}
                          data-testid="button-upload-hero"
                        >
                          {isUploadingHeroImage ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </Button>
                        <input
                          id="hero-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleHeroImageUpload}
                        />
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEditingCategory(null);
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-category"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingCategory ? "تحديث" : "إنشاء"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingCategory}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف التصنيف &quot;{deletingCategory?.nameAr}&quot; نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCategory && deleteMutation.mutate(deletingCategory.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
