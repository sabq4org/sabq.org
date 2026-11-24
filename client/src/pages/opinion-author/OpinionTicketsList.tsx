// استفساراتي — المرحلة 2 من خطة لوحة الكاتب: القائمة والمحادثة في شاشة واحدة،
// وشرائح تصفية بدل بطاقات الأرقام. نفس الصفحة للمراسلين وكتّاب الرأي.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowRight, Inbox, Loader2, PlusCircle } from "lucide-react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import {
  TICKET_STATUS_CHIP,
  TICKET_STATUS_LABEL,
  WriterTicketConversation,
  formatTicketTime,
} from "@/components/writer/WriterTicketConversation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { OpinionTicketStatus } from "@/components/opinion-tickets/statusMeta";

interface TicketRow {
  id: string;
  title: string;
  status: OpinionTicketStatus;
  lastMessageAt: string;
  createdAt: string;
  hasUnread: boolean;
}

interface ListResponse {
  tickets: TicketRow[];
}

type Filter = "all" | OpinionTicketStatus;
const FILTER_LABEL: Record<Filter, string> = { all: "الكل", open: "مفتوحة", answered: "تمت الإجابة", closed: "مغلقة" };
const TICKETS_PATH = "/dashboard/opinion-author/tickets";

export default function OpinionTicketsList({ selectedId }: { selectedId?: string } = {}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  // ?new=schedule يفتح طلب «تغيير موعد النشر الأسبوعي» جاهزاً من تبويب «مقالاتي»
  const scheduleRequest = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "schedule";
  const [openDialog, setOpenDialog] = useState(scheduleRequest);
  const [title, setTitle] = useState(scheduleRequest ? "طلب تغيير موعد النشر الأسبوعي" : "");
  const [message, setMessage] = useState(scheduleRequest ? "أرغب في تغيير موعدي الأسبوعي إلى يوم: " : "");

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["/api/opinion-tickets"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/opinion-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message }),
      });
    },
    onSuccess: (resp: any) => {
      setOpenDialog(false);
      setTitle("");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets"] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets/unread-count"] });
      toast({ title: "تم إرسال الاستفسار بنجاح" });
      if (resp?.ticket?.id) navigate(`${TICKETS_PATH}/${resp.ticket.id}`);
    },
    onError: (err: any) =>
      toast({
        title: "تعذر إرسال الاستفسار",
        description: err?.message ?? "حدث خطأ ما",
        variant: "destructive",
      }),
  });

  const tickets = Array.isArray(data?.tickets) ? data!.tickets : [];

  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: tickets.length, open: 0, answered: 0, closed: 0 };
    tickets.forEach((t) => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [tickets]);
  const shown = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);
  // على الشاشة العريضة نعرض أول استفسار إن لم يُختر واحد؛ على الجوال تبقى القائمة.
  const activeId = selectedId ?? shown[0]?.id ?? null;
  const open = (id: string) => navigate(`${TICKETS_PATH}/${id}`);

  const newTicketDialog = (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogTrigger asChild>
        <Button className="h-11 gap-2 rounded-full bg-[#1E9BE6] px-5 text-[15px] font-semibold text-white hover:bg-[#178BD0]" data-testid="button-new-ticket">
          <PlusCircle className="h-4 w-4" />
          استفسار جديد
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>استفسار جديد</DialogTitle>
          <DialogDescription>
            أرسل استفسارك إلى إدارة التحرير وسيتم الرد عليك من خلال هذه اللوحة.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">العنوان</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان مختصر للاستفسار"
              maxLength={255}
              data-testid="input-ticket-title"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">نص الاستفسار</label>
            <Textarea
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اشرح استفسارك بالتفصيل..."
              data-testid="textarea-ticket-message"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpenDialog(false)}>
            إلغاء
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title.trim() || !message.trim() || createMutation.isPending}
            data-testid="button-submit-ticket"
            className="gap-2"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <WriterPageFrame
      title="استفساراتي"
      description="تواصل مع إدارة التحرير. الرد يصلك هنا وفي الإشعارات."
      titleTestId="text-page-title"
      actions={newTicketDialog}
    >
      {isLoading ? (
        <WriterSurface className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </WriterSurface>
      ) : tickets.length === 0 ? (
        <WriterSurface className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Inbox className="h-9 w-9 text-[#8A99A8]" aria-hidden="true" />
          <p className="text-[15px] font-semibold">لا توجد استفسارات بعد</p>
          <p className="max-w-sm text-[13px] leading-6 text-[#55667A] dark:text-muted-foreground">
            اسأل إدارة التحرير عن مقال أو موعد أو أي شيء يخص عملك، ويصلك الرد هنا.
          </p>
          <Button
            onClick={() => setOpenDialog(true)}
            className="mt-1 h-11 gap-2 rounded-full bg-[#1E9BE6] px-5 font-semibold text-white hover:bg-[#178BD0]"
            data-testid="button-new-ticket-empty"
          >
            <PlusCircle className="h-4 w-4" />
            أرسل أول استفسار
          </Button>
        </WriterSurface>
      ) : (
        <>
          <div className={cn("flex flex-wrap gap-2", selectedId && "hidden lg:flex")}>
            {(Object.keys(FILTER_LABEL) as Filter[])
              .filter((k) => k === "all" || counts[k] > 0)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={cn(
                    "h-9 rounded-full px-4 text-[13px] transition",
                    filter === k
                      ? "bg-[#1E9BE6] font-semibold text-white"
                      : "bg-card text-foreground shadow-[inset_0_0_0_1px_#DCE4EC] hover:bg-[#F7F9FB]",
                  )}
                  data-testid={`filter-tickets-${k}`}
                >
                  {FILTER_LABEL[k]} {counts[k]}
                </button>
              ))}
          </div>
          <WriterSurface className="flex overflow-hidden lg:h-[640px]">
            <div
              className={cn(
                "w-full shrink-0 overflow-y-auto lg:w-[360px] lg:border-l lg:border-[#EEF2F6] dark:lg:border-border",
                selectedId && "hidden lg:block",
              )}
            >
              {shown.map((t) => {
                const active = t.id === activeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => open(t.id)}
                    className={cn(
                      "flex w-full flex-col gap-1.5 border-b border-[#EEF2F6] px-5 py-4 text-start transition hover:bg-[#F7F9FB] dark:border-border dark:hover:bg-muted/40",
                      active && "lg:bg-[#F2F9FE] lg:shadow-[inset_-3px_0_0_#1E9BE6] dark:lg:bg-sky-950/30",
                    )}
                    data-testid={`row-ticket-${t.id}`}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t.title}</span>
                      {t.hasUnread && !active && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#E5484D]" aria-label="رد جديد" />
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TICKET_STATUS_CHIP[t.status])}>
                        {TICKET_STATUS_LABEL[t.status]}
                      </span>
                      <span className="text-xs text-[#617183] dark:text-muted-foreground">{formatTicketTime(t.lastMessageAt)}</span>
                    </span>
                  </button>
                );
              })}
              {shown.length === 0 && <p className="px-5 py-8 text-center text-sm text-[#55667A]">لا استفسارات بهذه الحالة.</p>}
            </div>
            <div className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden lg:flex")}>
              {selectedId && (
                <button
                  type="button"
                  onClick={() => navigate(TICKETS_PATH)}
                  className="flex items-center gap-1.5 border-b border-[#EEF2F6] px-5 py-3 text-sm text-[#0B6FA8] lg:hidden"
                  data-testid="button-back"
                >
                  <ArrowRight className="h-4 w-4" /> كل الاستفسارات
                </button>
              )}
              {activeId ? (
                <WriterTicketConversation key={activeId} ticketId={activeId} />
              ) : (
                <p className="m-auto p-8 text-sm text-[#55667A]">اختر استفسارًا لعرضه.</p>
              )}
            </div>
          </WriterSurface>
        </>
      )}
    </WriterPageFrame>
  );
}
