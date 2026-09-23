import { cn } from "@/lib/utils";
import { fmtPct } from "./format";

/**
 * شارة تغيّر: اللون + السهم + الرقم (ترميز مزدوج فلا نعتمد على اللون وحده).
 * الأخضر/الأحمر عرف الأسواق العربية؛ الزوج مُتحقَّق منه لعمى الألوان مع السهم كترميز ثانٍ.
 */
export function ChangeChip({ value, className, suffix, digits = 1, hideEmpty = false }: { value: number | null | undefined; className?: string; suffix?: string; digits?: number; hideEmpty?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    if (hideEmpty) return null;
    return <span className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground", className)}>—</span>;
  }
  const up = value > 0.0001, down = value < -0.0001;
  return (
    <span
      dir="ltr"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap",
        up && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        down && "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
        !up && !down && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {up ? "▲" : down ? "▼" : "•"} {fmtPct(value, digits)}{suffix}
    </span>
  );
}
