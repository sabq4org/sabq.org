import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  MessageSquare,
  Search,
  Eye,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Calendar,
  User,
  FileText,
  Clock,
  Send,
  Inbox,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { ContactMessage } from "@shared/schema";
import { cn } from "@/lib/utils";

type ContactMessageStatus = "pending" | "read" | "replied";

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

const statusIcons: Record<ContactMessageStatus, typeof Clock> = {
  pending: Clock,
  read: Eye,
  replied: CheckCheck,
};

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return format(new Date(date), "d MMMM yyyy - HH:mm", { locale: ar });
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-primary/10 p-6 mb-4">
          <MessageSquare className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">لا توجد رسائل</h3>
        <p className="text-muted-foreground text-center max-w-md">
          لم يتم استلام أي رسائل تواصل بعد
        </p>
      </CardContent>
    </Card>
  );
}

export default function ContactMessagesManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [messageToDelete, setMessageToDelete] = useState<ContactMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return await apiRequest(`/api/admin/contact-messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-messages"] });
      toast({
        title: "تم تحديث الحالة",
        description: "تم تحديث حالة الرسالة بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الحالة",
        variant: "destructive",
      });
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

  const counts = {
    total,
    pending: messages.filter((m) => m.status === "pending").length,
    read: messages.filter((m) => m.status === "read").length,
    replied: messages.filter((m) => m.status === "replied").length,
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl" data-testid="contact-messages-page">
        <DashboardPageHeader
          icon={MessageSquare}
          title="رسائل التواصل"
          description="إدارة رسائل الزوار والرد عليها"
        />

        {/* Stats overview */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="card-total-messages">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Inbox className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الإجمالي</p>
                    <p className="text-2xl font-bold">{counts.total.toLocaleString("en-US")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-pending-messages">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/20">
                    <Clock className="h-5 w-5 text-amber-800 dark:text-amber-200" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">قيد الانتظار</p>
                    <p className="text-2xl font-bold text-foreground">{counts.pending.toLocaleString("en-US")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-read-messages">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-500/20">
                    <Eye className="h-5 w-5 text-sky-800 dark:text-sky-200" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">تمت القراءة</p>
                    <p className="text-2xl font-bold text-foreground">{counts.read.toLocaleString("en-US")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-replied-messages">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
                    <CheckCheck className="h-5 w-5 text-emerald-800 dark:text-emerald-200" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">تم الرد</p>
                    <p className="text-2xl font-bold text-foreground">{counts.replied.toLocaleString("en-US")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-[1fr_220px]" data-testid="filters-card">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="بحث بالاسم أو البريد..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="pr-10"
              data-testid="input-search"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger data-testid="select-status-filter">
              <SelectValue placeholder="جميع الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="read">تم القراءة</SelectItem>
              <SelectItem value="replied">تم الرد</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div data-testid="messages-table-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">قائمة الرسائل</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLoading ? "جاري التحميل..." : `عرض ${messages.length} من ${total}`}
              </p>
            </div>
            {!isLoading && messages.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {pendingOnPage.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAllOnPage}
                    data-testid="button-select-all-page"
                  >
                    {allPendingOnPageSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleMarkSelectedRead}
                  disabled={selectedIds.size === 0 || bulkMarkReadMutation.isPending}
                  data-testid="button-mark-selected-read"
                >
                  {bulkMarkReadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin ms-1" />
                  ) : (
                    <Check className="h-4 w-4 ms-1" />
                  )}
                  جعل المحدد مقروءاً
                  {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setMarkAllConfirmOpen(true)}
                  disabled={bulkMarkReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  <CheckCheck className="h-4 w-4 ms-1" />
                  جعل الكل مقروء
                </Button>
              </div>
            )}
          </div>
          <div>
              {isLoading ? (
                <TableSkeleton />
              ) : messages.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border bg-card" dir="rtl">
                    <Table data-testid="messages-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10 text-center">
                            <Checkbox
                              checked={
                                pendingOnPage.length > 0 && allPendingOnPageSelected
                              }
                              onCheckedChange={() => toggleSelectAllOnPage()}
                              disabled={pendingOnPage.length === 0}
                              aria-label="تحديد كل الرسائل قيد الانتظار في الصفحة"
                              data-testid="checkbox-select-all"
                            />
                          </TableHead>
                          <TableHead className="text-right">الاسم</TableHead>
                          <TableHead className="text-right">البريد</TableHead>
                          <TableHead className="text-right">الهاتف</TableHead>
                          <TableHead className="text-right">الموضوع</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {messages.map((message) => {
                          const StatusIcon = statusIcons[message.status as ContactMessageStatus] || Clock;
                          const isPending = message.status === "pending";
                          return (
                            <TableRow
                              key={message.id}
                              className="cursor-pointer hover-elevate"
                              onClick={() => handleViewMessage(message)}
                              data-testid={`message-row-${message.id}`}
                            >
                              <TableCell
                                className="w-10 text-center"
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
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2 flex-row-reverse justify-end">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  {message.name}
                                </div>
                              </TableCell>
                              <TableCell dir="ltr" className="text-right">
                                {message.email}
                              </TableCell>
                              <TableCell dir="ltr" className="text-right">
                                {message.phone}
                              </TableCell>
                              <TableCell>{message.subject}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "font-medium",
                                    statusColors[message.status as ContactMessageStatus],
                                  )}
                                  data-testid={`badge-status-${message.id}`}
                                >
                                  <StatusIcon className="h-3 w-3 ms-1" />
                                  {statusLabels[message.status as ContactMessageStatus]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {formatDate(message.createdAt)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleViewMessage(message)}
                                    data-testid={`button-view-${message.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {message.status !== "replied" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleOpenReplyDialog(message)}
                                      disabled={replyMutation.isPending}
                                      data-testid={`button-reply-${message.id}`}
                                    >
                                      <Send className="h-4 w-4 text-green-600" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setMessageToDelete(message)}
                                    data-testid={`button-delete-${message.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4" dir="rtl">
                      <p className="text-sm text-muted-foreground">
                        صفحة {page} من {totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
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
          </div>
        </div>

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl" dir="rtl" data-testid="message-details-dialog">
            <DialogHeader className="text-right">
              <DialogTitle className="flex items-center justify-end gap-2">
                <span>تفاصيل الرسالة</span>
                <MessageSquare className="h-5 w-5" />
              </DialogTitle>
              <DialogDescription>
                عرض كامل لمحتوى الرسالة والمعلومات المرتبطة
              </DialogDescription>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-row-reverse justify-end">
                      <User className="h-4 w-4" />
                      <span>الاسم</span>
                    </div>
                    <p className="font-medium" data-testid="detail-name">{selectedMessage.name}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-row-reverse justify-end">
                      <Mail className="h-4 w-4" />
                      <span>البريد الإلكتروني</span>
                    </div>
                    <p className="font-medium" dir="ltr" data-testid="detail-email">{selectedMessage.email}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-row-reverse justify-end">
                      <Phone className="h-4 w-4" />
                      <span>رقم الهاتف</span>
                    </div>
                    <p className="font-medium" dir="ltr" data-testid="detail-phone">{selectedMessage.phone}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-row-reverse justify-end">
                      <FileText className="h-4 w-4" />
                      <span>الموضوع</span>
                    </div>
                    <p className="font-medium" data-testid="detail-subject">{selectedMessage.subject}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-row-reverse justify-end">
                      <Calendar className="h-4 w-4" />
                      <span>تاريخ الإرسال</span>
                    </div>
                    <p className="font-medium" data-testid="detail-date">{formatDate(selectedMessage.createdAt)}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-row-reverse justify-end">
                      <Check className="h-4 w-4" />
                      <span>الحالة</span>
                    </div>
                    <Badge
                      className={statusColors[selectedMessage.status as ContactMessageStatus]}
                      data-testid="detail-status"
                    >
                      {statusLabels[selectedMessage.status as ContactMessageStatus]}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground flex-row-reverse justify-end">
                    <MessageSquare className="h-4 w-4" />
                    <span>نص الرسالة</span>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="whitespace-pre-wrap" data-testid="detail-message">{selectedMessage.message}</p>
                  </div>
                </div>

                {selectedMessage.repliedAt && (
                  <div className="text-sm text-muted-foreground border-t pt-4">
                    تم الرد بتاريخ: {formatDate(selectedMessage.repliedAt)}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t">
                  {selectedMessage.status !== "replied" && (
                    <Button
                      onClick={() => {
                        setDetailsOpen(false);
                        handleOpenReplyDialog(selectedMessage);
                      }}
                      disabled={replyMutation.isPending}
                      data-testid="button-dialog-reply"
                    >
                      {replyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin me-2" />
                      ) : (
                        <Send className="h-4 w-4 me-2" />
                      )}
                      إرسال رد
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDetailsOpen(false);
                      setMessageToDelete(selectedMessage);
                    }}
                    data-testid="button-dialog-delete"
                  >
                    <Trash2 className="h-4 w-4 me-2" />
                    حذف
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={markAllConfirmOpen} onOpenChange={setMarkAllConfirmOpen}>
          <AlertDialogContent dir="rtl" data-testid="mark-all-read-confirm-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-right">جعل كل الرسائل مقروءة؟</AlertDialogTitle>
              <AlertDialogDescription className="text-right">
                سيتم تعليم جميع الرسائل «قيد الانتظار» كمقروءة في النظام. لن تتأثر الرسائل التي تم الرد عليها.
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
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                ) : (
                  <CheckCheck className="h-4 w-4 me-2" />
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
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                ) : (
                  <Trash2 className="h-4 w-4 me-2" />
                )}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={replyDialogOpen} onOpenChange={(open) => {
          setReplyDialogOpen(open);
          if (!open) {
            setReplyText("");
            setMessageToReply(null);
          }
        }}>
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
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground">معلومات الرسالة الأصلية</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">الاسم: </span>
                      <span className="font-medium" data-testid="reply-dialog-name">{messageToReply.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">البريد: </span>
                      <span className="font-medium" dir="ltr" data-testid="reply-dialog-email">{messageToReply.email}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">الموضوع: </span>
                      <span className="font-medium" data-testid="reply-dialog-subject">{messageToReply.subject}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground text-sm">الرسالة: </span>
                    <p className="mt-1 text-sm whitespace-pre-wrap" data-testid="reply-dialog-message">{messageToReply.message}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">نص الرد</label>
                  <Textarea
                    placeholder="اكتب ردك هنا..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="min-h-[150px] resize-none"
                    data-testid="input-reply-text"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
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
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    data-testid="button-send-reply"
                  >
                    {replyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin me-2" />
                    ) : (
                      <Send className="h-4 w-4 me-2" />
                    )}
                    إرسال الرد
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
