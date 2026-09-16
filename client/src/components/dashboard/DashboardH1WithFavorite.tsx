import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DashboardFavoriteToggle } from "@/components/dashboard/DashboardFavoriteToggle";

type DashboardH1WithFavoriteProps = {
  children: ReactNode;
  className?: string;
  titleTestId?: string;
  showFavoriteToggle?: boolean;
};

/**
 * عنوان صفحة مخصص مع نجمة المفضلة بجانبه —
 * للصفحات التي لا تستخدم DashboardPageHeader بعد.
 */
export function DashboardH1WithFavorite({
  children,
  className,
  titleTestId,
  showFavoriteToggle = true,
}: DashboardH1WithFavoriteProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <h1 className={cn("min-w-0", className)} data-testid={titleTestId}>
        {children}
      </h1>
      {showFavoriteToggle ? <DashboardFavoriteToggle /> : null}
    </div>
  );
}
