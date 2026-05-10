import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PeakHoursHeatmapProps {
  data: Array<{
    hour: number;
    dayOfWeek: number;
    count: number;
  }>;
  title?: string;
  description?: string;
  loading?: boolean;
  className?: string;
}

const daysOfWeek = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const hoursOfDay = Array.from({ length: 24 }, (_, i) => i);

export function PeakHoursHeatmap({
  data,
  title = "ساعات الذروة",
  description = "أوقات الاستماع الأكثر نشاطاً خلال الأسبوع",
  loading,
  className
}: PeakHoursHeatmapProps) {
  // Create a map for quick lookup
  const dataMap = new Map(
    data.map(d => [`${d.dayOfWeek}-${d.hour}`, d.count])
  );

  // Find max count for scaling
  const maxCount = Math.max(...(data || []).map(d => d.count), 1);

  const getIntensity = (count: number) => {
    const intensity = (count / maxCount) * 100;
    if (intensity === 0) return "bg-muted";
    if (intensity < 20) return "bg-primary/20";
    if (intensity < 40) return "bg-primary/40";
    if (intensity < 60) return "bg-primary/60";
    if (intensity < 80) return "bg-primary/80";
    return "bg-primary";
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
  };

  return (
    <Card className={cn("hover-elevate", className)}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {daysOfWeek.map((_, dayIndex) => (
              <div key={dayIndex} className="flex gap-1">
                {hoursOfDay.map((_, hourIndex) => (
                  <div
                    key={`${dayIndex}-${hourIndex}`}
                    className="h-8 w-full animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Hour labels */}
              <div className="flex gap-1 mb-2 ml-20">
                {hoursOfDay.map(hour => (
                  <div
                    key={hour}
                    className="flex-1 text-center text-xs text-muted-foreground"
                  >
                    {hour % 3 === 0 ? formatHour(hour) : ""}
                  </div>
                ))}
              </div>
              
              {/* Heatmap grid */}
              <TooltipProvider>
                <div className="space-y-1">
                  {daysOfWeek.map((day, dayIndex) => (
                    <div key={day} className="flex gap-1 items-center">
                      <div className="w-20 text-sm text-muted-foreground text-right">
                        {day}
                      </div>
                      {hoursOfDay.map(hour => {
                        const count = dataMap.get(`${dayIndex}-${hour}`) || 0;
                        return (
                          <Tooltip key={`${dayIndex}-${hour}`}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "flex-1 h-8 rounded transition-all hover:ring-2 hover:ring-primary cursor-pointer",
                                  getIntensity(count)
                                )}
                                data-testid={`heatmap-cell-${dayIndex}-${hour}`}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-sm">
                                <div className="font-medium">{day} - {formatHour(hour)}</div>
                                <div className="text-muted-foreground">
                                  {count} استماع
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </TooltipProvider>
              
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 justify-center">
                <span className="text-xs text-muted-foreground">أقل</span>
                <div className="flex gap-1">
                  <div className="h-4 w-8 rounded bg-muted" />
                  <div className="h-4 w-8 rounded bg-primary/20" />
                  <div className="h-4 w-8 rounded bg-primary/40" />
                  <div className="h-4 w-8 rounded bg-primary/60" />
                  <div className="h-4 w-8 rounded bg-primary/80" />
                  <div className="h-4 w-8 rounded bg-primary" />
                </div>
                <span className="text-xs text-muted-foreground">أكثر</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}