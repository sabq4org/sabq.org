import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Calendar,
  Plus,
  Upload,
  Edit,
  Trash2,
  Sparkles,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  Filter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { worldDayCategories, insertWorldDaySchema } from "@shared/schema";
import type { WorldDay, WorldDaySuggestion, Category } from "@shared/schema";

const worldDayFormSchema = insertWorldDaySchema.extend({
  nameAr: z.string().min(2, "الاسم العربي يجب أن يكون حرفين على الأقل"),
  eventDate: z.string().min(1, "تاريخ المناسبة مطلوب"),
  month: z.number().min(1).max(12),
  day: z.number().min(1).max(31),
  category: z.string().min(1, "التصنيف مطلوب"),
  reminderDays: z.number().min(0).max(30).default(7),
  isActive: z.boolean().default(true),
});

type WorldDayFormValues = z.infer<typeof worldDayFormSchema>;

const categoryLabels: Record<string, string> = {
  international: "دولي",
  national: "وطني",
  religious: "ديني",
  health: "صحي",
  environmental: "بيئي",
  cultural: "ثقافي",
  social: "اجتماعي",
  educational: "تعليمي",
  sports: "رياضي",
  economic: "اقتصادي",
  other: "أخرى",
};

const suggestionTypeLabels: Record<string, string> = {
  news: "خبر",
  report: "تقرير",
  infographic: "إنفوجرافيك",
  event: "فعالية",
  social_post: "منشور سوشيال",
};

const arabicMonths = [
  { value: "1", label: "يناير" },
  { value: "2", label: "فبراير" },
  { value: "3", label: "مارس" },
  { value: "4", label: "أبريل" },
  { value: "5", label: "مايو" },
  { value: "6", label: "يونيو" },
  { value: "7", label: "يوليو" },
  { value: "8", label: "أغسطس" },
  { value: "9", label: "سبتمبر" },
  { value: "10", label: "أكتوبر" },
  { value: "11", label: "نوفمبر" },
  { value: "12", label: "ديسمبر" },
];

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  const day = d.getDate().toString().padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export default function WorldDaysManagement() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingWorldDay, setEditingWorldDay] = useState<WorldDay | null>(null);
  const [deletingWorldDay, setDeletingWorldDay] = useState<WorldDay | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedWorldDay, setSelectedWorldDay] = useState<WorldDay | null>(null);
  const [icsContent, setIcsContent] = useState("");
  const [importCategory, setImportCategory] = useState("international");

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const form = useForm<WorldDayFormValues>({
    resolver: zodResolver(worldDayFormSchema),
    defaultValues: {
      nameAr: "",
      nameEn: "",
      description: "",
      eventDate: "",
      month: 1,
      day: 1,
      category: "international",
      reminderDays: 7,
      isActive: true,
      isRecurring: true,
      linkedCategoryId: "",
    },
  });

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.append("category", categoryFilter);
    if (monthFilter !== "all") params.append("month", monthFilter);
    if (activeFilter !== "all") params.append("isActive", activeFilter);
    return params.toString();
  };

  const { data: worldDaysRaw, isLoading } = useQuery<WorldDay[]>({
    queryKey: ["/api/world-days", categoryFilter, monthFilter, activeFilter],
    queryFn: async () => {
      const queryString = buildQueryParams();
      const url = `/api/world-days${queryString ? `?${queryString}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch world days");
      return res.json();
    },
  });
  const worldDays = Array.isArray(worldDaysRaw) ? worldDaysRaw : [];

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: suggestionsRaw, isLoading: isSuggestionsLoading } = useQuery<WorldDaySuggestion[]>({
    queryKey: ["/api/world-days", selectedWorldDay?.id, "suggestions"],
    queryFn: async () => {
      if (!selectedWorldDay) return [];
      const res = await fetch(`/api/world-days/${selectedWorldDay.id}/suggestions`);
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    },
    enabled: !!selectedWorldDay,
  });
  const suggestions = Array.isArray(suggestionsRaw) ? suggestionsRaw : [];

  const createMutation = useMutation({
    mutationFn: async (data: WorldDayFormValues) => {
      return await apiRequest("/api/world-days", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-days"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({ title: "تم إنشاء اليوم العالمي", description: "تمت الإضافة بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل في إنشاء اليوم العالمي", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<WorldDayFormValues> }) => {
      return await apiRequest(`/api/world-days/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-days"] });
      setEditingWorldDay(null);
      form.reset();
      toast({ title: "تم تحديث اليوم العالمي", description: "تم التحديث بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل في تحديث اليوم العالمي", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/world-days/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-days"] });
      setDeletingWorldDay(null);
      if (selectedWorldDay?.id === deletingWorldDay?.id) {
        setSelectedWorldDay(null);
      }
      toast({ title: "تم حذف اليوم العالمي", description: "تم الحذف بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل في حذف اليوم العالمي", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { icsContent: string; category: string }) => {
      return await apiRequest("/api/world-days/import-ics", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-days"] });
      setIsImportDialogOpen(false);
      setIcsContent("");
      toast({
        title: "تم الاستيراد",
        description: `تم استيراد ${result.imported} يوم عالمي. تم تخطي ${result.skipped} مكرر.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في الاستيراد", description: error.message || "فشل في استيراد الملف", variant: "destructive" });
    },
  });

  const generateSuggestionsMutation = useMutation({
    mutationFn: async (worldDayId: string) => {
      return await apiRequest(`/api/world-days/${worldDayId}/generate-suggestions`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-days", selectedWorldDay?.id, "suggestions"] });
      toast({ title: "تم توليد الاقتراحات", description: "تم إنشاء اقتراحات جديدة بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل في توليد الاقتراحات", variant: "destructive" });
    },
  });

  const acceptSuggestionMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      return await apiRequest(`/api/world-days/suggestions/${suggestionId}/accept`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-days", selectedWorldDay?.id, "suggestions"] });
      toast({ title: "تم قبول الاقتراح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const rejectSuggestionMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      return await apiRequest(`/api/world-days/suggestions/${suggestionId}/reject`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-days", selectedWorldDay?.id, "suggestions"] });
      toast({ title: "تم رفض الاقتراح" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    form.reset({
      nameAr: "",
      nameEn: "",
      description: "",
      eventDate: "",
      month: 1,
      day: 1,
      category: "international",
      reminderDays: 7,
      isActive: true,
      isRecurring: true,
      linkedCategoryId: "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (worldDay: WorldDay) => {
    setEditingWorldDay(worldDay);
    form.reset({
      nameAr: worldDay.nameAr,
      nameEn: worldDay.nameEn || "",
      description: worldDay.description || "",
      eventDate: worldDay.eventDate,
      month: worldDay.month,
      day: worldDay.day,
      category: worldDay.category,
      reminderDays: worldDay.reminderDays,
      isActive: worldDay.isActive,
      isRecurring: worldDay.isRecurring,
      linkedCategoryId: worldDay.linkedCategoryId || "",
    });
  };

  const handleDateChange = (dateString: string) => {
    if (dateString) {
      const date = new Date(dateString);
      form.setValue("eventDate", dateString);
      form.setValue("month", date.getMonth() + 1);
      form.setValue("day", date.getDate());
    }
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (editingWorldDay) {
      updateMutation.mutate({ id: editingWorldDay.id, data });
    } else {
      createMutation.mutate(data);
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setIcsContent(content);
      };
      reader.readAsText(file);
    }
  };

  const handleImport = () => {
    if (icsContent.trim()) {
      importMutation.mutate({ icsContent, category: importCategory });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Calendar className="h-5 w-5 text-primary" /></span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">
                إدارة الأيام العالمية
              </h1>
              <p className="text-muted-foreground mt-1">
                إدارة المناسبات والأيام العالمية للتخطيط المحتوى
              </p>
            </div>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Button className="flex-1 sm:flex-none" onClick={() => setIsImportDialogOpen(true)} variant="outline" data-testid="button-import-ics">
              <Upload className="h-4 w-4 ml-2" />
              استيراد من تقويم
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={handleCreate} data-testid="button-create-world-day">
              <Plus className="h-4 w-4 ml-2" />
              إضافة يوم جديد
            </Button>
          </div>
        </div>

        <Card className="border-border/70 shadow-none" data-testid="card-filters">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              الفلاتر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[180px]">
                <label className="text-sm font-medium mb-2 block">التصنيف</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger data-testid="select-category-filter">
                    <SelectValue placeholder="كل التصنيفات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل التصنيفات</SelectItem>
                    {worldDayCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{categoryLabels[cat]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-sm font-medium mb-2 block">الشهر</label>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger data-testid="select-month-filter">
                    <SelectValue placeholder="كل الشهور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الشهور</SelectItem>
                    {arabicMonths.map((month) => (
                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-sm font-medium mb-2 block">الحالة</label>
                <Select value={activeFilter} onValueChange={setActiveFilter}>
                  <SelectTrigger data-testid="select-active-filter">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="true">نشط</SelectItem>
                    <SelectItem value="false">غير نشط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="border-border/70 shadow-none" data-testid="card-world-days-table">
              <CardHeader>
                <CardTitle>الأيام العالمية ({worldDays.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8" data-testid="loader-world-days">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : worldDays.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-world-days">
                    لا توجد أيام عالمية. ابدأ بإضافة يوم جديد أو استيراد من تقويم.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">الاسم</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">التصنيف</TableHead>
                          <TableHead className="text-right">التذكير</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {worldDays.map((worldDay) => (
                          <TableRow
                            key={worldDay.id}
                            className={selectedWorldDay?.id === worldDay.id ? "bg-muted/50" : ""}
                            data-testid={`row-world-day-${worldDay.id}`}
                          >
                            <TableCell>
                              <button
                                onClick={() => setSelectedWorldDay(worldDay)}
                                className="text-right hover:underline font-medium"
                                data-testid={`button-select-${worldDay.id}`}
                              >
                                {worldDay.nameAr}
                              </button>
                              {worldDay.nameEn && (
                                <div className="text-sm text-muted-foreground">{worldDay.nameEn}</div>
                              )}
                            </TableCell>
                            <TableCell data-testid={`text-date-${worldDay.id}`}>
                              {formatDate(worldDay.eventDate)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" data-testid={`badge-category-${worldDay.id}`}>
                                {categoryLabels[worldDay.category] || worldDay.category}
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-reminder-${worldDay.id}`}>
                              {worldDay.reminderDays} يوم
                            </TableCell>
                            <TableCell data-testid={`badge-status-${worldDay.id}`}>
                              {worldDay.isActive ? (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">نشط</Badge>
                              ) : (
                                <Badge variant="secondary">غير نشط</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEdit(worldDay)}
                                  data-testid={`button-edit-${worldDay.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedWorldDay(worldDay);
                                    generateSuggestionsMutation.mutate(worldDay.id);
                                  }}
                                  disabled={generateSuggestionsMutation.isPending}
                                  data-testid={`button-generate-${worldDay.id}`}
                                >
                                  <Sparkles className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeletingWorldDay(worldDay)}
                                  data-testid={`button-delete-${worldDay.id}`}
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
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="border-border/70 shadow-none" data-testid="card-suggestions-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  اقتراحات المحتوى
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedWorldDay ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-selection">
                    اختر يوماً عالمياً لعرض اقتراحات المحتوى
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <h3 className="font-semibold">{selectedWorldDay.nameAr}</h3>
                      <p className="text-sm text-muted-foreground">{formatDate(selectedWorldDay.eventDate)}</p>
                    </div>

                    <Button
                      onClick={() => generateSuggestionsMutation.mutate(selectedWorldDay.id)}
                      disabled={generateSuggestionsMutation.isPending}
                      className="w-full"
                      data-testid="button-generate-new-suggestions"
                    >
                      {generateSuggestionsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 ml-2" />
                      )}
                      توليد اقتراحات جديدة
                    </Button>

                    {isSuggestionsLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : suggestions.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground text-sm" data-testid="text-no-suggestions">
                        لا توجد اقتراحات. اضغط على الزر أعلاه لتوليد اقتراحات.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {suggestions.map((suggestion) => (
                          <div
                            key={suggestion.id}
                            className="p-3 border rounded-lg space-y-2"
                            data-testid={`suggestion-${suggestion.id}`}
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {suggestionTypeLabels[suggestion.suggestionType] || suggestion.suggestionType}
                              </Badge>
                              <Badge
                                variant={
                                  suggestion.status === "accepted" ? "default" :
                                  suggestion.status === "rejected" ? "destructive" : "secondary"
                                }
                                className="text-xs"
                              >
                                {suggestion.status === "accepted" ? "مقبول" :
                                 suggestion.status === "rejected" ? "مرفوض" : "معلق"}
                              </Badge>
                            </div>
                            <h4 className="font-medium text-sm">{suggestion.title}</h4>
                            {suggestion.summary && (
                              <p className="text-sm text-muted-foreground">{suggestion.summary}</p>
                            )}
                            {suggestion.status === "pending" && (
                              <div className="flex items-center gap-2 pt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => acceptSuggestionMutation.mutate(suggestion.id)}
                                  disabled={acceptSuggestionMutation.isPending}
                                  className="flex-1"
                                  data-testid={`button-accept-${suggestion.id}`}
                                >
                                  <CheckCircle className="h-4 w-4 ml-1" />
                                  قبول
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => rejectSuggestionMutation.mutate(suggestion.id)}
                                  disabled={rejectSuggestionMutation.isPending}
                                  className="flex-1"
                                  data-testid={`button-reject-${suggestion.id}`}
                                >
                                  <XCircle className="h-4 w-4 ml-1" />
                                  رفض
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog
          open={isCreateDialogOpen || !!editingWorldDay}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setEditingWorldDay(null);
              form.reset();
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">
                {editingWorldDay ? "تعديل اليوم العالمي" : "إضافة يوم عالمي جديد"}
              </DialogTitle>
              <DialogDescription>
                {editingWorldDay ? "تعديل معلومات اليوم العالمي" : "إضافة مناسبة جديدة إلى التقويم"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="nameAr"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الاسم بالعربية *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="مثال: اليوم العالمي للصحة" data-testid="input-name-ar" />
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
                          <Input {...field} value={field.value || ""} placeholder="World Health Day" dir="ltr" data-testid="input-name-en" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الوصف</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ""} placeholder="وصف مختصر للمناسبة..." rows={3} data-testid="input-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="eventDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تاريخ المناسبة *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            onChange={(e) => handleDateChange(e.target.value)}
                            data-testid="input-event-date"
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
                        <FormLabel>التصنيف *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder="اختر التصنيف" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {worldDayCategories.map((cat) => (
                              <SelectItem key={cat} value={cat}>{categoryLabels[cat]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="reminderDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>أيام التذكير المسبق</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            min={0}
                            max={30}
                            data-testid="input-reminder-days"
                          />
                        </FormControl>
                        <FormDescription>عدد الأيام قبل المناسبة لإرسال تذكير</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="linkedCategoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الفئة المرتبطة</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-linked-category">
                              <SelectValue placeholder="اختر فئة (اختياري)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">بدون ربط</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.nameAr}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">نشط</FormLabel>
                        <FormDescription>تفعيل أو تعطيل هذا اليوم العالمي</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-is-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingWorldDay(null);
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
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    )}
                    {editingWorldDay ? "تحديث" : "إنشاء"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="text-import-dialog-title">
                استيراد من تقويم ICS
              </DialogTitle>
              <DialogDescription>
                استيراد أيام عالمية من ملف تقويم بصيغة ICS
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="paste" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="paste" data-testid="tab-paste">لصق المحتوى</TabsTrigger>
                <TabsTrigger value="upload" data-testid="tab-upload">رفع ملف</TabsTrigger>
              </TabsList>
              <TabsContent value="paste" className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">محتوى ICS</label>
                  <Textarea
                    value={icsContent}
                    onChange={(e) => setIcsContent(e.target.value)}
                    placeholder="الصق محتوى ملف ICS هنا..."
                    rows={10}
                    dir="ltr"
                    className="font-mono text-sm"
                    data-testid="textarea-ics-content"
                  />
                </div>
              </TabsContent>
              <TabsContent value="upload" className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ics"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-file"
                  >
                    <Upload className="h-4 w-4 ml-2" />
                    اختر ملف ICS
                  </Button>
                  {icsContent && (
                    <p className="text-sm text-green-600 mt-2">تم تحميل الملف بنجاح</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div>
              <label className="text-sm font-medium mb-2 block">تصنيف الأحداث المستوردة</label>
              <Select value={importCategory} onValueChange={setImportCategory}>
                <SelectTrigger data-testid="select-import-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {worldDayCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{categoryLabels[cat]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsImportDialogOpen(false);
                  setIcsContent("");
                }}
                data-testid="button-cancel-import"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleImport}
                disabled={!icsContent.trim() || importMutation.isPending}
                data-testid="button-confirm-import"
              >
                {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                استيراد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deletingWorldDay} onOpenChange={() => setDeletingWorldDay(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد من الحذف؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف اليوم العالمي "{deletingWorldDay?.nameAr}" نهائياً. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingWorldDay && deleteMutation.mutate(deletingWorldDay.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
