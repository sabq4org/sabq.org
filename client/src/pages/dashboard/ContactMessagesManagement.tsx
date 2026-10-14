import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Search,
  Eye,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Send,
  Inbox,
  Mail,
  Phone,
  RefreshCw,
  Tag,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { PolishReplyButton } from "@/components/ai/PolishReplyButton";
import type { ContactMessage } from "@shared/schema";
import { cn } from "@/lib/utils";

type ContactMessageStatus = "pending" | "read" | "replied";
type StatusFilter = "all" | ContactMessageStatus;
type MessageCategoryKey =
  | "general"
  | "editorial"
  | "complaint"
  | "advertising"
  | "technical"
  | "suggestion";
type CategoryFilter = "all" | MessageCategoryKey;

const statusColors: Record<ContactMessageStatus, string> = {
  pending:
    "bg-amber-500/12 text-amber-800 border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30",
  read:
    "bg-sky-500/12 text-sky-800 border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/30",
  replied:
    "bg-emerald-500/12 text-emerald-800 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30",
};

const statusDotColors: Record<ContactMessageStatus, string> = {
  pending: "bg-amber-500",
  read: "bg-sky-500",
  replied: "bg-emerald-500",
};

const statusLabels: Record<ContactMessageStatus, string> = {
  pending: "غير مقروءة",
  read: "تمت القراءة",
  replied: "تم الرد",
};

const statusTone: Record<ContactMessageStatus, string> = {
  pending: "text-amber-700 dark:text-amber-300",
  read: "text-sky-700 dark:text-sky-300",
  replied: "text-emerald-700 dark:text-emerald-300",
};

const categoryMeta: Record<
  MessageCategoryKey,
  { label: string; badgeClass: string }
> = {
  editorial: {
    label: "تحرير وأخبار",
    badgeClass:
      "bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300",
  },
  complaint: {
    label: "شكوى أو بلاغ",
    badgeClass:
      "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300",
  },
  advertising: {
    label: "إعلانات وشراكات",
    badgeClass:
      "bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-300",
  },
  technical: {
    label: "دعم تقني",
    badgeClass:
      "bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:text-cyan-300",
  },
  suggestion: {
    label: "اقتراح وتطوير",
    badgeClass:
      "bg-teal-500/10 text-teal-700 border-teal-500/25 dark:text-teal-300",
  },
  general: {
    label: "تواصل عام",
    badgeClass:
      "bg-muted text-muted-foreground border-border/80",
  },
};

function resolveMessageCategory(message: ContactMessage): MessageCategoryKey {
  const rawCategory = String(
    (message as Record<string, unknown>).category ??
      (message as Record<string, unknown>).type ??
      "",
  )
    .trim()
    .toLowerCase();

  if (rawCategory) {
    if (
      rawCategory.includes("edit") ||
      rawCategory.includes("news") ||
      rawCategory.includes("press") ||
      rawCategory.includes("تحرير") ||
      rawCategory.includes("خبر")
    ) {
      return "editorial";
    }
    if (
      rawCategory.includes("complain") ||
      rawCategory.includes("report") ||
      rawCategory.includes("شكو") ||
      rawCategory.includes("بلاغ")
    ) {
      return "complaint";
    }
    if (
      rawCategory.includes("ad") ||
      rawCategory.includes("sponsor") ||
      rawCategory.includes("partner") ||
      rawCategory.includes("إعلان") ||
      rawCategory.includes("شراك")
    ) {
      return "advertising";
    }
    if (
      rawCategory.includes("tech") ||
      rawCategory.includes("support") ||
      rawCategory.includes("bug") ||
      rawCategory.includes("تقني") ||
      rawCategory.includes("دعم")
    ) {
      return "technical";
    }
    if (
      rawCategory.includes("suggest") ||
      rawCategory.includes("idea") ||
      rawCategory.includes("اقتراح")
    ) {
      return "suggestion";
    }
  }

  const text = `${message.subject ?? ""} ${message.message ?? ""}`.toLowerCase();
  if (/شكوى|بلاغ|اعتراض|تظلم|إساءة|خطأ في خبر/.test(text)) return "complaint";
  if (/إعلان|اعلان|رعاية|شراكة|تسويق|حملة/.test(text)) return "advertising";
  if (/تقني|تطبيق|مشكلة في الموقع|تسجيل الدخول|كلمة المرور|عطل/.test(text))
    return "technical";
  if (/خبر|مقال|صحفي|نشر|تغطية|بيان صحفي|محرر/.test(text)) return "editorial";
  if (/اقتراح|فكرة|تطوير|مبادرة/.test(text)) return "suggestion";
  return "general";
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "ز";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ز";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`;
}

export default function ContactMessagesManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [messageToDelete, setMessageToDelete] = useState<ContactMessage | null>(null);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [messageToReply, setMessageToReply] = useState<ContactMessage | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markAllConfirmOpen, setMarkAllConfirmOpen] = useState(false);

  useEffect(() => {
    document.title = "إدارة رسائل التواصل - لوحة التحكم";
  }, []);

  const { data, isLoading, isFetching, refetch } = useQuery<{
    messages: ContactMessage[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    statusCounts?: {
      pending: number;
      read: number;
      replied: number;
      total: number;
    };
  }>({
    queryKey: ["/api/admin/contact-messages", page, statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });
      if (statusFilter && statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      if (searchTerm) {
        params.append("search", searchTerm);
      }
      const response = await fetch(apiUrl(`/api/admin/contact-messages?${params}`), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("فشل في جلب الرسائل");
      }
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/contact-messages/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-messages"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف الرسالة بنجاح",
      });
      setMessageToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الرسالة",
        variant: "destructive",
      });
    },
  });

  const bulkMarkReadMutation = useMutation({
    mutationFn: async (payload: { ids?: string[]; all?: boolean }) => {
      return await apiRequest("/api/admin/contact-messages/bulk-mark-read", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (result: { updatedCount?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-messages"] });
      setSelectedIds(new Set());
      toast({
        title: "تم التحديث",
        description:
          result?.updatedCount != null
            ? `تم تعليم ${result.updatedCount} رسالة كمقروءة`
            : "تم تعليم الرسائل كمقروءة",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تعليم الرسائل كمقروءة",
        variant: "destructive",
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, replyText }: { id: string; replyText: string }) => {
      return await apiRequest(`/api/admin/contact-messages/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ replyText }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-messages"] });
      toast({
        title: "تم إرسال الرد",
        description: "تم إرسال الرد بنجاح وسيصل للمرسل عبر البريد الإلكتروني",
      });
      setReplyDialogOpen(false);
      setReplyText("");
      setMessageToReply(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال الرد",
        variant: "destructive",
      });
    },
  });

  const handleViewMessage = (message: ContactMessage) => {
    setLocation(`/dashboard/contact-messages/${message.id}`);
  };

  const handleOpenReplyDialog = (message: ContactMessage) => {
    setMessageToReply(message);
    setReplyText("");
    setReplyDialogOpen(true);
  };

  const handleSendReply = () => {
    if (messageToReply && replyText.trim()) {
      replyMutation.mutate({ id: messageToReply.id, replyText: replyText.trim() });
    }
  };

  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const statusCounts = data?.statusCounts ?? {
    pending: 0,
    read: 0,
    replied: 0,
    total: 0,
  };

  const displayedMessages = useMemo(() => {
    if (categoryFilter === "all") return messages;
    return messages.filter((m) => resolveMessageCategory(m) === categoryFilter);
  }, [messages, categoryFilter]);

  const pendingOnPage = useMemo(
    () => displayedMessages.filter((m) => m.status === "pending"),
    [displayedMessages],
  );

  const allPendingOnPageSelected =
    pendingOnPage.length > 0 && pendingOnPage.every((m) => selectedIds.has(m.id));

  const toggleSelectAllOnPage = () => {
    if (allPendingOnPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(pendingOnPage.map((m) => m.id)));
  };

  const toggleSelectMessage = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleMarkSelectedRead = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkMarkReadMutation.mutate({ ids });
  };

  const handleMarkAllRead = () => {
    bulkMarkReadMutation.mutate(
      { all: true },
      { onSuccess: () => setMarkAllConfirmOpen(false) },
    );
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, statusFilter, searchTerm, categoryFilter]);

  const statusTabs: Array<{
    id: StatusFilter;
    label: string;
    count: number;
    tone?: string;
    dot?: string;
  }> = [
    { id: "all", label: "الكل", count: statusCounts.total || total },
    {
      id: "pending",
      label: "غير مقروءة",
      count: statusCounts.pending,
      tone: statusTone.pending,
      dot: statusDotColors.pending,
    },
    {
      id: "read",
      label: "تمت القراءة",
      count: statusCounts.read,
      tone: statusTone.read,
      dot: statusDotColors.read,
    },
    {
      id: "replied",
      label: "تم الرد",
      count: statusCounts.replied,
      tone: statusTone.replied,
      dot: statusDotColors.replied,
    },
  ];

  const categoryTabs: Array<{ id: CategoryFilter; label: string }> = [
    { id: "all", label: "كل التصنيفات" },
    { id: "editorial", label: "تحرير وأخبار" },
    { id: "complaint", label: "شكوى أو بلاغ" },
    { id: "advertising", label: "إعلانات وشراكات" },
    { id: "technical", label: "دعم تقني" },
    { id: "suggestion", label: "اقتراح وتطوير" },
    { id: "general", label: "تواصل عام" },
  ];

  const totalCount = statusCounts.total || total;
  const replyRate =
    totalCount > 0 ? Math.round((statusCounts.replied / totalCount) * 100) : 0;

  return (
    <DashboardLayout>
      <div data-testid="contact-messages-page">
        <DashboardPageShell
          maxWidthClassName="max-w-[1400px]"
          contentClassName="px-4 pb-16 sm:px-6"
        >
          <DashboardPageHeader
            icon={MessageSquare}
            title="رسائل التواصل"
            description="صندوق رسائل الزوار والقراء — فرز ذكي حسب التصنيف والحالة ورد مباشر عبر البريد"
            titleTestId="text-contact-messages-title"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {statusCounts.pending > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    {statusCounts.pending.toLocaleString("en-US")} بانتظار المراجعة
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="no-min-touch-size h-9 gap-1.5 px-3 text-xs"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  data-testid="button-refresh-messages"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                  تحديث الصندوق
                </Button>
              </div>
            }
          />

          {/* شريط مؤشرات الأداء — 4 بطاقات KPI */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              {
                id: "all" as const,
                label: "إجمالي الرسائل",
                subtitle: "جميع الرسائل الواردة",
                value: totalCount,
                icon: Inbox,
                iconWrap: "bg-primary/10 text-primary",
                testId: "card-total-messages",
              },
              {
                id: "pending" as const,
                label: "غير مقروءة",
                subtitle: "بانتظار المراجعة والرد",
                value: statusCounts.pending,
                icon: Clock,
                iconWrap: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
                testId: "card-pending-messages",
                tone: statusTone.pending,
              },
              {
                id: "read" as const,
                label: "تمت القراءة",
                subtitle: "اطّلع عليها الفريق",
                value: statusCounts.read,
                icon: Eye,
                iconWrap: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
                testId: "card-read-messages",
                tone: statusTone.read,
              },
              {
                id: "replied" as const,
                label: "تم الرد",
                subtitle: `معدل الاستجابة ${replyRate}٪`,
                value: statusCounts.replied,
                icon: CheckCheck,
                iconWrap: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
                testId: "card-replied-messages",
                tone: statusTone.replied,
              },
            ].map((item) => {
              const Icon = item.icon;
              const selected = statusFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={item.testId}
                  onClick={() => {
                    setStatusFilter(item.id);
                    setPage(1);
                  }}
                  className={cn(
                    "no-min-touch-size group relative flex flex-col justify-between rounded-2xl border bg-card p-3.5 text-start transition-all sm:p-4",
                    selected
                      ? "ring-2 ring-primary/35 border-primary/40 bg-primary/[0.02]"
                      : "hover:border-border/80 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {item.label}
                      </p>
                      <p
                        className={cn(
                          "mt-1.5 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl",
                          item.tone,
                        )}
                      >
                        {isLoading ? "—" : item.value.toLocaleString("en-US")}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105",
                        item.iconWrap,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-2 truncate text-[11px] text-muted-foreground/80">
                    {item.subtitle}
                  </p>
                </button>
              );
            })}
          </div>

          {/* بطاقة البحث والفلاتر السريعة */}
          <div
            className="space-y-3 rounded-2xl border bg-card p-3.5 sm:p-4"
            data-testid="filters-card"
          >
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/40 p-1">
                {statusTabs.map((tab) => {
                  const active = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(tab.id);
                        setPage(1);
                      }}
                      data-testid={`filter-status-${tab.id}`}
                      className={cn(
                        "no-min-touch-size inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums transition-all",
                        active
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                        tab.tone && active && tab.tone,
                      )}
                    >
                      {tab.dot && (
                        <span className={cn("h-1.5 w-1.5 rounded-full", tab.dot)} />
                      )}
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px]",
                          active ? "bg-muted font-semibold" : "bg-background/60",
                        )}
                      >
                        {isLoading ? "—" : tab.count.toLocaleString("en-US")}
                      </span>
                    </button>
                  );
                })}
              </div>

              {!isLoading && messages.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {pendingOnPage.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="no-min-touch-size h-9 text-xs"
                      onClick={toggleSelectAllOnPage}
                      data-testid="button-select-all-page"
                    >
                      {allPendingOnPageSelected ? "إلغاء التحديد" : "تحديد الكل"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="no-min-touch-size h-9 text-xs"
                    onClick={handleMarkSelectedRead}
                    disabled={selectedIds.size === 0 || bulkMarkReadMutation.isPending}
                    data-testid="button-mark-selected-read"
                  >
                    {bulkMarkReadMutation.isPending ? (
                      <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="ms-1 h-3.5 w-3.5" />
                    )}
                    المحدد مقروءاً
                    {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="no-min-touch-size h-9 text-xs"
                    onClick={() => setMarkAllConfirmOpen(true)}
                    disabled={bulkMarkReadMutation.isPending}
                    data-testid="button-mark-all-read"
                  >
                    <CheckCheck className="ms-1 h-3.5 w-3.5" />
                    الكل مقروء
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم، البريد الإلكتروني، أو موضوع الرسالة..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 pr-10 pl-9 text-sm"
                  data-testid="input-search"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setPage(1);
                    }}
                    aria-label="مسح البحث"
                    className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground me-1">
                  <Tag className="h-3 w-3" />
                  التصنيف:
                </span>
                {categoryTabs.map((cat) => {
                  const active = categoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      data-testid={`filter-category-${cat.id}`}
                      className={cn(
                        "no-min-touch-size rounded-lg border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <section className="space-y-2.5" data-testid="messages-table-card">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">صندوق الرسائل الواردة</h2>
                {selectedIds.size > 0 && (
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    تم تحديد {selectedIds.size.toLocaleString("en-US")}
                  </span>
                )}
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {isLoading
                  ? "جاري التحميل..."
                  : `يعرض ${displayedMessages.length.toLocaleString("en-US")} من ${total.toLocaleString("en-US")}`}
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            ) : displayedMessages.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-semibold">لا توجد رسائل مطابقة</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {categoryFilter !== "all" || statusFilter !== "all" || searchTerm
                    ? "جرّب تغيير الفلتر أو مسح نص البحث لعرض جميع الرسائل"
                    : "صندوق رسائل التواصل فارغ حالياً"}
                </p>
                {(categoryFilter !== "all" || statusFilter !== "all" || searchTerm) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="no-min-touch-size mt-4 h-9 text-xs"
                    onClick={() => {
                      setStatusFilter("all");
                      setCategoryFilter("all");
                      setSearchTerm("");
                      setPage(1);
                    }}
                  >
                    إعادة ضبط الفلاتر
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div
                  className="divide-y overflow-hidden rounded-2xl border bg-card shadow-xs"
                  data-testid="messages-table"
                >
                  {displayedMessages.map((message) => {
                    const status = (message.status as ContactMessageStatus) || "pending";
                    const isPending = status === "pending";
                    const isReplied = status === "replied";
                    const categoryKey = resolveMessageCategory(message);
                    const category = categoryMeta[categoryKey];

                    return (
                      <div
                        key={message.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleViewMessage(message)}
                        onKeyDown={(e) =>
                          (e.key === "Enter" || e.key === " ") && handleViewMessage(message)
                        }
                        className={cn(
                          "group relative flex flex-col gap-3 px-3.5 py-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4",
                          isPending &&
                            "bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border-s-4 border-s-amber-500",
                          isReplied && "border-s-4 border-s-emerald-500/60",
                          !isPending && !isReplied && "border-s-4 border-s-transparent",
                        )}
                        data-testid={`message-row-${message.id}`}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div
                            className="flex shrink-0 items-center gap-2.5 pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedIds.has(message.id)}
                              disabled={!isPending}
                              onCheckedChange={(checked) =>
                                toggleSelectMessage(message.id, checked === true)
                              }
                              aria-label={`تحديد رسالة ${message.name}`}
                              data-testid={`checkbox-message-${message.id}`}
                            />
                            <div
                              className={cn(
                                "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
                                isPending
                                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {message.name ? (
                                <span>{getInitials(message.name)}</span>
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                              <span
                                className={cn(
                                  "absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                                  statusDotColors[status],
                                )}
                              />
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            {/* السطر الأول: اسم المرسل + شارات الحالة والتصنيف + التاريخ */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <h3
                                  className={cn(
                                    "truncate text-sm",
                                    isPending ? "font-bold text-foreground" : "font-semibold",
                                  )}
                                >
                                  {message.name}
                                </h3>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                                    statusColors[status],
                                  )}
                                  data-testid={`badge-status-${message.id}`}
                                >
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      statusDotColors[status],
                                    )}
                                  />
                                  {statusLabels[status]}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                                    category.badgeClass,
                                  )}
                                  data-testid={`badge-category-${message.id}`}
                                >
                                  {category.label}
                                </span>
                              </div>

                              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatDate(message.createdAt)}
                              </span>
                            </div>

                            {/* السطر الثاني: الموضوع + مقتطف الرسالة */}
                            <p
                              className={cn(
                                "line-clamp-1 text-xs sm:text-sm",
                                isPending
                                  ? "font-semibold text-foreground"
                                  : "font-medium text-foreground/90",
                              )}
                            >
                              {message.subject || "بدون عنوان"}
                            </p>
                            {message.message && (
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {message.message}
                              </p>
                            )}

                            {/* السطر الثالث: بيانات التواصل للمرسل */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px] text-muted-foreground">
                              {message.email && (
                                <span className="inline-flex items-center gap-1" dir="ltr">
                                  <Mail className="h-3 w-3 text-muted-foreground/70" />
                                  {message.email}
                                </span>
                              )}
                              {message.phone && (
                                <span className="inline-flex items-center gap-1" dir="ltr">
                                  <Phone className="h-3 w-3 text-muted-foreground/70" />
                                  {message.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* أزرار الإجراءات السريعة */}
                        <div
                          className="flex shrink-0 items-center justify-end gap-1 border-t pt-2 sm:border-t-0 sm:pt-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="no-min-touch-size h-8 gap-1 px-2.5 text-xs"
                            onClick={() => handleViewMessage(message)}
                            data-testid={`button-view-${message.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="sm:hidden lg:inline">عرض</span>
                          </Button>
                          {status !== "replied" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="no-min-touch-size h-8 gap-1 px-2.5 text-xs text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-400"
                              onClick={() => handleOpenReplyDialog(message)}
                              disabled={replyMutation.isPending}
                              data-testid={`button-reply-${message.id}`}
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span className="sm:hidden lg:inline">رد</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="no-min-touch-size h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setMessageToDelete(message)}
                            data-testid={`button-delete-${message.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-1" dir="rtl">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      صفحة {page.toLocaleString("en-US")} من {totalPages.toLocaleString("en-US")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="no-min-touch-size h-9"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        data-testid="button-next-page"
                      >
                        التالي
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="no-min-touch-size h-9"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                        السابق
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <AlertDialog open={markAllConfirmOpen} onOpenChange={setMarkAllConfirmOpen}>
            <AlertDialogContent dir="rtl" data-testid="mark-all-read-confirm-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-right">جعل كل الرسائل مقروءة؟</AlertDialogTitle>
                <AlertDialogDescription className="text-right">
                  سيتم تعليم جميع الرسائل غير المقروءة كمقروءة في النظام. لن تتأثر الرسائل التي تم
                  الرد عليها.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel data-testid="button-cancel-mark-all-read">إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleMarkAllRead}
                  disabled={bulkMarkReadMutation.isPending}
                  data-testid="button-confirm-mark-all-read"
                >
                  {bulkMarkReadMutation.isPending ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCheck className="me-2 h-4 w-4" />
                  )}
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={!!messageToDelete} onOpenChange={() => setMessageToDelete(null)}>
            <AlertDialogContent dir="rtl" data-testid="delete-confirm-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-right">هل أنت متأكد من الحذف؟</AlertDialogTitle>
                <AlertDialogDescription className="text-right">
                  سيتم حذف رسالة "{messageToDelete?.name}" نهائياً. لا يمكن التراجع عن هذا الإجراء.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => messageToDelete && deleteMutation.mutate(messageToDelete.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteMutation.isPending}
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="me-2 h-4 w-4" />
                  )}
                  حذف
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog
            open={replyDialogOpen}
            onOpenChange={(open) => {
              setReplyDialogOpen(open);
              if (!open) {
                setReplyText("");
                setMessageToReply(null);
              }
            }}
          >
            <DialogContent className="max-w-2xl" dir="rtl" data-testid="reply-dialog">
              <DialogHeader className="text-right">
                <DialogTitle className="flex items-center justify-end gap-2">
                  <span>الرد على الرسالة</span>
                  <Send className="h-5 w-5" />
                </DialogTitle>
                <DialogDescription>
                  سيتم إرسال ردك إلى البريد الإلكتروني للمرسل
                </DialogDescription>
              </DialogHeader>
              {messageToReply && (
                <div className="space-y-4">
                  <div className="space-y-3 rounded-xl border bg-muted/50 p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground">
                      معلومات الرسالة الأصلية
                    </h4>
                    <div className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">الاسم: </span>
                        <span className="font-medium" data-testid="reply-dialog-name">
                          {messageToReply.name}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">البريد: </span>
                        <span className="font-medium" dir="ltr" data-testid="reply-dialog-email">
                          {messageToReply.email}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">الموضوع: </span>
                        <span className="font-medium" data-testid="reply-dialog-subject">
                          {messageToReply.subject}
                        </span>
                      </div>
                    </div>
                    <div className="border-t pt-2.5">
                      <span className="text-xs text-muted-foreground">الرسالة: </span>
                      <p
                        className="mt-1 whitespace-pre-wrap text-sm leading-relaxed"
                        data-testid="reply-dialog-message"
                      >
                        {messageToReply.message}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">نص الرد</label>
                    <Textarea
                      placeholder="اكتب مضمون ردك باختصار… ثم اضغط «توليد الرد»"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="min-h-[150px] resize-none"
                      data-testid="input-reply-text"
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      className="h-10"
                      onClick={() => {
                        setReplyDialogOpen(false);
                        setReplyText("");
                        setMessageToReply(null);
                      }}
                      disabled={replyMutation.isPending}
                      data-testid="button-cancel-reply"
                    >
                      إلغاء
                    </Button>
                    <PolishReplyButton
                      draft={replyText}
                      channel="contact_message"
                      recipientName={messageToReply.name}
                      subject={messageToReply.subject}
                      originalMessage={messageToReply.message}
                      onPolished={setReplyText}
                      disabled={replyMutation.isPending}
                    />
                    <Button
                      className="h-10"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || replyMutation.isPending}
                      data-testid="button-send-reply"
                    >
                      {replyMutation.isPending ? (
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="me-2 h-4 w-4" />
                      )}
                      إرسال الرد
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </DashboardPageShell>
      </div>
    </DashboardLayout>
  );
}

