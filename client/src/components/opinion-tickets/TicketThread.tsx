import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { CornerDownRight, Loader2, MessageSquare, Send, Shield, User as UserIcon, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PolishReplyButton } from "@/components/ai/PolishReplyButton";
import type { OpinionTicketStatus } from "./statusMeta";
import { STATUS_META, STATUS_OPTIONS } from "./statusMeta";
import { authorKindMeta, type TicketAuthorKind } from "./authorKindMeta";

interface ThreadMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: "writer" | "admin";
  message: string;
  parentMessageId: string | null;
  createdAt: string;
  senderName: string | null;
}

interface ThreadTicket {
  id: string;
  writerId: string;
  writerName: string | null;
  writerEmail: string | null;
  authorKind?: TicketAuthorKind;
  title: string;
  status: OpinionTicketStatus;
  lastMessageAt: string;
  createdAt: string;
}

interface ThreadResponse {
  ticket: ThreadTicket;
  messages: ThreadMessage[];
}

interface Props {
  ticketId: string;
  viewerRole: "writer" | "admin";
}

function formatDate(date: string) {
  try {
    return format(new Date(date), "d MMMM yyyy - HH:mm", { locale: ar });
  } catch {
    return date;
  }
}

export function TicketThread({ ticketId, viewerRole }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<ThreadResponse>({
    queryKey: [`/api/opinion-tickets/${ticketId}`],
    enabled: !!ticketId,
    retry: false,
  });

  const replyMutation = useMutation({
    mutationFn: async (payload: { message: string; parentMessageId?: string | null }) => {
      return apiRequest(`/api/opinion-tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setDraft("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: [`/api/opinion-tickets/${ticketId}`] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets"] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets/unread-count"] });
    },
    onError: (err: any) => {
      toast({
        title: "تعذر إرسال الرد",
        description: err?.message ?? "حدث خطأ ما",
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: OpinionTicketStatus) => {
      return apiRequest(`/api/opinion-tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/opinion-tickets/${ticketId}`] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets"] });
      toast({ title: "تم تحديث حالة الاستفسار" });
    },
    onError: (err: any) =>
      toast({
        title: "تعذر تحديث الحالة",
        description: err?.message ?? "حدث خطأ ما",
        variant: "destructive",
      }),
  });

  const messages = Array.isArray(data?.messages) ? data.messages : [];

  const messagesById = useMemo(() => {
    const map = new Map<string, ThreadMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data?.ticket) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
          <div className="rounded-full bg-destructive/15 p-4">
            <MessageSquare className="h-8 w-8 text-destructive" />
          </div>
          <p className="font-semibold text-foreground">تعذر تحميل الاستفسار</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {(error as Error)?.message || "لم يتم العثور على الاستفسار أو لا تملك صلاحية عرضه"}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            إعادة المحاولة
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { ticket } = data;
  const statusMeta = STATUS_META[ticket.status] ?? STATUS_META.open;
  const isClosed = ticket.status === "closed";
  const kind = authorKindMeta(ticket.authorKind);
  const KindIcon = kind.icon;

  return (
    <div className="space-y-5" dir="rtl">
      <Card className="border-border/80 shadow-sm overflow-hidden">
        <div className="h-1.5 bg-gradient-to-l from-amber-600 via-orange-500 to-amber-400" />
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    kind.className,
                  )}
                  title={kind.label}
                  aria-label={kind.label}
                >
                  <KindIcon className="h-4 w-4" />
                </div>
                <h1 className="text-xl font-bold text-foreground leading-snug" data-testid="text-ticket-title">
                  {ticket.title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
                  <UserIcon className="h-3.5 w-3.5" />
                  {kind.label}
                  <span className="text-border">·</span>
                  {ticket.writerName || ticket.writerEmail || ticket.writerId}
                </span>
                <span className="text-border">·</span>
                <span>{formatDate(ticket.createdAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={cn("gap-1 font-medium", statusMeta.className)}
                data-testid="badge-ticket-status"
              >
                {statusMeta.label}
              </Badge>
              {viewerRole === "admin" && (
                <Select
                  value={ticket.status}
                  onValueChange={(v) => statusMutation.mutate(v as OpinionTicketStatus)}
                  disabled={statusMutation.isPending}
                >
                  <SelectTrigger className="w-40 h-9 bg-background" data-testid="select-ticket-status">
                    <SelectValue placeholder="تغيير الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {messages.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              لا توجد رسائل في هذا الاستفسار بعد
            </CardContent>
          </Card>
        ) : (
          messages.map((m) => {
            const parent = m.parentMessageId ? messagesById.get(m.parentMessageId) : null;
            const fromAdmin = m.senderRole === "admin";
            return (
              <Card
                key={m.id}
                className={cn(
                  "border shadow-sm overflow-hidden",
                  fromAdmin
                    ? "border-sky-300/80 dark:border-sky-500/40 bg-sky-50/80 dark:bg-sky-500/10"
                    : "border-emerald-300/80 dark:border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-500/10"
                )}
                data-testid={`row-message-${m.id}`}
              >
                <div
                  className={cn(
                    "h-full border-r-4",
                    fromAdmin ? "border-r-sky-600" : "border-r-emerald-600"
                  )}
                >
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        {fromAdmin ? (
                          <Shield className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" />
                        ) : (
                          <UserIcon className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
                        )}
                        <span>{m.senderName || (fromAdmin ? "إدارة التحرير" : "الكاتب")}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] py-0 font-medium",
                            fromAdmin
                              ? "border-sky-400 text-sky-900 dark:text-sky-100"
                              : "border-emerald-400 text-emerald-900 dark:text-emerald-100"
                          )}
                        >
                          {fromAdmin ? "إدارة" : "كاتب"}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground shrink-0">{formatDate(m.createdAt)}</span>
                    </div>

                    {parent && (
                      <div className="rounded-lg border border-border/70 bg-background/80 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
                        <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0" />
                        <div className="line-clamp-2">
                          <span className="font-semibold text-foreground/80 ml-1">
                            {parent.senderName || (parent.senderRole === "admin" ? "إدارة التحرير" : "الكاتب")}:
                          </span>
                          {parent.message}
                        </div>
                      </div>
                    )}

                    <div
                      className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground"
                      data-testid={`text-message-${m.id}`}
                    >
                      {m.message}
                    </div>

                    {!isClosed && (
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs gap-1 text-foreground/80 hover:text-foreground"
                          onClick={() => setReplyTo(m)}
                          data-testid={`button-reply-${m.id}`}
                        >
                          <CornerDownRight className="h-3 w-3" />
                          رد على هذه الرسالة
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {isClosed ? (
        <Card className="border-dashed border-border">
          <CardContent className="p-5 text-center text-sm text-muted-foreground">
            تم إغلاق هذا الاستفسار. لا يمكن إضافة ردود جديدة.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="p-4 space-y-3">
            {replyTo && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-400/30 p-2.5 text-xs">
                <div className="flex items-start gap-2 min-w-0">
                  <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground ml-1">
                      رد على {replyTo.senderName || (replyTo.senderRole === "admin" ? "إدارة التحرير" : "الكاتب")}:
                    </span>
                    <span className="text-muted-foreground line-clamp-1">{replyTo.message}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setReplyTo(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Textarea
              rows={4}
              placeholder={
                viewerRole === "admin"
                  ? "اكتب مضمون ردك باختصار… ثم اضغط «توليد الرد» لصياغة مهنية"
                  : "اكتب ردك هنا..."
              }
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="bg-background"
              data-testid="textarea-reply"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {viewerRole === "admin" && (
                <PolishReplyButton
                  draft={draft}
                  channel="contributor_ticket"
                  recipientName={data?.ticket.writerName || data?.ticket.writerEmail}
                  subject={data?.ticket.title}
                  originalMessage={
                    replyTo?.message ||
                    [...(data?.messages ?? [])].reverse().find((m) => m.senderRole === "writer")
                      ?.message
                  }
                  onPolished={setDraft}
                  disabled={replyMutation.isPending}
                />
              )}
              <Button
                onClick={() =>
                  replyMutation.mutate({
                    message: draft,
                    parentMessageId: replyTo?.id ?? null,
                  })
                }
                disabled={!draft.trim() || replyMutation.isPending}
                data-testid="button-send-reply"
                className="h-10 gap-2 bg-amber-700 hover:bg-amber-800 text-white"
              >
                {replyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                إرسال
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
