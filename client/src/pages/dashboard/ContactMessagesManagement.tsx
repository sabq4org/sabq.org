import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import type { ContactMessage } from "@shared/schema";

type ContactMessageStatus = "pending" | "read" | "replied";

const statusColors: Record<ContactMessageStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  read: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  replied: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
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
      const response = await fetch(`/api/admin/contact-messages?${params}`, {
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

  const messages = data?.messages || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6" dir="rtl" data-testid="contact-messages-page">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-end gap-3 mb-2">
            <div className="text-right">
              <h1 className="text-3xl font-bold">رسائل التواصل</h1>
              <p className="text-muted-foreground">إدارة رسائل الزوار والتواصل</p>
            </div>
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card data-testid="filters-card">
            <CardHeader className="text-right">
              <CardTitle className="flex items-center justify-end gap-2">
                <span>البحث والتصفية</span>
                <Search className="h-5 w-5" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
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
                    <SelectValue placeholder="تصفية حسب الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="pending">قيد الانتظار</SelectItem>
                    <SelectItem value="read">تم القراءة</SelectItem>
                    <SelectItem value="replied">تم الرد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card data-testid="messages-table-card">
            <CardHeader className="text-right">
              <CardTitle>الرسائل</CardTitle>
              <CardDescription>
                {isLoading ? "جاري التحميل..." : `عرض ${messages.length} من ${total} رسالة`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton />
              ) : messages.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="rounded-md border" dir="rtl">
                    <Table data-testid="messages-table">
                      <TableHeader>
                        <TableRow>
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
                          return (
                            <TableRow
                              key={message.id}
                              className="cursor-pointer hover-elevate"
                              onClick={() => handleViewMessage(message)}
                              data-testid={`message-row-${message.id}`}
                            >
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
                                  className={statusColors[message.status as ContactMessageStatus]}
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
            </CardContent>
          </Card>
        </motion.div>

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
