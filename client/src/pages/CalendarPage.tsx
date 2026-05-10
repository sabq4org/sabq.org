import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, List, Grid3x3, CalendarDays, Plus, Globe, MapPin, Building2, Star } from "lucide-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  dateStart: string;
  dateEnd?: string | null;
  importance: number;
  tags?: string[] | null;
  category?: {
    id: string;
    nameAr: string;
  };
}

export default function CalendarPage() {
  const [view, setView] = useState<"month" | "week" | "agenda">("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data, isLoading } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["/api/calendar"],
  });

  const events = data?.events || [];

  const getEventIcon = (type: string) => {
    switch (type) {
      case "GLOBAL":
        return <Globe className="h-4 w-4" />;
      case "NATIONAL":
        return <MapPin className="h-4 w-4" />;
      case "INTERNAL":
        return <Building2 className="h-4 w-4" />;
      default:
        return <CalendarDays className="h-4 w-4" />;
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case "GLOBAL":
        return "عالمي";
      case "NATIONAL":
        return "وطني";
      case "INTERNAL":
        return "داخلي";
      default:
        return type;
    }
  };

  const getImportanceColor = (importance: number) => {
    if (importance >= 5) return "border-r-red-400 bg-red-50 dark:bg-red-950/30";
    if (importance >= 4) return "border-r-orange-400 bg-orange-50 dark:bg-orange-950/30";
    if (importance >= 3) return "border-r-yellow-400 bg-yellow-50 dark:bg-yellow-950/30";
    return "border-r-blue-400 bg-blue-50 dark:bg-blue-950/30";
  };

  const getImportanceColorSimple = (importance: number) => {
    if (importance >= 5) return "bg-red-100 dark:bg-red-900/20 text-red-900 dark:text-red-100";
    if (importance >= 4) return "bg-orange-100 dark:bg-orange-900/20 text-orange-900 dark:text-orange-100";
    if (importance >= 3) return "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100";
    return "bg-blue-100 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100";
  };

  const monthEvents = events.filter(event => {
    const eventStartDate = new Date(event.dateStart);
    const eventEndDate = event.dateEnd ? new Date(event.dateEnd) : eventStartDate;
    
    // Get first and last day of the current month
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
    
    // Check if event overlaps with the current month
    return eventStartDate <= monthEnd && eventEndDate >= monthStart;
  });

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const formatDate = (date: Date) => {
    const gregorian = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
      month: "long",
      year: "numeric",
    }).format(date);
    
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      month: "long",
      year: "numeric",
    }).format(date);
    
    return { gregorian, hijri };
  };

  const currentDateFormatted = formatDate(currentDate);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">تقويم سبق</h1>
            <p className="text-muted-foreground">
              تقويم ذكي لإدارة المناسبات والأحداث التحريرية
            </p>
          </div>

          <Link href="/dashboard/calendar/new">
            <Button data-testid="button-add-event">
              <Plus className="h-4 w-4 ml-2" />
              إضافة مناسبة
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={prevMonth}
                  data-testid="button-prev-month"
                >
                  ←
                </Button>
                <div className="flex flex-col items-center">
                  <CardTitle className="text-xl">{currentDateFormatted.gregorian}</CardTitle>
                  <p className="text-xs text-muted-foreground">{currentDateFormatted.hijri}</p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={nextMonth}
                  data-testid="button-next-month"
                >
                  →
                </Button>
              </div>

              <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                <TabsList>
                  <TabsTrigger value="month" data-testid="tab-month">
                    <Calendar className="h-4 w-4 ml-2" />
                    شهر
                  </TabsTrigger>
                  <TabsTrigger value="week" data-testid="tab-week">
                    <Grid3x3 className="h-4 w-4 ml-2" />
                    أسبوع
                  </TabsTrigger>
                  <TabsTrigger value="agenda" data-testid="tab-agenda">
                    <List className="h-4 w-4 ml-2" />
                    قائمة
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">جاري التحميل...</p>
                </div>
              </div>
            ) : (
              <>
                {view === "month" && (
                  <MonthView events={monthEvents} currentDate={currentDate} getImportanceColorSimple={getImportanceColorSimple} />
                )}
                {view === "week" && (
                  <WeekView events={monthEvents} currentDate={currentDate} getImportanceColor={getImportanceColor} getEventTypeLabel={getEventTypeLabel} />
                )}
                {view === "agenda" && (
                  <AgendaView
                    events={monthEvents}
                    getEventIcon={getEventIcon}
                    getEventTypeLabel={getEventTypeLabel}
                    getImportanceColor={getImportanceColor}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>إحصائيات التقويم</CardTitle>
            <CardDescription>نظرة سريعة على المناسبات القادمة</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                icon={<Globe className="h-5 w-5" />}
                title="مناسبات عالمية"
                count={events.filter(e => e.type === "GLOBAL").length}
                variant="blue"
              />
              <StatCard
                icon={<MapPin className="h-5 w-5" />}
                title="مناسبات وطنية"
                count={events.filter(e => e.type === "NATIONAL").length}
                variant="green"
              />
              <StatCard
                icon={<Building2 className="h-5 w-5" />}
                title="مناسبات داخلية"
                count={events.filter(e => e.type === "INTERNAL").length}
                variant="purple"
              />
              <StatCard
                icon={<Star className="h-5 w-5" />}
                title="ذات أولوية عالية"
                count={events.filter(e => e.importance >= 4).length}
                variant="orange"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function MonthView({ events, currentDate, getImportanceColorSimple }: { events: CalendarEvent[]; currentDate: Date; getImportanceColorSimple: (importance: number) => string }) {
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const today = new Date();
  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const getEventsForDay = (day: number) => {
    return events.filter(event => {
      const eventStartDate = new Date(event.dateStart);
      const eventEndDate = event.dateEnd ? new Date(event.dateEnd) : eventStartDate;
      
      // Create date for this day in the current month
      const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      
      // Check if this day falls between event start and end dates
      const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
      const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59);
      
      const eventStart = new Date(eventStartDate.getFullYear(), eventStartDate.getMonth(), eventStartDate.getDate());
      const eventEnd = new Date(eventEndDate.getFullYear(), eventEndDate.getMonth(), eventEndDate.getDate(), 23, 59, 59);
      
      return dayStart <= eventEnd && dayEnd >= eventStart;
    });
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day) => (
        <div key={day} className="text-center font-semibold p-2 text-sm text-muted-foreground">
          {day}
        </div>
      ))}
      
      {blanks.map((blank) => (
        <div key={`blank-${blank}`} className="min-h-24 p-2 bg-muted/30 rounded-md"></div>
      ))}
      
      {days.map((day) => {
        const dayEvents = getEventsForDay(day);
        const isTodayDay = isToday(day);
        return (
          <div
            key={day}
            className={`min-h-24 p-2 border rounded-md hover-elevate active-elevate-2 cursor-pointer ${
              isTodayDay ? 'bg-primary/10 border-primary' : ''
            }`}
            data-testid={`calendar-day-${day}`}
          >
            <div className={`font-semibold text-sm mb-1 ${isTodayDay ? 'text-primary' : ''}`}>
              {day}
            </div>
            <div className="space-y-1">
              {dayEvents.slice(0, 2).map((event) => (
                <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
                  <div className={`text-xs p-1 rounded truncate ${getImportanceColorSimple(event.importance)}`}>
                    {event.title}
                  </div>
                </Link>
              ))}
              {dayEvents.length > 2 && (
                <div className="text-xs text-muted-foreground">
                  +{dayEvents.length - 2} مناسبة
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ events, currentDate, getImportanceColor, getEventTypeLabel }: { events: CalendarEvent[]; currentDate: Date; getImportanceColor: (importance: number) => string; getEventTypeLabel: (type: string) => string }) {
  const today = new Date(currentDate);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return date;
  });

  const todayDate = new Date();
  const isToday = (date: Date) => {
    return (
      date.getDate() === todayDate.getDate() &&
      date.getMonth() === todayDate.getMonth() &&
      date.getFullYear() === todayDate.getFullYear()
    );
  };

  const getEventsForDay = (date: Date) => {
    return events.filter(event => {
      const eventStartDate = new Date(event.dateStart);
      const eventEndDate = event.dateEnd ? new Date(event.dateEnd) : eventStartDate;
      
      // Check if this date falls between event start and end dates
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
      
      const eventStart = new Date(eventStartDate.getFullYear(), eventStartDate.getMonth(), eventStartDate.getDate());
      const eventEnd = new Date(eventEndDate.getFullYear(), eventEndDate.getMonth(), eventEndDate.getDate(), 23, 59, 59);
      
      return dayStart <= eventEnd && dayEnd >= eventStart;
    });
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((date, index) => {
        const dayEvents = getEventsForDay(date);
        const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
        const isTodayDay = isToday(date);
        
        return (
          <div key={index} className="space-y-2">
            <div className={`text-center p-2 rounded-md ${
              isTodayDay ? 'bg-primary/10 border border-primary' : 'bg-muted'
            }`}>
              <div className={`font-semibold text-sm ${isTodayDay ? 'text-primary' : ''}`}>
                {dayNames[index]}
              </div>
              <div className={`text-lg ${isTodayDay ? 'text-primary' : ''}`}>
                {date.getDate()}
              </div>
            </div>
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
                  <Card className={`hover-elevate active-elevate-2 cursor-pointer ${getImportanceColor(event.importance)}`}>
                    <CardContent className="p-3">
                      <div className="text-sm font-medium truncate">{event.title}</div>
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {getEventTypeLabel(event.type)}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({
  events,
  getEventIcon,
  getEventTypeLabel,
  getImportanceColor,
}: {
  events: CalendarEvent[];
  getEventIcon: (type: string) => React.ReactNode;
  getEventTypeLabel: (type: string) => string;
  getImportanceColor: (importance: number) => string;
}) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime()
  );

  if (sortedEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <CalendarDays className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">لا توجد مناسبات</h3>
        <p className="text-muted-foreground">لا توجد مناسبات في هذا الشهر</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedEvents.map((event) => (
        <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
          <Card className="hover-elevate active-elevate-2 cursor-pointer" data-testid={`event-card-${event.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-md ${getImportanceColor(event.importance)}/10`}>
                  {getEventIcon(event.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg">{event.title}</h3>
                    <Badge variant="outline">{getEventTypeLabel(event.type)}</Badge>
                    {event.importance >= 4 && (
                      <Badge variant="secondary">
                        <Star className="h-3 w-3 ml-1" />
                        مهم
                      </Badge>
                    )}
                  </div>
                  
                  {event.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {event.description}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-4 w-4" />
                      {new Date(event.dateStart).toLocaleDateString("ar-SA-u-ca-gregory", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                    
                    {event.tags && event.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {event.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {event.tags.length > 3 && (
                          <span className="text-xs">+{event.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className={`w-1 h-full ${getImportanceColor(event.importance)} rounded-full`}></div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  title,
  count,
  variant,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  variant: string;
}) {
  const variantClasses = {
    blue: "bg-blue-500/10 text-blue-500",
    green: "bg-green-500/10 text-green-500",
    purple: "bg-purple-500/10 text-purple-500",
    orange: "bg-orange-500/10 text-orange-500",
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-md ${variantClasses[variant as keyof typeof variantClasses]}`}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold" data-testid={`stat-${variant}`}>{count}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

