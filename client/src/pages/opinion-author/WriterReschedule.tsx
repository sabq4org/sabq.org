// «غيّر الموعد» للكاتب: مرة واحدة لكل مقال مجدول، يختار تاريخًا ووقتًا بتوقيت
// الرياض بدل موعده الحالي. بعد الاستخدام يبقى أثر صغير «غُيّر الموعد مرة».
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  dateToRiyadhLocal,
  rescheduleEligibility,
  rescheduleTargetError,
  riyadhLocalToDate,
} from "@shared/opinionReaderExtras";

export const WRITER_RESCHEDULES_QUERY = ["/api/opinion-author/reschedules"] as const;

type RescheduleItem = { articleId: string; fromAt: string; toAt: string; createdAt: string };

export function useWriterReschedules() {
  const q = useQuery<{ items: RescheduleItem[] }>({ queryKey: WRITER_RESCHEDULES_QUERY, retry: false });
  return useMemo(() => new Map((q.data?.items ?? []).map((i) => [i.articleId, i])), [q.data]);
}

const RIYADH = "Asia/Riyadh";
function riyadhLabel(at: string | Date): string {
  const d = new Date(at);
  const day = d.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long", timeZone: RIYADH, numberingSystem: "latn" });
  const time = d.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit", timeZone: RIYADH, numberingSystem: "latn" });
  return `${day} · ${time}`;
}

export function WriterRescheduleAction({
  article,
  used,
}: {
  article: { id: string; title: string; status: string; scheduledAt?: string | null };
  used: RescheduleItem | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (article.status !== "scheduled") return null;
  if (used) {
    return (
      <span
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#F4F7FB] px-3 text-[12px] text-[#55667A]"
        title={`كان: ${riyadhLabel(used.fromAt)}`}
        data-testid={`reschedule-used-${article.id}`}
      >
        <Check className="h-3.5 w-3.5 text-[#1A7F4B]" aria-hidden /> غيّرتَ الموعد مرة
      </span>
    );
  }
  const eligibility = rescheduleEligibility({
    status: article.status,
    scheduledAt: article.scheduledAt,
    alreadyUsed: false,
    nowMs: Date.now(),
  });
  if (!eligibility.canReschedule) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#D6ECFB] bg-[#E6F4FD] px-3.5 text-[13px] font-semibold text-[#0B6FA8] hover:bg-[#D6ECFB]"
        data-testid={`button-reschedule-${article.id}`}
      >
        <CalendarClock className="h-4 w-4" aria-hidden /> غيّر الموعد
      </button>
      {open ? <RescheduleDialog article={article} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function RescheduleDialog({
  article,
  onClose,
}: {
  article: { id: string; title: string; scheduledAt?: string | null };
  onClose: () => void;
}) {
  const { toast } = useToast();
  const current = article.scheduledAt ? new Date(article.scheduledAt) : new Date();
  const initial = dateToRiyadhLocal(current);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const target = riyadhLocalToDate(date, time);
  const error = rescheduleTargetError(target, current.getTime(), Date.now());
  const minDate = dateToRiyadhLocal(new Date()).date;
  const maxDate = dateToRiyadhLocal(new Date(Date.now() + 30 * 24 * 3600 * 1000)).date;

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/opinion-author/articles/${article.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ date, time }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WRITER_RESCHEDULES_QUERY });
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/workspace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/schedule"] });
      toast({ title: "تغيّر موعد النشر", description: target ? riyadhLabel(target) : undefined });
      onClose();
    },
    onError: (err: unknown) =>
      toast({ title: "لم يتغير الموعد", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent dir="rtl" className="max-w-md rounded-[24px]" data-testid="dialog-reschedule">
        <DialogHeader className="text-right">
          <DialogTitle className="text-[18px]">غيّر موعد نشر مقالك</DialogTitle>
          <DialogDescription className="text-right leading-6">{article.title}</DialogDescription>
        </DialogHeader>

        <div className="rounded-[16px] bg-[#F7FAFD] px-4 py-3 text-[13px] text-[#55667A]">
          الموعد الحالي: <span className="font-semibold text-[#1B2B3A]">{riyadhLabel(current)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px] font-semibold text-[#1B2B3A]">
            التاريخ
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-12 w-full rounded-[14px] border border-[#E3EAF2] bg-white px-3 text-[15px] font-normal outline-none focus:border-[#1E9BE6]"
              dir="ltr"
              data-testid="input-reschedule-date"
            />
          </label>
          <label className="text-[13px] font-semibold text-[#1B2B3A]">
            الوقت
            <input
              type="time"
              value={time}
              step={300}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 h-12 w-full rounded-[14px] border border-[#E3EAF2] bg-white px-3 text-[15px] font-normal outline-none focus:border-[#1E9BE6]"
              dir="ltr"
              data-testid="input-reschedule-time"
            />
          </label>
        </div>
        <p className="m-0 -mt-1 text-[12px] text-[#55667A]">التاريخ والوقت بتوقيت الرياض</p>

        {target && !error ? (
          <p className="m-0 text-[14px] text-[#1B2B3A]">
            الموعد الجديد: <span className="font-bold text-[#0B6FA8]">{riyadhLabel(target)}</span>
          </p>
        ) : error ? (
          <p className="m-0 text-[13px] text-[#BF3038]">{error}</p>
        ) : null}

        <div className="flex items-start gap-2 rounded-[14px] border border-[#FCE6B8] bg-[#FFF8E8] px-3 py-2.5 text-[12px] leading-5 text-[#7A5200]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          يمكنك تغيير موعد هذا المقال مرة واحدة فقط. بعدها أي تغيير يكون عبر التحرير.
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-full px-4 text-[14px] text-[#55667A] hover:bg-[#F4F7FB]">
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={Boolean(error) || mutation.isPending}
            className="h-11 rounded-full bg-[#1E9BE6] px-5 text-[14px] font-semibold text-white disabled:bg-[#B9DDF5]"
            data-testid="button-confirm-reschedule"
          >
            {mutation.isPending ? "جارٍ الحفظ…" : "اعتمد الموعد الجديد"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

