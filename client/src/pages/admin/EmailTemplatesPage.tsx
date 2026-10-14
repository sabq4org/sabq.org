import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DOMPurify from "isomorphic-dompurify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { cn } from "@/lib/utils";
import {
  Mail,
  Edit,
  Eye,
  Send,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Save,
  Search,
  Filter,
  Code2,
  FileText,
  Layers,
  Braces,
  Sparkles,
  Copy,
  Check,
  LayoutGrid,
  Table as TableIcon,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmployeeEmailTemplate } from "@shared/schema";

const TEMPLATE_TYPES: Record<string, string> = {
  correspondent_approved: "قبول طلب المراسل",
  correspondent_rejected: "رفض طلب المراسل",
  article_published: "نشر المقال",
  article_rejected: "رفض المقال",
  motivational: "رسالة تحفيزية",
};

const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  correspondent_approved: ["{{name}}", "{{email}}", "{{password}}"],
  correspondent_rejected: ["{{name}}", "{{reason}}"],
  article_published: ["{{name}}", "{{articleTitle}}", "{{articleUrl}}"],
  article_rejected: ["{{name}}", "{{articleTitle}}", "{{reason}}"],
  motivational: ["{{name}}", "{{message}}"],
};

type TemplateCategoryKey = "all" | "correspondent" | "articles" | "motivational";
type TemplateStatusFilter = "all" | "active" | "inactive";

const TEMPLATE_CATEGORY_META: Record<
  string,
  { key: Exclude<TemplateCategoryKey, "all">; label: string; badgeClass: string; description: string }
> = {
  correspondent_approved: {
    key: "correspondent",
    label: "شؤون المراسلين",
    badgeClass:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300",
    description: "يُرسل تلقائياً عند اعتماد طلب انضمام مراسل جديد مع بيانات الدخول المؤقتة",
  },
  correspondent_rejected: {
    key: "correspondent",
    label: "شؤون المراسلين",
    badgeClass:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300",
    description: "يُرسل عند الاعتذار عن قبول طلب المراسل مع توضيح السبب",
  },
  article_published: {
    key: "articles",
    label: "المقالات والنشر",
    badgeClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
    description: "إشعار بريدي فوري للكاتب أو المراسل فور نشر مادته التحريرية",
  },
  article_rejected: {
    key: "articles",
    label: "المقالات والنشر",
    badgeClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
    description: "إشعار للكاتب أو المراسل عند رفض المادة أو إعادتها مع ملاحظات التحرير",
  },
  motivational: {
    key: "motivational",
    label: "التحفيز والتواصل",
    badgeClass:
      "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:border-purple-400/30 dark:bg-purple-500/15 dark:text-purple-300",
    description: "رسائل تقدير وتحفيز دورية لأعضاء غرفة الأخبار والمراسلين المتميزين",
  },
};

const CATEGORY_FILTER_PILLS: { id: TemplateCategoryKey; label: string }[] = [
  { id: "all", label: "كل التصنيفات" },
  { id: "correspondent", label: "شؤون المراسلين" },
  { id: "articles", label: "المقالات والنشر" },
  { id: "motivational", label: "التحفيز والتواصل" },
];

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<EmployeeEmailTemplate | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategoryKey>("all");
  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    subject: "",
    bodyHtml: "",
    bodyText: "",
    isActive: true,
  });
  const [previewContent, setPreviewContent] = useState<{
    subject: string;
    bodyHtml: string;
    bodyText: string;
    sampleData: Record<string, string>;
  } | null>(null);

  const { data: templates, isLoading, isFetching, refetch } = useQuery<EmployeeEmailTemplate[]>({
    queryKey: ["/api/admin/email-templates/defaults"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ type, data }: { type: string; data: typeof editForm }) => {
      return apiRequest(`/api/admin/email-templates/${type}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم تحديث قالب البريد الإلكتروني بنجاح",
      });
      setShowEditDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates/defaults"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: error.message || "حدث خطأ أثناء حفظ القالب",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; bodyHtml: string; bodyText: string }) => {
      return apiRequest("/api/admin/email-templates/preview", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      setPreviewContent(data);
      setShowPreviewDialog(true);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل المعاينة",
        description: error.message || "حدث خطأ أثناء إنشاء المعاينة",
      });
    },
  });

  const testSendMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; bodyHtml: string; bodyText: string }) => {
      return apiRequest("/api/admin/email-templates/test-send", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "تم الإرسال",
        description: `تم إرسال البريد التجريبي إلى ${data?.sentTo || "بريد المسؤول"}`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الإرسال",
        description: error.message || "حدث خطأ أثناء إرسال البريد التجريبي",
      });
    },
  });

  const openEditDialog = (template: EmployeeEmailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      subject: template.subject || "",
      bodyHtml: template.bodyHtml || "",
      bodyText: template.bodyText || "",
      isActive: template.isActive ?? true,
    });
    setShowEditDialog(true);
  };

  const openQuickPreview = (template: EmployeeEmailTemplate) => {
    setSelectedTemplate(template);
    previewMutation.mutate({
      type: template.type,
      subject: template.subject || "",
      bodyHtml: template.bodyHtml || "",
      bodyText: template.bodyText || "",
    });
  };

  const handlePreview = () => {
    if (selectedTemplate) {
      previewMutation.mutate({
        type: selectedTemplate.type,
        subject: editForm.subject,
        bodyHtml: editForm.bodyHtml,
        bodyText: editForm.bodyText,
      });
    }
  };

  const handleTestSend = () => {
    if (selectedTemplate) {
      testSendMutation.mutate({
        type: selectedTemplate.type,
        subject: editForm.subject,
        bodyHtml: editForm.bodyHtml,
        bodyText: editForm.bodyText,
      });
    }
  };

  const handleSave = () => {
    if (selectedTemplate) {
      updateMutation.mutate({
        type: selectedTemplate.type,
        data: editForm,
      });
    }
  };

  const handleCopyPlaceholder = (placeholder: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(placeholder).catch(() => {});
    }
    setCopiedPlaceholder(placeholder);
    toast({
      title: "تم نسخ المتغير",
      description: `تم نسخ ${placeholder} إلى الحافظة`,
    });
    setTimeout(() => {
      setCopiedPlaceholder((prev) => (prev === placeholder ? null : prev));
    }, 1800);
  };

  const allTemplates = useMemo((): EmployeeEmailTemplate[] => {
    const safeList = Array.isArray(templates) ? templates : [];
    if (safeList.length > 0) {
      return safeList.map((t) => ({
        ...t,
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : new Date(),
      }));
    }
    return Object.entries(TEMPLATE_TYPES).map(([type, nameAr]) => ({
      id: `default-${type}`,
      type,
      nameAr,
      subject: "",
      bodyHtml: "",
      bodyText: "",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allTemplates.filter((template) => {
      const meta = TEMPLATE_CATEGORY_META[template.type];
      if (categoryFilter !== "all" && meta?.key !== categoryFilter) {
        return false;
      }
      if (statusFilter === "active" && !template.isActive) {
        return false;
      }
      if (statusFilter === "inactive" && template.isActive) {
        return false;
      }
      if (!q) return true;
      const displayName = (TEMPLATE_TYPES[template.type] || template.nameAr || template.type).toLowerCase();
      const typeKey = (template.type || "").toLowerCase();
      const subject = (template.subject || "").toLowerCase();
      const placeholders = (TEMPLATE_PLACEHOLDERS[template.type] ?? []).join(" ").toLowerCase();
      return (
        displayName.includes(q) ||
        typeKey.includes(q) ||
        subject.includes(q) ||
        placeholders.includes(q)
      );
    });
  }, [allTemplates, categoryFilter, statusFilter, searchQuery]);

  const totalCount = Object.keys(TEMPLATE_TYPES).length;
  const activeCount = allTemplates.filter((t) => t.isActive).length;
  const inactiveCount = allTemplates.filter((t) => !t.isActive).length;
  const uniquePlaceholders = useMemo(() => {
    const set = new Set<string>();
    Object.values(TEMPLATE_PLACEHOLDERS).forEach((arr) => {
      (Array.isArray(arr) ? arr : []).forEach((item) => set.add(item));
    });
    return Array.from(set);
  }, []);

  const hasActiveFilters =
    searchQuery.trim().length > 0 || categoryFilter !== "all" || statusFilter !== "all";

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-10 pt-2 sm:px-6"
      >
        <div className="space-y-6" data-testid="email-templates-page">
          {/* Unified Page Header */}
          <DashboardPageHeader
            icon={Mail}
            title="قوالب البريد الإلكتروني"
            titleTestId="text-page-title"
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span data-testid="text-page-description">
                  إدارة وتخصيص قوالب رسائل البريد الإلكتروني التلقائية للموظفين والمراسلين
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {activeCount} من {totalCount} مفعّلة
                </span>
              </span>
            }
            actions={
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="gap-1.5 text-xs"
                    data-testid="button-reset-filters"
                  >
                    <X className="h-3.5 w-3.5" />
                    إعادة ضبط الفلاتر
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="flex-1 gap-2 sm:flex-initial"
                  data-testid="button-refresh"
                >
                  <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                  تحديث القوالب
                </Button>
              </div>
            }
          />

          {/* 4-Card KPI Summary Strip */}
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
            data-testid="email-templates-kpi-strip"
          >
            {/* KPI 1: Total Templates */}
            <div
              className="rounded-2xl border border-border/80 bg-gradient-to-br from-slate-50/90 via-card to-card p-4 shadow-xs dark:from-slate-900/70 dark:via-card dark:to-card"
              data-testid="kpi-total-templates"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  إجمالي القوالب
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Mail className="h-4 w-4" />
                </span>
              </div>
              <p
                className="mt-2 text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-foreground"
                data-testid="text-total-count"
              >
                {totalCount}
              </p>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>قوالب النظام المعتمدة</span>
                <span className="font-semibold text-foreground">HTML + نص</span>
              </div>
            </div>

            {/* KPI 2: Active & Inactive Status */}
            <div
              className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-active-templates"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  القوالب المفعّلة
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p
                  className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400"
                  data-testid="text-active-count"
                >
                  {activeCount}
                </p>
                <span className="text-xs font-semibold text-muted-foreground">نشط حالياً</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-rose-500" />
                  القوالب المعطلة
                </span>
                <span
                  className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums"
                  data-testid="text-inactive-count"
                >
                  {inactiveCount}
                </span>
              </div>
            </div>

            {/* KPI 3: Categories / Types */}
            <div
              className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-template-categories"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  التصنيفات والأنواع
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/15 text-sky-600 dark:text-sky-400">
                  <Layers className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-sky-600 dark:text-sky-400">
                  3
                </p>
                <span className="text-xs font-semibold text-muted-foreground">مسارات بريدية</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>مراسلون · مقالات · تحفيز</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
                  {totalCount} أحداث
                </span>
              </div>
            </div>

            {/* KPI 4: Available Dynamic Variables */}
            <div
              className="rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-template-variables"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  المتغيرات المتاحة
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-500/25 bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <Braces className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-purple-600 dark:text-purple-400">
                  {uniquePlaceholders.length}
                </p>
                <span className="text-xs font-semibold text-muted-foreground">متغير ديناميكي</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span className="truncate" dir="ltr">
                  {"{{name}}, {{articleTitle}}..."}
                </span>
                <span className="font-semibold text-purple-600 dark:text-purple-400 shrink-0">
                  استبدال تلقائي
                </span>
              </div>
            </div>
          </div>

          {/* Search & Quick Filter Bar */}
          <Card className="rounded-2xl border-border/80 bg-card shadow-xs">
            <CardContent className="p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {/* Search Input */}
                <div className="relative flex-1 max-w-xl">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث باسم القالب، المعرّف البرمجي، الموضوع، أو المتغيرات..."
                    className="pr-9 pl-8 h-10 rounded-xl bg-background/80 text-sm"
                    data-testid="input-search-templates"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="مسح البحث"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Status Filter + View Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1"
                    role="group"
                    aria-label="تصفية حسب الحالة"
                  >
                    {(
                      [
                        { id: "all", label: "الكل" },
                        { id: "active", label: "نشطة" },
                        { id: "inactive", label: "معطلة" },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setStatusFilter(st.id)}
                        data-testid={`filter-status-${st.id}`}
                        className={cn(
                          "no-min-touch-size rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                          statusFilter === st.id
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div
                    className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1"
                    role="group"
                    aria-label="طريقة العرض"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      data-testid="button-view-table"
                      className={cn(
                        "no-min-touch-size inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                        viewMode === "table"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <TableIcon className="h-3.5 w-3.5" />
                      <span>جدول</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("cards")}
                      data-testid="button-view-cards"
                      className={cn(
                        "no-min-touch-size inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                        viewMode === "cards"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span>بطاقات</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5" role="tablist">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground ml-1">
                    <Filter className="h-3.5 w-3.5" />
                    التصنيف:
                  </span>
                  {CATEGORY_FILTER_PILLS.map((pill) => {
                    const isSelected = categoryFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => setCategoryFilter(pill.id)}
                        data-testid={`filter-category-${pill.id}`}
                        className={cn(
                          "no-min-touch-size inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  عرض {filteredTemplates.length} من {allTemplates.length} قوالب
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Templates Content Card */}
          <Card className="overflow-hidden rounded-2xl border-border/80 bg-card shadow-xs">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold">قائمة القوالب</CardTitle>
                  <CardDescription className="text-xs sm:text-sm mt-0.5">
                    اضغط على تحرير لتعديل نص الموضوع أو محتوى HTML والنص العادي أو إرسال بريد تجريبي
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-semibold tabular-nums">
                  {filteredTemplates.length} قالب
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-4">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <Mail className="h-6 w-6" />
                  </div>
                  <p className="text-base font-bold text-foreground">
                    لا توجد قوالب مطابقة لمعايير البحث
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-md">
                    جرّب تغيير كلمات البحث أو إعادة ضبط فلاتر التصنيف والحالة لعرض جميع القوالب المتاحة.
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetFilters}
                      className="mt-4 gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      إظهار كل القوالب
                    </Button>
                  )}
                </div>
              ) : viewMode === "table" ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-right font-bold">اسم القالب</TableHead>
                        <TableHead className="text-right font-bold">التصنيف والنوع</TableHead>
                        <TableHead className="text-right font-bold">الموضوع</TableHead>
                        <TableHead className="text-right font-bold">المتغيرات</TableHead>
                        <TableHead className="text-right font-bold">الحالة</TableHead>
                        <TableHead className="text-right font-bold">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTemplates.map((template) => {
                        const meta = TEMPLATE_CATEGORY_META[template.type];
                        const placeholders = Array.isArray(TEMPLATE_PLACEHOLDERS[template.type])
                          ? TEMPLATE_PLACEHOLDERS[template.type]
                          : [];
                        return (
                          <TableRow
                            key={template.type}
                            data-testid={`row-template-${template.type}`}
                            className="group transition-colors hover:bg-muted/30"
                          >
                            <TableCell className="align-top py-3.5">
                              <div className="space-y-1">
                                <p
                                  className="font-bold text-sm text-foreground"
                                  data-testid={`text-name-${template.type}`}
                                >
                                  {TEMPLATE_TYPES[template.type] || template.nameAr || template.type}
                                </p>
                                {meta?.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">
                                    {meta.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top py-3.5">
                              <div className="flex flex-col items-start gap-1.5">
                                {meta && (
                                  <Badge
                                    variant="outline"
                                    className={cn("text-[11px] font-semibold", meta.badgeClass)}
                                  >
                                    {meta.label}
                                  </Badge>
                                )}
                                <code
                                  className="text-[11px] bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground"
                                  dir="ltr"
                                  data-testid={`text-type-${template.type}`}
                                >
                                  {template.type}
                                </code>
                              </div>
                            </TableCell>
                            <TableCell
                              className="align-top py-3.5 max-w-[240px] truncate text-sm"
                              data-testid={`text-subject-${template.type}`}
                            >
                              {template.subject ? (
                                <span className="font-medium text-foreground">{template.subject}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  لم يتم تحديده
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="align-top py-3.5">
                              <div className="flex flex-wrap gap-1 max-w-[200px]" dir="ltr">
                                {placeholders.map((ph) => (
                                  <span
                                    key={ph}
                                    className="inline-flex items-center rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                  >
                                    {ph}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="align-top py-3.5">
                              {template.isActive ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                                  data-testid={`badge-status-${template.type}`}
                                >
                                  <CheckCircle className="w-3 h-3 ml-1" />
                                  نشط
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  data-testid={`badge-status-${template.type}`}
                                >
                                  <XCircle className="w-3 h-3 ml-1" />
                                  معطل
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="align-top py-3.5">
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditDialog(template)}
                                  className="h-8 gap-1.5 px-2.5 text-xs font-semibold"
                                  data-testid={`button-edit-${template.type}`}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>تحرير</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openQuickPreview(template)}
                                  disabled={previewMutation.isPending}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                  title="معاينة سريعة"
                                  data-testid={`button-quick-preview-${template.type}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredTemplates.map((template) => {
                    const meta = TEMPLATE_CATEGORY_META[template.type];
                    const placeholders = Array.isArray(TEMPLATE_PLACEHOLDERS[template.type])
                      ? TEMPLATE_PLACEHOLDERS[template.type]
                      : [];
                    return (
                      <div
                        key={template.type}
                        data-testid={`row-template-${template.type}`}
                        className="flex flex-col justify-between rounded-2xl border border-border/80 bg-background/60 p-4 shadow-2xs transition-all hover:border-primary/40 hover:shadow-sm"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {meta && (
                                  <Badge
                                    variant="outline"
                                    className={cn("text-[10px] font-semibold", meta.badgeClass)}
                                  >
                                    {meta.label}
                                  </Badge>
                                )}
                                <code
                                  className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground"
                                  dir="ltr"
                                  data-testid={`text-type-${template.type}`}
                                >
                                  {template.type}
                                </code>
                              </div>
                              <h3
                                className="text-base font-bold text-foreground"
                                data-testid={`text-name-${template.type}`}
                              >
                                {TEMPLATE_TYPES[template.type] || template.nameAr || template.type}
                              </h3>
                            </div>
                            {template.isActive ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                                data-testid={`badge-status-${template.type}`}
                              >
                                <CheckCircle className="w-3 h-3 ml-1" />
                                نشط
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="shrink-0"
                                data-testid={`badge-status-${template.type}`}
                              >
                                <XCircle className="w-3 h-3 ml-1" />
                                معطل
                              </Badge>
                            )}
                          </div>

                          {meta?.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {meta.description}
                            </p>
                          )}

                          <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 space-y-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              موضوع الرسالة:
                            </span>
                            <p
                              className="text-xs font-medium text-foreground truncate"
                              data-testid={`text-subject-${template.type}`}
                            >
                              {template.subject || (
                                <span className="text-muted-foreground italic">لم يتم تحديده</span>
                              )}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              المتغيرات المتاحة:
                            </span>
                            <div className="flex flex-wrap gap-1" dir="ltr">
                              {placeholders.map((ph) => (
                                <span
                                  key={ph}
                                  className="inline-flex items-center rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                >
                                  {ph}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/50 pt-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openQuickPreview(template)}
                            disabled={previewMutation.isPending}
                            className="h-8 gap-1.5 text-xs"
                            data-testid={`button-quick-preview-card-${template.type}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            معاينة
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openEditDialog(template)}
                            className="h-8 gap-1.5 text-xs"
                            data-testid={`button-edit-${template.type}`}
                          >
                            <Edit className="w-3.5 h-3.5" />
                            تحرير القالب
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Template Dialog */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent
              className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6"
              dir="rtl"
            >
              <DialogHeader className="space-y-2 border-b border-border/60 pb-4 text-right">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Mail className="w-4 h-4" />
                    </span>
                    <span>
                      تحرير قالب:{" "}
                      {selectedTemplate
                        ? TEMPLATE_TYPES[selectedTemplate.type] || selectedTemplate.nameAr
                        : ""}
                    </span>
                  </DialogTitle>
                  {selectedTemplate && (
                    <code
                      className="rounded-lg bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      {selectedTemplate.type}
                    </code>
                  )}
                </div>
                <DialogDescription className="text-xs sm:text-sm text-right">
                  المتغيرات المتاحة:{" "}
                  {selectedTemplate
                    ? (TEMPLATE_PLACEHOLDERS[selectedTemplate.type] ?? []).join("، ")
                    : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Active status switch card */}
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/30 p-3.5">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive" className="text-sm font-bold cursor-pointer">
                      تفعيل القالب
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      عند التعطيل لن يتم إرسال رسائل تلقائية لهذا الحدث
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={editForm.isActive}
                    onCheckedChange={(checked) =>
                      setEditForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    data-testid="switch-is-active"
                  />
                </div>

                {/* Interactive Variable Chips */}
                {selectedTemplate &&
                  Array.isArray(TEMPLATE_PLACEHOLDERS[selectedTemplate.type]) && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                          المتغيرات الديناميكية (اضغط لنسخ المتغير)
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          تُستبدل تلقائياً عند الإرسال
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5" dir="ltr">
                        {(TEMPLATE_PLACEHOLDERS[selectedTemplate.type] ?? []).map((ph) => {
                          const isCopied = copiedPlaceholder === ph;
                          return (
                            <button
                              key={ph}
                              type="button"
                              onClick={() => handleCopyPlaceholder(ph)}
                              className="no-min-touch-size inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-mono text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                            >
                              <span>{ph}</span>
                              {isCopied ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Subject Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="subject" className="text-sm font-bold">
                      موضوع الرسالة
                    </Label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {editForm.subject.length} حرف
                    </span>
                  </div>
                  <Input
                    id="subject"
                    value={editForm.subject}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    placeholder="موضوع البريد الإلكتروني"
                    className="text-right rounded-xl"
                    dir="rtl"
                    data-testid="input-subject"
                  />
                </div>

                {/* Body HTML / Text Tabs */}
                <Tabs defaultValue="html" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 rounded-xl">
                    <TabsTrigger value="html" className="gap-1.5" data-testid="tab-html">
                      <Code2 className="h-3.5 w-3.5" />
                      محتوى HTML
                    </TabsTrigger>
                    <TabsTrigger value="text" className="gap-1.5" data-testid="tab-text">
                      <FileText className="h-3.5 w-3.5" />
                      نص عادي
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="html" className="space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bodyHtml" className="text-xs font-semibold">
                        محتوى HTML (يدعم تنسيقات البريد وRTL)
                      </Label>
                      <span className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                        HTML
                      </span>
                    </div>
                    <Textarea
                      id="bodyHtml"
                      value={editForm.bodyHtml}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, bodyHtml: e.target.value }))
                      }
                      placeholder="<html>...</html>"
                      className="min-h-[260px] sm:min-h-[300px] font-mono text-xs sm:text-sm rounded-xl"
                      dir="ltr"
                      data-testid="textarea-body-html"
                    />
                  </TabsContent>
                  <TabsContent value="text" className="space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bodyText" className="text-xs font-semibold">
                        نص عادي (نسخة احتياطية لبرامج البريد النصية)
                      </Label>
                      <span className="text-[11px] text-muted-foreground">Plain Text</span>
                    </div>
                    <Textarea
                      id="bodyText"
                      value={editForm.bodyText}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, bodyText: e.target.value }))
                      }
                      placeholder="محتوى الرسالة بنص عادي..."
                      className="min-h-[260px] sm:min-h-[300px] rounded-xl text-sm"
                      dir="rtl"
                      data-testid="textarea-body-text"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 border-t border-border/60 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePreview}
                    disabled={previewMutation.isPending}
                    className="flex-1 sm:flex-initial gap-1.5"
                    data-testid="button-preview"
                  >
                    {previewMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    معاينة
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestSend}
                    disabled={testSendMutation.isPending}
                    className="flex-1 sm:flex-initial gap-1.5"
                    data-testid="button-test-send"
                  >
                    {testSendMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    إرسال تجريبي
                  </Button>
                </div>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="w-full sm:w-auto gap-1.5"
                  data-testid="button-save"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  حفظ التغييرات
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Preview Template Dialog */}
          <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
            <DialogContent
              className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6"
              dir="rtl"
            >
              <DialogHeader className="space-y-1.5 border-b border-border/60 pb-4 text-right">
                <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Eye className="w-4 h-4" />
                  </span>
                  معاينة البريد الإلكتروني
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-right">
                  هذه معاينة حية للقالب بعد تعويض المتغيرات ببيانات تجريبية
                </DialogDescription>
              </DialogHeader>

              {previewContent && (
                <div className="space-y-4 py-2">
                  <div className="rounded-xl border border-border/70 bg-muted/40 p-3.5 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">موضوع الرسالة:</p>
                    <p
                      className="font-bold text-sm sm:text-base text-foreground"
                      data-testid="text-preview-subject"
                    >
                      {previewContent.subject}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      البيانات التجريبية المستخدمة:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(previewContent.sampleData ?? {}).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs bg-background">
                          <span className="font-mono text-muted-foreground ml-1">{key}:</span>
                          <span>{value}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Tabs defaultValue="html" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 rounded-xl">
                      <TabsTrigger value="html" className="gap-1.5">
                        <Code2 className="h-3.5 w-3.5" />
                        معاينة HTML
                      </TabsTrigger>
                      <TabsTrigger value="text" className="gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        نص عادي
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="html" className="mt-3">
                      <div
                        className="border border-border/80 rounded-xl p-4 min-h-[220px] bg-white text-slate-900 dark:bg-gray-900 dark:text-slate-100 overflow-x-auto"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(previewContent.bodyHtml || ""),
                        }}
                        data-testid="preview-html-content"
                      />
                    </TabsContent>
                    <TabsContent value="text" className="mt-3">
                      <pre
                        className="border border-border/80 rounded-xl p-4 min-h-[220px] bg-muted/20 whitespace-pre-wrap text-sm leading-relaxed"
                        dir="rtl"
                        data-testid="preview-text-content"
                      >
                        {previewContent.bodyText}
                      </pre>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              <DialogFooter className="border-t border-border/60 pt-3">
                <Button
                  variant="outline"
                  onClick={() => setShowPreviewDialog(false)}
                  data-testid="button-close-preview"
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}

