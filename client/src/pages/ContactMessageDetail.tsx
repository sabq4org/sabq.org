import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  Mail,
  Phone,
  User,
  FileText,
  Clock,
  Eye,
  CheckCheck,
  Trash2,
  Loader2,
  Send,
  Edit2,
  Paperclip,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import type { ContactMessage, ContactMessageReply } from "@shared/schema";

type ContactMessageStatus = "pending" | "read" | "replied";

interface MessageReplyWithUser extends ContactMessageReply {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
}

interface MessageWithReplies extends ContactMessage {
  replies: MessageReplyWithUser[];
}

const statusColors: Record<ContactMessageStatus, string> = {
  pending:
    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-400/40",
  read:
    "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:border-sky-400/40",
  replied:
    "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-400/40",
};

type AttachmentItem = { url: string; name: string; type?: string };

/** Normalize attachments — schema is string[], form saves {url,name,type}[] */
function parseAttachments(attachments: unknown): AttachmentItem[] {
  if (!attachments) return [];

  let raw: unknown = attachments;
  if (typeof attachments === "string") {
    try {
      raw = JSON.parse(attachments);
    } catch {
      return attachments.trim()
        ? [{ url: attachments, name: attachments.split("/").pop() || "مرفق" }]
        : [];
    }
  }

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): AttachmentItem | null => {
      if (typeof item === "string") {
        const url = item.trim();
        if (!url) return null;
        return { url, name: url.split("/").pop() || "مرفق" };
      }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const url = typeof obj.url === "string" ? obj.url : "";
        if (!url) return null;
        const name =
          typeof obj.name === "string" && obj.name.trim()
            ? obj.name
            : url.split("/").pop() || "مرفق";
        const type = typeof obj.type === "string" ? obj.type : undefined;
        return { url, name, type };
      }
      return null;
    })
    .filter((item): item is AttachmentItem => item !== null);
}

function isImageAttachment(attachment: AttachmentItem) {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];
  const url = (attachment.url || "").toLowerCase();
  const name = (attachment.name || "").toLowerCase();
  const type = (attachment.type || "").toLowerCase();

  return (
    type.startsWith("image/") ||
    imageExtensions.some((ext) => url.endsWith(ext) || name.endsWith(ext) || url.includes(ext + "?"))
  );
}

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

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ContactMessageDetail() {
  const [, routeParams] = useRoute("/dashboard/contact-messages/:id");
  const id = routeParams?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReplyDialogOpen, setDeleteReplyDialogOpen] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState("");
  const [newReplyText, setNewReplyText] = useState("");
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);

  useEffect(() => {
    document.title = "تفاصيل الرسالة - لوحة التحكم";
  }, []);

  // Fetch message with replies
  const { data: message, isLoading, error, isError } = useQuery<MessageWithReplies>({
    queryKey: ["/api/contact-messages", id, "full"],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/contact-messages/${id}/full`), {
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "فشل في جلب تفاصيل الرسالة");
      }
      return response.json();
    },
    enabled: !!id,
    retry: false,
  });

  // Fetch all messages for navigation
  const { data: messagesData } = useQuery<{
    messages: ContactMessage[];
    total: number;
  }>({
    queryKey: ["/api/admin/contact-messages", 1, "all", ""],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/admin/contact-messages?limit=100`), {
        credentials: "include",
      });
      if (!response.ok) return { messages: [], total: 0 };
      return response.json();
    },
  });

  // Find current index for navigation
  const allMessages = messagesData?.messages || [];
  const currentIndex = allMessages.findIndex((m) => m.id === id);
  const prevMessage = currentIndex > 0 ? allMessages[currentIndex - 1] : null;
  const nextMessage = currentIndex < allMessages.length - 1 ? allMessages[currentIndex + 1] : null;

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      return await apiRequest(`/api/admin/contact-messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-messages", id, "full"] });
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

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
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
      setLocation("/dashboard/contact-messages");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الرسالة",
        variant: "destructive",
      });
    },
  });

  // Send new reply mutation
  const sendReplyMutation = useMutation({
    mutationFn: async ({ replyText }: { replyText: string }) => {
      return await apiRequest(`/api/contact-messages/${id}/replies`, {
        method: "POST",
        body: JSON.stringify({ replyText }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-messages", id, "full"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-messages"] });
      toast({
        title: "تم إرسال الرد",
        description: "تم إرسال الرد بنجاح",
      });
      setNewReplyText("");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال الرد",
        variant: "destructive",
      });
    },
  });

  // Edit reply mutation
  const editReplyMutation = useMutation({
    mutationFn: async ({ replyId, replyText }: { replyId: string; replyText: string }) => {
      return await apiRequest(`/api/contact-messages/replies/${replyId}`, {
        method: "PATCH",
        body: JSON.stringify({ replyText }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-messages", id, "full"] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث الرد بنجاح",
      });
      setEditingReplyId(null);
      setEditReplyText("");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الرد",
        variant: "destructive",
      });
    },
  });

  // Delete reply mutation
  const deleteReplyMutation = useMutation({
    mutationFn: async (replyId: string) => {
      return await apiRequest(`/api/contact-messages/replies/${replyId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-messages", id, "full"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-messages"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف الرد بنجاح",
      });
      setDeleteReplyDialogOpen(false);
      setReplyToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الرد",
        variant: "destructive",
      });
    },
  });

  const handleMarkAsRead = () => {
    if (message?.status === "pending") {
      updateStatusMutation.mutate({ status: "read" });
    }
  };

  const handleSendReply = () => {
    if (newReplyText.trim()) {
      sendReplyMutation.mutate({ replyText: newReplyText.trim() });
    }
  };

  const handleStartEditReply = (reply: MessageReplyWithUser) => {
    setEditingReplyId(reply.id);
    setEditReplyText(reply.replyText);
  };

  const handleSaveEditReply = () => {
    if (editingReplyId && editReplyText.trim()) {
      editReplyMutation.mutate({ replyId: editingReplyId, replyText: editReplyText.trim() });
    }
  };

  const handleCancelEdit = () => {
    setEditingReplyId(null);
    setEditReplyText("");
  };

  const handleOpenDeleteReplyDialog = (replyId: string) => {
    setReplyToDelete(replyId);
    setDeleteReplyDialogOpen(true);
  };

  const handleConfirmDeleteReply = () => {
    if (replyToDelete) {
      deleteReplyMutation.mutate(replyToDelete);
    }
  };

  const getUserDisplayName = (user: MessageReplyWithUser["user"]) => {
    if (!user) return "مدير";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return fullName || "مدير";
  };

  const getUserInitials = (user: MessageReplyWithUser["user"]) => {
    if (!user) return "م";
    const first = user.firstName?.charAt(0) || "";
    const last = user.lastName?.charAt(0) || "";
    return first + last || "م";
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 md:p-6" dir="rtl">
          <LoadingSkeleton />
        </div>
      </DashboardLayout>
    );
  }

  if (!id || isError || error || !message) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 md:p-6" dir="rtl" data-testid="message-not-found">
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-destructive/15 p-6 mb-4">
                <MessageSquare className="h-12 w-12 text-destructive" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">
                {!id ? "معرّف الرسالة غير صالح" : "تعذر تحميل الرسالة"}
              </h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {(error as Error)?.message || "لم يتم العثور على الرسالة المطلوبة أو لا تملك صلاحية عرضها"}
              </p>
              <Button onClick={() => setLocation("/dashboard/contact-messages")} data-testid="button-back-to-list">
                <ArrowRight className="h-4 w-4 ml-2" />
                العودة للقائمة
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const StatusIcon = statusIcons[message.status as ContactMessageStatus] || Clock;
  const attachments = parseAttachments((message as { attachments?: unknown }).attachments);
  const replies = Array.isArray(message.replies) ? message.replies : [];

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-5" dir="rtl" data-testid="contact-message-detail-page">
        {/* Header with navigation */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation("/dashboard/contact-messages")}
              className="gap-2 text-foreground"
              data-testid="button-back"
            >
              <ArrowRight className="h-4 w-4" />
              العودة للقائمة
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => nextMessage && setLocation(`/dashboard/contact-messages/${nextMessage.id}`)}
                disabled={!nextMessage}
                data-testid="button-next-message"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-foreground/80">
                {currentIndex >= 0 ? currentIndex + 1 : "—"} من {allMessages.length || "—"}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => prevMessage && setLocation(`/dashboard/contact-messages/${prevMessage.id}`)}
                disabled={!prevMessage}
                data-testid="button-prev-message"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Message Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <Card className="border-border/80 shadow-sm overflow-hidden" data-testid="message-header-card">
            <div className="h-1.5 bg-gradient-to-l from-emerald-600 via-teal-500 to-cyan-500" />
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-emerald-600 shrink-0">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-xl text-foreground leading-snug">{message.subject}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(message.createdAt)}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn("shrink-0 font-medium", statusColors[message.status as ContactMessageStatus])}
                data-testid="badge-status"
              >
                <StatusIcon className="h-3 w-3 ml-1" />
                {statusLabels[message.status as ContactMessageStatus] || message.status}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl bg-muted/60 dark:bg-muted/30 p-4 border border-border/60">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span>الاسم</span>
                  </div>
                  <p className="font-semibold text-foreground" data-testid="text-sender-name">{message.name}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <span>البريد الإلكتروني</span>
                  </div>
                  <p className="font-semibold" dir="ltr" data-testid="text-sender-email">
                    <a href={`mailto:${message.email}`} className="text-sky-700 dark:text-sky-300 hover:underline">
                      {message.email}
                    </a>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>رقم الهاتف</span>
                  </div>
                  <p className="font-semibold" dir="ltr" data-testid="text-sender-phone">
                    <a href={`tel:${message.phone}`} className="text-sky-700 dark:text-sky-300 hover:underline">
                      {message.phone}
                    </a>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border/70 flex-wrap">
                {message.status === "pending" && (
                  <Button
                    variant="outline"
                    onClick={handleMarkAsRead}
                    disabled={updateStatusMutation.isPending}
                    className="border-sky-300 text-sky-800 hover:bg-sky-50 dark:border-sky-500/40 dark:text-sky-200 dark:hover:bg-sky-500/10"
                    data-testid="button-mark-read"
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Eye className="h-4 w-4 ml-2" />
                    )}
                    تحديد كمقروءة
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  data-testid="button-delete-message"
                >
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف الرسالة
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Original Message Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          <Card className="border-border/80 shadow-sm" data-testid="original-message-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <FileText className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                نص الرسالة الأصلية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-xl bg-background border border-border leading-relaxed">
                <p className="whitespace-pre-wrap text-foreground text-[15px]" data-testid="text-original-message">
                  {message.message}
                </p>
              </div>

              {attachments.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                    <Paperclip className="h-4 w-4" />
                    <span>المرفقات ({attachments.length})</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {attachments.map((attachment, index) => (
                      <div
                        key={`${attachment.url}-${index}`}
                        className="relative group rounded-xl overflow-hidden border border-border bg-muted/40 cursor-pointer hover:border-emerald-500/50 transition-colors"
                        onClick={() => isImageAttachment(attachment) && setFullImageUrl(attachment.url)}
                        data-testid={`attachment-${index}`}
                      >
                        {isImageAttachment(attachment) ? (
                          <div className="aspect-square">
                            <img
                              src={attachment.url}
                              alt={attachment.name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        ) : (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="aspect-square flex flex-col items-center justify-center p-3"
                          >
                            <Paperclip className="h-8 w-8 text-foreground/70 mb-2" />
                            <span className="text-xs text-center line-clamp-2 text-foreground">
                              {attachment.name}
                            </span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Threaded Replies Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <Card className="border-border/80 shadow-sm" data-testid="replies-section-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <MessageSquare className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                الردود ({replies.length + (message.replyText ? 1 : 0)})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {message.replyText && (
                <div
                  className="p-4 rounded-xl border border-emerald-300/70 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-400/30"
                  data-testid="legacy-reply"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <CheckCheck className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-emerald-900 dark:text-emerald-100">الرد الرسمي</span>
                        {message.repliedAt && (
                          <span className="text-sm text-muted-foreground">
                            {formatDate(message.repliedAt)}
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-2 text-foreground whitespace-pre-wrap leading-relaxed"
                        data-testid="text-legacy-reply"
                      >
                        {message.replyText}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {replies.length === 0 && !message.replyText ? (
                <p className="text-muted-foreground text-center py-8" data-testid="text-no-replies">
                  لا توجد ردود حتى الآن
                </p>
              ) : replies.length > 0 ? (
                <div className="space-y-3">
                  {replies.map((reply) => (
                    <div
                      key={reply.id}
                      className="p-4 rounded-xl border border-border bg-card"
                      data-testid={`reply-${reply.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Avatar className="h-10 w-10 border border-border">
                            <AvatarImage src={reply.user?.profileImageUrl || undefined} />
                            <AvatarFallback className="bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100">
                              {getUserInitials(reply.user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground" data-testid={`text-reply-author-${reply.id}`}>
                                {getUserDisplayName(reply.user)}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatDate(reply.createdAt)}
                              </span>
                              {reply.isEdited && (
                                <Badge variant="outline" className="text-xs" data-testid={`badge-edited-${reply.id}`}>
                                  تم التعديل
                                </Badge>
                              )}
                            </div>

                            {editingReplyId === reply.id ? (
                              <div className="mt-3 space-y-3">
                                <Textarea
                                  value={editReplyText}
                                  onChange={(e) => setEditReplyText(e.target.value)}
                                  className="min-h-[100px]"
                                  data-testid={`textarea-edit-reply-${reply.id}`}
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={handleSaveEditReply}
                                    disabled={editReplyMutation.isPending || !editReplyText.trim()}
                                    data-testid={`button-save-edit-${reply.id}`}
                                  >
                                    {editReplyMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin ml-1" />
                                    ) : null}
                                    حفظ
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelEdit}
                                    data-testid={`button-cancel-edit-${reply.id}`}
                                  >
                                    إلغاء
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p
                                className="mt-2 text-foreground whitespace-pre-wrap leading-relaxed"
                                data-testid={`text-reply-content-${reply.id}`}
                              >
                                {reply.replyText}
                              </p>
                            )}
                          </div>
                        </div>

                        {editingReplyId !== reply.id && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleStartEditReply(reply)}
                              data-testid={`button-edit-reply-${reply.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDeleteReplyDialog(reply.id)}
                              data-testid={`button-delete-reply-${reply.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 pt-4 border-t border-border/70" data-testid="new-reply-form">
                <h4 className="font-semibold text-foreground mb-3">إضافة رد جديد</h4>
                <Textarea
                  placeholder="اكتب ردك هنا..."
                  value={newReplyText}
                  onChange={(e) => setNewReplyText(e.target.value)}
                  className="min-h-[120px] mb-3 bg-background"
                  data-testid="textarea-new-reply"
                />
                <Button
                  onClick={handleSendReply}
                  disabled={sendReplyMutation.isPending || !newReplyText.trim()}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                  data-testid="button-send-reply"
                >
                  {sendReplyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Send className="h-4 w-4 ml-2" />
                  )}
                  إرسال الرد
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Delete Message Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent dir="rtl" data-testid="delete-message-dialog">
            <AlertDialogHeader className="text-right">
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذه الرسالة؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Reply Dialog */}
        <AlertDialog open={deleteReplyDialogOpen} onOpenChange={setDeleteReplyDialogOpen}>
          <AlertDialogContent dir="rtl" data-testid="delete-reply-dialog">
            <AlertDialogHeader className="text-right">
              <AlertDialogTitle>تأكيد حذف الرد</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا الرد؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete-reply">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={handleConfirmDeleteReply}
                disabled={deleteReplyMutation.isPending}
                data-testid="button-confirm-delete-reply"
              >
                {deleteReplyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Full Image View Dialog */}
        <Dialog open={!!fullImageUrl} onOpenChange={() => setFullImageUrl(null)}>
          <DialogContent className="max-w-4xl p-0" data-testid="image-dialog">
            <DialogHeader className="sr-only">
              <DialogTitle>عرض الصورة</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm"
                onClick={() => setFullImageUrl(null)}
                data-testid="button-close-image"
              >
                <X className="h-4 w-4" />
              </Button>
              {fullImageUrl && (
                <img
                  src={fullImageUrl}
                  alt="صورة مكبرة"
                  className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
