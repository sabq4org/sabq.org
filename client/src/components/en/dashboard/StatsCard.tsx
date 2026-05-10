import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  isLoading?: boolean;
  className?: string;
  testId?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = "text-primary",
  iconBgColor = "bg-primary/10",
  trend,
  isLoading = false,
  className,
  testId,
}: StatsCardProps) {
  return (
    <Card 
      className={cn(
        "hover-elevate transition-all shadow-sm",
        className
      )} 
      data-testid={testId}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn("p-2 rounded-md", iconBgColor)}>
          <Icon className={cn("h-4 w-4", iconColor)} data-testid={testId ? `${testId}-icon` : undefined} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <div 
                className="text-2xl font-bold"
                data-testid={testId ? `${testId}-value` : undefined}
              >
                {value}
              </div>
              {trend && (
                <span 
                  className={cn(
                    "text-xs font-medium",
                    trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}
                  data-testid={testId ? `${testId}-trend` : undefined}
                >
                  {trend.isPositive ? "+" : ""}{trend.value}%
                </span>
              )}
            </div>
            {description && (
              <p 
                className="text-xs text-muted-foreground mt-1" 
                data-testid={testId ? `${testId}-description` : undefined}
              >
                {description}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
