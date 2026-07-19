import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  CheckCircle,
  Clock,
  Inbox,
  Loader2,
  Lock,
  MessageSquare,
  PlusCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
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

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
}

function StatCard({ label, value, icon: Icon, iconColor, iconBg }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value.toLocaleString("en-US")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status === "open").length;
    const answered = tickets.filter((t) => t.status === "answered").length;
    const closed = tickets.filter((t) => t.status === "closed").length;
    return { total: tickets.length, open, answered, closed };
  }, [tickets]);

  const newTicketDialog = (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogTrigger asChild>
        <Button className="h-10 gap-2 px-4" data-testid="button-new-ticket">
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
    <DashboardLayout>
      <DashboardPageShell contentClassName="px-4 pb-20 sm:px-6">
        <DashboardPageHeader
          icon={MessageSquare}
          title="استفساراتي"
          description="تواصل مع إدارة التحرير — نفس الصندوق للمراسلين وكتّاب الرأي"
          titleTestId="text-page-title"
          actions={newTicketDialog}
        />

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
            <StatCard
              label="إجمالي الاستفسارات"
              value={stats.total}
              icon={Inbox}
              iconColor="text-primary"
              iconBg="bg-primary/10"
            />
            <StatCard
              label="مفتوحة"
              value={stats.open}
              icon={Clock}
              iconColor="text-yellow-600 dark:text-yellow-400"
              iconBg="bg-yellow-500/10"
            />
            <StatCard
              label="تمت الإجابة"
              value={stats.answered}
              icon={CheckCircle}
              iconColor="text-green-600 dark:text-green-400"
              iconBg="bg-green-500/10"
            />
            <StatCard
              label="مغلقة"
              value={stats.closed}
              icon={Lock}
              iconColor="text-muted-foreground"
              iconBg="bg-muted"
            />
          </div>
        )}

        {/* List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">قائمة الاستفسارات</h2>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/20">
              <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">لا توجد استفسارات بعد</p>
              <Button
                onClick={() => setOpenDialog(true)}
                className="h-10 gap-2 px-4"
                data-testid="button-new-ticket-empty"
              >
                <PlusCircle className="h-4 w-4" />
                أرسل أول استفسار
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card">
              {tickets.map((t, idx) => {
                const meta = STATUS_META[t.status];
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/dashboard/opinion-author/tickets/${t.id}`)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      navigate(`/dashboard/opinion-author/tickets/${t.id}`)
                    }
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40",
                      idx !== tickets.length - 1 && "border-b",
                      t.hasUnread && "bg-warning/5 dark:bg-warning/5"
                    )}
                    data-testid={`row-ticket-${t.id}`}
                  >
                    <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-warning dark:text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm line-clamp-1">{t.title}</h3>
                        {t.hasUnread && (
                          <span className="inline-block h-2 w-2 rounded-full bg-warning" aria-label="غير مقروء" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        آخر نشاط: {formatDate(t.lastMessageAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0", meta.className)}>
                      {meta.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
