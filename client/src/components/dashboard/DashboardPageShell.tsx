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
 * Soft sky/emerald atmosphere wrapper for dashboard list/admin pages.
 * Pair with DashboardPageHeader for the full polished look.
 */
export function DashboardPageShell({
  children,
  className,
  contentClassName,
  maxWidthClassName,
}: DashboardPageShellProps) {
  return (
    <div className={cn("relative min-h-full overflow-hidden", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.07),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.045),_transparent_45%),linear-gradient(180deg,_rgba(240,249,255,0.55)_0%,_transparent_26%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.1),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.05),_transparent_45%),linear-gradient(180deg,_rgba(8,47,73,0.22)_0%,_transparent_28%)]"
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
