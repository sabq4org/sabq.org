import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardPageHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleTestId?: string;
}

export function DashboardPageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
  titleTestId,
}: DashboardPageHeaderProps) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-sky-200/60 bg-gradient-to-l from-sky-50/80 via-background to-emerald-50/40 p-5 shadow-sm dark:border-sky-900/40 dark:from-sky-950/30 dark:via-background dark:to-emerald-950/20 sm:p-6",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#1BADF8]/10 blur-3xl dark:bg-[#1BADF8]/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1BADF8]/15 text-[#078fd1] dark:text-[#45c0f5] sm:h-11 sm:w-11">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1
              className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
              data-testid={titleTestId}
            >
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
