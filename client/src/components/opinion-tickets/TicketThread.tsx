import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { CornerDownRight, Loader2, Send, Shield, User as UserIcon, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { OpinionTicketStatus } from "./statusMeta";
import { STATUS_META, STATUS_OPTIONS } from "./statusMeta";

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

  const { data, isLoading } = useQuery<ThreadResponse>({
    queryKey: [`/api/opinion-tickets/${ticketId}`],
    enabled: !!ticketId,
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

  const messagesById = useMemo(() => {
    const map = new Map<string, ThreadMessage>();
    (data?.messages ?? []).forEach((m) => map.set(m.id, m));
    return map;
  }, [data?.messages]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data?.ticket) {
    return (
      <div className="text-center text-muted-foreground py-12">
        لم يتم العثور على الاستفسار
      </div>
    );
  }

  const { ticket, messages } = data;
  const statusMeta = STATUS_META[ticket.status];
  const isClosed = ticket.status === "closed";

  return (
    <div className="space-y-6" dir="rtl">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-xl font-semibold" data-testid="text-ticket-title">
                {ticket.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  {ticket.writerName || ticket.writerEmail || ticket.writerId}
                </span>
                <span>·</span>
                <span>{formatDate(ticket.createdAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn("gap-1", statusMeta.className)} data-testid="badge-ticket-status">
                {statusMeta.label}
              </Badge>
              {viewerRole === "admin" && (
                <Select
                  value={ticket.status}
                  onValueChange={(v) => statusMutation.mutate(v as OpinionTicketStatus)}
                  disabled={statusMutation.isPending}
                >
                  <SelectTrigger className="w-36 h-8" data-testid="select-ticket-status">
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
        {messages.map((m) => {
          const parent = m.parentMessageId ? messagesById.get(m.parentMessageId) : null;
          const fromAdmin = m.senderRole === "admin";
          return (
            <Card
              key={m.id}
              className={cn(
                "border-r-4",
                fromAdmin
                  ? "border-r-blue-500 bg-blue-500/5"
                  : "border-r-emerald-500 bg-emerald-500/5"
              )}
              data-testid={`row-message-${m.id}`}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-medium">
                    {fromAdmin ? (
                      <Shield className="h-3.5 w-3.5 text-blue-600" />
                    ) : (
                      <UserIcon className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    <span>{m.senderName || (fromAdmin ? "إدارة التحرير" : "الكاتب")}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {fromAdmin ? "إدارة" : "كاتب"}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">{formatDate(m.createdAt)}</span>
                </div>

                {parent && (
                  <div className="rounded border bg-background/60 p-2 text-xs text-muted-foreground flex items-start gap-2">
                    <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0" />
                    <div className="line-clamp-2">
                      <span className="font-medium ml-1">
                        {parent.senderName || (parent.senderRole === "admin" ? "إدارة التحرير" : "الكاتب")}:
                      </span>
                      {parent.message}
                    </div>
                  </div>
                )}

                <div className="whitespace-pre-wrap text-sm leading-relaxed" data-testid={`text-message-${m.id}`}>
                  {m.message}
                </div>

                {!isClosed && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => setReplyTo(m)}
                      data-testid={`button-reply-${m.id}`}
                    >
                      <CornerDownRight className="h-3 w-3" />
                      رد على هذه الرسالة
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isClosed ? (
        <Card className="border-dashed">
          <CardContent className="p-5 text-center text-sm text-muted-foreground">
            تم إغلاق هذا الاستفسار. لا يمكن إضافة ردود جديدة.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            {replyTo && (
              <div className="flex items-start justify-between gap-2 rounded border bg-muted/40 p-2 text-xs">
                <div className="flex items-start gap-2 min-w-0">
                  <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium ml-1">
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
              placeholder="اكتب ردك هنا..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              data-testid="textarea-reply"
            />
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  replyMutation.mutate({
                    message: draft,
                    parentMessageId: replyTo?.id ?? null,
                  })
                }
                disabled={!draft.trim() || replyMutation.isPending}
                data-testid="button-send-reply"
                className="gap-2"
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
