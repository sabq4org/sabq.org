import { cn } from "@/lib/utils";

/** شارة «جديد» الحمراء للخدمات الجديدة. */
export function NewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full bg-[#E5484D] px-2 text-[11px] font-bold leading-none text-white",
        className,
      )}
      data-testid="badge-new-feature"
    >
      جديد
    </span>
  );
}

/** نقطة حمراء (زر القائمة على الجوال). */
export function NewDot({ className }: { className?: string }) {
  return (
    <span
      aria-label="خدمة جديدة"
      className={cn("block h-2.5 w-2.5 rounded-full bg-[#E5484D] ring-2 ring-background", className)}
      data-testid="dot-new-feature"
    />
  );
}
