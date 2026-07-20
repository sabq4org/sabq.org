import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DashboardFavoriteToggle } from "@/components/dashboard/DashboardFavoriteToggle";

interface DashboardPageHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleTestId?: string;
  /**
   * نجمة التفضيل بجانب العنوان.
   * الافتراضي false لأن النجمة تظهر عالمياً بجانب اسم الصفحة في AppBreadcrumbs
   * — فعّلها فقط إن أردت نجمة إضافية داخل ترويسة الصفحة.
   */
  showFavoriteToggle?: boolean;
}

/**
 * Clean page header that respects theme tokens without flooding
 * surfaces with accent/primary (avoids neon washes on themes like WhatsApp).
 */
export function DashboardPageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
  titleTestId,
  showFavoriteToggle = false,
}: DashboardPageHeaderProps) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-none sm:p-6",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-primary/[0.04] to-transparent"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-11 sm:w-11">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1
                className="min-w-0 text-xl font-bold tracking-tight text-foreground sm:text-2xl"
                data-testid={titleTestId}
              >
                {title}
              </h1>
              {showFavoriteToggle ? <DashboardFavoriteToggle /> : null}
            </div>
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
