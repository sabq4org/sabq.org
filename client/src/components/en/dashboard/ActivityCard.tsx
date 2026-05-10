import { ReactNode } from "react";
import { Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

export interface ActivityItem {
  id: string;
  title: string;
  description?: string;
  status?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ActivityCardProps {
  title: string;
  description?: string;
  items: ActivityItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  testId?: string;
  actions?: ReactNode;
  renderItem?: (item: ActivityItem) => ReactNode;
  getStatusBadge?: (status: string) => ReactNode;
}

const defaultGetStatusBadge = (status: string) => {
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    published: "default",
    draft: "secondary",
    pending: "outline",
    approved: "default",
    rejected: "destructive",
    archived: "outline",
  };
  const labels: Record<string, string> = {
    published: "Published",
    draft: "Draft",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    archived: "Archived",
  };
  return (
    <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>
      {labels[status] || status}
    </Badge>
  );
};

export function ActivityCard({
  title,
  description,
  items,
  isLoading = false,
  emptyMessage = "No recent activity",
  className,
  testId,
  actions,
  renderItem,
  getStatusBadge = defaultGetStatusBadge,
}: ActivityCardProps) {
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
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => 
              renderItem ? (
                renderItem(item)
              ) : (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 p-3 border rounded-lg hover-elevate transition-all"
                  data-testid={`${testId}-item-${item.id}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm truncate" data-testid={`${testId}-item-title-${item.id}`}>
                        {item.title}
                      </h4>
                      {item.status && getStatusBadge(item.status)}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate" data-testid={`${testId}-item-description-${item.id}`}>
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span data-testid={`${testId}-item-time-${item.id}`}>
                        {formatDistanceToNow(new Date(item.timestamp), {
                          addSuffix: true,
                          locale: enUS,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8" data-testid={`${testId}-empty`}>
            {emptyMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
