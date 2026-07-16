import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface MetricCardChange {
  direction: "up" | "down";
  text: string;
  testId?: string;
  iconTestId?: string;
}

interface MetricCardProps {
  testId: string;
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtext?: string;
  progress?: number;
  change?: MetricCardChange;
}

/**
 * بطاقة مقياس تفصيلية بمعادلة البطاقة الموحّدة وشريحة أيقونة primary.
 * يشتق testids الفرعية (label-… و value-…) من testId بإزالة البادئة "metric-".
 */
export function MetricCard({ testId, label, value, icon: Icon, subtext, progress, change }: MetricCardProps) {
  const key = testId.replace(/^metric-/, "");

  return (
    <Card className="border-0 shadow-sm dark:border dark:border-card-border" data-testid={testId}>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-2" data-testid={`label-${key}`}>
              {label}
            </p>
            <div className="text-2xl md:text-3xl font-bold tabular-nums" data-testid={`value-${key}`}>
              {value}
            </div>
            {subtext && (
              <p className="text-xs text-muted-foreground mt-1" data-testid={`text-${key}-subtext`}>
                {subtext}
              </p>
            )}
            {change && (
              <div className="flex items-center gap-1 mt-1">
                <span data-testid={change.iconTestId}>
                  {change.direction === "up" ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                </span>
                <p className="text-xs text-muted-foreground tabular-nums" data-testid={change.testId}>
                  {change.text}
                </p>
              </div>
            )}
            {typeof progress === "number" && (
              <Progress value={progress} className="mt-2" data-testid={`progress-${key}`} />
            )}
          </div>
          <div className="flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
