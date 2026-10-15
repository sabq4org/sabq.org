import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ShieldAlert,
  FileText,
  Upload,
  Filter,
  XCircle,
  AlertTriangle,
  Loader2,
  Flame,
  ListChecks,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SuspiciousWord {
  id: string;
  word: string;
  category: string;
  severity: string;
  matchType: string;
  action: string;
  isActive: boolean;
  notes?: string;
  flagCount: number;
  addedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface SuspiciousWordsResponse {
  words: SuspiciousWord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SuspiciousWordsStats {
  total: number;
  active: number;
  inactive: number;
  totalFlags: number;
  critical: number;
  topFlagged: Array<{
    id: string;
    word: string;
    category: string;
    severity: string;
    flagCount: number;
  }>;
}

const CATEGORIES = [
  { value: "general", label: "عام", color: "bg-gray-500" },
  { value: "profanity", label: "ألفاظ نابية", color: "bg-red-500" },
  { value: "offensive", label: "مسيء", color: "bg-rose-500" },
  { value: "spam", label: "سبام", color: "bg-orange-500" },
  { value: "advertising", label: "إعلانات", color: "bg-amber-500" },
  { value: "political", label: "سياسي", color: "bg-blue-500" },
  { value: "religious", label: "ديني", color: "bg-purple-500" },
  { value: "personal_attack", label: "هجوم شخصي", color: "bg-pink-500" },
];

const SEVERITIES = [
  { value: "low", label: "منخفض", color: "bg-green-500" },
  { value: "medium", label: "متوسط", color: "bg-yellow-500" },
  { value: "high", label: "عالي", color: "bg-orange-500" },
  { value: "critical", label: "حرج", color: "bg-red-500" },
];

const MATCH_TYPES = [
  { value: "exact", label: "مطابقة تامة" },
  { value: "contains", label: "يحتوي على" },
  { value: "starts_with", label: "يبدأ بـ" },
  { value: "ends_with", label: "ينتهي بـ" },
];

const ACTIONS = [
  {
    value: "review",
    label: "مراجعة يدوية",
    description: "التعليق يُحجز للمراجعة قبل النشر",
  },
  {
    value: "reject",
    label: "رفض تلقائي (لا يُنشر)",
    description: "التعليق يُرفض فوراً ولا يظهر للعموم",
  },
];

export default function SuspiciousWordsManagement() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState<SuspiciousWord | null>(null);

  const [formData, setFormData] = useState({
    word: "",
    category: "general",
    severity: "medium",
    matchType: "exact",
    action: "review",
    notes: "",
  });

  const [bulkText, setBulkText] = useState("");
  const [bulkCategory, setBulkCategory] = useState("general");
  const [bulkSeverity, setBulkSeverity] = useState("medium");
  const [bulkMatchType, setBulkMatchType] = useState("exact");
  const [bulkAction, setBulkAction] = useState("review");

  const { data: wordsData, isLoading, refetch: refetchWords } = useQuery<SuspiciousWordsResponse>({
    queryKey: ["/api/admin/suspicious-words", page, searchQuery, categoryFilter, severityFilter, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });
      if (searchQuery) params.append("search", searchQuery);
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      if (severityFilter !== "all") params.append("severity", severityFilter);
      if (activeFilter !== "all") params.append("isActive", activeFilter);
      const res = await fetch(`/api/admin/suspicious-words?${params}`);
      if (!res.ok) throw new Error("Failed to fetch words");
      return res.json();
    },
  });

  const words = Array.isArray(wordsData?.words) ? wordsData.words : [];
  const totalPages = wordsData?.totalPages ?? 1;
  const total = wordsData?.total ?? 0;

  const { data: stats, refetch: refetchStats } = useQuery<SuspiciousWordsStats>({
    queryKey: ["/api/admin/suspicious-words/stats"],
  });

  const topFlagged = Array.isArray(stats?.topFlagged) ? stats.topFlagged : [];

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("/api/admin/suspicious-words", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "تمت الإضافة", description: "تمت إضافة الكلمة بنجاح" });
      setAddDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words/stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message || "فشل في إضافة الكلمة", variant: "destructive" });
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (data: { words: string[]; category: string; severity: string; matchType: string; action: string }) => {
      return await apiRequest("/api/admin/suspicious-words/bulk", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: { added: number; duplicates: number }) => {
      toast({ 
        title: "تمت الإضافة الجماعية", 
        description: `تمت إضافة ${data.added} كلمة${data.duplicates > 0 ? ` (${data.duplicates} مكررة)` : ""}` 
      });
      setBulkDialogOpen(false);
      setBulkText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words/stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message || "فشل في الإضافة الجماعية", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData & { isActive?: boolean }> }) => {
      return await apiRequest(`/api/admin/suspicious-words/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "تم التحديث", description: "تم تحديث الكلمة بنجاح" });
      setEditDialogOpen(false);
      setSelectedWord(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words/stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message || "فشل في تحديث الكلمة", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/suspicious-words/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({ title: "تم الحذف", description: "تم حذف الكلمة بنجاح" });
      setDeleteDialogOpen(false);
      setSelectedWord(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words/stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message || "فشل في حذف الكلمة", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest(`/api/admin/suspicious-words/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspicious-words/stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message || "فشل في تغيير الحالة", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      word: "",
      category: "general",
      severity: "medium",
      matchType: "exact",
      action: "review",
      notes: "",
    });
  };

  const handleRefresh = () => {
    void refetchWords();
    void refetchStats();
    toast({ title: "تم التحديث", description: "تم تحديث قائمة الكلمات والإحصائيات" });
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    categoryFilter !== "all" ||
    severityFilter !== "all" ||
    activeFilter !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setSeverityFilter("all");
    setActiveFilter("all");
    setPage(1);
  };

  const handleEdit = (word: SuspiciousWord) => {
    setSelectedWord(word);
    setFormData({
      word: word.word,
      category: word.category,
      severity: word.severity,
      matchType: word.matchType,
      action: word.action || "review",
      notes: word.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (word: SuspiciousWord) => {
    setSelectedWord(word);
    setDeleteDialogOpen(true);
  };

  const handleBulkAdd = () => {
    const parsedWords = bulkText
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);
    
    if (parsedWords.length === 0) {
      toast({ title: "خطأ", description: "يرجى إدخال كلمات صالحة", variant: "destructive" });
      return;
    }

    bulkAddMutation.mutate({
      words: parsedWords,
      category: bulkCategory,
      severity: bulkSeverity,
      matchType: bulkMatchType,
      action: bulkAction,
    });
  };

  const getActionBadge = (action: string, isMobile = false) => {
    const suffix = isMobile ? "-mobile" : "";
    if (action === "reject") {
      return (
        <Badge className="bg-red-600 hover:bg-red-700 gap-1" data-testid={`badge-action-reject${suffix}`}>
          <XCircle className="h-3 w-3" />
          رفض تلقائي
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-amber-700 border-amber-500 dark:text-amber-400 gap-1" data-testid={`badge-action-review${suffix}`}>
        <AlertTriangle className="h-3 w-3" />
        مراجعة
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const cat = CATEGORIES.find((c) => c.value === category);
    return (
      <Badge className={`${cat?.color || "bg-gray-500"} hover:${cat?.color || "bg-gray-600"}`}>
        {cat?.label || category}
      </Badge>
    );
  };

  const getSeverityBadge = (severity: string) => {
    const sev = SEVERITIES.find((s) => s.value === severity);
    return (
      <Badge variant="outline" className={`border-current ${
        severity === "critical" ? "text-red-600 border-red-600 dark:text-red-400" :
        severity === "high" ? "text-orange-600 border-orange-600 dark:text-orange-400" :
        severity === "medium" ? "text-yellow-600 border-yellow-600 dark:text-yellow-400" :
        "text-green-600 border-green-600 dark:text-green-400"
      }`}>
        {sev?.label || severity}
      </Badge>
    );
  };

  const getMatchTypeBadge = (matchType: string) => {
    const mt = MATCH_TYPES.find((m) => m.value === matchType);
    return <Badge variant="secondary">{mt?.label || matchType}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={ShieldAlert}
          titleTestId="text-page-title"
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>إدارة الكلمات المشبوهة</span>
              <Badge
                variant="secondary"
                className="gap-1 border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-primary"
                data-testid="badge-total-words"
              >
                {stats?.total ?? total} كلمة
              </Badge>
            </span>
          }
          description="إدارة قائمة الكلمات المحظورة والمشبوهة وتحديد إجراءات المراجعة أو الرفض التلقائي للتعليقات"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                title="تحديث البيانات"
                data-testid="button-refresh-words"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => setBulkDialogOpen(true)} variant="outline" size="sm" data-testid="button-bulk-add">
                <Upload className="h-4 w-4 ml-2" />
                إضافة جماعية
              </Button>
              <Button onClick={() => setAddDialogOpen(true)} size="sm" data-testid="button-add-word">
                <Plus className="h-4 w-4 ml-2" />
                إضافة كلمة
              </Button>
            </div>
          }
        />

        {/* 4-Card KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="stat-total">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">إجمالي الكلمات</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
                    {stats?.total ?? "—"}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ListChecks className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>ضمن القاموس الرقابي</span>
                <span className="inline-flex items-center gap-1 tabular-nums" data-testid="stat-inactive">
                  <PowerOff className="h-3 w-3" />
                  {stats?.inactive ?? "—"} معطّل
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="stat-active">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">الكلمات المفعّلة</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {stats?.active ?? "—"}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Power className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>نشطة في الفلترة التلقائية</span>
                {stats?.total ? (
                  <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {Math.round(((stats.active || 0) / stats.total) * 100)}%
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="stat-critical">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">الكلمات الحرجة</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                    {stats?.critical ?? "—"}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                أعلى درجات الحساسية والخطورة
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="stat-flags">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">مرات الإبلاغ</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
                    {stats?.totalFlags ?? "—"}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <Flame className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                إجمالي مرات الرصد في التعليقات
              </div>
            </CardContent>
          </Card>
        </div>

        {topFlagged.length > 0 && (
          <Card className="rounded-xl border-border/60 bg-card shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                الأكثر إبلاغاً
              </CardTitle>
              <CardDescription>الكلمات التي تم رصدها أكثر من غيرها في تعليقات المستخدمين</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap" dir="rtl">
                {topFlagged.map((w) => (
                  <Badge
                    key={w.id}
                    variant="outline"
                    className="text-sm py-1.5 px-3 gap-2 rounded-lg border-border/60"
                    data-testid={`top-flagged-${w.id}`}
                  >
                    <span className="font-medium">{w.word}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-orange-600 dark:text-orange-400 font-semibold tabular-nums">{w.flagCount}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search & Quick Filter Toolbar */}
        <Card className="rounded-xl border-border/60 bg-card shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                البحث والتصفية السريعة
              </CardTitle>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="button-reset-filters"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  إعادة تعيين الفلاتر
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick status filter pills with count badges */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeFilter === "all" ? "default" : "outline"}
                className="h-8 rounded-xl gap-1.5 text-xs"
                onClick={() => { setActiveFilter("all"); setPage(1); }}
                data-testid="pill-filter-all"
              >
                <span>الكل</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                  {stats?.total ?? total}
                </Badge>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeFilter === "true" ? "default" : "outline"}
                className="h-8 rounded-xl gap-1.5 text-xs"
                onClick={() => { setActiveFilter("true"); setPage(1); }}
                data-testid="pill-filter-active"
              >
                <Power className="h-3.5 w-3.5 text-emerald-500" />
                <span>مفعّل</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                  {stats?.active ?? 0}
                </Badge>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeFilter === "false" ? "default" : "outline"}
                className="h-8 rounded-xl gap-1.5 text-xs"
                onClick={() => { setActiveFilter("false"); setPage(1); }}
                data-testid="pill-filter-inactive"
              >
                <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                <span>معطّل</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                  {stats?.inactive ?? 0}
                </Badge>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={severityFilter === "critical" ? "destructive" : "outline"}
                className="h-8 rounded-xl gap-1.5 text-xs"
                onClick={() => {
                  setSeverityFilter(severityFilter === "critical" ? "all" : "critical");
                  setPage(1);
                }}
                data-testid="pill-filter-critical"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span>حرج فقط</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                  {stats?.critical ?? 0}
                </Badge>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث عن كلمة..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pr-10 rounded-xl border-border/60"
                  data-testid="input-search"
                />
              </div>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="rounded-xl border-border/60" data-testid="select-category-filter">
                  <SelectValue placeholder="التصنيف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع التصنيفات</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
                <SelectTrigger className="rounded-xl border-border/60" data-testid="select-severity-filter">
                  <SelectValue placeholder="الشدة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع مستويات الشدة</SelectItem>
                  {SEVERITIES.map((sev) => (
                    <SelectItem key={sev.value} value={sev.value}>{sev.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1); }}>
                <SelectTrigger className="rounded-xl border-border/60" data-testid="select-active-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="true">مفعّل</SelectItem>
                  <SelectItem value="false">معطّل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Words Table (Desktop) + Stacked Cards (Mobile) */}
        <Card className="rounded-xl border-border/60 bg-card shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base sm:text-lg">
              <span>قائمة الكلمات</span>
              {wordsData && (
                <Badge variant="outline" className="font-normal tabular-nums text-muted-foreground">
                  {total} كلمة
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : words.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لا توجد كلمات مطابقة</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الكلمة</TableHead>
                        <TableHead className="text-right">التصنيف</TableHead>
                        <TableHead className="text-right">الشدة</TableHead>
                        <TableHead className="text-right">نوع المطابقة</TableHead>
                        <TableHead className="text-right">الإجراء عند المطابقة</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">مرات الإبلاغ</TableHead>
                        <TableHead className="text-right">ملاحظات</TableHead>
                        <TableHead className="text-right">العمليات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {words.map((word) => (
                        <TableRow key={word.id} data-testid={`row-word-${word.id}`}>
                          <TableCell className="font-medium">{word.word}</TableCell>
                          <TableCell>{getCategoryBadge(word.category)}</TableCell>
                          <TableCell>{getSeverityBadge(word.severity)}</TableCell>
                          <TableCell>{getMatchTypeBadge(word.matchType)}</TableCell>
                          <TableCell>{getActionBadge(word.action, false)}</TableCell>
                          <TableCell>
                            <Switch
                              checked={word.isActive}
                              onCheckedChange={(checked) => 
                                toggleActiveMutation.mutate({ id: word.id, isActive: checked })
                              }
                              data-testid={`switch-active-${word.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="tabular-nums">{word.flagCount}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={word.notes}>
                            {word.notes || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEdit(word)}
                                data-testid={`button-edit-${word.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(word)}
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-${word.id}`}
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

                {/* Mobile Stacked Cards View */}
                <div className="space-y-3 md:hidden">
                  {words.map((word) => (
                    <div
                      key={word.id}
                      className="rounded-xl border border-border/60 bg-card p-4 space-y-3"
                      data-testid={`row-word-${word.id}-mobile`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="font-bold text-base text-foreground break-words">
                            {word.word}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {getCategoryBadge(word.category)}
                            {getSeverityBadge(word.severity)}
                            {getMatchTypeBadge(word.matchType)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={word.isActive}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: word.id, isActive: checked })
                            }
                            data-testid={`switch-active-${word.id}-mobile`}
                          />
                        </div>
                      </div>

                      {word.notes ? (
                        <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/40 rounded-lg px-2.5 py-1.5">
                          {word.notes}
                        </p>
                      ) : null}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                        <div className="flex flex-wrap items-center gap-2">
                          {getActionBadge(word.action, true)}
                          <Badge variant="outline" className="gap-1 tabular-nums text-xs">
                            <Flame className="h-3 w-3 text-orange-500" />
                            {word.flagCount} إبلاغ
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleEdit(word)}
                            data-testid={`button-edit-${word.id}-mobile`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(word)}
                            data-testid={`button-delete-${word.id}-mobile`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      السابق
                    </Button>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      صفحة {page} من {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      التالي
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة كلمة مشبوهة</DialogTitle>
              <DialogDescription>
                أضف كلمة جديدة إلى قائمة الكلمات المشبوهة
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="word">الكلمة</Label>
                <Input
                  id="word"
                  value={formData.word}
                  onChange={(e) => setFormData({ ...formData, word: e.target.value })}
                  placeholder="أدخل الكلمة..."
                  data-testid="input-word"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>التصنيف</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الشدة</Label>
                  <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                    <SelectTrigger data-testid="select-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((sev) => (
                        <SelectItem key={sev.value} value={sev.value}>{sev.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>نوع المطابقة</Label>
                  <Select value={formData.matchType} onValueChange={(v) => setFormData({ ...formData, matchType: v })}>
                    <SelectTrigger data-testid="select-match-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATCH_TYPES.map((mt) => (
                        <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الإجراء عند المطابقة</Label>
                  <Select value={formData.action} onValueChange={(v) => setFormData({ ...formData, action: v })}>
                    <SelectTrigger data-testid="select-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ACTIONS.find((a) => a.value === formData.action)?.description}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="ملاحظات اختيارية..."
                  data-testid="input-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>
                إلغاء
              </Button>
              <Button
                onClick={() => addMutation.mutate(formData)}
                disabled={!formData.word.trim() || addMutation.isPending}
                data-testid="button-submit-add"
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                إضافة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
          <DialogContent className="sm:max-w-[600px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة كلمات جماعية</DialogTitle>
              <DialogDescription>
                أضف عدة كلمات دفعة واحدة (كلمة واحدة في كل سطر)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>الكلمات</Label>
                <Textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="أدخل الكلمات (كلمة واحدة في كل سطر)..."
                  rows={8}
                  data-testid="input-bulk-words"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>التصنيف</Label>
                  <Select value={bulkCategory} onValueChange={setBulkCategory}>
                    <SelectTrigger data-testid="select-bulk-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الشدة</Label>
                  <Select value={bulkSeverity} onValueChange={setBulkSeverity}>
                    <SelectTrigger data-testid="select-bulk-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((sev) => (
                        <SelectItem key={sev.value} value={sev.value}>{sev.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>نوع المطابقة</Label>
                  <Select value={bulkMatchType} onValueChange={setBulkMatchType}>
                    <SelectTrigger data-testid="select-bulk-match-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATCH_TYPES.map((mt) => (
                        <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الإجراء</Label>
                  <Select value={bulkAction} onValueChange={setBulkAction}>
                    <SelectTrigger data-testid="select-bulk-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                {ACTIONS.find((a) => a.value === bulkAction)?.description}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setBulkDialogOpen(false); setBulkText(""); }}>
                إلغاء
              </Button>
              <Button
                onClick={handleBulkAdd}
                disabled={!bulkText.trim() || bulkAddMutation.isPending}
                data-testid="button-submit-bulk"
              >
                {bulkAddMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                إضافة الكلمات
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>تعديل كلمة</DialogTitle>
              <DialogDescription>
                تعديل بيانات الكلمة المشبوهة
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-word">الكلمة</Label>
                <Input
                  id="edit-word"
                  value={formData.word}
                  onChange={(e) => setFormData({ ...formData, word: e.target.value })}
                  data-testid="input-edit-word"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>التصنيف</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger data-testid="select-edit-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الشدة</Label>
                  <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                    <SelectTrigger data-testid="select-edit-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((sev) => (
                        <SelectItem key={sev.value} value={sev.value}>{sev.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>نوع المطابقة</Label>
                  <Select value={formData.matchType} onValueChange={(v) => setFormData({ ...formData, matchType: v })}>
                    <SelectTrigger data-testid="select-edit-match-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATCH_TYPES.map((mt) => (
                        <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الإجراء عند المطابقة</Label>
                  <Select value={formData.action} onValueChange={(v) => setFormData({ ...formData, action: v })}>
                    <SelectTrigger data-testid="select-edit-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ACTIONS.find((a) => a.value === formData.action)?.description}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">ملاحظات</Label>
                <Textarea
                  id="edit-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  data-testid="input-edit-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditDialogOpen(false); setSelectedWord(null); resetForm(); }}>
                إلغاء
              </Button>
              <Button
                onClick={() => selectedWord && updateMutation.mutate({ id: selectedWord.id, data: formData })}
                disabled={!formData.word.trim() || updateMutation.isPending}
                data-testid="button-submit-edit"
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف الكلمة "{selectedWord?.word}"؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedWord && deleteMutation.mutate(selectedWord.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
