/**
 * شريط ثلاثي القطع (فوز المضيف / تعادل / فوز الضيف) — يُعيد استخدامه «المساعد
 * الذكي» لعرض احتمالات النموذج وإجماع الجمهور بنفس الشكل. RTL: قطعة المضيف يمينًا.
 */
import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  label: string;
  homeName: string;
  awayName: string;
  home: number; // نِسَب مئوية صحيحة
  draw: number;
  away: number;
  /** أبرِز قطعة النتيجة الأرجح بإطار خفيف. */
  highlightTop?: boolean;
}

export function ProbabilityBar({ icon, label, homeName, awayName, home, draw, away, highlightTop }: Props) {
  const top = Math.max(home, draw, away);
  const seg = (value: number, cls: string, isTop: boolean) => (
    <div
      className={`${cls} h-full transition-all ${highlightTop && isTop ? "ring-2 ring-inset ring-white/70" : ""}`}
      style={{ width: `${value}%` }}
    />
  );

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" dir="rtl">
        {seg(home, "bg-emerald-500", home === top)}
        {seg(draw, "bg-amber-400/80", draw === top)}
        {seg(away, "bg-sky-500", away === top)}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-semibold">
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="max-w-[5.5rem] truncate">{homeName}</span>
          <span className="tabular-nums">{home}%</span>
        </span>
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          تعادل <span className="tabular-nums">{draw}%</span>
        </span>
        <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
          <span className="tabular-nums">{away}%</span>
          <span className="max-w-[5.5rem] truncate">{awayName}</span>
          <span className="h-2 w-2 rounded-full bg-sky-500" />
        </span>
      </div>
    </div>
  );
}
