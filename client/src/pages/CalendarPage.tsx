import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  List,
  Grid3x3,
  CalendarDays,
  Plus,
  Globe,
  MapPin,
  Building2,
  Star,
  Search,
  X,
  ChevronRight,
  ChevronLeft,
  Clock,
  Sparkles,
  ArrowUpLeft,
} from "lucide-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "NATIONAL" | "GLOBAL" | "INTERNAL" | "HIGH">("ALL");
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate());

  const { data, isLoading } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["/api/calendar"],
  });

  const events = Array.isArray(data?.events) ? data.events : [];

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
    if (importance >= 5) return "border-r-red-500 bg-red-500/[0.06] dark:bg-red-500/[0.1]";
    if (importance >= 4) return "border-r-orange-500 bg-orange-500/[0.06] dark:bg-orange-500/[0.1]";
    if (importance >= 3) return "border-r-amber-500 bg-amber-500/[0.06] dark:bg-amber-500/[0.1]";
    return "border-r-blue-500 bg-blue-500/[0.06] dark:bg-blue-500/[0.1]";
  };

  const getImportanceColorSimple = (importance: number) => {
    if (importance >= 5)
      return "bg-red-500/15 text-red-800 dark:text-red-200 border border-red-500/25";
    if (importance >= 4)
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200 border border-orange-500/25";
    if (importance >= 3)
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/25";
    return "bg-blue-500/15 text-blue-800 dark:text-blue-200 border border-blue-500/25";
  };

  const getImportanceDotColor = (importance: number) => {
    if (importance >= 5) return "bg-red-500";
    if (importance >= 4) return "bg-orange-500";
    if (importance >= 3) return "bg-amber-500";
    return "bg-blue-500";
  };

  // Filter events by search & type filter
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (event.title || "").toLowerCase().includes(q) ||
        (event.description && event.description.toLowerCase().includes(q)) ||
        (Array.isArray(event.tags) && event.tags.some((t) => (t || "").toLowerCase().includes(q)));

      if (!matchesSearch) return false;

      if (typeFilter === "HIGH") return event.importance >= 4;
      if (typeFilter !== "ALL") return event.type === typeFilter;
      return true;
    });
  }, [events, searchQuery, typeFilter]);

  const monthEvents = useMemo(() => {
    return filteredEvents.filter((event) => {
      const eventStartDate = new Date(event.dateStart);
      const eventEndDate = event.dateEnd ? new Date(event.dateEnd) : eventStartDate;

      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

      return eventStartDate <= monthEnd && eventEndDate >= monthStart;
    });
  }, [filteredEvents, currentDate]);

  // Upcoming events from today onwards (fallback to current month events if none upcoming)
  const upcomingEvents = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const upcoming = filteredEvents
      .filter((event) => {
        const end = event.dateEnd ? new Date(event.dateEnd) : new Date(event.dateStart);
        return end >= todayStart;
      })
      .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());

    if (upcoming.length > 0) return upcoming.slice(0, 8);
    return [...monthEvents]
      .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime())
      .slice(0, 8);
  }, [filteredEvents, monthEvents]);

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDay(1);
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDay(1);
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(now.getDate());
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
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        {/* Unified Editorial Header */}
        <DashboardPageHeader
          icon={CalendarDays}
          title="تقويم سبق"
          description="تقويم ذكي لإدارة المناسبات والأحداث التحريرية ومتابعة التغطيات الصحفية."
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={goToToday}
                className="no-min-touch-size gap-2"
              >
                <Clock className="h-4 w-4" />
                <span>اليوم</span>
              </Button>
              <Link href="/dashboard/calendar/new">
                <Button className="gap-2 shadow-sm" data-testid="button-add-event">
                  <Plus className="h-4 w-4" />
                  <span>إضافة مناسبة</span>
                </Button>
              </Link>
            </>
          }
        />

        {/* Top KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={<Globe className="h-5 w-5" />}
            title="مناسبات عالمية"
            subtitle="أحداث وأيام دولية"
            count={events.filter((e) => e.type === "GLOBAL").length}
            variant="blue"
          />
          <StatCard
            icon={<MapPin className="h-5 w-5" />}
            title="مناسبات وطنية"
            subtitle="أحداث المملكة والمواسم"
            count={events.filter((e) => e.type === "NATIONAL").length}
            variant="green"
          />
          <StatCard
            icon={<Building2 className="h-5 w-5" />}
            title="مناسبات داخلية"
            subtitle="اجتماعات وخطط غرفة الأخبار"
            count={events.filter((e) => e.type === "INTERNAL").length}
            variant="purple"
          />
          <StatCard
            icon={<Star className="h-5 w-5" />}
            title="ذات أولوية عالية"
            subtitle="تتطلب تغطية خاصة"
            count={events.filter((e) => e.importance >= 4).length}
            variant="orange"
          />
        </div>

        {/* Main Responsive Split Layout: Calendar Grid + Upcoming Events */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Calendar Card (8 columns on xl) */}
          <Card className="xl:col-span-8 border-border/60 shadow-none">
            <CardHeader className="pb-4 border-b border-border/50 space-y-4">
              {/* Top Row: Month Navigation & View Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center justify-between sm:justify-start gap-2.5">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={prevMonth}
                    className="no-min-touch-size h-9 w-9 shrink-0"
                    title="الشهر السابق"
                    data-testid="button-prev-month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <div className="flex flex-col items-center sm:items-start px-2 min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg sm:text-xl font-bold">
                        {currentDateFormatted.gregorian}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {monthEvents.length} مناسبة
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {currentDateFormatted.hijri}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={nextMonth}
                    className="no-min-touch-size h-9 w-9 shrink-0"
                    title="الشهر القادم"
                    data-testid="button-next-month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>

                <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                  <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex h-9">
                    <TabsTrigger
                      value="month"
                      className="no-min-touch-size text-xs sm:text-sm gap-1.5"
                      data-testid="tab-month"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <span>شهر</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="week"
                      className="no-min-touch-size text-xs sm:text-sm gap-1.5"
                      data-testid="tab-week"
                    >
                      <Grid3x3 className="h-3.5 w-3.5" />
                      <span>أسبوع</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="agenda"
                      className="no-min-touch-size text-xs sm:text-sm gap-1.5"
                      data-testid="tab-agenda"
                    >
                      <List className="h-3.5 w-3.5" />
                      <span>قائمة</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Second Row: Search & Type Filter Pills */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث عن مناسبة، وصف، أو وسم..."
                    className="pr-9 h-9 text-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="مسح البحث"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { key: "ALL", label: "الكل" },
                    { key: "NATIONAL", label: "وطني" },
                    { key: "GLOBAL", label: "عالمي" },
                    { key: "INTERNAL", label: "داخلي" },
                    { key: "HIGH", label: "أولوية عالية" },
                  ].map((item) => {
                    const isActive = typeFilter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setTypeFilter(item.key as any)}
                        className={`no-min-touch-size inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-5">
              {isLoading ? (
                <div className="flex items-center justify-center h-72">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground text-sm">جاري تحميل التقويم...</p>
                  </div>
                </div>
              ) : (
                <>
                  {view === "month" && (
                    <MonthView
                      events={monthEvents}
                      currentDate={currentDate}
                      selectedDay={selectedDay}
                      onSelectDay={setSelectedDay}
                      getImportanceColorSimple={getImportanceColorSimple}
                      getImportanceDotColor={getImportanceDotColor}
                      getEventTypeLabel={getEventTypeLabel}
                    />
                  )}
                  {view === "week" && (
                    <WeekView
                      events={monthEvents}
                      currentDate={currentDate}
                      getImportanceColor={getImportanceColor}
                      getEventTypeLabel={getEventTypeLabel}
                    />
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

          {/* Upcoming Events Sidebar Card (4 columns on xl) */}
          <Card className="xl:col-span-4 border-border/60 shadow-none">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base sm:text-lg">المناسبات القادمة</CardTitle>
                    <CardDescription className="text-xs">
                      نظرة سريعة على أقرب الأحداث المجدولة
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {upcomingEvents.length}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">
                    لا توجد مناسبات قادمة مطابقة
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcomingEvents.map((event) => {
                    const startDate = new Date(event.dateStart);
                    const now = new Date();
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const eventDayStart = new Date(
                      startDate.getFullYear(),
                      startDate.getMonth(),
                      startDate.getDate()
                    );
                    const diffDays = Math.round(
                      (eventDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
                    );

                    let relativeLabel = "";
                    if (diffDays === 0) relativeLabel = "اليوم";
                    else if (diffDays === 1) relativeLabel = "غداً";
                    else if (diffDays > 1 && diffDays <= 30) relativeLabel = `بعد ${diffDays} يوم`;

                    return (
                      <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
                        <div className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3 transition-all hover:border-primary/40 hover:bg-muted/30 cursor-pointer">
                          {/* Date Badge */}
                          <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 min-w-[52px] text-center shrink-0">
                            <span className="text-base font-bold leading-none text-foreground">
                              {startDate.getDate()}
                            </span>
                            <span className="text-[10px] font-medium text-muted-foreground mt-1">
                              {startDate.toLocaleDateString("ar-SA-u-ca-gregory", {
                                month: "short",
                              })}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                {event.title}
                              </h4>
                              <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                {getEventTypeLabel(event.type)}
                              </Badge>
                              {event.importance >= 4 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400">
                                  <Star className="h-2.5 w-2.5 fill-current" />
                                  أولوية عالية
                                </span>
                              )}
                              {relativeLabel && (
                                <span
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                    diffDays === 0
                                      ? "bg-primary/15 text-primary"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {relativeLabel}
                                </span>
                              )}
                            </div>
                          </div>

                          <span
                            className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${getImportanceDotColor(
                              event.importance
                            )}`}
                            title={`الأهمية: ${event.importance}/5`}
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Priority Legend */}
              <div className="pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium">دليل الأولوية:</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    حرجة
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-orange-500" />
                    عالية
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    متوسطة
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    عادية
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function MonthView({
  events,
  currentDate,
  selectedDay,
  onSelectDay,
  getImportanceColorSimple,
  getImportanceDotColor,
  getEventTypeLabel,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
  getImportanceColorSimple: (importance: number) => string;
  getImportanceDotColor: (importance: number) => string;
  getEventTypeLabel: (type: string) => string;
}) {
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
    return events.filter((event) => {
      const eventStartDate = new Date(event.dateStart);
      const eventEndDate = event.dateEnd ? new Date(event.dateEnd) : eventStartDate;

      const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

      const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
      const dayEnd = new Date(
        dayDate.getFullYear(),
        dayDate.getMonth(),
        dayDate.getDate(),
        23,
        59,
        59
      );

      const eventStart = new Date(
        eventStartDate.getFullYear(),
        eventStartDate.getMonth(),
        eventStartDate.getDate()
      );
      const eventEnd = new Date(
        eventEndDate.getFullYear(),
        eventEndDate.getMonth(),
        eventEndDate.getDate(),
        23,
        59,
        59
      );

      return dayStart <= eventEnd && dayEnd >= eventStart;
    });
  };

  const dayHeaders = [
    { full: "الأحد", short: "أحد" },
    { full: "الاثنين", short: "اثن" },
    { full: "الثلاثاء", short: "ثلا" },
    { full: "الأربعاء", short: "أرب" },
    { full: "الخميس", short: "خمي" },
    { full: "الجمعة", short: "جمع" },
    { full: "السبت", short: "سبت" },
  ];

  const activeDay = selectedDay && selectedDay <= daysInMonth ? selectedDay : null;
  const activeDayEvents = activeDay ? getEventsForDay(activeDay) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {dayHeaders.map((day) => (
          <div
            key={day.full}
            className="text-center font-semibold py-2 px-1 text-xs sm:text-sm text-muted-foreground bg-muted/40 rounded-md"
          >
            <span className="hidden sm:inline">{day.full}</span>
            <span className="sm:hidden">{day.short}</span>
          </div>
        ))}

        {blanks.map((blank) => (
          <div
            key={`blank-${blank}`}
            className="min-h-[64px] sm:min-h-[104px] p-1.5 sm:p-2 bg-muted/20 border border-transparent rounded-lg"
          />
        ))}

        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const isTodayDay = isToday(day);
          const isSelected = activeDay === day;

          return (
            <div
              key={day}
              onClick={() => onSelectDay(day)}
              className={`min-h-[64px] sm:min-h-[104px] p-1.5 sm:p-2 border rounded-lg transition-all cursor-pointer flex flex-col justify-between ${
                isTodayDay
                  ? "bg-primary/[0.06] border-primary"
                  : isSelected
                  ? "border-primary/60 bg-muted/40"
                  : "border-border/60 hover:border-border hover:bg-muted/20"
              }`}
              data-testid={`calendar-day-${day}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span
                  className={`inline-flex items-center justify-center text-xs sm:text-sm font-semibold rounded-full ${
                    isTodayDay
                      ? "bg-primary text-primary-foreground h-6 w-6"
                      : "text-foreground px-1"
                  }`}
                >
                  {day}
                </span>
                {dayEvents.length > 0 && (
                  <span className="sm:hidden text-[10px] font-medium text-muted-foreground bg-muted px-1 rounded">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* Desktop Event Pills */}
              <div className="hidden sm:block space-y-1 flex-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
                    <div
                      className={`text-xs px-1.5 py-0.5 rounded truncate font-medium transition-opacity hover:opacity-85 ${getImportanceColorSimple(
                        event.importance
                      )}`}
                    >
                      {event.title}
                    </div>
                  </Link>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[11px] font-medium text-muted-foreground px-1">
                    +{dayEvents.length - 2} مناسبة
                  </div>
                )}
              </div>

              {/* Mobile Compact Event Indicators */}
              {dayEvents.length > 0 && (
                <div className="sm:hidden space-y-1 mt-auto">
                  <div className="flex items-center gap-1 flex-wrap">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className={`h-1.5 w-1.5 rounded-full ${getImportanceDotColor(
                          event.importance
                        )}`}
                      />
                    ))}
                  </div>
                  <div className="text-[10px] leading-tight truncate text-muted-foreground font-medium">
                    {dayEvents[0].title}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Day Details Strip (Especially helpful on Mobile & when inspecting busy days) */}
      {activeDay && (
        <div className="rounded-xl border border-border/60 bg-muted/25 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span>
                مناسبات يوم {activeDay}{" "}
                {new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
                  month: "long",
                }).format(currentDate)}
              </span>
            </h4>
            <Badge variant="secondary" className="text-xs">
              {activeDayEvents.length} مناسبة
            </Badge>
          </div>

          {activeDayEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              لا توجد مناسبات مسجلة في هذا اليوم.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeDayEvents.map((event) => (
                <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background p-2.5 hover:border-primary/40 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold truncate">{event.title}</p>
                      <span className="text-[11px] text-muted-foreground">
                        {getEventTypeLabel(event.type)}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${getImportanceColorSimple(
                        event.importance
                      )}`}
                    >
                      أولوية {event.importance}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeekView({
  events,
  currentDate,
  getImportanceColor,
  getEventTypeLabel,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  getImportanceColor: (importance: number) => string;
  getEventTypeLabel: (type: string) => string;
}) {
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
    return events.filter((event) => {
      const eventStartDate = new Date(event.dateStart);
      const eventEndDate = event.dateEnd ? new Date(event.dateEnd) : eventStartDate;

      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

      const eventStart = new Date(
        eventStartDate.getFullYear(),
        eventStartDate.getMonth(),
        eventStartDate.getDate()
      );
      const eventEnd = new Date(
        eventEndDate.getFullYear(),
        eventEndDate.getMonth(),
        eventEndDate.getDate(),
        23,
        59,
        59
      );

      return dayStart <= eventEnd && dayEnd >= eventStart;
    });
  };

  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  return (
    <>
      {/* Desktop 7-Column Week Grid */}
      <div className="hidden md:grid md:grid-cols-7 gap-2.5">
        {weekDays.map((date, index) => {
          const dayEvents = getEventsForDay(date);
          const isTodayDay = isToday(date);

          return (
            <div key={index} className="space-y-2 min-h-[220px] rounded-xl border border-border/50 p-2 bg-muted/10">
              <div
                className={`text-center p-2 rounded-lg ${
                  isTodayDay ? "bg-primary/10 border border-primary" : "bg-muted/60"
                }`}
              >
                <div className={`font-semibold text-xs ${isTodayDay ? "text-primary" : "text-muted-foreground"}`}>
                  {dayNames[index]}
                </div>
                <div className={`text-lg font-bold ${isTodayDay ? "text-primary" : ""}`}>
                  {date.getDate()}
                </div>
              </div>
              <div className="space-y-2">
                {dayEvents.length === 0 ? (
                  <p className="text-[11px] text-center text-muted-foreground/60 py-4">
                    لا توجد مناسبات
                  </p>
                ) : (
                  dayEvents.map((event) => (
                    <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
                      <Card
                        className={`hover-elevate active-elevate-2 cursor-pointer border-r-4 shadow-none ${getImportanceColor(
                          event.importance
                        )}`}
                      >
                        <CardContent className="p-2.5">
                          <div className="text-xs font-semibold truncate">{event.title}</div>
                          <Badge variant="secondary" className="mt-1.5 text-[10px] px-1.5 py-0">
                            {getEventTypeLabel(event.type)}
                          </Badge>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Stacked Week View */}
      <div className="md:hidden space-y-2.5">
        {weekDays.map((date, index) => {
          const dayEvents = getEventsForDay(date);
          const isTodayDay = isToday(date);

          return (
            <div
              key={index}
              className={`rounded-xl border p-3 space-y-2 ${
                isTodayDay ? "border-primary bg-primary/[0.04]" : "border-border/60 bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      isTodayDay
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <span className="font-semibold text-sm">{dayNames[index]}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {dayEvents.length} مناسبة
                </Badge>
              </div>

              {dayEvents.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {dayEvents.map((event) => (
                    <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
                      <div
                        className={`rounded-lg border-r-4 p-2.5 flex items-center justify-between gap-2 ${getImportanceColor(
                          event.importance
                        )}`}
                      >
                        <span className="text-xs font-semibold truncate">{event.title}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {getEventTypeLabel(event.type)}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
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
        <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
        <h3 className="text-base font-semibold mb-1">لا توجد مناسبات</h3>
        <p className="text-sm text-muted-foreground">لا توجد مناسبات مطابقة في هذا الشهر</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedEvents.map((event) => {
        const startDate = new Date(event.dateStart);
        return (
          <Link key={event.id} href={`/dashboard/calendar/events/${event.id}`}>
            <Card
              className={`hover-elevate active-elevate-2 cursor-pointer border-r-4 shadow-none transition-all ${getImportanceColor(
                event.importance
              )}`}
              data-testid={`event-card-${event.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  {/* Date Block */}
                  <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-background px-3 py-2 min-w-[60px] text-center shrink-0">
                    <span className="text-lg sm:text-xl font-bold leading-none">
                      {startDate.getDate()}
                    </span>
                    <span className="text-[11px] text-muted-foreground mt-1">
                      {startDate.toLocaleDateString("ar-SA-u-ca-gregory", {
                        month: "short",
                      })}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h3 className="font-bold text-base sm:text-lg text-foreground">
                        {event.title}
                      </h3>
                      <Badge variant="outline" className="gap-1 text-xs bg-background/80">
                        {getEventIcon(event.type)}
                        <span>{getEventTypeLabel(event.type)}</span>
                      </Badge>
                      {event.importance >= 4 && (
                        <Badge
                          variant="secondary"
                          className="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30 text-xs"
                        >
                          <Star className="h-3 w-3 ml-1 fill-current" />
                          مهم
                        </Badge>
                      )}
                      {event.category?.nameAr && (
                        <Badge variant="secondary" className="text-xs">
                          {event.category.nameAr}
                        </Badge>
                      )}
                    </div>

                    {event.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground mb-2.5 line-clamp-2 leading-relaxed">
                        {event.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>
                          {startDate.toLocaleDateString("ar-SA-u-ca-gregory", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      {event.tags && event.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {event.tags.slice(0, 3).map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[11px] px-1.5 py-0">
                              #{tag}
                            </Badge>
                          ))}
                          {event.tags.length > 3 && (
                            <span className="text-xs">+{event.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function StatCard({
  icon,
  title,
  subtitle,
  count,
  variant,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  count: number;
  variant: "blue" | "green" | "purple" | "orange";
}) {
  const styles = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  }[variant];

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
            {title}
          </p>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid={`stat-${variant}`}>
            {count}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center shrink-0 ${styles}`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
