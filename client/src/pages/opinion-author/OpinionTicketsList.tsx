import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Inbox, Loader2, MessageSquare, PlusCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { STATUS_META, type OpinionTicketStatus } from "@/components/opinion-tickets/statusMeta";

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

function formatDate(date: string) {
  try {
    return format(new Date(date), "d MMMM yyyy - HH:mm", { locale: ar });
  } catch {
    return date;
  }
}

export default function OpinionTicketsList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

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
      if (resp?.ticket?.id) navigate(`/dashboard/opinion-author/tickets/${resp.ticket.id}`);
    },
    onError: (err: any) =>
      toast({
        title: "تعذر إرسال الاستفسار",
        description: err?.message ?? "حدث خطأ ما",
        variant: "destructive",
      }),
  });

  const tickets = Array.isArray(data?.tickets) ? data!.tickets : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              استفساراتي
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              تواصل مع إدارة التحرير من خلال نظام الاستفسارات
            </p>
          </div>

          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-new-ticket">
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
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">لا توجد استفسارات بعد</p>
              <Button onClick={() => setOpenDialog(true)} className="gap-2">
                <PlusCircle className="h-4 w-4" />
                أرسل أول استفسار
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const meta = STATUS_META[t.status];
              return (
                <Card
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/dashboard/opinion-author/tickets/${t.id}`)}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") &&
                    navigate(`/dashboard/opinion-author/tickets/${t.id}`)
                  }
                  className={cn(
                    "hover:bg-muted/40 transition-colors cursor-pointer",
                    t.hasUnread && "border-primary/40 bg-primary/5"
                  )}
                  data-testid={`row-ticket-${t.id}`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium line-clamp-1">{t.title}</h3>
                        {t.hasUnread && (
                          <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5">
                            جديد
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        آخر نشاط: {formatDate(t.lastMessageAt)}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0", meta.className)}>{meta.label}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
