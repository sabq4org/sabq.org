import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Tag as TagIcon,
  PlusCircle,
  Edit,
  Trash2,
  Search,
  Loader2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  Hash,
  CheckCircle2,
  TrendingUp,
  EyeOff,
  X,
  FileText,
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import type { Tag } from "@shared/schema";
import { insertTagSchema } from "@shared/schema";
import { Link } from "wouter";

// Form schema for client-side validation
const tagFormSchema = insertTagSchema.extend({
  nameAr: z.string().min(2, "الاسم العربي يجب أن يكون حرفين على الأقل"),
  nameEn: z.string().min(2, "الاسم الإنجليزي يجب أن يكون حرفين على الأقل"),
  slug: z.string().optional(),
  description: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]),
});

type TagFormValues = z.infer<typeof tagFormSchema>;
type TagUsageFilter = "all" | "used" | "unused";

export default function TagsManagement() {
  const { toast } = useToast();

  // State for dialogs and filters
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [usageFilter, setUsageFilter] = useState<TagUsageFilter>("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Form
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: {
      nameAr: "",
      nameEn: "",
      slug: "",
      description: "",
      color: "#3b82f6",
      status: "active",
    },
  });

  // Auto-generate slug from nameEn
  const watchNameEn = form.watch("nameEn");

  // Generate slug when nameEn changes (only if slug is empty or matches auto-generated pattern)
  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  // Fetch tags
  const { data: tagsRaw, isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });
  const tags = Array.isArray(tagsRaw) ? tagsRaw : [];

  // KPI summary metrics
  const stats = useMemo(() => {
    const total = tags.length;
    const active = tags.filter((t) => t.status === "active").length;
    const inactive = tags.filter((t) => t.status === "inactive").length;
    const usedCount = tags.filter((t) => (t.usageCount ?? 0) > 0).length;
    const unusedCount = total - usedCount;
    const totalUsage = tags.reduce((sum, t) => sum + (t.usageCount ?? 0), 0);
    const topTag =
      tags.length > 0
        ? [...tags].sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))[0]
        : null;

    return {
      total,
      active,
      inactive,
      usedCount,
      unusedCount,
      totalUsage,
      topTag: topTag && (topTag.usageCount ?? 0) > 0 ? topTag : null,
    };
  }, [tags]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: TagFormValues) => {
      // Auto-generate slug if not provided
      const slug = data.slug || generateSlug(data.nameEn);
      return await apiRequest("/api/tags", {
        method: "POST",
        body: JSON.stringify({ ...data, slug }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "تم إنشاء الوسم",
        description: "تم إضافة الوسم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الوسم",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TagFormValues> }) => {
      return await apiRequest(`/api/tags/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setEditingTag(null);
      form.reset();
      toast({
        title: "تم تحديث الوسم",
        description: "تم تحديث الوسم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الوسم",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/tags/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setDeletingTag(null);
      toast({
        title: "تم حذف الوسم",
        description: "تم حذف الوسم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الوسم",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    form.reset({
      nameAr: tag.nameAr,
      nameEn: tag.nameEn,
      slug: tag.slug,
      description: tag.description || "",
      color: tag.color || "#3b82f6",
      status: (tag.status || "active") as "active" | "inactive",
    });
  };

  const onSubmit = (data: TagFormValues) => {
    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Filter tags
  const filteredTags = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tags.filter((tag) => {
      const matchesSearch = query
        ? (tag.nameAr || "").toLowerCase().includes(query) ||
          (tag.nameEn || "").toLowerCase().includes(query) ||
          (tag.slug || "").toLowerCase().includes(query)
        : true;

      const matchesStatus = statusFilter === "all" || tag.status === statusFilter;

      const matchesUsage =
        usageFilter === "all"
          ? true
          : usageFilter === "used"
          ? (tag.usageCount ?? 0) > 0
          : (tag.usageCount ?? 0) === 0;

      return matchesSearch && matchesStatus && matchesUsage;
    });
  }, [tags, searchQuery, statusFilter, usageFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredTags.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTags = filteredTags.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleUsageFilterChange = (value: TagUsageFilter) => {
    setUsageFilter(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const statusPills = [
    { id: "all", label: "كل الحالات", count: stats.total },
    { id: "active", label: "نشط", count: stats.active },
    { id: "inactive", label: "معطل", count: stats.inactive },
  ];

  const usagePills: Array<{ id: TagUsageFilter; label: string; count: number }> = [
    { id: "all", label: "كل الاستخدامات", count: stats.total },
    { id: "used", label: "مرتبط بمقالات", count: stats.usedCount },
    { id: "unused", label: "غير مستخدم", count: stats.unusedCount },
  ];

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="pb-10 space-y-5">
        <DashboardPageHeader
          icon={TagIcon}
          title="إدارة الوسوم"
          description="نظّم الوسوم المستخدمة في ربط المحتوى وتحسين الوصول إليه وأرشفة الموضوعات."
          titleTestId="heading-tags"
          actions={
            <Button
              onClick={() => {
                setIsCreateDialogOpen(true);
                form.reset();
              }}
              className="w-full gap-2 sm:w-auto shadow-xs"
              data-testid="button-add-tag"
            >
              <PlusCircle className="h-4 w-4" />
              إضافة وسم جديد
            </Button>
          }
        />

        {/* Top KPI Summary Strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
          <Card className="rounded-2xl border-border/70 bg-card shadow-xs">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">إجمالي الوسوم</p>
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  {stats.total.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {stats.usedCount.toLocaleString("en-US")} وسم مستخدم في الأخبار
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Hash className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 via-card to-card shadow-xs dark:border-emerald-900/40 dark:from-emerald-950/20">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">الوسوم النشطة</p>
                <p className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {stats.active.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  متاحة للربط والفهرسة في الصفحات العامة
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 bg-card shadow-xs">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">معطلة / غير مستخدمة</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold tracking-tight tabular-nums">
                    {stats.inactive.toLocaleString("en-US")}
                  </p>
                  <span className="text-xs text-muted-foreground">معطل</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {stats.unusedCount.toLocaleString("en-US")} وسم بلا مقالات مرتبطة
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <EyeOff className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 bg-card shadow-xs">
            <CardContent className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">إجمالي الارتباطات</p>
                <p className="text-2xl font-bold tracking-tight text-violet-700 dark:text-violet-300 tabular-nums">
                  {stats.totalUsage.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {stats.topTag
                    ? `الأعلى: ${stats.topTag.nameAr} (${(stats.topTag.usageCount ?? 0).toLocaleString("en-US")})`
                    : "لا توجد ارتباطات مسجلة بعد"}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Card with Search, Quick Filter Pills, and Responsive Table/Cards */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15 overflow-hidden">
          <CardHeader className="border-b border-sky-200/40 px-4 py-4 sm:px-5 dark:border-sky-900/30 space-y-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-base sm:text-lg font-bold tabular-nums">
                  الوسوم ({filteredTags.length.toLocaleString("en-US")})
                </CardTitle>
                {(searchQuery || statusFilter !== "all" || usageFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSearchChange("");
                      handleStatusFilterChange("all");
                      handleUsageFilterChange("all");
                    }}
                    className="no-min-touch-size inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                    مسح الفلاتر
                  </button>
                )}
              </div>

              <div className="flex w-full items-center gap-2 flex-wrap sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="ابحث بالاسم العربي أو الإنجليزي أو المعرّف..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full pr-9 pl-8 sm:w-64 bg-background/80"
                    data-testid="input-search-tags"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange("")}
                      className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label="مسح البحث"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="w-32 bg-background/80" data-testid="select-filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">معطل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {statusPills.map((pill) => {
                  const isActive = statusFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => handleStatusFilterChange(pill.id)}
                      className={`no-min-touch-size inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all ${
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

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {usagePills.map((pill) => {
                  const isActive = usageFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => handleUsageFilterChange(pill.id)}
                      className={`no-min-touch-size inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-sky-600 text-white shadow-xs dark:bg-sky-500"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                          isActive ? "bg-white/20 text-white" : "bg-background/80 text-muted-foreground"
                        }`}
                      >
                        {pill.count.toLocaleString("en-US")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y divide-border/60 p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4 pt-3 first:pt-0">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : filteredTags.length > 0 ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="hidden md:table-header-group bg-muted/40 border-b border-border/70">
                      <tr>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">
                          الاسم العربي
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">
                          الاسم الإنجليزي
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">
                          Slug
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">
                          اللون
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">
                          الاستخدامات
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">
                          الحالة
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">
                          الإجراءات
                        </th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group divide-y divide-border/60 p-3 md:p-0 space-y-3 md:space-y-0">
                      {paginatedTags.map((tag) => {
                        const accentColor = tag.color || "#3b82f6";
                        const usage = tag.usageCount ?? 0;

                        return (
                          <tr
                            key={tag.id}
                            style={{ borderRightColor: accentColor }}
                            className="block md:table-row rounded-xl md:rounded-none border border-border/70 md:border-0 md:border-b md:border-border/60 border-r-4 bg-card p-3.5 md:p-0 shadow-2xs md:shadow-none hover:bg-muted/30 transition-colors"
                            data-testid={`tag-row-${tag.id}`}
                          >
                            {/* Arabic Name + Icon Accent */}
                            <td
                              data-label="الوسم"
                              className="flex items-center justify-between gap-3 py-1.5 md:py-3.5 md:px-4 md:table-cell before:content-[attr(data-label)] before:text-xs before:font-normal before:text-muted-foreground md:before:hidden"
                              data-testid={`tag-name-ar-${tag.id}`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50"
                                  style={{
                                    backgroundColor: `${accentColor}15`,
                                    borderColor: `${accentColor}35`,
                                    color: accentColor,
                                  }}
                                >
                                  <Hash className="h-4 w-4" />
                                </span>
                                <span className="font-semibold text-sm sm:text-base text-foreground block truncate">
                                  {tag.nameAr}
                                </span>
                              </div>
                            </td>

                            {/* English Name */}
                            <td
                              data-label="الاسم الإنجليزي"
                              className="flex items-center justify-between gap-2 py-1.5 md:py-3.5 md:px-4 md:table-cell text-sm text-muted-foreground before:content-[attr(data-label)] before:text-xs before:font-normal before:text-muted-foreground md:before:hidden"
                              data-testid={`tag-name-en-${tag.id}`}
                            >
                              <span dir="ltr" className="font-medium">
                                {tag.nameEn}
                              </span>
                            </td>

                            {/* Slug */}
                            <td
                              data-label="المعرف"
                              className="flex items-center justify-between gap-2 py-1.5 md:py-3.5 md:px-4 md:table-cell before:content-[attr(data-label)] before:text-xs before:font-normal before:text-muted-foreground md:before:hidden"
                            >
                              <code
                                dir="ltr"
                                className="text-xs font-mono bg-muted/60 border border-border/50 px-2 py-0.5 rounded-md text-foreground/90"
                                data-testid={`tag-slug-${tag.id}`}
                              >
                                {tag.slug}
                              </code>
                            </td>

                            {/* Color */}
                            <td
                              data-label="اللون"
                              className="flex items-center justify-between gap-2 py-1.5 md:py-3.5 md:px-4 md:table-cell before:content-[attr(data-label)] before:text-xs before:font-normal before:text-muted-foreground md:before:hidden"
                            >
                              {tag.color ? (
                                <Badge
                                  className="gap-1.5 font-mono text-xs shadow-2xs"
                                  style={{
                                    backgroundColor: tag.color,
                                    color: "#ffffff",
                                  }}
                                  dir="ltr"
                                  data-testid={`tag-color-${tag.id}`}
                                >
                                  <span className="h-2 w-2 rounded-full bg-white/90" />
                                  {tag.color}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Usage Count */}
                            <td
                              data-label="الاستخدامات"
                              className="flex items-center justify-between gap-2 py-1.5 md:py-3.5 md:px-4 md:table-cell before:content-[attr(data-label)] before:text-xs before:font-normal before:text-muted-foreground md:before:hidden"
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                    usage > 0
                                      ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                      : "bg-muted/60 text-muted-foreground"
                                  }`}
                                  data-testid={`tag-usage-${tag.id}`}
                                >
                                  <FileText className="h-3 w-3 opacity-75" />
                                  {usage.toLocaleString("en-US")}
                                </span>
                                {usage > 0 && (
                                  <Link href={`/dashboard/tags/${tag.id}/articles`}>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary"
                                      title="عرض المقالات المرتبطة"
                                      data-testid={`button-view-articles-${tag.id}`}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  </Link>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td
                              data-label="الحالة"
                              className="flex items-center justify-between gap-2 py-1.5 md:py-3.5 md:px-4 md:table-cell before:content-[attr(data-label)] before:text-xs before:font-normal before:text-muted-foreground md:before:hidden"
                            >
                              <Badge
                                variant={tag.status === "active" ? "default" : "secondary"}
                                className={
                                  tag.status === "active"
                                    ? "gap-1.5 border border-emerald-200/80 bg-emerald-50/90 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "gap-1.5 bg-muted text-muted-foreground"
                                }
                                data-testid={`tag-status-${tag.id}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    tag.status === "active"
                                      ? "bg-emerald-500"
                                      : "bg-muted-foreground/60"
                                  }`}
                                />
                                {tag.status === "active" ? "نشط" : "معطل"}
                              </Badge>
                            </td>

                            {/* Actions */}
                            <td
                              data-label="الإجراءات"
                              className="flex items-center justify-between md:justify-end gap-2 pt-2.5 mt-1.5 border-t border-border/40 md:border-t-0 md:pt-0 md:mt-0 md:py-3.5 md:px-4 md:table-cell before:content-[attr(data-label)] before:text-xs before:font-normal before:text-muted-foreground md:before:hidden"
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70"
                                  onClick={() => handleEdit(tag)}
                                  title="تعديل الوسم"
                                  data-testid={`button-edit-tag-${tag.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeletingTag(tag)}
                                  title="حذف الوسم"
                                  data-testid={`button-delete-tag-${tag.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3.5 sm:px-5 border-t border-border/60 bg-muted/20">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                      <span>عرض</span>
                      <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                        <SelectTrigger className="w-20 h-8 bg-background" data-testid="select-items-per-page">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="tabular-nums">
                        من أصل {filteredTags.length.toLocaleString("en-US")} وسم
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        data-testid="button-first-page"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      <div className="flex items-center gap-1 mx-2">
                        <span className="text-xs sm:text-sm text-muted-foreground">صفحة</span>
                        <span className="text-xs sm:text-sm font-semibold tabular-nums">
                          {currentPage.toLocaleString("en-US")}
                        </span>
                        <span className="text-xs sm:text-sm text-muted-foreground">من</span>
                        <span className="text-xs sm:text-sm font-semibold tabular-nums">
                          {totalPages.toLocaleString("en-US")}
                        </span>
                      </div>

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        data-testid="button-last-page"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <TagIcon className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {searchQuery || statusFilter !== "all" || usageFilter !== "all"
                    ? "لا توجد نتائج"
                    : "لا توجد وسوم"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                  {searchQuery || statusFilter !== "all" || usageFilter !== "all"
                    ? "جرّب تعديل عبارة البحث أو تغيير فلاتر الحالة والاستخدام."
                    : "ابدأ بإضافة وسم جديد لربط المقالات وتسهيل أرشفتها."}
                </p>
                {(searchQuery || statusFilter !== "all" || usageFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSearchChange("");
                      handleStatusFilterChange("all");
                      handleUsageFilterChange("all");
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
        open={isCreateDialogOpen || !!editingTag}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingTag(null);
            form.reset();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingTag ? "تعديل الوسم" : "إضافة وسم جديد"}
            </DialogTitle>
            <DialogDescription>
              {editingTag ? "تعديل بيانات الوسم" : "أضف وسماً جديداً للمقالات"}
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
                        <Input {...field} data-testid="input-tag-name-ar" />
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
                      <FormLabel>الاسم بالإنجليزية *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          dir="ltr"
                          onChange={(e) => {
                            field.onChange(e);
                            // Auto-generate slug if it's empty or not manually edited
                            const currentSlug = form.getValues("slug");
                            if (!currentSlug || currentSlug === generateSlug(watchNameEn)) {
                              form.setValue("slug", generateSlug(e.target.value));
                            }
                          }}
                          data-testid="input-tag-name-en"
                        />
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
                    <FormLabel>المعرف (Slug)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        dir="ltr"
                        placeholder="يتم توليده تلقائياً"
                        data-testid="input-tag-slug"
                      />
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
                      <Textarea
                        {...field}
                        value={field.value || ""}
                        rows={3}
                        data-testid="input-tag-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اللون</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            type="color"
                            {...field}
                            value={field.value || "#3b82f6"}
                            className="h-10 w-16 p-1 cursor-pointer shrink-0"
                            data-testid="input-tag-color"
                          />
                        </FormControl>
                        <Input
                          value={field.value || "#3b82f6"}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="#3b82f6"
                          dir="ltr"
                          className="flex-1 font-mono"
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحالة</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-tag-status">
                            <SelectValue />
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

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEditingTag(null);
                    form.reset();
                  }}
                  data-testid="button-cancel-tag"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-tag"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingTag ? "تحديث" : "حفظ"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingTag}
        onOpenChange={(open) => {
          if (!open) setDeletingTag(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الوسم &quot;{deletingTag?.nameAr}&quot; نهائياً. هذا الإجراء لا يمكن التراجع عنه.
              {deletingTag && (deletingTag.usageCount ?? 0) > 0 && (
                <span className="block mt-2 text-destructive font-semibold">
                  تحذير: هذا الوسم مستخدم في {deletingTag.usageCount} مقال
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-delete">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTag && deleteMutation.mutate(deletingTag.id)}
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
