import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, ChevronLeft, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorldDay } from "@shared/schema";

// Extended type with calculated fields from API
type UpcomingWorldDay = WorldDay & {
  nextOccurrence: string;
  daysUntil: number;
};

const categoryLabels: Record<string, string> = {
  international: "دولي",
  national: "وطني",
  religious: "ديني",
  health: "صحي",
  environmental: "بيئي",
  cultural: "ثقافي",
  social: "اجتماعي",
  educational: "تعليمي",
  sports: "رياضي",
  economic: "اقتصادي",
  other: "أخرى",
};

const categoryColors: Record<string, string> = {
  international: "bg-blue-500",
  national: "bg-green-600",
  religious: "bg-purple-500",
  health: "bg-red-500",
  environmental: "bg-emerald-500",
  cultural: "bg-amber-500",
  social: "bg-pink-500",
  educational: "bg-indigo-500",
  sports: "bg-orange-500",
  economic: "bg-cyan-500",
  other: "bg-gray-500",
};

function getDaysLabel(daysUntil: number): string {
  if (daysUntil === 0) return "اليوم";
  if (daysUntil === 1) return "غداً";
  if (daysUntil === 2) return "بعد يومين";
  if (daysUntil <= 10) return `بعد ${daysUntil} أيام`;
  return `بعد ${daysUntil} يوماً`;
}

function formatGregorianDate(dateStr: string): string {
  const date = new Date(dateStr);
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const dayName = days[date.getDay()];
  const day = date.getDate().toString().padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName}، ${day} ${month} ${year}`;
}

interface UpcomingWorldDaysWidgetProps {
  deferLoading?: boolean;
}

export function UpcomingWorldDaysWidget({ deferLoading = false }: UpcomingWorldDaysWidgetProps) {
  const { data: worldDays, isLoading, isError, error } = useQuery<UpcomingWorldDay[]>({
    queryKey: ["/api/world-days/upcoming"],
    enabled: !deferLoading, // Defer loading until initial dashboard stats are loaded
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  if (isLoading) {
    return (
      <Card dir="rtl" data-testid="widget-upcoming-world-days-loading">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            الأيام العالمية القادمة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card dir="rtl" data-testid="widget-upcoming-world-days-error">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            الأيام العالمية القادمة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground" data-testid="text-world-days-error">
            <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50 text-destructive" />
            <p className="text-destructive">حدث خطأ أثناء تحميل الأيام العالمية</p>
            <p className="text-xs mt-1">{error?.message || "يرجى المحاولة مرة أخرى"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const upcomingDays = worldDays?.slice(0, 5) || [];

  return (
    <Card dir="rtl" data-testid="widget-upcoming-world-days">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          الأيام العالمية القادمة
        </CardTitle>
        {worldDays && worldDays.length > 0 && (
          <Badge variant="secondary">{worldDays.length} يوم</Badge>
        )}
      </CardHeader>
      <CardContent>
        {upcomingDays.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-upcoming-world-days">
            <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>لا توجد أيام عالمية قادمة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingDays.map((day) => {
              const isUrgent = day.daysUntil >= 0 && day.daysUntil <= 7;
              
              return (
                <div
                  key={day.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    isUrgent ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                  }`}
                  data-testid={`world-day-item-${day.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate">
                        {day.nameAr}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatGregorianDate(day.nextOccurrence)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={isUrgent ? "default" : "outline"}
                        className={isUrgent ? "bg-primary" : ""}
                      >
                        {getDaysLabel(day.daysUntil)}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`${categoryColors[day.category]} text-white text-xs`}
                      >
                        {categoryLabels[day.category] || day.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
            
            <Link href="/dashboard/world-days">
              <Button
                variant="ghost"
                className="w-full mt-2 text-primary hover:text-primary"
                data-testid="button-view-all-world-days"
              >
                عرض الكل
                <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
