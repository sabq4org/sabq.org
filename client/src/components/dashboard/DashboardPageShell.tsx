import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardPageShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Optional max-width utility, e.g. max-w-[1600px] */
  maxWidthClassName?: string;
}

/**
 * Quiet page atmosphere. Uses background/muted only — no heavy accent fills
 * so theme presets (WhatsApp green accent, etc.) stay elegant.
 */
export function DashboardPageShell({
  children,
  className,
  contentClassName,
  maxWidthClassName,
}: DashboardPageShellProps) {
  return (
    <div className={cn("relative min-h-full overflow-hidden bg-background text-foreground", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.04),transparent_50%)]"
      />
      <div
        className={cn(
          "relative space-y-6",
          maxWidthClassName && "mx-auto",
          maxWidthClassName,
          contentClassName,
        )}
        dir="rtl"
      >
        {children}
      </div>
    </div>
  );
}
