import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Clock, Target } from "lucide-react";

interface PublishingActivityCardProps {
  lastPublishedAt: string | null;
  daysSinceLastPublished: number | null;
  thisWeekCount: number;
  thisMonthCount: number;
  weeklyGoal?: number;
  loading?: boolean;
}

export function PublishingActivityCard({
  lastPublishedAt,
  daysSinceLastPublished,
  thisWeekCount,
  thisMonthCount,
  weeklyGoal = 1,
  loading,
}: PublishingActivityCardProps) {
  const goalMet = thisWeekCount >= weeklyGoal;

  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          نشاط النشر
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              {daysSinceLastPublished !== null ? (
                <span>
                  آخر نشر منذ{" "}
                  <span className={daysSinceLastPublished > 14 ? "text-warning font-medium" : "font-medium"}>
                    {daysSinceLastPublished === 0
                      ? "اليوم"
                      : daysSinceLastPublished === 1
                        ? "يوم واحد"
                        : `${daysSinceLastPublished} يوم`}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">لم تنشر بعد</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <div className="text-lg font-bold">{thisWeekCount}</div>
                <div className="text-xs text-muted-foreground">هذا الأسبوع</div>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <div className="text-lg font-bold">{thisMonthCount}</div>
                <div className="text-xs text-muted-foreground">هذا الشهر</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Target className={`h-3.5 w-3.5 ${goalMet ? "text-green-500" : "text-muted-foreground"}`} />
              <span className={goalMet ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                هدف الأسبوع: {thisWeekCount}/{weeklyGoal} مقال
                {goalMet && " ✓"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
