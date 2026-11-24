// محادثة استفسار واحد بأسلوب لوحة الكاتب (فقاعات + رد من المكان نفسه).
// نفس واجهات /api/opinion-tickets التي يستخدمها TicketThread؛ عرض الإدارة لم يتغير.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { OpinionTicketStatus } from "@/components/opinion-tickets/statusMeta";

type Message = {
  id: string;
  senderRole: "writer" | "admin";
  message: string;
  parentMessageId: string | null;
  createdAt: string;
  senderName: string | null;
};
type ThreadResponse = {
  ticket: { id: string; title: string; status: OpinionTicketStatus; createdAt: string };
  messages: Message[];
};

export const TICKET_STATUS_LABEL: Record<OpinionTicketStatus, string> = {
  open: "مفتوح",
  answered: "تمت الإجابة",
  closed: "مغلق",
};
export const TICKET_STATUS_CHIP: Record<OpinionTicketStatus, string> = {
  open: "bg-[#FFF6E5] text-[#946000]",
  answered: "bg-[#E8F6EF] text-[#13734E]",
  closed: "bg-[#F1F4F7] text-[#55667A]",
};

export function formatTicketTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export function WriterTicketConversation({ ticketId }: { ticketId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError } = useQuery<ThreadResponse>({
    queryKey: [`/api/opinion-tickets/${ticketId}`],
    enabled: Boolean(ticketId),
    retry: false,
  });
  const messages = Array.isArray(data?.messages) ? data.messages : [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, ticketId]);

  const reply = useMutation({
    mutationFn: () =>
      apiRequest(`/api/opinion-tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft, parentMessageId: null }),
      }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: [`/api/opinion-tickets/${ticketId}`] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets"] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets/unread-count"] });
    },
    onError: (err: unknown) =>
      toast({ title: "تعذر إرسال الرد", description: err instanceof Error ? err.message : "حاول مرة أخرى", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }
  if (isError || !data) {
    return <div className="flex flex-1 items-center justify-center py-16 text-sm text-destructive">تعذر تحميل الاستفسار.</div>;
  }

  const { ticket } = data;
  const closed = ticket.status === "closed";

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={`ticket-conversation-${ticket.id}`}>
      <div className="flex items-center gap-3 border-b border-[#EEF2F6] px-5 py-4 dark:border-border sm:px-6">
        <h2 className="min-w-0 flex-1 text-[17px] font-bold leading-snug" data-testid="text-ticket-title">{ticket.title}</h2>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", TICKET_STATUS_CHIP[ticket.status])} data-testid="badge-ticket-status">
          {TICKET_STATUS_LABEL[ticket.status]}
        </span>
      </div>
      <div className="flex min-h-[260px] flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-5 sm:px-6">
        {messages.map((m) => {
          const mine = m.senderRole === "writer";
          return (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[85%] flex-col gap-1.5 rounded-[18px] px-4 py-3 sm:max-w-[78%]",
                mine ? "self-start bg-[#EAF7FF] dark:bg-sky-950/40" : "self-end bg-[#F4F7FB] dark:bg-muted",
              )}
              data-testid={`row-message-${m.id}`}
            >
              <span className="text-xs text-[#617183] dark:text-muted-foreground">
                {mine ? "أنت" : m.senderName || "إدارة التحرير"} · {formatTicketTime(m.createdAt)}
              </span>
              <p className="whitespace-pre-wrap text-[15px] leading-8" data-testid={`text-message-${m.id}`}>{m.message}</p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {closed ? (
        <p className="border-t border-[#EEF2F6] px-6 py-4 text-center text-sm text-[#55667A] dark:border-border">
          أُغلق هذا الاستفسار. لإضافة شيء افتح استفسارًا جديدًا.
        </p>
      ) : (
        <form
          className="flex items-end gap-2.5 border-t border-[#EEF2F6] px-4 py-3.5 dark:border-border sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() && !reply.isPending) reply.mutate();
          }}
        >
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="اكتب ردك…"
            className="max-h-40 min-h-12 flex-1 resize-y rounded-[22px] border border-[#DCE4EC] bg-background px-4 py-3 text-[15px] leading-6 outline-none focus:ring-2 focus:ring-[#1E9BE6] dark:border-border"
            data-testid="textarea-reply"
          />
          <button
            type="submit"
            disabled={!draft.trim() || reply.isPending}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-[#1E9BE6] px-5 text-[15px] font-semibold text-white hover:bg-[#178BD0] disabled:opacity-50"
            data-testid="button-send-reply"
          >
            {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
            إرسال
          </button>
        </form>
      )}
    </div>
  );
}
