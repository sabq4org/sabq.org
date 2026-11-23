import type { DutyCellState } from "@shared/contentDuty";
import { riyadhClock } from "@shared/contentDuty";
import { DUTY_COLORS } from "@/lib/contentDuty";

interface Props {
  cells: DutyCellState[];
  startMs: number;
  endMs: number;
  nowMs?: number;
  ticks?: Array<{ offsetMin: number; breaking: boolean }>;
  backlog?: number[];
  compact?: boolean;
  label: string;
}

const HOUR = 3_600_000;

/** «نبض الوردية»: خانة لكل 5 دقائق تبدأ من اليمين، النقاط فوقها ما نُشر، والخط تحتها المنتظر. */
export function DutyPulseRibbon({ cells, startMs, endMs, nowMs, ticks, backlog, compact, label }: Props) {
  const span = endMs - startMs;
  const durationMin = span / 60_000;
  const nowPct = nowMs && nowMs > startMs && nowMs < endMs ? ((nowMs - startMs) / span) * 100 : null;
  const hours: Array<{ pct: number; text: string }> = [];
  for (let t = startMs; t <= endMs; t += HOUR) hours.push({ pct: ((t - startMs) / span) * 100, text: riyadhClock(t) });
  if (hours.length > 7) {
    const step = Math.ceil(hours.length / 6);
    for (let i = hours.length - 1; i >= 0; i--) if (i % step !== 0 && i !== hours.length - 1) hours.splice(i, 1);
  }
  const maxBacklog = Math.max(4, ...(backlog ?? [0]));
  const points = (backlog ?? []).map((v, i) => {
    const x = 960 - Math.min(1, (i * 10) / durationMin) * 960;
    const y = 42 - (v / maxBacklog) * 36;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="w-full" dir="rtl">
      {ticks && ticks.length > 0 && !compact ? (
        <div className="relative h-[18px]" aria-hidden="true">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                right: `${(t.offsetMin / durationMin) * 100}%`,
                top: t.breaking ? 4 : 6,
                width: t.breaking ? 10 : 7,
                height: t.breaking ? 10 : 7,
                background: t.breaking ? "#E0393E" : "#1B2B3A",
                transform: "translateX(50%)",
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="relative">
        <div className={`flex ${compact ? "h-3.5 gap-px" : "h-[34px] gap-[2px]"}`} role="img" aria-label={label}>
          {cells.map((c, i) => (
            <span key={i} className={`min-w-0 flex-1 ${compact ? "rounded-[2px]" : "rounded-[3px]"}`} style={{ background: DUTY_COLORS[c] }} />
          ))}
        </div>
        {nowPct !== null && !compact ? (
          <>
            <div className="absolute -bottom-2 -top-2 w-0.5 rounded bg-[#1B2B3A]" style={{ right: `${nowPct}%` }} aria-hidden="true" />
            <span
              dir="ltr"
              className="absolute -top-7 rounded-full bg-[#1B2B3A] px-2 py-0.5 text-[11px] tabular-nums text-white"
              style={{ right: `${nowPct}%`, transform: "translateX(50%)" }}
            >
              {riyadhClock(nowMs as number)}
            </span>
          </>
        ) : null}
      </div>
      {backlog && backlog.length > 1 && !compact ? (
        <svg viewBox="0 0 960 46" preserveAspectRatio="none" className="mt-1 block h-[46px] w-full" aria-hidden="true">
          <polyline points={points} fill="none" stroke="#E0A21B" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
      {compact ? null : <div className="relative mt-1 h-4 text-[11px] text-[#617183]">
        {hours.map((h, i) => (
          <span key={i} dir="ltr" className="absolute tabular-nums" style={{ right: `${h.pct}%`, transform: i === 0 ? "none" : i === hours.length - 1 ? "translateX(100%)" : "translateX(50%)" }}>
            {h.text === "00:00" && i === hours.length - 1 ? "24:00" : h.text}
          </span>
        ))}
      </div>}
    </div>
  );
}

export function DutyLegend() {
  const items: Array<{ c: string; t: string; round?: boolean }> = [
    { c: DUTY_COLORS.action, t: "يعمل" },
    { c: DUTY_COLORS.view, t: "متصل بلا حركة" },
    { c: DUTY_COLORS.absent, t: "غائب" },
    { c: "#1B2B3A", t: "نُشر", round: true },
    { c: "#E0393E", t: "عاجل", round: true },
    { c: "#E0A21B", t: "المنتظر" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#55667A]">
      {items.map((i) => (
        <span key={i.t} className="inline-flex items-center gap-1.5">
          <span className={i.round ? "h-2 w-2 rounded-full" : "h-3 w-3 rounded-[3px]"} style={{ background: i.c }} />
          {i.t}
        </span>
      ))}
    </div>
  );
}
