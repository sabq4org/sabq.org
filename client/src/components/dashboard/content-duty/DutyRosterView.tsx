import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContentDutyRosterResponse, DutyThresholds, RosterShiftView } from "@shared/contentDuty";
import { addDays, DUTY_DAY_NAMES, minuteLabel } from "@shared/contentDuty";
import { apiRequest } from "@/lib/queryClient";
import { personColor } from "@/lib/contentDuty";
import { DUTY_CARD_URL, DUTY_ROOM_URL, DUTY_ROSTER_URL, DUTY_TEAM_URL } from "@/hooks/useContentDuty";
import { useToast } from "@/hooks/use-toast";

const surface = "rounded-[22px] bg-white shadow-[0_1px_4px_rgba(27,43,58,.06)] dark:bg-slate-900";
const hatch = { backgroundImage: "repeating-linear-gradient(135deg,#F7D4D6 0 6px,#FDF1F2 6px 12px)" };
const input = "h-11 rounded-xl border border-[#DCE4EC] bg-white px-3 text-[15px] text-[#1B2B3A] focus:outline-none focus:ring-2 focus:ring-[#1E9BE6]";
const primary = "inline-flex h-11 items-center justify-center rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,.3)] disabled:opacity-50";
const soft = "inline-flex h-11 items-center justify-center rounded-full bg-[#E6F4FD] px-5 text-sm font-semibold text-[#0B6FA8] disabled:opacity-50";

const toMinute = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const toTime = (minute: number) => minuteLabel(minute % 1440);

function useDutyMutation<T>(fn: (body: T) => Promise<unknown>, done: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      [DUTY_ROSTER_URL, DUTY_CARD_URL, DUTY_ROOM_URL, DUTY_TEAM_URL].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: done });
    },
    onError: (e: Error) => toast({ title: "تعذر الحفظ", description: e.message, variant: "destructive" }),
  });
}

function ShiftEditor({ roster, editing, onDone }: { roster: ContentDutyRosterResponse; editing: RosterShiftView | null; onDone: () => void }) {
  const [userId, setUserId] = useState(editing?.userId ?? "");
  const [days, setDays] = useState<number[]>(editing?.days ?? [0, 1, 2, 3, 4]);
  const [start, setStart] = useState(toTime(editing?.startMinute ?? 960));
  const [end, setEnd] = useState(toTime(editing?.endMinute ?? 1440));
  useEffect(() => {
    setUserId(editing?.userId ?? "");
    setDays(editing?.days ?? [0, 1, 2, 3, 4]);
    setStart(toTime(editing?.startMinute ?? 960));
    setEnd(toTime(editing?.endMinute ?? 1440));
  }, [editing]);
  const body = () => {
    const s = toMinute(start);
    let e = toMinute(end);
    if (e === 0) e = 1440;
    return { userId, days, startMinute: s, endMinute: e };
  };
  const save = useDutyMutation(
    () => editing
      ? apiRequest(`/api/admin/content-duty/shifts/${editing.id}`, { method: "PATCH", body: JSON.stringify(body()) })
      : apiRequest("/api/admin/content-duty/shifts", { method: "POST", body: JSON.stringify(body()) }),
    "حُفظت الوردية",
  );
  const disable = useDutyMutation(
    () => apiRequest(`/api/admin/content-duty/shifts/${editing?.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) }),
    "أُوقفت الوردية",
  );
  const overnight = toMinute(end) !== 0 && toMinute(end) <= toMinute(start);
  return (
    <section aria-labelledby="duty-edit" className={`${surface} flex flex-col gap-3.5 p-5`}>
      <h2 id="duty-edit" className="m-0 text-base font-bold">{editing ? `تعديل وردية ${editing.name}` : "إضافة وردية"}</h2>
      <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">الموظف
        <select className={input} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">اختر</option>
          {roster.candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
        </select>
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-[#55667A]">الأيام</span>
        <div className="flex flex-wrap gap-1.5">
          {DUTY_DAY_NAMES.map((name, d) => {
            const on = days.includes(d);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                className={`h-9 rounded-full px-3 text-[13px] ${on ? "bg-[#1E9BE6] text-white shadow-[0_4px_10px_rgba(30,155,230,.28)]" : "bg-white text-[#1B2B3A] shadow-[0_1px_3px_rgba(27,43,58,.1)]"}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">من
          <input type="time" dir="ltr" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">إلى
          <input type="time" dir="ltr" className={input} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <p className="m-0 text-xs text-[#55667A]">الوقت بتوقيت الرياض، ولو كان الموظف في بلد آخر.</p>
      {overnight ? <p className="m-0 text-xs text-[#0B6FA8]">تمتد إلى صباح اليوم التالي.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${primary} flex-1`} disabled={!userId || days.length === 0 || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onDone })}>حفظ</button>
        {editing ? <button type="button" className={`${soft} flex-1`} disabled={disable.isPending} onClick={() => disable.mutate(undefined, { onSuccess: onDone })}>إيقاف الوردية</button> : null}
        {editing ? <button type="button" className="h-11 px-3 text-sm text-[#55667A]" onClick={onDone}>إلغاء</button> : null}
      </div>
    </section>
  );
}

function ExceptionEditor({ roster }: { roster: ContentDutyRosterResponse }) {
  const [dutyDate, setDutyDate] = useState(roster.today);
  const [userId, setUserId] = useState("");
  const [coverUserId, setCover] = useState("");
  const [note, setNote] = useState("");
  const add = useDutyMutation(
    () => apiRequest("/api/admin/content-duty/exceptions", { method: "POST", body: JSON.stringify({ dutyDate, userId, coverUserId: coverUserId || null, note: note || null }) }),
    "حُفظ الاستثناء",
  );
  const cancel = useDutyMutation(
    (id: string) => apiRequest(`/api/admin/content-duty/exceptions/${id}/cancel`, { method: "POST" }),
    "أُلغي الاستثناء",
  );
  const rostered = roster.people;
  return (
    <section aria-labelledby="duty-ex" className={`${surface} overflow-hidden`}>
      <div className="px-5 pb-2 pt-[18px]"><h2 id="duty-ex" className="m-0 text-base font-bold">إجازة أو تغطية</h2></div>
      {roster.exceptions.map((e) => (
        <div key={e.id} className="flex items-start justify-between gap-3 border-t border-[#EEF2F6] px-5 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{e.name} · {e.coverName ? `يغطيه ${e.coverName}` : "إجازة"} · {DUTY_DAY_NAMES[new Date(`${e.dutyDate}T00:00:00Z`).getUTCDay()]} <bdi dir="ltr">{e.dutyDate.slice(8)}/{e.dutyDate.slice(5, 7)}</bdi></span>
            {e.note ? <span className="text-xs text-[#55667A]">{e.note}</span> : null}
          </div>
          <button type="button" className="text-[13px] font-semibold text-[#0B6FA8]" onClick={() => cancel.mutate(e.id)}>إلغاء</button>
        </div>
      ))}
      <div className="flex flex-col gap-2.5 border-t border-[#EEF2F6] p-5">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">اليوم
            <input type="date" dir="ltr" className={input} value={dutyDate} onChange={(e) => setDutyDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">صاحب الوردية
            <select className={input} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">اختر</option>
              {rostered.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">يغطيه (اتركه فارغًا للإجازة)
          <select className={input} value={coverUserId} onChange={(e) => setCover(e.target.value)}>
            <option value="">بلا بديل</option>
            {roster.candidates.filter((c) => c.userId !== userId).map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
          </select>
        </label>
        <input className={input} placeholder="ملاحظة (اختياري)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className={primary} disabled={!userId || !dutyDate || add.isPending} onClick={() => add.mutate(undefined, { onSuccess: () => { setNote(""); setCover(""); } })}>حفظ الاستثناء</button>
      </div>
    </section>
  );
}

function ThresholdsEditor({ value }: { value: DutyThresholds }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = useDutyMutation(
    () => apiRequest("/api/admin/content-duty/settings", { method: "PUT", body: JSON.stringify({ thresholds: draft }) }),
    "حُفظت الحدود",
  );
  const rows: Array<{ key: keyof DutyThresholds; label: string }> = [
    { key: "breakingWaitMin", label: "انتظار الخبر العاجل" },
    { key: "normalWaitMin", label: "انتظار الخبر العادي" },
    { key: "gapMin", label: "انقطاع المناوب" },
    { key: "lateStartMin", label: "تأخر بداية الوردية" },
  ];
  return (
    <section aria-labelledby="duty-rules" className={`${surface} overflow-hidden`}>
      <div className="px-5 pb-2 pt-[18px]"><h2 id="duty-rules" className="m-0 text-base font-bold">حدود التنبيه</h2></div>
      {rows.map((r) => (
        <label key={r.key} className="flex items-center justify-between gap-2.5 border-t border-[#EEF2F6] px-5 py-2.5 text-sm">
          {r.label}
          <span className="inline-flex items-center gap-1.5">
            <input type="number" dir="ltr" min={1} max={240} className="h-9 w-20 rounded-full bg-[#F4F7FB] px-3 text-center font-semibold tabular-nums" value={draft[r.key]} onChange={(e) => setDraft({ ...draft, [r.key]: Number(e.target.value) })} />
            د
          </span>
        </label>
      ))}
      <div className="border-t border-[#EEF2F6] p-4"><button type="button" className={`${soft} w-full`} disabled={save.isPending} onClick={() => save.mutate(undefined)}>حفظ الحدود</button></div>
    </section>
  );
}

export function DutyRosterView({ roster, onWeek }: { roster: ContentDutyRosterResponse; onWeek: (week: string) => void }) {
  const [editing, setEditing] = useState<RosterShiftView | null>(null);
  const isLead = roster.access === "lead";
  const colorOf = useMemo(() => new Map(roster.people.map((p) => [p.userId, personColor(p.colorIndex)])), [roster.people]);
  const nameOf = useMemo(() => new Map(roster.people.map((p) => [p.userId, p.name])), [roster.people]);
  const gapHours = Math.round(roster.gapMinutes / 60);
  const days = Array.from({ length: 7 }, (_, i) => addDays(roster.weekStart, i));

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="h-10 rounded-full bg-white px-4 text-sm shadow-[0_1px_3px_rgba(27,43,58,.08)]" onClick={() => onWeek(addDays(roster.weekStart, -7))}>الأسبوع السابق</button>
          <span className="px-2 text-[15px] font-semibold">
            <bdi dir="ltr">{roster.weekStart.slice(8)}/{roster.weekStart.slice(5, 7)} – {addDays(roster.weekStart, 6).slice(8)}/{addDays(roster.weekStart, 6).slice(5, 7)}</bdi>
          </span>
          <button type="button" className="h-10 rounded-full bg-white px-4 text-sm shadow-[0_1px_3px_rgba(27,43,58,.08)]" onClick={() => onWeek(addDays(roster.weekStart, 7))}>الأسبوع التالي</button>
        </div>
        {gapHours > 0 ? (
          <span className="rounded-full bg-[#FDECEC] px-3.5 py-1.5 text-[13px] font-semibold text-[#BF3038]">بلا تغطية <bdi dir="ltr">{gapHours}</bdi> ساعة هذا الأسبوع</span>
        ) : (
          <span className="rounded-full bg-[#E8F6EF] px-3.5 py-1.5 text-[13px] font-semibold text-[#13734E]">الأسبوع مغطى بالكامل</span>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-[22px]">
        <section aria-label="الأسبوع" className={`${surface} flex min-w-0 flex-[999_1_640px] flex-col gap-1.5 px-4 py-5 sm:px-[22px]`}>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 pb-2 text-xs text-[#55667A]">
            {roster.people.map((p) => (
              <span key={p.userId} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: personColor(p.colorIndex).solid }} />{p.name}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={hatch} />بلا مناوب</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border-[1.5px] border-dashed border-[#9FB3C6]" />تغطية</span>
            <span className="ms-auto font-semibold text-[#0B6FA8]">كل الأوقات بتوقيت الرياض</span>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-[11px] text-[#617183] sm:grid-cols-[96px_minmax(0,1fr)]">
            <span />
            <div className="relative h-4">
              {[0, 6, 12, 18, 24].map((h, i) => (
                <span key={h} dir="ltr" className="absolute tabular-nums" style={{ right: `${(h / 24) * 100}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(100%)" : "translateX(50%)" }}>{minuteLabel(h * 60)}</span>
              ))}
            </div>
          </div>
          {days.map((key) => {
            const isToday = key === roster.today;
            const blocks = roster.blocks.filter((b) => b.dutyDate === key);
            const gaps = roster.gaps.filter((g) => g.dutyDate === key);
            return (
              <div key={key} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-t border-[#EEF2F6] py-2 sm:grid-cols-[96px_minmax(0,1fr)]">
                <span className="flex flex-col">
                  <span className={`text-sm ${isToday ? "font-bold text-[#0B6FA8]" : "font-medium"}`}>{DUTY_DAY_NAMES[new Date(`${key}T00:00:00Z`).getUTCDay()]}</span>
                  <span dir="ltr" className="text-right text-[11px] tabular-nums text-[#617183]">{key.slice(8)}/{key.slice(5, 7)}</span>
                </span>
                <div className={`relative h-10 rounded-[10px] ${isToday ? "bg-[#EEF6FD]" : "bg-[#F7F9FB]"}`}>
                  {gaps.map((g, i) => (
                    <div key={`g${i}`} className="absolute bottom-1 top-1 rounded-lg" style={{ ...hatch, right: `${(g.startMinute / 1440) * 100}%`, width: `${((g.endMinute - g.startMinute) / 1440) * 100}%` }} title={`بلا مناوب ${minuteLabel(g.startMinute)}–${minuteLabel(g.endMinute)}`} />
                  ))}
                  {blocks.map((b, i) => {
                    const c = colorOf.get(b.userId) ?? personColor(0);
                    const overlap = blocks.filter((o) => o.startMinute < b.endMinute && b.startMinute < o.endMinute);
                    const lane = overlap.indexOf(b);
                    const h = 32 / overlap.length;
                    return (
                      <div
                        key={i}
                        className="absolute flex items-center justify-center overflow-hidden rounded-lg"
                        style={{
                          right: `${(b.startMinute / 1440) * 100}%`,
                          width: `${((b.endMinute - b.startMinute) / 1440) * 100}%`,
                          top: 4 + lane * h,
                          height: h - (overlap.length > 1 ? 1 : 0),
                          background: c.soft,
                          border: b.covering ? "1.5px dashed #9FB3C6" : "none",
                        }}
                        title={`${nameOf.get(b.userId) ?? ""} ${minuteLabel(b.startMinute)}–${minuteLabel(b.endMinute)}`}
                      >
                        <span className="truncate px-1.5 text-xs font-semibold" style={{ color: c.text }}>{nameOf.get(b.userId)}</span>
                      </div>
                    );
                  })}
                  {isToday ? <div className="absolute -bottom-1.5 -top-1.5 w-0.5 rounded bg-[#1B2B3A]" style={{ right: `${(roster.nowMinute / 1440) * 100}%` }} aria-hidden="true" /> : null}
                </div>
              </div>
            );
          })}
          {isLead ? (
            <div className="mt-3 flex flex-col">
              <span className="pb-1 text-[13px] text-[#55667A]">الورديات المتكررة · اضغط للتعديل</span>
              {roster.shifts.map((s) => (
                <button key={s.id} type="button" onClick={() => setEditing(s)} className="flex items-center justify-between gap-3 border-t border-[#EEF2F6] py-2.5 text-start text-sm hover:bg-[#F8FBFE]">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-[13px] text-[#55667A]">{s.days.map((d) => DUTY_DAY_NAMES[d]).join("، ")} · <bdi dir="ltr" className="tabular-nums">{minuteLabel(s.startMinute)}–{minuteLabel(s.endMinute)}</bdi></span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#617183]">يعدّل المسؤول الجدول من هذه الصفحة.</p>
          )}
        </section>

        {isLead ? (
          <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-[22px]">
            <ShiftEditor roster={roster} editing={editing} onDone={() => setEditing(null)} />
            <ExceptionEditor roster={roster} />
            <ThresholdsEditor value={roster.thresholds} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
