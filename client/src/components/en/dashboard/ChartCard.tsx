import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  isLoading?: boolean;
  className?: string;
  testId?: string;
  actions?: ReactNode;
}

export function ChartCard({
  title,
  description,
  children,
  isLoading = false,
  className,
  testId,
  actions,
}: ChartCardProps) {
  return (
    <Card className={cn("shadow-sm", className)} data-testid={testId}>
      <CardHeader className={cn(actions && "flex flex-row items-start justify-between gap-4")}>
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
