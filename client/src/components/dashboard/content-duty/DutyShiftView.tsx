import { Link } from "wouter";
import type { ContentDutyRoomResponse } from "@shared/contentDuty";
import { riyadhClock } from "@shared/contentDuty";
import { minutesText, statusLabel, statusTone } from "@/lib/contentDuty";
import { DutyRing } from "./ContentDutyCard";
import { DutyLegend, DutyPulseRibbon } from "./DutyPulseRibbon";

type Shift = NonNullable<ContentDutyRoomResponse["shift"]>;

const surface = "rounded-[22px] bg-white shadow-[0_1px_4px_rgba(27,43,58,.06)] dark:bg-slate-900";

function Vital({ label, value, sub, subTone, valueColor, first }: { label: string; value: string; sub?: string; subTone?: "good" | "bad" | "muted"; valueColor?: string; first?: boolean }) {
  const tone = subTone === "good" ? "#13734E" : subTone === "bad" ? "#BF3038" : "#55667A";
  return (
    <div className={`flex flex-col gap-1 px-3 py-3.5 ${first ? "" : "border-s border-[#EEF2F6]"}`}>
      <span className="text-xs text-[#55667A]">{label}</span>
      <span dir="auto" className="text-right text-[26px] font-bold tabular-nums" style={{ color: valueColor }}>{value}</span>
      {sub ? <span className="text-xs" style={{ color: tone }}>{sub}</span> : null}
    </div>
  );
}

function compareTone(now: number | null, avg: number | null, higherIsBetter: boolean): "good" | "bad" | "muted" {
  if (now === null || avg === null || now === avg) return "muted";
  return (now > avg) === higherIsBetter ? "good" : "bad";
}

function Chips({ shift, thresholds }: { shift: Shift; thresholds: ContentDutyRoomResponse["thresholds"] }) {
  const p = shift.report.presence;
  const chips: Array<{ text: string; tone: "bad" | "warn" | "info" }> = [];
  if (p.lateStartMin > thresholds.lateStartMin) {
    chips.push({ text: p.firstActivityAt ? `بدأ متأخرًا ${p.lateStartMin} د (أول حركة ${riyadhClock(p.firstActivityAt)})` : `لا حركة منذ بداية الوردية (${p.lateStartMin} د)`, tone: "bad" });
  }
  if (p.longestGap && p.longestGap.minutes >= thresholds.gapMin && p.firstActivityAt && p.longestGap.start > p.firstActivityAt) {
    chips.push({ text: `أطول انقطاع ${p.longestGap.minutes} د (${riyadhClock(p.longestGap.start)} – ${riyadhClock(p.longestGap.end)})`, tone: "bad" });
  }
  if (p.earlyLeaveMin !== null && p.earlyLeaveMin > thresholds.lateStartMin) chips.push({ text: `غادر قبل النهاية بـ ${p.earlyLeaveMin} د`, tone: "bad" });
  if (shift.report.leftAtHandoff) chips.push({ text: `سلّم ${shift.report.leftAtHandoff} مواد متأخرة للوردية التالية`, tone: "warn" });
  if (shift.report.peakBacklog > 0) chips.push({ text: `أعلى عدد انتظار ${shift.report.peakBacklog}`, tone: "warn" });
  if (shift.report.breakingFast > 0) chips.push({ text: `${shift.report.breakingFast} عاجل حُسم خلال ${thresholds.breakingWaitMin} د`, tone: "info" });
  if (chips.length === 0) return null;
  const tones = { bad: "bg-[#FDECEC] text-[#BF3038]", warn: "bg-[#FFF6E5] text-[#946000]", info: "bg-[#E6F4FD] text-[#0B6FA8]" };
  return (
    <div className="flex flex-wrap gap-2 pt-1.5">
      {chips.map((c) => <span key={c.text} className={`rounded-full px-3 py-1 text-xs ${tones[c.tone]}`}>{c.text}</span>)}
    </div>
  );
}

export function DutyShiftView({ room }: { room: ContentDutyRoomResponse }) {
  const shift = room.shift as Shift;
  const r = shift.report;
  const avg = shift.averages;
  const tone = statusTone(shift.status);
  const overdue = shift.waiting.filter((w) => w.overdue).length;
  const maxHour = Math.max(1, ...r.hourly.map((h) => h ?? 0));
  const startHour = Number(shift.start.slice(0, 2));

  const compareRows: Array<{ label: string; now: string; avg: string; trend: "good" | "bad" | "muted"; word: string }> = [
    { label: "الحضور المتصل", now: r.presence.presentPct === null ? "—" : `${r.presence.presentPct}%`, avg: avg.presentPct === null ? "—" : `${avg.presentPct}%`, trend: compareTone(r.presence.presentPct, avg.presentPct, true), word: "" },
    { label: "المنشور", now: String(r.published), avg: avg.published === null ? "—" : String(avg.published), trend: compareTone(r.published, avg.published, true), word: "" },
    { label: "زمن الاستجابة (وسيط)", now: minutesText(r.responseMedianMin), avg: minutesText(avg.responseMedianMin), trend: compareTone(r.responseMedianMin, avg.responseMedianMin, false), word: "" },
    { label: "أطول انقطاع", now: minutesText(r.presence.longestGap?.minutes ?? 0), avg: minutesText(avg.longestGapMin), trend: compareTone(r.presence.longestGap?.minutes ?? 0, avg.longestGapMin, false), word: "" },
    { label: "بداية الوردية", now: `+${r.presence.lateStartMin} د`, avg: avg.lateStartMin === null ? "—" : `+${avg.lateStartMin} د`, trend: compareTone(r.presence.lateStartMin, avg.lateStartMin, false), word: "" },
  ].map((row) => ({ ...row, word: row.trend === "good" ? "أفضل" : row.trend === "bad" ? "أسوأ" : "" }));

  return (
    <div className="flex flex-col gap-[22px]">
      <section aria-label="المناوب" className="flex flex-col gap-6 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] p-5 shadow-[0_2px_10px_rgba(27,43,58,.05)] sm:p-7">
        <div className="flex flex-wrap items-center gap-6 sm:gap-7">
          {shift.live ? <DutyRing pct={shift.elapsedPct} remaining={shift.remainingMin} size={132} label="باقي على نهايتها" /> : null}
          <div className="flex min-w-[240px] flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] border-white bg-[#E6F4FD] text-lg font-bold text-[#0B6FA8]">{shift.person.initial}</span>
              <div className="flex flex-col">
                <span className="text-[13px] text-[#55667A]">{shift.live ? "مدير المحتوى المناوب" : "وردية منتهية"}</span>
                <span className="text-[22px] font-bold">{shift.person.name}</span>
              </div>
              {shift.status ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: tone.dot }} />{statusLabel(shift.status)}
                </span>
              ) : null}
            </div>
            <p className="m-0 text-[15px] leading-7 text-[#55667A]">
              <bdi dir="ltr" className="tabular-nums">{shift.start} – {shift.end}</bdi>
              {shift.coveredName ? <> · يغطي بدل {shift.coveredName}</> : null}
              {shift.lastAction ? <> · آخر عمل <bdi dir="ltr" className="tabular-nums">{shift.lastAction.at}</bdi>: «{shift.lastAction.title}»</> : null}
            </p>
            {shift.next ? (
              <p className="m-0 text-[13px] text-[#55667A]">
                التالي: <strong className="text-[#1B2B3A]">{shift.next.name}</strong> <bdi dir="ltr" className="tabular-nums">{shift.next.start}</bdi>
                {shift.next.pendingToHandOver > 0 ? <> · {shift.live ? "سيُسلَّم له الآن" : "سُلّم له"} <strong className="text-[#946000]">{shift.next.pendingToHandOver} مواد</strong></> : null}
              </p>
            ) : null}
          </div>
          <div className="grid min-w-[300px] flex-1 grid-cols-2 rounded-[18px] bg-white/75 p-1.5 sm:grid-cols-4">
            <Vital first label="الحضور المتصل" value={r.presence.presentPct === null ? "—" : `${r.presence.presentPct}%`} sub={avg.presentPct === null ? undefined : `معدّله \u2066${avg.presentPct}%\u2069`} subTone={compareTone(r.presence.presentPct, avg.presentPct, true)} />
            <Vital label="نشر في ورديته" value={String(r.published)} sub={`تعديل ${r.edits} · مراجعة ${r.reviews}`} />
            <Vital label="زمن الاستجابة" value={minutesText(r.responseMedianMin)} sub={avg.responseMedianMin === null ? undefined : `معدّله ${avg.responseMedianMin} د`} subTone={compareTone(r.responseMedianMin, avg.responseMedianMin, false)} />
            {shift.live ? (
              <Vital label="تنتظر الآن" value={String(shift.waiting.length)} valueColor="#946000" sub={overdue ? `${overdue} تجاوزت الحد` : "لا متأخر"} subTone={overdue ? "bad" : "good"} />
            ) : (
              <Vital label="المتروك عند التسليم" value={String(r.leftAtHandoff ?? 0)} valueColor={(r.leftAtHandoff ?? 0) > 0 ? "#BF3038" : "#13734E"} />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 rounded-[18px] bg-white px-4 pb-3.5 pt-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold">نبض الوردية</span>
              <span className="text-xs text-[#55667A]">كل خانة 5 دقائق · النقاط فوقها ما نشره · الخط تحتها المسودات المنتظرة</span>
            </div>
            <DutyLegend />
          </div>
          <div className="pt-6">
            <DutyPulseRibbon
              cells={r.cells}
              startMs={shift.startMs}
              endMs={shift.endMs}
              nowMs={shift.live ? shift.nowMs : undefined}
              ticks={r.ticks}
              backlog={r.backlog}
              label={`حضور ${shift.person.name} خلال الوردية: ${r.presence.presentPct ?? 0}%`}
            />
          </div>
          <Chips shift={shift} thresholds={room.thresholds} />
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-[22px]">
        <section aria-labelledby="duty-wait" className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2.5 px-1">
            <h2 id="duty-wait" className="m-0 text-lg font-bold">{shift.live ? "مسودات تنتظر قرار المناوب" : "المسودات"}</h2>
            <span className="text-[13px] text-[#55667A]">الأقدم أولًا · الانتظار من آخر إرسال</span>
          </div>
          {!shift.live ? (
            <p className={`${surface} m-0 p-5 text-sm text-[#55667A]`}>قائمة المنتظر تظهر للوردية الجارية فقط. انتهت هذه الوردية و{(r.leftAtHandoff ?? 0) > 0 ? `سُلّم منها ${r.leftAtHandoff} مواد متأخرة` : "لم يبقَ فيها متأخر"}.</p>
          ) : shift.waiting.length === 0 ? (
            <p className={`${surface} m-0 p-5 text-sm text-[#13734E]`}>لا مسودات تنتظر الآن.</p>
          ) : (
            shift.waiting.map((d) => {
              const old = d.overdue;
              const ageBg = old ? "#FDECEC" : d.waitMin >= room.thresholds.normalWaitMin / 2 ? "#FFF6E5" : "#F1F4F8";
              const ageFg = old ? "#BF3038" : d.waitMin >= room.thresholds.normalWaitMin / 2 ? "#946000" : "#55667A";
              const limit = d.breaking ? room.thresholds.breakingWaitMin : room.thresholds.normalWaitMin;
              return (
                <article key={d.articleId} className={`${surface} flex flex-wrap items-center gap-4 px-[18px] py-4`}>
                  <div className="flex w-[62px] shrink-0 flex-col items-center rounded-[14px] py-2" style={{ background: ageBg }}>
                    <span dir="ltr" className="text-[22px] font-bold tabular-nums" style={{ color: ageFg }}>{d.waitMin}</span>
                    <span className="text-[11px]" style={{ color: ageFg }}>دقيقة</span>
                  </div>
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {d.breaking ? <span className="rounded-full bg-[#FDECEC] px-2 py-0.5 text-[11px] font-bold text-[#BF3038]">عاجل</span> : null}
                      <span className="text-[15px] font-semibold leading-relaxed">{d.title}</span>
                    </div>
                    <span className="text-[13px] text-[#55667A]">{[d.submitter, d.category].filter(Boolean).join(" · ") || "—"}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF2F6]" aria-hidden="true">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (d.waitMin / limit) * 100)}%`, background: old ? "#E0393E" : "#E0A21B" }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-center text-xs ${d.openedBy ? "bg-[#E6F4FD] text-[#0B6FA8]" : old ? "bg-[#FDECEC] text-[#BF3038]" : "bg-[#F1F4F8] text-[#55667A]"}`}>
                      {d.openedBy ? `مفتوحة لدى ${d.openedBy}` : "لم تُفتح"}
                    </span>
                    <Link href={`/dashboard/articles/${d.articleId}/edit`} className="inline-flex h-10 items-center justify-center rounded-full bg-[#E6F4FD] px-4 text-sm font-semibold text-[#0B6FA8]">
                      افتح المسودة
                    </Link>
                  </div>
                </article>
              );
            })
          )}
          <p className="mx-1 mt-1 text-xs text-[#617183]">
            الحد: <bdi dir="ltr">{room.thresholds.breakingWaitMin}</bdi> د للعاجل و<bdi dir="ltr">{room.thresholds.normalWaitMin}</bdi> د للعادي.
          </p>
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-[22px]">
          <section aria-labelledby="duty-hours" className={`${surface} flex flex-col gap-3.5 p-5`}>
            <div className="flex items-baseline justify-between">
              <h2 id="duty-hours" className="m-0 text-base font-bold">الإنتاج ساعة بساعة</h2>
              <span className="text-xs text-[#55667A]">نشر · تعديل · مراجعة</span>
            </div>
            <div className="flex h-[130px] items-end gap-2 pt-2" role="img" aria-label="الإنتاج في كل ساعة من الوردية">
              {r.hourly.map((v, i) => (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span dir="ltr" className="text-xs font-semibold tabular-nums">{v === null ? "" : v}</span>
                  <div className="w-full max-w-[26px] rounded-[8px_8px_4px_4px]" style={{ height: v === null ? 6 : Math.max(6, (v / maxHour) * 90), background: v === null ? "#EEF2F6" : v === 0 ? "#F5C9CC" : "#1E9BE6" }} />
                  <span dir="ltr" className="text-[11px] tabular-nums text-[#617183]">{(startHour + i) % 24}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="duty-compare" className={`${surface} overflow-hidden`}>
            <div className="px-5 pb-2 pt-[18px]">
              <h2 id="duty-compare" className="m-0 text-base font-bold">مقارنة بنفسه لا بزملائه</h2>
              <span className="text-xs text-[#55667A]">
                {avg.shifts > 0 ? `مقابل متوسط آخر ${avg.shifts} ورديات من النوع نفسه له` : "لا ورديات سابقة للمقارنة بعد"}
              </span>
            </div>
            {compareRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2.5 border-t border-[#EEF2F6] px-5 py-3">
                <span className="text-sm">{row.label}</span>
                <span className="inline-flex items-baseline gap-2.5">
                  <span dir="ltr" className="text-[15px] font-bold tabular-nums">{row.now}</span>
                  <span dir="ltr" className="text-xs tabular-nums text-[#617183]">{row.avg}</span>
                  {row.word ? <span className="text-xs font-semibold" style={{ color: row.trend === "good" ? "#13734E" : "#BF3038" }}>{row.word}</span> : null}
                </span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
