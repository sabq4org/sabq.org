// «فرصة تغيير الموعد»: حين تفتح إدارة التحرير الفرصة يرى الكاتب بطاقة في لوحته،
// يقرأ الإيضاحات ويوافق عليها، ثم يختار يومًا ووقتًا جديدين لموعده الأسبوعي مرة واحدة.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Check, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  SLOT_CHANGE_TERMS,
  SLOT_CHANGE_TIMES,
  WEEKDAY_NAMES_AR,
  formatSlotTimeAr,
  slotChangeTargetError,
} from "@shared/opinionSlotChange";

export const WRITER_SLOT_CHANGE_QUERY = ["/api/opinion-author/slot-change"] as const;

type SlotChangeState = {
  round: { id: string; openedAt: string; closesAt: string | null; note: string | null } | null;
  used: { fromWeekday: number; fromTime: string; toWeekday: number; toTime: string; createdAt: string } | null;
  current: { weekday: number; publishTime: string } | null;
  canChange: boolean;
  dayLoads?: number[];
  cap: number;
};

const RIYADH = "Asia/Riyadh";

function slotLabel(weekday: number, time: string) {
  return `كل ${WEEKDAY_NAMES_AR[weekday] ?? ""} · ${formatSlotTimeAr(time)}`;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: RIYADH,
    numberingSystem: "latn",
  });
}

export function WriterSlotChangeCard() {
  const q = useQuery<SlotChangeState | null>({ queryKey: WRITER_SLOT_CHANGE_QUERY, retry: false });
  const [open, setOpen] = useState(false);
  const data = q.data;
  if (!data?.round || !data.current) return null;

  if (data.used) {
    return (
      <section
        dir="rtl"
        className="flex items-center gap-3 rounded-[18px] border border-[#D3EEDD] bg-[#F1FAF4] px-4 py-3 text-[13px] text-[#1B2B3A]"
        data-testid="writer-slot-change-used"
      >
        <Check className="h-4 w-4 shrink-0 text-[#1A7F4B]" aria-hidden />
        <span>
          غيّرتَ موعدك الأسبوعي إلى <strong>{slotLabel(data.used.toWeekday, data.used.toTime)}</strong>. استخدمت فرصة هذه المرة.
        </span>
      </section>
    );
  }

  if (!data.canChange) return null;
  return (
    <>
      <section
        dir="rtl"
        className="grid gap-3 rounded-[22px] border border-[#D6ECFB] bg-gradient-to-br from-[#E6F4FD] to-[#EEF1FE] px-5 py-4 sm:flex sm:items-center sm:gap-4"
        data-testid="writer-slot-change-card"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#1E9BE6]">
            <CalendarClock className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[15px] font-bold text-[#1B2B3A]">فرصة لتغيير موعدك الأسبوعي</p>
            <p className="m-0 mt-0.5 text-[13px] leading-6 text-[#55667A]">
              أتاحت إدارة التحرير تغيير يوم نشرك ووقته مرة واحدة. موعدك الحالي:{" "}
              <span className="font-semibold text-[#1B2B3A]">{slotLabel(data.current.weekday, data.current.publishTime)}</span>
              {data.round.closesAt ? <>. الفرصة متاحة حتى {dayLabel(data.round.closesAt)}</> : null}
            </p>
            {data.round.note ? <p className="m-0 mt-1 text-[13px] text-[#0B6FA8]">{data.round.note}</p> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 w-full shrink-0 rounded-full bg-[#1E9BE6] px-5 text-[14px] font-semibold text-white hover:bg-[#1789CE] sm:w-auto"
          data-testid="button-open-slot-change"
        >
          اقرأ الإيضاحات وغيّر موعدك
        </button>
      </section>
      {open ? <SlotChangeDialog state={data} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SlotChangeDialog({ state, onClose }: { state: SlotChangeState; onClose: () => void }) {
  const { toast } = useToast();
  const current = state.current!;
  const loads = state.dayLoads ?? Array(7).fill(0);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [agreed, setAgreed] = useState(false);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [time, setTime] = useState<string>(
    SLOT_CHANGE_TIMES.includes(current.publishTime) ? current.publishTime : "06:00",
  );
  const error =
    weekday === null
      ? null
      : slotChangeTargetError({
          fromWeekday: current.weekday,
          fromTime: current.publishTime,
          toWeekday: weekday,
          toTime: time,
          dayLoads: loads,
          cap: state.cap,
        });

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/opinion-author/slot-change", {
        method: "POST",
        body: JSON.stringify({ weekday, time, acceptedTerms: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WRITER_SLOT_CHANGE_QUERY });
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/schedule"] });
      toast({ title: "تغيّر موعدك الأسبوعي", description: weekday !== null ? slotLabel(weekday, time) : undefined });
      onClose();
    },
    onError: (err: unknown) =>
      toast({
        title: "لم يتغير الموعد",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      }),
  });

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-lg overflow-y-auto rounded-[24px]" data-testid="dialog-slot-change">
        <DialogHeader className="pr-8 text-right sm:text-right">
          <p className="m-0 text-[12px] font-semibold text-[#0B6FA8]">الخطوة {step} من 3</p>
          <DialogTitle className="text-[18px]">
            {step === 1 ? "قبل أن تغيّر موعدك" : step === 2 ? "اختر موعدك الجديد" : "راجع واعتمد"}
          </DialogTitle>
          <DialogDescription className="text-right leading-6">
            موعدك الحالي: <span className="font-semibold text-[#1B2B3A]">{slotLabel(current.weekday, current.publishTime)}</span>
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid gap-4">
            <ol className="m-0 grid list-decimal gap-2.5 pr-5 text-[14px] leading-7 text-[#1B2B3A] marker:font-bold marker:text-[#1E9BE6]">
              {SLOT_CHANGE_TERMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <label className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-[#E3EAF2] bg-[#F7FAFD] px-4 py-3 text-[14px] font-semibold text-[#1B2B3A]">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[#1E9BE6]"
                data-testid="checkbox-slot-change-terms"
              />
              قرأت الإيضاحات وأوافق عليها
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-11 rounded-full px-4 text-[14px] text-[#55667A] hover:bg-[#F4F7FB]">
                ليس الآن
              </button>
              <button
                type="button"
                disabled={!agreed}
                onClick={() => setStep(2)}
                className="h-11 rounded-full bg-[#1E9BE6] px-5 text-[14px] font-semibold text-white disabled:bg-[#B9DDF5]"
                data-testid="button-slot-change-next"
              >
                متابعة
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <div>
              <p className="m-0 mb-2 text-[13px] font-semibold text-[#1B2B3A]">اليوم</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {WEEKDAY_NAMES_AR.map((day, i) => {
                  const load = loads[i] ?? 0;
                  const isCurrent = i === current.weekday;
                  const isFull = !isCurrent && load >= state.cap;
                  const picked = weekday === i;
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={isFull}
                      onClick={() => setWeekday(i)}
                      className={cn(
                        "min-h-[60px] rounded-[14px] border px-1 py-2 text-center transition-colors",
                        isFull
                          ? "cursor-not-allowed border-[#F1E2C0] bg-[#FFF8E8] text-[#7A5200]"
                          : picked
                            ? "border-[#1E9BE6] bg-[#E6F4FD] font-bold text-[#0B6FA8]"
                            : "border-[#E3EAF2] bg-white text-[#1B2B3A] hover:border-[#9FD2F3]",
                      )}
                      data-testid={`slot-change-day-${i}`}
                    >
                      <span className="block text-[13px]">{day}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-current opacity-80">
                        {isFull ? "مكتمل" : isCurrent ? "يومك الحالي" : `${load} من ${state.cap}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="text-[13px] font-semibold text-[#1B2B3A]">
              الوقت
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 h-12 w-full rounded-[14px] border border-[#E3EAF2] bg-white px-3 text-[15px] font-normal outline-none focus:border-[#1E9BE6]"
                data-testid="select-slot-change-time"
              >
                {SLOT_CHANGE_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {formatSlotTimeAr(t)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[12px] font-normal text-[#55667A]">بتوقيت الرياض</span>
            </label>
            {error ? <p className="m-0 text-[13px] text-[#BF3038]">{error}</p> : null}
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setStep(1)} className="h-11 rounded-full px-4 text-[14px] text-[#55667A] hover:bg-[#F4F7FB]">
                رجوع
              </button>
              <button
                type="button"
                disabled={weekday === null || Boolean(error)}
                onClick={() => setStep(3)}
                className="h-11 rounded-full bg-[#1E9BE6] px-5 text-[14px] font-semibold text-white disabled:bg-[#B9DDF5]"
                data-testid="button-slot-change-review"
              >
                مراجعة
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && weekday !== null ? (
          <div className="grid gap-4">
            <div className="grid items-center gap-2 rounded-[18px] bg-[#F7FAFD] p-4 text-center sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <p className="m-0 text-[12px] text-[#55667A]">من</p>
                <p className="m-0 text-[15px] font-semibold text-[#55667A] line-through decoration-[#B9C6D3]">
                  {slotLabel(current.weekday, current.publishTime)}
                </p>
              </div>
              <ArrowLeft className="mx-auto h-5 w-5 text-[#1E9BE6] max-sm:-rotate-90" aria-hidden />
              <div>
                <p className="m-0 text-[12px] text-[#55667A]">إلى</p>
                <p className="m-0 text-[17px] font-bold text-[#0B6FA8]" data-testid="slot-change-target">
                  {slotLabel(weekday, time)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-[14px] border border-[#FCE6B8] bg-[#FFF8E8] px-3 py-2.5 text-[13px] leading-6 text-[#7A5200]">
              <TriangleAlert className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              هذا التغيير نهائي ولا يمكن التراجع عنه، ولن تتاح فرصة أخرى حتى تعلنها إدارة التحرير.
            </div>
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setStep(2)} className="h-11 rounded-full px-4 text-[14px] text-[#55667A] hover:bg-[#F4F7FB]">
                رجوع
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="h-11 rounded-full bg-[#1E9BE6] px-5 text-[14px] font-semibold text-white disabled:bg-[#B9DDF5]"
                data-testid="button-slot-change-confirm"
              >
                {mutation.isPending ? "جارٍ الحفظ…" : "اعتمد موعدي الجديد"}
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
