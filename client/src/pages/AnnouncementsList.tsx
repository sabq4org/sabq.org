import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  Archive,
  Send,
  Search,
  Megaphone,
  Eye,
  Clock,
  CheckCircle2,
  Flame,
  Users,
  Calendar,
  Radio,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  channels: string[];
  audienceRoles: string[] | null;
  audienceUserIds: string[] | null;
  startAt: string | null;
  endAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

const statusQuickPills = [
  { value: "all", label: "الكل" },
  { value: "published", label: "منشور" },
  { value: "draft", label: "مسودة" },
  { value: "scheduled", label: "مجدول" },
  { value: "archived", label: "مؤرشف" },
] as const;

const priorityQuickPills = [
  { value: "all", label: "الكل" },
  { value: "critical", label: "حرج" },
  { value: "high", label: "عالي" },
  { value: "normal", label: "متوسط" },
  { value: "low", label: "منخفض" },
] as const;

const channelOptions = [
  { value: "dashboardBanner", label: "بانر لوحة التحكم" },
  { value: "inbox", label: "صندوق الوارد" },
  { value: "toast", label: "إشعار منبثق" },
] as const;

function stripHtmlPreview(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPriorityAccentClass(priority: string, status: string): string {
  if (status === "archived" || status === "expired") {
    return "border-r-4 border-r-muted-foreground/40";
  }
  switch (priority) {
    case "critical":
      return "border-r-4 border-r-rose-500";
    case "high":
      return "border-r-4 border-r-orange-500";
    case "medium":
    case "normal":
      return "border-r-4 border-r-sky-500";
    case "low":
      return "border-r-4 border-r-slate-400";
    default:
      return "border-r-4 border-r-border";
  }
}

export default function AnnouncementsList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [channelFilters, setChannelFilters] = useState<string[]>([]);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);

  const pageSize = 20;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
    if (priorityFilter && priorityFilter !== "all") params.append("priority", priorityFilter);
    if (search) params.append("search", search);
    return params.toString() ? `?${params.toString()}` : "";
  };

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements", statusFilter, priorityFilter, channelFilters, search],
    queryFn: () => fetch(apiUrl(`/api/announcements${buildQueryString()}`)).then((r) => r.json()),
  });

  const announcementList = Array.isArray(announcements) ? announcements : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      toast({ title: "✅ تم حذف الإعلان بنجاح" });
      setDeleteDialogId(null);
    },
    onError: () => {
      toast({ title: "❌ فشل حذف الإعلان", variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      toast({ title: "✅ تم نشر الإعلان بنجاح" });
    },
    onError: () => {
      toast({ title: "❌ فشل نشر الإعلان", variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}/archive`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      toast({ title: "✅ تم أرشفة الإعلان بنجاح" });
    },
    onError: () => {
      toast({ title: "❌ فشل أرشفة الإعلان", variant: "destructive" });
    },
  });

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      critical:
        "border border-rose-200/80 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:border-rose-800/60 dark:bg-rose-500/15 dark:text-rose-300",
      high:
        "border border-orange-200/80 bg-orange-500/10 text-orange-700 hover:bg-orange-500/15 dark:border-orange-800/60 dark:bg-orange-500/15 dark:text-orange-300",
      medium:
        "border border-sky-200/80 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:border-sky-800/60 dark:bg-sky-500/15 dark:text-sky-300",
      normal:
        "border border-sky-200/80 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:border-sky-800/60 dark:bg-sky-500/15 dark:text-sky-300",
      low:
        "border border-slate-200/80 bg-slate-500/10 text-slate-700 hover:bg-slate-500/15 dark:border-slate-700/60 dark:bg-slate-500/15 dark:text-slate-300",
    };

    const labels: Record<string, string> = {
      critical: "حرج",
      high: "عالي",
      medium: "متوسط",
      normal: "متوسط",
      low: "منخفض",
    };

    return (
      <Badge className={cn("text-xs font-medium", styles[priority] || styles.low)}>
        {labels[priority] || priority}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; label: string }> = {
      published: {
        className:
          "border border-emerald-200/80 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:border-emerald-800/60 dark:bg-emerald-500/15 dark:text-emerald-300",
        label: "منشور",
      },
      scheduled: {
        className:
          "border border-violet-200/80 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 dark:border-violet-800/60 dark:bg-violet-500/15 dark:text-violet-300",
        label: "مجدول",
      },
      draft: {
        className:
          "border border-amber-200/80 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:border-amber-800/60 dark:bg-amber-500/15 dark:text-amber-300",
        label: "مسودة",
      },
      expired: {
        className:
          "border border-rose-200/80 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:border-rose-800/60 dark:bg-rose-500/15 dark:text-rose-300",
        label: "منتهي",
      },
      archived: {
        className: "border-border bg-muted/70 text-muted-foreground hover:bg-muted",
        label: "مؤرشف",
      },
    };
    const config = styles[status] || styles.draft;

    return <Badge className={cn("text-xs font-medium", config.className)}>{config.label}</Badge>;
  };

  const getChannelLabel = (ch: string) => {
    if (ch === "dashboardBanner") return "بانر لوحة التحكم";
    if (ch === "inbox") return "صندوق الوارد";
    if (ch === "toast") return "إشعار منبثق";
    return ch;
  };

  const getTargetAudience = (announcement: Announcement) => {
    const audience: string[] = [];
    if (Array.isArray(announcement.audienceRoles) && announcement.audienceRoles.length > 0) {
      audience.push(announcement.audienceRoles.join("، "));
    }
    if (Array.isArray(announcement.audienceUserIds) && announcement.audienceUserIds.length > 0) {
      audience.push(`${announcement.audienceUserIds.length} مستخدم محدد`);
    }
    return audience.length > 0 ? audience.join(" + ") : "الجميع";
  };

  const filteredAnnouncements = announcementList.filter((ann) => {
    if (search && !(ann.title || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (priorityFilter !== "all") {
      if (priorityFilter === "normal" || priorityFilter === "medium") {
        if (ann.priority !== "normal" && ann.priority !== "medium") return false;
      } else if (ann.priority !== priorityFilter) {
        return false;
      }
    }
    const channels = Array.isArray(ann.channels) ? ann.channels : [];
    if (channelFilters.length > 0 && !channels.some((ch) => channelFilters.includes(ch))) {
      return false;
    }
    return true;
  });

  const paginatedAnnouncements = filteredAnnouncements.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredAnnouncements.length / pageSize);

  // KPI metrics computed from guarded announcements list
  const totalCount = announcementList.length;
  const publishedCount = announcementList.filter((a) => a.status === "published").length;
  const draftScheduledCount = announcementList.filter(
    (a) => a.status === "draft" || a.status === "scheduled",
  ).length;
  const criticalHighCount = announcementList.filter(
    (a) => a.priority === "high" || a.priority === "critical",
  ).length;

  const toggleChannelFilter = (channel: string) => {
    setChannelFilters((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
    setPage(1);
  };

  const hasActiveFilters =
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    channelFilters.length > 0 ||
    search.trim().length > 0;

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setChannelFilters([]);
    setPage(1);
  };

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]">
        <DashboardPageHeader
          icon={Megaphone}
          title="الإعلانات والتنبيهات الداخلية"
          description="إدارة التعاميم والتنبيهات الموجهة لفريق التحرير والمنسوبين عبر اللوحة والبريد"
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/dashboard/announcements/archive")}
                data-testid="button-announcements-archive"
                className="no-min-touch-size h-9 gap-1.5"
              >
                <Archive className="h-4 w-4" />
                الأرشيف
              </Button>
              <Button
                onClick={() => setLocation("/dashboard/announcements/new")}
                data-testid="button-create-announcement"
                size="sm"
                className="no-min-touch-size h-9 gap-1.5"
              >
                <Plus className="h-4 w-4" />
                إعلان جديد
              </Button>
            </>
          }
        />

        {/* 4-Card KPI Summary Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setPriorityFilter("all");
              setPage(1);
            }}
            data-testid="card-kpi-total"
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-4 text-right transition-all hover:border-primary/40 hover:shadow-sm",
              statusFilter === "all" && priorityFilter === "all" && "ring-2 ring-primary/30 border-primary/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">إجمالي الإعلانات</p>
                <div className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums sm:text-3xl">
                  {totalCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  التعاميم والرسائل المسجلة بالنظام
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Megaphone className="h-5 w-5" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === "published" ? "all" : "published"));
              setPage(1);
            }}
            data-testid="card-kpi-published"
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-500/[0.08] via-card to-card p-4 text-right transition-all hover:border-emerald-500/40 hover:shadow-sm",
              statusFilter === "published" && "ring-2 ring-emerald-500/30 border-emerald-500/50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">المنشورة والنشطة</p>
                <div className="mt-1.5 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 tabular-nums sm:text-3xl">
                  {publishedCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  تظهر حالياً لفريق التحرير والمنسوبين
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === "draft" ? "all" : "draft"));
              setPage(1);
            }}
            data-testid="card-kpi-draft-scheduled"
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-500/[0.08] via-card to-card p-4 text-right transition-all hover:border-amber-500/40 hover:shadow-sm",
              (statusFilter === "draft" || statusFilter === "scheduled") &&
                "ring-2 ring-amber-500/30 border-amber-500/50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">المسودات والمجدولة</p>
                <div className="mt-1.5 text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-300 tabular-nums sm:text-3xl">
                  {draftScheduledCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  بانتظار الاعتماد أو موعد البث المجدول
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <Clock className="h-5 w-5" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setPriorityFilter((prev) => (prev === "high" ? "all" : "high"));
              setPage(1);
            }}
            data-testid="card-kpi-high-priority"
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-rose-500/[0.08] via-card to-card p-4 text-right transition-all hover:border-rose-500/40 hover:shadow-sm",
              (priorityFilter === "high" || priorityFilter === "critical") &&
                "ring-2 ring-rose-500/30 border-rose-500/50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">عالية الأهمية / عاجلة</p>
                <div className="mt-1.5 text-2xl font-bold tracking-tight text-rose-700 dark:text-rose-300 tabular-nums sm:text-3xl">
                  {criticalHighCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  تنبيهات حرجة وعاجلة تتطلب الانتباه
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300">
                <Flame className="h-5 w-5" />
              </span>
            </div>
          </button>
        </div>

        {/* Filter Bar + Quick Filter Pills */}
        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-none">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                البحث في التعاميم
              </label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث في عناوين الإعلانات والتنبيهات..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pr-10 h-9 text-sm"
                  data-testid="input-search"
                />
              </div>
            </div>

            <div className="w-full md:w-44">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">الحالة</label>
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-status" className="h-9 text-sm">
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="scheduled">مجدول</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                  <SelectItem value="expired">منتهي</SelectItem>
                  <SelectItem value="archived">مؤرشف</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-44">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">الأولوية</label>
              <Select
                value={priorityFilter}
                onValueChange={(val) => {
                  setPriorityFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-priority" className="h-9 text-sm">
                  <SelectValue placeholder="اختر الأولوية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="critical">حرج</SelectItem>
                  <SelectItem value="high">عالي</SelectItem>
                  <SelectItem value="normal">متوسط</SelectItem>
                  <SelectItem value="low">منخفض</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="no-min-touch-size h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                data-testid="button-reset-filters"
              >
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
          </div>

          {/* Quick Status & Priority Pills */}
          <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                الحالة:
              </span>
              {statusQuickPills.map((pill) => {
                const active = statusFilter === pill.value;
                return (
                  <button
                    key={pill.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(pill.value);
                      setPage(1);
                    }}
                    data-testid={`pill-status-${pill.value}`}
                    className={cn(
                      "no-min-touch-size inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                الأولوية:
              </span>
              {priorityQuickPills.map((pill) => {
                const active = priorityFilter === pill.value;
                return (
                  <button
                    key={pill.value}
                    type="button"
                    onClick={() => {
                      setPriorityFilter(pill.value);
                      setPage(1);
                    }}
                    data-testid={`pill-priority-${pill.value}`}
                    className={cn(
                      "no-min-touch-size inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channel Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
            <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Radio className="h-3.5 w-3.5" />
              قنوات العرض:
            </span>
            {channelOptions.map((channel) => {
              const checked = channelFilters.includes(channel.value);
              return (
                <label
                  key={channel.value}
                  htmlFor={`channel-${channel.value}`}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    checked
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Checkbox
                    id={`channel-${channel.value}`}
                    checked={checked}
                    onCheckedChange={() => toggleChannelFilter(channel.value)}
                    data-testid={`checkbox-channel-${channel.value}`}
                    className="h-3.5 w-3.5"
                  />
                  <span className="whitespace-nowrap">{channel.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Announcements List Card */}
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="flex flex-col gap-2 space-y-0 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold">قائمة التعاميم والإعلانات</CardTitle>
              <CardDescription className="mt-0.5 tabular-nums">
                عرض {paginatedAnnouncements.length.toLocaleString("en-US")} من أصل{" "}
                {filteredAnnouncements.length.toLocaleString("en-US")} إعلان
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-2.5">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-right">العنوان والملخص</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">الأولوية</TableHead>
                          <TableHead className="text-right">القنوات</TableHead>
                          <TableHead className="text-right">الجمهور المستهدف</TableHead>
                          <TableHead className="text-right">التوقيت</TableHead>
                          <TableHead className="text-right">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedAnnouncements.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                              <Megaphone className="mx-auto mb-2.5 h-10 w-10 opacity-40" />
                              <p className="font-semibold text-foreground">لا توجد إعلانات مطابقة</p>
                              <p className="text-xs mt-1">
                                {hasActiveFilters
                                  ? "جرّب تعديل الفلاتر أو مسحها لعرض كافة الإعلانات"
                                  : "ابدأ بإنشاء إعلان داخلي جديد لفريق التحرير"}
                              </p>
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedAnnouncements.map((announcement) => {
                            const channels = Array.isArray(announcement.channels)
                              ? announcement.channels
                              : [];
                            const preview = stripHtmlPreview(announcement.message);
                            const accentClass = getPriorityAccentClass(
                              announcement.priority,
                              announcement.status,
                            );

                            return (
                              <TableRow
                                key={announcement.id}
                                data-testid={`row-announcement-${announcement.id}`}
                                className={cn("group transition-colors hover:bg-muted/40", accentClass)}
                              >
                                <TableCell className="max-w-md">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLocation(`/dashboard/announcements/${announcement.id}`)
                                    }
                                    className="no-min-touch-size text-right font-semibold text-sm sm:text-base text-foreground hover:text-primary transition-colors line-clamp-1"
                                  >
                                    {announcement.title}
                                  </button>
                                  {preview && (
                                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                                      {preview}
                                    </p>
                                  )}
                                </TableCell>
                                <TableCell>{getStatusBadge(announcement.status)}</TableCell>
                                <TableCell>{getPriorityBadge(announcement.priority)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1 flex-wrap">
                                    {channels.map((ch) => (
                                      <Badge
                                        key={ch}
                                        variant="outline"
                                        className="text-[11px] font-normal bg-background/60"
                                      >
                                        {getChannelLabel(ch)}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="truncate max-w-[140px]">
                                      {getTargetAudience(announcement)}
                                    </span>
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                                    {announcement.publishedAt ? (
                                      <span>
                                        نُشر:{" "}
                                        {format(new Date(announcement.publishedAt), "dd MMM yyyy", {
                                          locale: ar,
                                        })}
                                      </span>
                                    ) : announcement.startAt ? (
                                      <span>
                                        يبدأ:{" "}
                                        {format(new Date(announcement.startAt), "dd MMM yyyy", {
                                          locale: ar,
                                        })}
                                      </span>
                                    ) : (
                                      <span>
                                        أُنشئ:{" "}
                                        {format(new Date(announcement.createdAt), "dd MMM yyyy", {
                                          locale: ar,
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      title="عرض الإعلان"
                                      className="no-min-touch-size h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                      onClick={() =>
                                        setLocation(`/dashboard/announcements/${announcement.id}`)
                                      }
                                      data-testid={`button-view-${announcement.id}`}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      title="تعديل الإعلان"
                                      className="no-min-touch-size h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                      onClick={() =>
                                        setLocation(`/dashboard/announcements/${announcement.id}/edit`)
                                      }
                                      data-testid={`button-edit-${announcement.id}`}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>

                                    {(announcement.status === "draft" ||
                                      announcement.status === "scheduled") && (
                                      <Button
                                        size="sm"
                                        variant="default"
                                        title="نشر الآن"
                                        className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
                                        onClick={() => publishMutation.mutate(announcement.id)}
                                        disabled={publishMutation.isPending}
                                        data-testid={`button-publish-${announcement.id}`}
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                        <span>نشر</span>
                                      </Button>
                                    )}

                                    {announcement.status === "published" && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        title="أرشفة الإعلان"
                                        className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
                                        onClick={() => archiveMutation.mutate(announcement.id)}
                                        disabled={archiveMutation.isPending}
                                        data-testid={`button-archive-${announcement.id}`}
                                      >
                                        <Archive className="h-3.5 w-3.5" />
                                        <span>أرشفة</span>
                                      </Button>
                                    )}

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      title="حذف الإعلان"
                                      className="no-min-touch-size h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => setDeleteDialogId(announcement.id)}
                                      data-testid={`button-delete-${announcement.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {paginatedAnnouncements.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Megaphone className="mx-auto mb-2 h-10 w-10 opacity-40" />
                      <p className="font-semibold text-foreground">لا توجد إعلانات</p>
                    </div>
                  ) : (
                    paginatedAnnouncements.map((announcement) => {
                      const channels = Array.isArray(announcement.channels)
                        ? announcement.channels
                        : [];
                      const preview = stripHtmlPreview(announcement.message);
                      const accentClass = getPriorityAccentClass(
                        announcement.priority,
                        announcement.status,
                      );

                      return (
                        <div
                          key={announcement.id}
                          className={cn(
                            "border rounded-xl bg-card p-4 space-y-3 transition-shadow hover:shadow-sm",
                            accentClass,
                          )}
                          data-testid={`card-announcement-${announcement.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm sm:text-base break-words leading-snug">
                                {announcement.title}
                              </h3>
                              {preview && (
                                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                  {preview}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {getStatusBadge(announcement.status)}
                              {getPriorityBadge(announcement.priority)}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {channels.map((ch) => (
                              <Badge key={ch} variant="outline" className="text-xs font-normal">
                                {getChannelLabel(ch)}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {getTargetAudience(announcement)}
                            </span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Calendar className="h-3.5 w-3.5" />
                              {announcement.publishedAt ? (
                                <>
                                  نُشر:{" "}
                                  {format(new Date(announcement.publishedAt), "dd MMM yyyy", {
                                    locale: ar,
                                  })}
                                </>
                              ) : announcement.startAt ? (
                                <>
                                  يبدأ:{" "}
                                  {format(new Date(announcement.startAt), "dd MMM yyyy", {
                                    locale: ar,
                                  })}
                                </>
                              ) : (
                                <>
                                  أُنشئ:{" "}
                                  {format(new Date(announcement.createdAt), "dd MMM yyyy", {
                                    locale: ar,
                                  })}
                                </>
                              )}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-border/60">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setLocation(`/dashboard/announcements/${announcement.id}`)
                              }
                              data-testid={`button-view-mobile-${announcement.id}`}
                              className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              عرض
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setLocation(`/dashboard/announcements/${announcement.id}/edit`)
                              }
                              data-testid={`button-edit-mobile-${announcement.id}`}
                              className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              تعديل
                            </Button>

                            {(announcement.status === "draft" ||
                              announcement.status === "scheduled") && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => publishMutation.mutate(announcement.id)}
                                disabled={publishMutation.isPending}
                                data-testid={`button-publish-mobile-${announcement.id}`}
                                className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
                              >
                                <Send className="h-3.5 w-3.5" />
                                نشر
                              </Button>
                            )}

                            {announcement.status === "published" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => archiveMutation.mutate(announcement.id)}
                                disabled={archiveMutation.isPending}
                                data-testid={`button-archive-mobile-${announcement.id}`}
                                className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
                              >
                                <Archive className="h-3.5 w-3.5" />
                                أرشفة
                              </Button>
                            )}

                            <div className="flex-1" />

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteDialogId(announcement.id)}
                              data-testid={`button-delete-mobile-${announcement.id}`}
                              className="no-min-touch-size h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
                    <div className="text-sm text-muted-foreground tabular-nums">
                      صفحة {page.toLocaleString("en-US")} من {totalPages.toLocaleString("en-US")}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="no-min-touch-size h-8"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronRight className="h-4 w-4 ml-1" />
                        السابق
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="no-min-touch-size h-8"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        التالي
                        <ChevronLeft className="h-4 w-4 mr-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!deleteDialogId} onOpenChange={() => setDeleteDialogId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا الإعلان؟ هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction
                onClick={() => deleteDialogId && deleteMutation.mutate(deleteDialogId)}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                حذف
              </AlertDialogAction>
              <AlertDialogCancel data-testid="button-cancel-delete">
                إلغاء
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
