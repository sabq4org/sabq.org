import { cn } from "@/lib/utils";

/** وسم «جديد» صغير نابض — يظهر 48 ساعة بعد صدور تقرير أسبوعي جديد. */
export function NewBadge({ className, label = "جديد" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white leading-4", className)} data-testid="economy-new-badge">
      <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />
      {label}
    </span>
  );
}
