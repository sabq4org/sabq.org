import { Minus, Plus } from "lucide-react";

const MAX_GOALS = 20;

interface ScoreStepperProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
}

/**
 * عدّاد أهداف منتخب واحد: − [قيمة] + عموديًا. القيمة كبيرة وواضحة، والأزرار
 * معطّلة بعد قفل المباراة. مدى 0..20 (يكفي لأي نتيجة واقعية).
 */
export function ScoreStepper({ value, onChange, disabled, label }: ScoreStepperProps) {
  const bump = (delta: number) => {
    if (disabled) return;
    onChange(Math.min(MAX_GOALS, Math.max(0, value + delta)));
  };

  return (
    <div className="flex flex-col items-center gap-1.5" aria-label={label}>
      <button
        type="button"
        onClick={() => bump(1)}
        disabled={disabled}
        aria-label={`زيادة أهداف ${label}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/20 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
      </button>

      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-black tabular-nums shadow-sm ${
          disabled
            ? "bg-muted text-muted-foreground"
            : "bg-white dark:bg-card text-foreground ring-1 ring-emerald-500/30"
        }`}
        data-testid={`score-value-${label}`}
      >
        {value}
      </div>

      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={disabled || value <= 0}
        aria-label={`إنقاص أهداف ${label}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/20 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
}
