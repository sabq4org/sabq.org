import { Link } from "wouter";
import type { ContentDutyCardEntry, ContentDutyCardResponse } from "@shared/contentDuty";
import { useContentDutyCard } from "@/hooks/useContentDuty";
import { formatRemaining, statusLabel, statusTone, viewerClock } from "@/lib/contentDuty";
import { DutyPulseRibbon } from "./DutyPulseRibbon";

const ROOM = "/dashboard/content-duty";

export function DutyRing({ pct, remaining, size = 84, label = "باقٍ" }: { pct: number; remaining: number; size?: number; label?: string }) {
  const r = 72;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 168 168" role="img" aria-label={`مضى ${pct}% من الوردية`}>
        <circle cx="84" cy="84" r={r} fill="none" stroke="#FFFFFF" strokeWidth={16} />
        <circle
          cx="84" cy="84" r={r} fill="none" stroke="#1E9BE6" strokeWidth={16} strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 84 84)"
        />
        <circle cx="84" cy="84" r={56} fill="#FFFFFF" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span dir="ltr" className="font-bold tabular-nums text-[#1E9BE6]" style={{ fontSize: Math.round(size / 4.6) }}>{formatRemaining(remaining)}</span>
        <span className="text-[10px] text-[#55667A]">{label}</span>
      </div>
    </div>
  );
}

function StatusPill({ entry }: { entry: Pick<ContentDutyCardEntry, "status"> }) {
  const tone = statusTone(entry.status);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: tone.bg, color: tone.fg }}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: tone.dot }} />
      {statusLabel(entry.status)}
    </span>
  );
}

function Numbers({ data, entry }: { data: ContentDutyCardResponse; entry: ContentDutyCardEntry }) {
  if (!data.waiting) return null;
  const cells: Array<{ label: string; value: number | null; color: string }> = [
    { label: "نشر", value: entry.published, color: "#1B2B3A" },
    { label: "تنتظر", value: data.waiting.count, color: "#946000" },
    { label: "متأخرة", value: data.waiting.overdue, color: data.waiting.overdue > 0 ? "#BF3038" : "#13734E" },
  ];
  return (
    <div className="flex rounded-2xl bg-white/75">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex flex-col gap-0.5 px-4 py-2.5 ${i > 0 ? "border-s border-[#EEF2F6]" : ""}`}>
          <span className="text-xs text-[#55667A]">{c.label}</span>
          <span dir="ltr" className="text-right text-[22px] font-bold tabular-nums" style={{ color: c.color }}>{c.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

export default function ContentDutyCard() {
  const { data, isLoading, isError } = useContentDutyCard();
  // قبل تنفيذ SQL أو عند الخطأ تختفي البطاقة ولا تزعج اللوحة.
  if (isError) return null;
  if (isLoading || !data) {
    return <div className="h-[132px] animate-pulse rounded-[22px] bg-[#EEF4FA] dark:bg-slate-800" aria-busy="true" aria-label="جار تحميل المناوبة" />;
  }

  const shell = "rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] p-4 text-[#1B2B3A] shadow-[0_2px_10px_rgba(27,43,58,.05)] sm:p-6";

  if (data.onDuty.length === 0) {
    return (
      <section aria-label="المناوبة الآن" className={shell} dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[#55667A]">المناوب الآن</span>
            <span className="text-lg font-bold text-[#BF3038]">لا مناوب الآن</span>
            {data.next ? (
              <span className="text-[13px] text-[#55667A]">
                أقرب وردية: {data.next.name} <bdi dir="ltr" className="tabular-nums">{viewerClock(data.next.startMs, data.next.start)}</bdi>
              </span>
            ) : null}
          </div>
          <Link href={ROOM} className="inline-flex h-11 items-center rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,.3)]">
            افتح غرفة المناوبة
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="المناوبة الآن" className={`${shell} flex flex-col gap-4`} dir="rtl">
      {data.onDuty.map((entry, idx) => (
        <div key={`${entry.name}-${idx}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <DutyRing pct={entry.elapsedPct} remaining={entry.remainingMin} size={idx === 0 ? 84 : 64} />
            <div className="flex min-w-[180px] flex-1 flex-col gap-1">
              <span className="text-[13px] text-[#55667A]">{idx === 0 ? "المناوب الآن" : "يناوب معه"}</span>
              <span className="flex flex-wrap items-center gap-2.5">
                <span className="text-xl font-bold">{entry.name}</span>
                <StatusPill entry={entry} />
              </span>
              <span className="text-[13px] text-[#55667A]">
                <bdi dir="ltr" className="tabular-nums">{viewerClock(entry.startMs, entry.start)} – {viewerClock(entry.endMs, entry.end)}</bdi>
                {entry.coveredName ? <> · بدل {entry.coveredName}</> : null}
                {idx === 0 && data.next ? <> · يستلم بعده {data.next.name}</> : null}
              </span>
            </div>
            <Numbers data={data} entry={entry} />
            {idx === 0 ? (
              <Link href={ROOM} className="inline-flex h-11 items-center rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,.3)]">
                افتح غرفة المناوبة
              </Link>
            ) : null}
          </div>
          {entry.cells ? (
            <DutyPulseRibbon compact cells={entry.cells} startMs={0} endMs={entry.cells.length * 300_000} label={`نبض وردية ${entry.name}`} />
          ) : null}
        </div>
      ))}
      {data.alert ? (
        <Link
          href={`/dashboard/articles/${data.alert.articleId}/edit`}
          className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-sm text-[#1B2B3A] hover:bg-[#F8FBFE]"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#E0393E]" />
          <span className="min-w-0 flex-1">
            <strong>
              {data.alert.breaking ? "عاجل ينتظر" : "مادة تنتظر"} <bdi dir="ltr" className="tabular-nums">{data.alert.waitMin}</bdi> دقيقة
              {data.alert.opened ? " (مفتوح الآن)" : " ولم يُفتح"}:
            </strong>{" "}
            {data.alert.title}
          </span>
          <span className="shrink-0 font-semibold text-[#0B6FA8]">افتحه</span>
        </Link>
      ) : null}
    </section>
  );
}
