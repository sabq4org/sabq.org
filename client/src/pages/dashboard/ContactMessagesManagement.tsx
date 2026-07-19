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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { PolishReplyButton } from "@/components/ai/PolishReplyButton";
import type { ContactMessage } from "@shared/schema";
import { cn } from "@/lib/utils";

type ContactMessageStatus = "pending" | "read" | "replied";
type StatusFilter = "all" | ContactMessageStatus;

const statusColors: Record<ContactMessageStatus, string> = {
  pending:
    "bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-400/40",
  read:
    "bg-sky-100 text-sky-950 border-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:border-sky-400/40",
  replied:
    "bg-emerald-100 text-emerald-950 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-400/40",
};

const statusLabels: Record<ContactMessageStatus, string> = {
  pending: "قيد الانتظار",
  read: "تم القراءة",
  replied: "تم الرد",
};

const statusTone: Record<ContactMessageStatus, string> = {
  pending: "text-amber-700 dark:text-amber-300",
  read: "text-sky-700 dark:text-sky-300",
  replied: "text-emerald-700 dark:text-emerald-300",
};

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ContactMessagesManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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

  const { data, isLoading } = useQuery<{
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

  const pendingOnPage = useMemo(
    () => messages.filter((m) => m.status === "pending"),
    [messages],
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
  }, [page, statusFilter, searchTerm]);

  const statusTabs: Array<{
    id: StatusFilter;
    label: string;
    count: number;
    tone?: string;
  }> = [
    { id: "all", label: "الكل", count: statusCounts.total || total },
    {
      id: "pending",
      label: "قيد الانتظار",
      count: statusCounts.pending,
      tone: statusTone.pending,
    },
    {
      id: "read",
      label: "مقروءة",
      count: statusCounts.read,
      tone: statusTone.read,
    },
    {
      id: "replied",
      label: "تم الرد",
      count: statusCounts.replied,
      tone: statusTone.replied,
    },
  ];

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
            description="صندوق رسائل الزوار — فرز سريع ورد بالبريد"
            titleTestId="text-contact-messages-title"
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                id: "all" as const,
                label: "الإجمالي",
                value: statusCounts.total || total,
                icon: Inbox,
                testId: "card-total-messages",
              },
              {
                id: "pending" as const,
                label: "قيد الانتظار",
                value: statusCounts.pending,
                icon: Clock,
                testId: "card-pending-messages",
                tone: statusTone.pending,
              },
              {
                id: "read" as const,
                label: "تمت القراءة",
                value: statusCounts.read,
                icon: Eye,
                testId: "card-read-messages",
                tone: statusTone.read,
              },
              {
                id: "replied" as const,
                label: "تم الرد",
                value: statusCounts.replied,
                icon: CheckCheck,
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
                    "rounded-xl border bg-card px-3 py-2.5 text-start transition-all",
                    selected && "ring-2 ring-primary/35 border-primary/30",
                    !selected && "hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-bold tabular-nums tracking-tight",
                      item.tone,
                    )}
                  >
                    {isLoading ? "—" : item.value.toLocaleString("en-US")}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4" data-testid="filters-card">
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/40 p-1">
              {statusTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
                    statusFilter === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    tab.tone && statusFilter === tab.id && tab.tone,
                  )}
                >
                  {tab.label} ({isLoading ? "—" : tab.count.toLocaleString("en-US")})
                </button>
              ))}
            </div>

            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو البريد..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 pr-10"
                  data-testid="input-search"
                />
              </div>
              {!isLoading && messages.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {pendingOnPage.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={toggleSelectAllOnPage}
                      data-testid="button-select-all-page"
                    >
                      {allPendingOnPageSelected ? "إلغاء التحديد" : "تحديد الكل"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10"
                    onClick={handleMarkSelectedRead}
                    disabled={selectedIds.size === 0 || bulkMarkReadMutation.isPending}
                    data-testid="button-mark-selected-read"
                  >
                    {bulkMarkReadMutation.isPending ? (
                      <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="ms-1 h-4 w-4" />
                    )}
                    المحدد مقروءاً
                    {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </Button>
                  <Button
                    type="button"
                    className="h-10"
                    onClick={() => setMarkAllConfirmOpen(true)}
                    disabled={bulkMarkReadMutation.isPending}
                    data-testid="button-mark-all-read"
                  >
                    <CheckCheck className="ms-1 h-4 w-4" />
                    الكل مقروء
                  </Button>
                </div>
              )}
            </div>
          </div>

          <section className="space-y-2" data-testid="messages-table-card">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h2 className="text-sm font-semibold">قائمة الرسائل</h2>
              <p className="text-xs tabular-nums text-muted-foreground">
                {isLoading
                  ? "جاري التحميل..."
                  : `${messages.length.toLocaleString("en-US")} من ${total.toLocaleString("en-US")}`}
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 py-12 text-center">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">لا توجد رسائل</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  لا نتائج مطابقة للفلتر الحالي
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border bg-card" data-testid="messages-table">
                  {messages.map((message, idx) => {
                    const status = (message.status as ContactMessageStatus) || "pending";
                    const isPending = status === "pending";
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
                          "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 sm:px-4",
                          idx !== messages.length - 1 && "border-b",
                          isPending && "bg-amber-50/40 dark:bg-amber-500/5",
                        )}
                        data-testid={`message-row-${message.id}`}
                      >
                        <div
                          className="flex items-center gap-2"
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
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-sm font-semibold">{message.name}</h3>
                            <span
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                                statusColors[status],
                              )}
                              data-testid={`badge-status-${message.id}`}
                            >
                              {statusLabels[status]}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/80">{message.subject}</span>
                            <span className="mx-1 opacity-40">·</span>
                            <span dir="ltr">{message.email}</span>
                            {message.phone ? (
                              <>
                                <span className="mx-1 opacity-40">·</span>
                                <span dir="ltr">{message.phone}</span>
                              </>
                            ) : null}
                            <span className="mx-1 opacity-40">·</span>
                            <span className="tabular-nums">{formatDate(message.createdAt)}</span>
                          </p>
                        </div>

                        <div
                          className="flex shrink-0 items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewMessage(message)}
                            data-testid={`button-view-${message.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {status !== "replied" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenReplyDialog(message)}
                              disabled={replyMutation.isPending}
                              data-testid={`button-reply-${message.id}`}
                            >
                              <Send className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setMessageToDelete(message)}
                            data-testid={`button-delete-${message.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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
                        className="h-9"
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
                        className="h-9"
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
                  سيتم تعليم جميع الرسائل «قيد الانتظار» كمقروءة في النظام. لن تتأثر الرسائل التي تم
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
                  <div className="space-y-3 rounded-lg bg-muted p-4">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      معلومات الرسالة الأصلية
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
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
                      <div className="col-span-2">
                        <span className="text-muted-foreground">الموضوع: </span>
                        <span className="font-medium" data-testid="reply-dialog-subject">
                          {messageToReply.subject}
                        </span>
                      </div>
                    </div>
                    <div className="border-t pt-2">
                      <span className="text-sm text-muted-foreground">الرسالة: </span>
                      <p
                        className="mt-1 whitespace-pre-wrap text-sm"
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
