import { useState, useMemo } from "react";
import { Calendar, momentLocalizer, Views, View } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { motion } from "framer-motion";

// Setup moment for Arabic locale
moment.locale('ar', {
  months: 'يناير_فبراير_مارس_أبريل_مايو_يونيو_يوليو_أغسطس_سبتمبر_أكتوبر_نوفمبر_ديسمبر'.split('_'),
  monthsShort: 'يناير_فبراير_مارس_أبريل_مايو_يونيو_يوليو_أغسطس_سبتمبر_أكتوبر_نوفمبر_ديسمبر'.split('_'),
  weekdays: 'الأحد_الإثنين_الثلاثاء_الأربعاء_الخميس_الجمعة_السبت'.split('_'),
  weekdaysShort: 'أحد_إثنين_ثلاثاء_أربعاء_خميس_جمعة_سبت'.split('_'),
  weekdaysMin: 'ح_ن_ث_ر_خ_ج_س'.split('_'),
  week: {
    dow: 6, // Saturday is the first day of the week
    doy: 12
  }
});

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  category: string;
  status?: "scheduled" | "published" | "failed" | "cancelled";
}

interface IFoxCalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  className?: string;
}

const categoryColors: Record<string, string> = {
  "ai-news": "bg-violet-500",
  "AI News": "bg-violet-500",
  "ai-voice": "bg-blue-500",
  "AI Voice": "bg-blue-500",
  "ai-tools": "bg-pink-500",
  "AI Tools": "bg-pink-500",
  "ai-academy": "bg-amber-500",
  "AI Academy": "bg-amber-500",
  "ai-community": "bg-green-500",
  "AI Community": "bg-green-500",
  "ai-insights": "bg-indigo-500",
  "AI Insights": "bg-indigo-500",
  "ai-opinions": "bg-red-500",
  "AI Opinions": "bg-red-500",
};

const statusColors: Record<string, string> = {
  scheduled: "border-blue-500/50",
  published: "border-green-500/50",
  failed: "border-red-500/50",
  cancelled: "border-gray-500/50",
};

export function IFoxCalendar({
  events,
  onEventClick,
  onDateClick,
  className
}: IFoxCalendarProps) {
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Custom event component
  const EventComponent = ({ event }: { event: CalendarEvent }) => {
    const categoryColor = categoryColors[event.category] || "bg-gray-500";
    const statusColor = event.status ? statusColors[event.status] : "";
    
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className={cn(
          "px-2 py-1 rounded text-white text-xs cursor-pointer",
          "border-l-2",
          categoryColor,
          statusColor
        )}
        onClick={(e) => {
          e.stopPropagation();
          onEventClick?.(event);
        }}
      >
        <div className="font-medium truncate">{event.title}</div>
        {currentView !== Views.MONTH && (
          <div className="text-white/80 text-[10px] mt-0.5">{event.category}</div>
        )}
      </motion.div>
    );
  };

  // Custom toolbar
  const CustomToolbar = () => {
    return (
      <div className="flex items-center justify-between mb-4 px-4 py-3 bg-white/5 rounded-lg" dir="rtl">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentDate(moment(currentDate).subtract(1, currentView === Views.DAY ? 'day' : currentView === Views.WEEK ? 'week' : 'month').toDate())}
            className="text-white hover:bg-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCurrentDate(new Date())}
            className="text-white hover:bg-white/10"
          >
            اليوم
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentDate(moment(currentDate).add(1, currentView === Views.DAY ? 'day' : currentView === Views.WEEK ? 'week' : 'month').toDate())}
            className="text-white hover:bg-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-white/60" />
          <h2 className="text-lg font-semibold text-white">
            {moment(currentDate).format(currentView === Views.DAY ? 'DD MMMM YYYY' : 'MMMM YYYY')}
          </h2>
        </div>

        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          <Button
            variant={currentView === Views.MONTH ? "default" : "ghost"}
            size="sm"
            onClick={() => setCurrentView(Views.MONTH)}
            className="text-xs"
          >
            شهر
          </Button>
          <Button
            variant={currentView === Views.WEEK ? "default" : "ghost"}
            size="sm"
            onClick={() => setCurrentView(Views.WEEK)}
            className="text-xs"
          >
            أسبوع
          </Button>
          <Button
            variant={currentView === Views.DAY ? "default" : "ghost"}
            size="sm"
            onClick={() => setCurrentView(Views.DAY)}
            className="text-xs"
          >
            يوم
          </Button>
        </div>
      </div>
    );
  };

  // Custom date cell wrapper for month view
  const DateCellWrapper = ({ children, value }: any) => {
    const hasEvents = events.some(
      event => moment(event.start).isSame(value, 'day')
    );
    
    return (
      <div
        className={cn(
          "h-full",
          hasEvents && "bg-white/5",
          moment(value).isSame(new Date(), 'day') && "bg-violet-500/10"
        )}
        onClick={() => onDateClick?.(value)}
      >
        {children}
      </div>
    );
  };

  const formats = useMemo(() => ({
    dayFormat: 'dd DD',
    weekdayFormat: 'dddd',
    monthHeaderFormat: 'MMMM YYYY',
    dayRangeHeaderFormat: ({ start, end }: any) =>
      `${moment(start).format('DD MMMM')} - ${moment(end).format('DD MMMM YYYY')}`,
    dayHeaderFormat: 'dddd DD MMMM',
  }), []);

  const messages = {
    today: 'اليوم',
    previous: 'السابق',
    next: 'التالي',
    month: 'شهر',
    week: 'أسبوع',
    day: 'يوم',
    agenda: 'جدول الأعمال',
    date: 'التاريخ',
    time: 'الوقت',
    event: 'الحدث',
    noEventsInRange: 'لا توجد أحداث في هذا النطاق',
    showMore: (total: number) => `+${total} المزيد`,
  };

  return (
    <div className={cn("ifox-calendar", className)}>
      <CustomToolbar />
      <div className="bg-white/5 rounded-lg p-4" style={{ height: '500px' }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={currentView}
          date={currentDate}
          onNavigate={setCurrentDate}
          onView={setCurrentView}
          components={{
            event: EventComponent,
            dateCellWrapper: DateCellWrapper,
            toolbar: () => null, // We're using our custom toolbar
          }}
          formats={formats}
          messages={messages}
          rtl={true}
          style={{ height: '100%' }}
        />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {Object.entries(categoryColors).filter(([key]) => !key.includes("-")).map(([category, color]) => (
          <div key={category} className="flex items-center gap-1">
            <div className={cn("w-3 h-3 rounded", color)} />
            <span className="text-xs text-white/60">{category}</span>
          </div>
        ))}
      </div>

      <style jsx global>{`
        .ifox-calendar .rbc-calendar {
          background: transparent;
          color: white;
        }
        
        .ifox-calendar .rbc-header {
          padding: 8px;
          font-weight: 600;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
        }
        
        .ifox-calendar .rbc-month-view,
        .ifox-calendar .rbc-time-view {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: hidden;
        }
        
        .ifox-calendar .rbc-day-bg {
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ifox-calendar .rbc-month-row {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ifox-calendar .rbc-off-range {
          color: rgba(255, 255, 255, 0.3);
        }
        
        .ifox-calendar .rbc-today {
          background-color: rgba(139, 92, 246, 0.1);
        }
        
        .ifox-calendar .rbc-date-cell {
          padding: 4px;
        }
        
        .ifox-calendar .rbc-event {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
        }
        
        .ifox-calendar .rbc-event-content {
          margin: 0 !important;
        }
        
        .ifox-calendar .rbc-time-slot {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .ifox-calendar .rbc-time-content {
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ifox-calendar .rbc-time-header-content {
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ifox-calendar .rbc-time-header-gutter {
          color: rgba(255, 255, 255, 0.6);
        }
        
        .ifox-calendar .rbc-current-time-indicator {
          background-color: rgb(139, 92, 246);
        }
        
        .ifox-calendar .rbc-show-more {
          color: rgb(139, 92, 246);
          font-size: 11px;
        }
        
        .ifox-calendar .rbc-selected {
          background-color: rgba(139, 92, 246, 0.2) !important;
        }
      `}</style>
    </div>
  );
}