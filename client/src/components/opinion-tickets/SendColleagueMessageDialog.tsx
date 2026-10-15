/**
 * حوار أدمن: إرسال رسالة صادرة إلى زميل من منسوبي سبق
 * (مراسل / كاتب رأي / كاتب زاوية) عبر صندوق الاستفسارات.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AUTHOR_KIND_META, type TicketAuthorKind } from "./authorKindMeta";

interface Colleague {
  id: string;
  name: string | null;
  email: string | null;
  authorKind?: TicketAuthorKind;
}

type KindFilter = "all" | "reporter" | "opinion_author" | "angle_writer";

export function SendColleagueMessageDialog() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [colleagueId, setColleagueId] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery<{ writers: Colleague[] }>({
    queryKey: ["/api/opinion-tickets/writers/list"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/opinion-tickets/writers/list"), { credentials: "include" });
      if (!res.ok) throw new Error("تعذر جلب قائمة الزملاء");
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  const colleagues = useMemo(() => {
    const list = Array.isArray(data?.writers) ? data!.writers : [];
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (kindFilter !== "all" && c.authorKind !== kindFilter) return false;
      if (!q) return true;
      const hay = `${c.name ?? ""} ${c.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.writers, kindFilter, search]);

  const reset = () => {
    setColleagueId("");
    setKindFilter("all");
    setSearch("");
    setTitle("");
    setMessage("");
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/opinion-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writerId: colleagueId,
          title: title.trim(),
          message: message.trim(),
        }),
      });
    },
    onSuccess: (resp: any) => {
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets"] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets/unread-count"] });
      qc.invalidateQueries({ queryKey: ["/api/opinion-tickets/writers/list"] });
      toast({ title: "تم إرسال الرسالة إلى الزميل" });
      if (resp?.ticket?.id) navigate(`/dashboard/opinion-tickets/${resp.ticket.id}`);
    },
    onError: (err: any) =>
      toast({
        title: "تعذر إرسال الرسالة",
        description: err?.message ?? "حدث خطأ ما",
        variant: "destructive",
      }),
  });

  const canSend =
    !!colleagueId && title.trim().length >= 3 && message.trim().length >= 1 && !sendMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-10 gap-2 px-4" data-testid="button-send-colleague-message">
          <Send className="h-4 w-4" />
          أرسل رسالة
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>رسالة إلى زميل</DialogTitle>
          <DialogDescription>
            اختر مراسلاً أو كاتب رأي أو كاتب زاوية من منسوبي سبق، وستصل الرسالة في صندوق استفساراته.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "all" as const, label: "الكل" },
                { id: "reporter" as const, label: "مراسلون" },
                { id: "opinion_author" as const, label: "كتّاب رأي" },
                { id: "angle_writer" as const, label: "كتّاب زوايا" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setKindFilter(tab.id);
                  setColleagueId("");
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                  kindFilter === tab.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground hover:bg-muted",
                )}
                data-testid={`colleague-kind-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">بحث</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم أو بريد الزميل..."
              data-testid="input-colleague-search"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">الزميل</label>
            <Select
              value={colleagueId || undefined}
              onValueChange={setColleagueId}
              disabled={isLoading}
            >
              <SelectTrigger data-testid="select-colleague">
                <SelectValue placeholder={isLoading ? "جاري التحميل..." : "اختر زميلاً"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {colleagues.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    لا يوجد زملاء مطابقون
                  </div>
                ) : (
                  colleagues.map((c) => {
                    const meta = AUTHOR_KIND_META[c.authorKind && c.authorKind in AUTHOR_KIND_META ? c.authorKind : "other"];
                    return (
                      <SelectItem key={c.id} value={c.id} data-testid={`colleague-option-${c.id}`}>
                        <span className="flex items-center gap-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", meta.className)}>
                            {meta.shortLabel}
                          </span>
                          <span>{c.name || c.email || c.id}</span>
                        </span>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isLoading ? "…" : `${colleagues.length} زميل`}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">العنوان</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="موضوع الرسالة"
              maxLength={255}
              data-testid="input-outbound-title"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">نص الرسالة</label>
            <Textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اكتب رسالتك للزميل..."
              data-testid="textarea-outbound-message"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!canSend}
            className="gap-2"
            data-testid="button-submit-outbound-message"
          >
            {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
