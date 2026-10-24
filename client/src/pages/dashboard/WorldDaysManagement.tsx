import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
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
  Search,
  Clock,
  Bell,
  CalendarDays,
  Flame,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
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

const categoryBadgeStyles: Record<string, string> = {
  national: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
  international: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300",
  religious: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
  health: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300",
  environmental: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300",
  cultural: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-300",
  social: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300",
  educational: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300",
  sports: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-300",
  economic: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800/60 dark:bg-cyan-950/40 dark:text-cyan-300",
  other: "border-border bg-muted/60 text-muted-foreground",
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

const monthNamesArray = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = monthNamesArray[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function getWorldDayCountdown(worldDay: WorldDay) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parsed = worldDay.eventDate ? new Date(worldDay.eventDate) : null;
  const month =
    worldDay.month ||
    (parsed && !isNaN(parsed.getTime()) ? parsed.getMonth() + 1 : 1);
  const day =
    worldDay.day ||
    (parsed && !isNaN(parsed.getTime()) ? parsed.getDate() : 1);

  if (today.getMonth() + 1 === month && today.getDate() === day) {
    return {
      daysLeft: 0,
      label: "اليوم!",
      tone: "today" as const,
      isWithinReminder: true,
      monthName: monthNamesArray[(month - 1) % 12] || "",
      dayNum: day,
      badgeClass:
        "border-emerald-300 bg-emerald-500/15 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold",
    };
  }

  let targetDate = new Date(today.getFullYear(), month - 1, day);
  if (worldDay.isRecurring === false && parsed && !isNaN(parsed.getTime())) {
    targetDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  } else if (targetDate < today) {
    targetDate = new Date(today.getFullYear() + 1, month - 1, day);
  }

  const daysLeft = Math.round(
    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const reminderDays =
    typeof worldDay.reminderDays === "number" ? worldDay.reminderDays : 7;
  const isWithinReminder = daysLeft >= 0 && daysLeft <= reminderDays;

  if (daysLeft < 0) {
    return {
      daysLeft,
      label: `مضى (${Math.abs(daysLeft)} يوم)`,
      tone: "past" as const,
      isWithinReminder: false,
      monthName: monthNamesArray[(month - 1) % 12] || "",
      dayNum: day,
      badgeClass: "border-border bg-muted/60 text-muted-foreground",
    };
  }
  if (daysLeft === 1) {
    return {
      daysLeft,
      label: "غداً!",
      tone: "imminent" as const,
      isWithinReminder,
      monthName: monthNamesArray[(month - 1) % 12] || "",
      dayNum: day,
      badgeClass:
        "border-amber-300 bg-amber-500/15 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-semibold",
    };
  }
  if (daysLeft === 2) {
    return {
      daysLeft,
      label: "خلال يومين",
      tone: "imminent" as const,
      isWithinReminder,
      monthName: monthNamesArray[(month - 1) % 12] || "",
      dayNum: day,
      badgeClass:
        "border-amber-300 bg-amber-500/15 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium",
    };
  }
  if (daysLeft <= 10) {
    return {
      daysLeft,
      label: `خلال ${daysLeft} أيام`,
      tone: "imminent" as const,
      isWithinReminder,
      monthName: monthNamesArray[(month - 1) % 12] || "",
      dayNum: day,
      badgeClass:
        "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300 font-medium",
    };
  }
  if (daysLeft <= 30) {
    return {
      daysLeft,
      label: `خلال ${daysLeft} يوماً`,
      tone: "upcoming" as const,
      isWithinReminder,
      monthName: monthNamesArray[(month - 1) % 12] || "",
      dayNum: day,
      badgeClass:
        "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300",
    };
  }
  return {
    daysLeft,
    label: `خلال ${daysLeft} يوم`,
    tone: "future" as const,
    isWithinReminder,
    monthName: monthNamesArray[(month - 1) % 12] || "",
    dayNum: day,
    badgeClass: "border-border/80 bg-muted/50 text-muted-foreground",
  };
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [quickTimeFilter, setQuickTimeFilter] = useState<"all" | "today" | "soon" | "month">("all");

  const form = useForm<WorldDayFormValues>({
    resolver: zodResolver(worldDayFormSchema) as Resolver<WorldDayFormValues>,
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
      const res = await fetch(apiUrl(`/api/world-days/${selectedWorldDay.id}/suggestions`));
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    },
    enabled: !!selectedWorldDay,
  });
  const suggestions = Array.isArray(suggestionsRaw) ? suggestionsRaw : [];

  // Enrich world days with countdown info and compute KPIs
  const currentMonthIndex = new Date().getMonth() + 1;
  const currentMonthLabel = monthNamesArray[currentMonthIndex - 1] || "";

  const kpiStats = useMemo(() => {
    let activeCount = 0;
    let activeTodayCount = 0;
    let thisMonthCount = 0;
    let withinReminderCount = 0;

    worldDays.forEach((wd) => {
      const cd = getWorldDayCountdown(wd);
      if (wd.isActive) activeCount++;
      if (cd.daysLeft === 0) activeTodayCount++;
      if (wd.month === currentMonthIndex) thisMonthCount++;
      if (wd.isActive && cd.isWithinReminder) withinReminderCount++;
    });

    return {
      total: worldDays.length,
      activeCount,
      inactiveCount: worldDays.length - activeCount,
      activeTodayCount,
      thisMonthCount,
      withinReminderCount,
    };
  }, [worldDays, currentMonthIndex]);

  const filteredWorldDays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return worldDays.filter((wd) => {
      const matchesSearch =
        !q ||
        wd.nameAr.toLowerCase().includes(q) ||
        (wd.nameEn && wd.nameEn.toLowerCase().includes(q)) ||
        (wd.description && wd.description.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (quickTimeFilter === "all") return true;
      const cd = getWorldDayCountdown(wd);
      if (quickTimeFilter === "today") return cd.daysLeft === 0;
      if (quickTimeFilter === "soon") return cd.daysLeft >= 0 && cd.daysLeft <= 14;
      if (quickTimeFilter === "month") return wd.month === currentMonthIndex;
      return true;
    });
  }, [worldDays, searchQuery, quickTimeFilter, currentMonthIndex]);

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

  const selectedCountdown = selectedWorldDay ? getWorldDayCountdown(selectedWorldDay) : null;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        {/* Unified Editorial Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="flex items-start sm:items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs">
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">
                إدارة الأيام العالمية
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                تخطيط وتغطية المناسبات الوطنية والدولية وتوليد الأفكار التحريرية بالذكاء الاصطناعي
              </p>
            </div>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Button
              className="flex-1 sm:flex-none gap-1.5"
              onClick={() => setIsImportDialogOpen(true)}
              variant="outline"
              data-testid="button-import-ics"
            >
              <Upload className="h-4 w-4" />
              <span>استيراد من تقويم</span>
            </Button>
            <Button
              className="flex-1 sm:flex-none gap-1.5"
              onClick={handleCreate}
              data-testid="button-create-world-day"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة يوم جديد</span>
            </Button>
          </div>
        </div>

        {/* Top KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="kpi-strip-world-days">
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">إجمالي الأيام العالمية</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                    {kpiStats.total}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {kpiStats.activeCount} نشط
                </span>
                <span>·</span>
                <span>{kpiStats.inactiveCount} غير نشط</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">مناسبات اليوم</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {kpiStats.activeTodayCount}
                    </p>
                    {kpiStats.activeTodayCount > 0 && (
                      <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                        اليوم!
                      </Badge>
                    )}
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Flame className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {kpiStats.activeTodayCount > 0
                  ? "مناسبة جارية اليوم للتغطية المباشرة"
                  : "لا توجد مناسبة مسجلة بتاريخ اليوم"}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">مناسبات هذا الشهر</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-sky-600 dark:text-sky-400 tabular-nums">
                    {kpiStats.thisMonthCount}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                خلال شهر {currentMonthLabel} الحالي
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">ضمن نافذة التذكير</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">
                    {kpiStats.withinReminderCount}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                مناسبات قريبة جاهزة لتوليد مقترحات التغطية
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters Card */}
        <Card className="border-border/70 shadow-xs" data-testid="card-filters">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <span>البحث والفلاتر السريعة</span>
              </CardTitle>

              {/* Search Input */}
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث باسم المناسبة أو الوصف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 pl-8 h-9 text-sm"
                  data-testid="input-search-world-days"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 pb-3">
              <span className="text-xs font-medium text-muted-foreground ml-1">الفترة:</span>
              {(
                [
                  { id: "all", label: "كل الأوقات" },
                  { id: "today", label: "اليوم!" },
                  { id: "soon", label: "خلال 14 يوماً" },
                  { id: "month", label: `شهر ${currentMonthLabel}` },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setQuickTimeFilter(pill.id)}
                  className={`no-min-touch-size inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    quickTimeFilter === pill.id
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {pill.label}
                </button>
              ))}

              <span className="mx-1 h-4 w-px bg-border/70 hidden sm:inline-block" />
              <span className="text-xs font-medium text-muted-foreground ml-1">التصنيف السريع:</span>
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`no-min-touch-size inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  categoryFilter === "all"
                    ? "bg-sky-600 text-white"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                الكل
              </button>
              {worldDayCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`no-min-touch-size inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    categoryFilter === cat
                      ? "bg-sky-600 text-white"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {categoryLabels[cat]}
                </button>
              ))}
            </div>

            {/* Select Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">التصنيف</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger data-testid="select-category-filter" className="h-9">
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
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">الشهر</label>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger data-testid="select-month-filter" className="h-9">
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
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">الحالة</label>
                <Select value={activeFilter} onValueChange={setActiveFilter}>
                  <SelectTrigger data-testid="select-active-filter" className="h-9">
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
            <Card className="border-border/70 shadow-xs" data-testid="card-world-days-table">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">الأيام العالمية ({filteredWorldDays.length})</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      اضغط على اسم المناسبة لعرض أو توليد مقترحات التغطية التحريرية
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {isLoading ? (
                  <div className="flex justify-center py-12" data-testid="loader-world-days">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredWorldDays.length === 0 ? (
                  <div className="text-center py-12 px-4 text-muted-foreground space-y-2" data-testid="text-no-world-days">
                    <Calendar className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="font-medium text-foreground">
                      لا توجد أيام عالمية. ابدأ بإضافة يوم جديد أو استيراد من تقويم.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="block md:table" dir="rtl">
                      <TableHeader className="hidden md:table-header-group">
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-right">المناسبة</TableHead>
                          <TableHead className="text-right">التاريخ والعد التنازلي</TableHead>
                          <TableHead className="text-right">التصنيف</TableHead>
                          <TableHead className="text-right">التذكير</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-left">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="block md:table-row-group p-3 sm:p-0 space-y-3 md:space-y-0">
                        {filteredWorldDays.map((worldDay) => {
                          const countdown = getWorldDayCountdown(worldDay);
                          const isSelected = selectedWorldDay?.id === worldDay.id;
                          const catBadgeStyle =
                            categoryBadgeStyles[worldDay.category] || categoryBadgeStyles.other;

                          return (
                            <TableRow
                              key={worldDay.id}
                              className={`flex flex-col md:table-row rounded-xl border border-border/70 md:rounded-none md:border-0 md:border-b p-4 md:p-0 transition-colors gap-2.5 md:gap-0 ${
                                isSelected
                                  ? "bg-primary/5 border-primary/40"
                                  : "bg-card hover:bg-muted/30"
                              }`}
                              data-testid={`row-world-day-${worldDay.id}`}
                            >
                              {/* Name & Calendar Date Box */}
                              <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-border/70 bg-muted/40 text-center">
                                    <span className="text-sm font-bold leading-none text-foreground tabular-nums">
                                      {countdown.dayNum}
                                    </span>
                                    <span className="mt-0.5 text-[10px] font-medium text-muted-foreground leading-none">
                                      {countdown.monthName}
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedWorldDay(worldDay)}
                                      className="no-min-touch-size text-right hover:text-primary hover:underline font-semibold text-foreground transition-colors"
                                      data-testid={`button-select-${worldDay.id}`}
                                    >
                                      {worldDay.nameAr}
                                    </button>
                                    {worldDay.nameEn && (
                                      <div className="text-xs text-muted-foreground font-mono truncate" dir="ltr">
                                        {worldDay.nameEn}
                                      </div>
                                    )}
                                    {worldDay.description && (
                                      <p className="text-xs text-muted-foreground/80 line-clamp-1 mt-0.5">
                                        {worldDay.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>

                              {/* Date & Countdown Badge */}
                              <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                                <div className="flex flex-wrap md:flex-col items-center md:items-start justify-between gap-1.5">
                                  <span
                                    className="text-xs sm:text-sm font-medium text-foreground"
                                    data-testid={`text-date-${worldDay.id}`}
                                  >
                                    {formatDate(worldDay.eventDate)}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`gap-1 text-[11px] ${countdown.badgeClass}`}
                                    data-testid={`badge-countdown-${worldDay.id}`}
                                  >
                                    {countdown.tone === "today" ? (
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    ) : (
                                      <Clock className="h-3 w-3" />
                                    )}
                                    <span>{countdown.label}</span>
                                  </Badge>
                                </div>
                              </TableCell>

                              {/* Category */}
                              <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                                <Badge
                                  variant="outline"
                                  className={catBadgeStyle}
                                  data-testid={`badge-category-${worldDay.id}`}
                                >
                                  {categoryLabels[worldDay.category] || worldDay.category}
                                </Badge>
                              </TableCell>

                              {/* Reminder */}
                              <TableCell
                                className="block md:table-cell p-0 md:p-4 text-right text-xs sm:text-sm text-muted-foreground"
                                data-testid={`text-reminder-${worldDay.id}`}
                              >
                                <span className="inline-flex items-center gap-1">
                                  <Bell className="h-3.5 w-3.5 text-muted-foreground/70" />
                                  <span>{worldDay.reminderDays} يوم</span>
                                </span>
                              </TableCell>

                              {/* Status */}
                              <TableCell
                                className="block md:table-cell p-0 md:p-4 text-right"
                                data-testid={`badge-status-${worldDay.id}`}
                              >
                                {worldDay.isActive ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                  >
                                    نشط
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">غير نشط</Badge>
                                )}
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="block md:table-cell p-0 pt-2 md:pt-4 md:p-4 border-t border-border/40 md:border-0 text-left">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleEdit(worldDay)}
                                    title="تعديل المناسبة"
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
                                    title="توليد اقتراحات بالذكاء الاصطناعي"
                                    data-testid={`button-generate-${worldDay.id}`}
                                  >
                                    <Sparkles className="h-4 w-4 text-primary" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setDeletingWorldDay(worldDay)}
                                    title="حذف المناسبة"
                                    data-testid={`button-delete-${worldDay.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
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
          </div>

          {/* Content Suggestions Panel */}
          <div className="lg:col-span-1">
            <Card className="border-border/70 shadow-xs lg:sticky lg:top-6" data-testid="card-suggestions-panel">
              <CardHeader className="border-b border-border/50 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  اقتراحات المحتوى الذكية
                </CardTitle>
                <CardDescription className="text-xs">
                  أفكار وزوايا تحريرية مقترحة لتغطية المناسبة المختارة
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {!selectedWorldDay ? (
                  <div className="text-center py-10 px-4 text-muted-foreground space-y-2" data-testid="text-no-selection">
                    <Sparkles className="h-9 w-9 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">
                      اختر يوماً عالمياً لعرض اقتراحات المحتوى
                    </p>
                    <p className="text-xs text-muted-foreground">
                      يمكنك توليد أفكار أخبار وتقارير وإنفوجرافيك بضغطة زر.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3.5 bg-muted/40 border border-border/60 rounded-xl space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground">{selectedWorldDay.nameAr}</h3>
                        {selectedCountdown && (
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[11px] ${selectedCountdown.badgeClass}`}
                          >
                            {selectedCountdown.label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(selectedWorldDay.eventDate)}</span>
                        <span>·</span>
                        <span>{categoryLabels[selectedWorldDay.category] || selectedWorldDay.category}</span>
                      </div>
                      {selectedWorldDay.description && (
                        <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                          {selectedWorldDay.description}
                        </p>
                      )}
                    </div>

                    <Button
                      onClick={() => generateSuggestionsMutation.mutate(selectedWorldDay.id)}
                      disabled={generateSuggestionsMutation.isPending}
                      className="w-full gap-2"
                      data-testid="button-generate-new-suggestions"
                    >
                      {generateSuggestionsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      توليد اقتراحات جديدة
                    </Button>

                    {isSuggestionsLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : suggestions.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm" data-testid="text-no-suggestions">
                        لا توجد اقتراحات. اضغط على الزر أعلاه لتوليد اقتراحات.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                        {suggestions.map((suggestion) => (
                          <div
                            key={suggestion.id}
                            className="p-3.5 border border-border/70 bg-card rounded-xl space-y-2 shadow-2xs"
                            data-testid={`suggestion-${suggestion.id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className="text-xs">
                                {suggestionTypeLabels[suggestion.suggestionType] || suggestion.suggestionType}
                              </Badge>
                              <Badge
                                variant={
                                  suggestion.status === "accepted"
                                    ? "default"
                                    : suggestion.status === "rejected"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {suggestion.status === "accepted"
                                  ? "مقبول"
                                  : suggestion.status === "rejected"
                                  ? "مرفوض"
                                  : "معلق"}
                              </Badge>
                            </div>
                            <h4 className="font-semibold text-sm text-foreground">{suggestion.title}</h4>
                            {suggestion.summary && (
                              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                {suggestion.summary}
                              </p>
                            )}
                            {suggestion.status === "pending" && (
                              <div className="flex items-center gap-2 pt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => acceptSuggestionMutation.mutate(suggestion.id)}
                                  disabled={acceptSuggestionMutation.isPending}
                                  className="flex-1 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800/60 dark:hover:bg-emerald-950/40"
                                  data-testid={`button-accept-${suggestion.id}`}
                                >
                                  <CheckCircle className="h-4 w-4 ml-1 text-emerald-600" />
                                  قبول
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => rejectSuggestionMutation.mutate(suggestion.id)}
                                  disabled={rejectSuggestionMutation.isPending}
                                  className="flex-1 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800/60 dark:hover:bg-rose-950/40"
                                  data-testid={`button-reject-${suggestion.id}`}
                                >
                                  <XCircle className="h-4 w-4 ml-1 text-rose-600" />
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
                <TabsTrigger value="paste" className="no-min-touch-size" data-testid="tab-paste">لصق المحتوى</TabsTrigger>
                <TabsTrigger value="upload" className="no-min-touch-size" data-testid="tab-upload">رفع ملف</TabsTrigger>
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
