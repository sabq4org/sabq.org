import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Pencil, Trash2, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import type { Category } from "@shared/schema";

const categoryFormSchema = z.object({
  nameAr: z.string().min(1, "الاسم العربي مطلوب"),
  nameEn: z.string().optional(),
  slug: z.string().min(1, "المعرّف مطلوب"),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  type: z.enum(["smart", "dynamic", "seasonal"]),
  status: z.enum(["active", "inactive"]),
  autoActivate: z.boolean().default(false),
  seasonalRules: z.object({
    hijriMonth: z.string().optional(),
    hijriYear: z.union([z.string(), z.literal("auto")]).optional(),
    gregorianMonth: z.number().min(1).max(12).optional(),
    activateDaysBefore: z.number().min(0).default(0),
    deactivateDaysAfter: z.number().min(0).default(0),
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
  }).optional(),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const HIJRI_MONTHS = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

const GREGORIAN_MONTHS = [
  { value: 1, label: "يناير" },
  { value: 2, label: "فبراير" },
  { value: 3, label: "مارس" },
  { value: 4, label: "أبريل" },
  { value: 5, label: "مايو" },
  { value: 6, label: "يونيو" },
  { value: 7, label: "يوليو" },
  { value: 8, label: "أغسطس" },
  { value: 9, label: "سبتمبر" },
  { value: 10, label: "أكتوبر" },
  { value: 11, label: "نوفمبر" },
  { value: 12, label: "ديسمبر" },
];

export default function SmartCategoriesManagement() {
  const { toast } = useToast();
  
  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Form
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      nameAr: "",
      nameEn: "",
      slug: "",
      descriptionAr: "",
      descriptionEn: "",
      type: "smart",
      status: "active",
      autoActivate: false,
      seasonalRules: {
        activateDaysBefore: 0,
        deactivateDaysAfter: 0,
      },
    },
  });

  // Fetch categories
  const { data: categoriesRaw, isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories/smart", typeFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.append("type", typeFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);
      
      const url = `/api/categories/smart${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Filter by search term
  const filteredCategories = categories.filter((cat) =>
    cat.nameAr.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.nameEn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const stats = {
    total: filteredCategories.length,
    smart: filteredCategories.filter((c) => c.type === "smart").length,
    dynamic: filteredCategories.filter((c) => c.type === "dynamic").length,
    seasonal: filteredCategories.filter((c) => c.type === "seasonal").length,
    active: filteredCategories.filter((c) => c.status === "active").length,
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      return await apiRequest("/api/admin/categories/smart", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/smart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "تم الإنشاء بنجاح", description: "تم إنشاء التصنيف الذكي بنجاح" });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في الإنشاء",
        description: error.message || "فشل في إنشاء التصنيف",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CategoryFormValues> }) => {
      return await apiRequest(`/api/admin/categories/smart/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/smart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "تم التحديث بنجاح", description: "تم تحديث التصنيف بنجاح" });
      setEditDialogOpen(false);
      setEditingCategory(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في التحديث",
        description: error.message || "فشل في تحديث التصنيف",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/categories/smart/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/smart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "تم الحذف بنجاح", description: "تم حذف التصنيف بنجاح" });
      setDeletingCategory(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في الحذف",
        description: error.message || "فشل في حذف التصنيف",
        variant: "destructive",
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      return await apiRequest(`/api/admin/categories/smart/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/smart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "تم تحديث الحالة", description: "تم تحديث حالة التصنيف بنجاح" });
    },
  });

  const handleAdd = () => {
    form.reset({
      nameAr: "",
      nameEn: "",
      slug: "",
      descriptionAr: "",
      descriptionEn: "",
      type: "smart",
      status: "active",
      autoActivate: false,
      seasonalRules: {
        activateDaysBefore: 0,
        deactivateDaysAfter: 0,
      },
    });
    setAddDialogOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      nameAr: category.nameAr,
      nameEn: category.nameEn || "",
      slug: category.slug,
      descriptionAr: (category as any).descriptionAr || "",
      descriptionEn: (category as any).descriptionEn || "",
      type: category.type as "smart" | "dynamic" | "seasonal",
      status: category.status as "active" | "inactive",
      autoActivate: category.autoActivate || false,
      seasonalRules: category.seasonalRules || {
        activateDaysBefore: 0,
        deactivateDaysAfter: 0,
      },
    });
    setEditDialogOpen(true);
  };

  const handleSubmit = (data: CategoryFormValues) => {
    // Clean up the data before sending
    const cleanData: any = { ...data };
    
    // If not seasonal type, remove seasonalRules
    if (data.type !== "seasonal") {
      delete cleanData.seasonalRules;
      delete cleanData.autoActivate;
    } else {
      // For seasonal, ensure seasonalRules is properly formatted
      if (cleanData.seasonalRules) {
        // Remove empty or undefined fields
        const rules: any = {};
        if (cleanData.seasonalRules.hijriMonth) {
          rules.hijriMonth = cleanData.seasonalRules.hijriMonth;
          if (cleanData.seasonalRules.hijriYear) {
            rules.hijriYear = cleanData.seasonalRules.hijriYear;
          }
        }
        if (cleanData.seasonalRules.gregorianMonth) {
          rules.gregorianMonth = cleanData.seasonalRules.gregorianMonth;
        }
        if (cleanData.seasonalRules.activateDaysBefore !== undefined) {
          rules.activateDaysBefore = cleanData.seasonalRules.activateDaysBefore;
        }
        if (cleanData.seasonalRules.deactivateDaysAfter !== undefined) {
          rules.deactivateDaysAfter = cleanData.seasonalRules.deactivateDaysAfter;
        }
        if (cleanData.seasonalRules.dateRange?.start || cleanData.seasonalRules.dateRange?.end) {
          rules.dateRange = cleanData.seasonalRules.dateRange;
        }
        
        cleanData.seasonalRules = Object.keys(rules).length > 0 ? rules : undefined;
      }
    }

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: cleanData });
    } else {
      createMutation.mutate(cleanData);
    }
  };

  const getTypeBadge = (type: string) => {
    const variants = {
      smart: "default",
      dynamic: "secondary",
      seasonal: "outline",
    };
    const labels = {
      smart: "ذكي",
      dynamic: "ديناميكي",
      seasonal: "موسمي",
    };
    return (
      <Badge variant={variants[type as keyof typeof variants] as any}>
        {labels[type as keyof typeof labels]}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    return status === "active" ? (
      <Badge variant="default">نشط</Badge>
    ) : (
      <Badge variant="secondary">معطل</Badge>
    );
  };

  const categoryType = form.watch("type");
  const useHijri = form.watch("seasonalRules.hijriMonth");

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              التصنيفات الذكية
            </h1>
            <p className="text-muted-foreground mt-1">
              إدارة التصنيفات الذكية والديناميكية والموسمية
            </p>
          </div>
          <Button onClick={handleAdd} data-testid="button-add-category">
            <Plus className="ml-2 h-4 w-4" />
            إضافة تصنيف ذكي
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card data-testid="card-stat-total">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                المجموع
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-total">
                {stats.total.toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>

          <Card
            data-testid="card-stat-smart"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${
              typeFilter === "smart" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setTypeFilter(typeFilter === "smart" ? "all" : "smart")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                ذكية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-smart">
                {stats.smart.toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>

          <Card
            data-testid="card-stat-dynamic"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${
              typeFilter === "dynamic" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setTypeFilter(typeFilter === "dynamic" ? "all" : "dynamic")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                ديناميكية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-dynamic">
                {stats.dynamic.toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>

          <Card
            data-testid="card-stat-seasonal"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${
              typeFilter === "seasonal" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setTypeFilter(typeFilter === "seasonal" ? "all" : "seasonal")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                موسمية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-seasonal">
                {stats.seasonal.toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>

          <Card
            data-testid="card-stat-active"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${
              statusFilter === "active" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                نشطة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-active">
                {stats.active.toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>التصنيفات الذكية</CardTitle>
            <CardDescription>
              {filteredCategories.length.toLocaleString("en-US")} تصنيف
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="البحث بالاسم أو المعرّف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10"
                  data-testid="input-search"
                />
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>المعرّف</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>تفعيل تلقائي</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        جاري التحميل...
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && filteredCategories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد تصنيفات
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading &&
                    filteredCategories.map((category) => (
                      <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium" data-testid={`text-name-ar-${category.id}`}>
                              {category.nameAr}
                            </div>
                            {category.nameEn && (
                              <div className="text-sm text-muted-foreground" data-testid={`text-name-en-${category.id}`}>
                                {category.nameEn}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded" data-testid={`text-slug-${category.id}`}>
                            {category.slug}
                          </code>
                        </TableCell>
                        <TableCell data-testid={`cell-type-${category.id}`}>
                          {getTypeBadge(category.type)}
                        </TableCell>
                        <TableCell data-testid={`cell-status-${category.id}`}>
                          {getStatusBadge(category.status)}
                        </TableCell>
                        <TableCell data-testid={`cell-auto-activate-${category.id}`}>
                          {category.autoActivate ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-gray-400" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(category)}
                              data-testid={`button-edit-${category.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  id: category.id,
                                  status: category.status === "active" ? "inactive" : "active",
                                })
                              }
                              disabled={toggleStatusMutation.isPending}
                              data-testid={`button-toggle-${category.id}`}
                            >
                              {category.status === "active" ? (
                                <XCircle className="h-4 w-4 text-red-600" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingCategory(category)}
                              data-testid={`button-delete-${category.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={addDialogOpen || editDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setAddDialogOpen(false);
            setEditDialogOpen(false);
            setEditingCategory(null);
            form.reset();
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "تعديل تصنيف ذكي" : "إضافة تصنيف ذكي"}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? "تعديل بيانات التصنيف الذكي"
                  : "إضافة تصنيف ذكي جديد للنظام"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                {/* Basic Info */}
                <FormField
                  control={form.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم العربي *</FormLabel>
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
                      <FormLabel>الاسم الإنجليزي</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name-en" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المعرّف (Slug) *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-slug" />
                      </FormControl>
                      <FormDescription>
                        يستخدم في الروابط (مثال: ramadan-smart)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="descriptionAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الوصف العربي</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="textarea-desc-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>النوع *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue placeholder="اختر النوع" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="smart">ذكي</SelectItem>
                            <SelectItem value="dynamic">ديناميكي</SelectItem>
                            <SelectItem value="seasonal">موسمي</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الحالة *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-status">
                              <SelectValue placeholder="اختر الحالة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">نشط</SelectItem>
                            <SelectItem value="inactive">معطل</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Seasonal Rules */}
                {categoryType === "seasonal" && (
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold">قواعد التفعيل الموسمي</h3>

                    <FormField
                      control={form.control}
                      name="autoActivate"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">تفعيل تلقائي</FormLabel>
                            <FormDescription>
                              تفعيل/تعطيل التصنيف تلقائياً حسب الموسم
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-auto-activate"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="seasonalRules.hijriMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الشهر الهجري</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-hijri-month">
                                <SelectValue placeholder="اختر الشهر الهجري" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">لا يوجد</SelectItem>
                              {HIJRI_MONTHS.map((month) => (
                                <SelectItem key={month} value={month}>
                                  {month}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {useHijri && (
                      <FormField
                        control={form.control}
                        name="seasonalRules.hijriYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>السنة الهجرية</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="auto أو رقم السنة"
                                data-testid="input-hijri-year"
                              />
                            </FormControl>
                            <FormDescription>
                              اكتب "auto" للسنة التلقائية أو رقم سنة محدد
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {!useHijri && (
                      <FormField
                        control={form.control}
                        name="seasonalRules.gregorianMonth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>الشهر الميلادي</FormLabel>
                            <Select
                              onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                              value={field.value?.toString() || ""}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-gregorian-month">
                                  <SelectValue placeholder="اختر الشهر الميلادي" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">لا يوجد</SelectItem>
                                {GREGORIAN_MONTHS.map((month) => (
                                  <SelectItem key={month.value} value={month.value.toString()}>
                                    {month.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="seasonalRules.activateDaysBefore"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>تفعيل قبل بـ (أيام)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min="0"
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-activate-before"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="seasonalRules.deactivateDaysAfter"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>تعطيل بعد بـ (أيام)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min="0"
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-deactivate-after"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddDialogOpen(false);
                      setEditDialogOpen(false);
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
                    data-testid="button-submit"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "جاري الحفظ..."
                      : editingCategory
                      ? "تحديث"
                      : "إضافة"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف التصنيف "{deletingCategory?.nameAr}" نهائياً. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingCategory && deleteMutation.mutate(deletingCategory.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
