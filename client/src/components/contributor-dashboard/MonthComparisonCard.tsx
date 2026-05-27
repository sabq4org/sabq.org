import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthComparisonCardProps {
  comparison: {
    viewsThisMonth: number;
    viewsLastMonth: number;
    likesThisMonth: number;
    likesLastMonth: number;
  };
  loading?: boolean;
}

function pctChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function TrendIndicator({ value }: { value: number }) {
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  const color = value > 0
    ? "text-green-600 dark:text-green-400"
    : value < 0
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", color)}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

export function MonthComparisonCard({ comparison, loading }: MonthComparisonCardProps) {
  const viewsChange = pctChange(comparison.viewsThisMonth, comparison.viewsLastMonth);
  const likesChange = pctChange(comparison.likesThisMonth, comparison.likesLastMonth);

  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          مقارنة الشهر
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
              <span className="text-xs text-muted-foreground">المشاهدات</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {comparison.viewsThisMonth.toLocaleString("ar-SA")}
                </span>
                <TrendIndicator value={viewsChange} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
              <span className="text-xs text-muted-foreground">الإعجابات</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {comparison.likesThisMonth.toLocaleString("ar-SA")}
                </span>
                <TrendIndicator value={likesChange} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              مقارنة بالشهر الماضي ({comparison.viewsLastMonth.toLocaleString("ar-SA")} مشاهدة)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
