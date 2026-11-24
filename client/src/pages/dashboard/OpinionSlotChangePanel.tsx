// لوحة الإدارة لفرصة تغيير الموعد الأسبوعي: فتح فرصة جديدة للكتّاب (مدة أو حتى الإغلاق)،
// إغلاقها، ومتابعة من غيّر موعده فيها. تعديل موعد كاتب بعينه يبقى من جدول الكتّاب.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SLOT_CHANGE_DURATION_DAYS, WEEKDAY_NAMES_AR, formatSlotTimeAr } from "@shared/opinionSlotChange";

const SUMMARY_KEY = ["/api/admin/opinion-writers/slot-change"] as const;

type Summary = {
  round: { id: string; openedAt: string; closesAt: string | null; note: string | null } | null;
  lastRound: { id: string; openedAt: string; closesAt: string | null; closedAt: string | null; note: string | null } | null;
  changes: Array<{ writerId: string; writerName: string; fromWeekday: number; fromTime: string; toWeekday: number; toTime: string; createdAt: string }>;
  eligibleWriters: number;
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
  });
}

const slot = (w: number, t: string) => `${WEEKDAY_NAMES_AR[w] ?? ""} ${formatSlotTimeAr(t)}`;

export function OpinionSlotChangePanel() {
  const { toast } = useToast();
  const q = useQuery<Summary | null>({ queryKey: SUMMARY_KEY });
  const [days, setDays] = useState<string>("7");
  const [note, setNote] = useState("");
  const data = q.data;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/opinion-writers"] });
  };
  const openMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/admin/opinion-writers/slot-change/open", {
        method: "POST",
        body: JSON.stringify({ days: days === "none" ? null : Number(days), note: note.trim() || null }),
      }),
    onSuccess: () => {
      refresh();
      setNote("");
      toast({ title: "فُتحت فرصة تغيير الموعد", description: "تظهر لكل كاتب له موعد أسبوعي في لوحته" });
    },
    onError: (e: unknown) => toast({ title: "تعذر فتح الفرصة", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
  });
  const closeMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/opinion-writers/slot-change/close", { method: "POST", body: "{}" }),
    onSuccess: () => {
      refresh();
      toast({ title: "أُغلقت الفرصة" });
    },
    onError: (e: unknown) => toast({ title: "تعذر الإغلاق", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
  });

  const round = data?.round ?? null;
  const changes = data?.changes ?? [];

  return (
    <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm" dir="rtl" data-testid="admin-slot-change-panel">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span>فرصة تغيير الموعد الأسبوعي</span>
          </CardTitle>
          {round ? (
            <Badge className="bg-[#E6F4FD] text-[#0B6FA8] hover:bg-[#E6F4FD]">
              مفتوحة {round.closesAt ? `حتى ${day(round.closesAt)}` : "حتى تغلقها"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">مغلقة</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        {round ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              غيّر <span className="font-bold text-foreground">{changes.length}</span> من{" "}
              <span className="font-bold text-foreground">{data?.eligibleWriters ?? 0}</span> كاتبًا موعدهم في هذه الفرصة.
              {round.note ? <> الرسالة للكتّاب: «{round.note}»</> : null}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
              data-testid="button-close-slot-change"
            >
              أغلق الفرصة الآن
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              عند فتح الفرصة يرى كل كاتب له موعد أسبوعي بطاقة في لوحته، يقرأ الإيضاحات ويوافق عليها، ثم يغيّر يومه ووقته مرة
              واحدة. اليوم الذي بلغ الحد لا يُختار.
              {data?.lastRound ? <> آخر فرصة فُتحت {day(data.lastRound.openedAt)}.</> : null}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold">
                المدة
                <select
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="mt-1 block h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal"
                  data-testid="select-slot-change-days"
                >
                  {SLOT_CHANGE_DURATION_DAYS.map((d) => (
                    <option key={d} value={String(d)}>
                      {d} أيام
                    </option>
                  ))}
                  <option value="none">حتى أغلقها</option>
                </select>
              </label>
              <label className="min-w-[200px] flex-1 text-xs font-semibold">
                رسالة قصيرة للكتّاب (اختيارية)
                <input
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal"
                  placeholder="مثال: نعيد توزيع المقالات مع بداية الشهر"
                  data-testid="input-slot-change-note"
                />
              </label>
              <Button
                size="sm"
                className="h-10"
                disabled={openMutation.isPending}
                onClick={() => openMutation.mutate()}
                data-testid="button-open-slot-change-round"
              >
                أتح فرصة تغيير الموعد
              </Button>
            </div>
          </div>
        )}

        {changes.length > 0 ? (
          <div className="grid gap-1.5">
            <p className="m-0 text-xs font-semibold text-muted-foreground">
              {round ? "التغييرات في هذه الفرصة" : "التغييرات في آخر فرصة"}
            </p>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {changes.map((c) => (
                <li key={c.writerId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-semibold">{c.writerName}</span>
                  <span className="text-muted-foreground">
                    {slot(c.fromWeekday, c.fromTime)} ← <span className="font-semibold text-foreground">{slot(c.toWeekday, c.toTime)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
