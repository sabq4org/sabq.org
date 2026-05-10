import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IfoxEditorialCalendar, InsertIfoxEditorialCalendar } from "@shared/schema";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
  startOfDay,
  endOfDay,
  startOfISOWeek,
  endOfISOWeek,
} from "date-fns";
import { ar } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIfoxEditorialCalendarSchema } from "@shared/schema";
import { z } from "zod";

export default function EditorialCalendarTab() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<IfoxEditorialCalendar | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch calendar entries for current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: eventsRaw, isLoading } = useQuery<IfoxEditorialCalendar[]>({
    queryKey: ["/api/ifox/ai-management/calendar", format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const response = await fetch(
        `/api/ifox/ai-management/calendar?scheduledDateFrom=${monthStart.toISOString()}&scheduledDateTo=${monthEnd.toISOString()}`
      );
      if (!response.ok) throw new Error("Failed to fetch calendar entries");
      return response.json();
    },
  });
  const events = Array.isArray(eventsRaw) ? eventsRaw : [];

  // Calculate stats
  const totalEvents = events.length;
  const today = new Date();
  const todayEvents = events.filter((e) =>
    isSameDay(new Date(e.scheduledDate), today)
  );
  const weekStart = startOfISOWeek(today);
  const weekEnd = endOfISOWeek(today);
  const weekEvents = events.filter((e) => {
    const eventDate = new Date(e.scheduledDate);
    return eventDate >= weekStart && eventDate <= weekEnd;
  });

  // Calendar grid
  const calendarStart = startOfWeek(monthStart, { locale: ar });
  const calendarEnd = endOfWeek(monthEnd, { locale: ar });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return events.filter((event) =>
      isSameDay(new Date(event.scheduledDate), date)
    );
  };

  // Navigate months
  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  // Handle date click (create new event)
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setIsDialogOpen(true);
  };

  // Handle event click (view/edit)
  const handleEventClick = (event: IfoxEditorialCalendar, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
    setSelectedDate(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الأحداث</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-events">
              {totalEvents}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">أحداث اليوم</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="text-today-events">
              {todayEvents.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">أحداث هذا الأسبوع</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-week-events">
              {weekEvents.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                التقويم التحريري
              </CardTitle>
              <CardDescription>
                جدولة ونشر المحتوى التلقائي والمخصص
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousMonth}
                data-testid="button-previous-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={goToToday}
                data-testid="button-today"
              >
                اليوم
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextMonth}
                data-testid="button-next-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="text-center text-lg font-semibold" data-testid="text-current-month">
            {format(currentMonth, "MMMM yyyy", { locale: ar })}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" data-testid="loader-calendar" />
            </div>
          ) : (
            <div className="space-y-2">
              {/* Week days header */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-semibold text-muted-foreground p-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-2" data-testid="calendar-grid">
                {calendarDays.map((day, index) => {
                  const dayEvents = getEventsForDate(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isTodayDate = isToday(day);

                  return (
                    <div
                      key={index}
                      onClick={() => handleDateClick(day)}
                      className={`
                        min-h-24 p-2 border rounded-md cursor-pointer transition-all hover-elevate
                        ${isCurrentMonth ? "bg-card" : "bg-muted/30"}
                        ${isTodayDate ? "border-primary border-2" : ""}
                      `}
                      data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-medium ${
                            isCurrentMonth ? "" : "text-muted-foreground"
                          } ${isTodayDate ? "text-primary font-bold" : ""}`}
                        >
                          {format(day, "d", { locale: ar })}
                        </span>
                        {dayEvents.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {dayEvents.length}
                          </Badge>
                        )}
                      </div>

                      {/* Events for this day */}
                      <div className="space-y-1">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            onClick={(e) => handleEventClick(event, e)}
                            className={`
                              text-xs p-1 rounded truncate hover-elevate
                              ${getEventColor(event.status || "planned")}
                            `}
                            data-testid={`event-${event.id}`}
                          >
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {getSlotLabel(event.slot)}
                              </Badge>
                              <span className="truncate">{event.topicIdea || "بدون عنوان"}</span>
                            </div>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-xs text-muted-foreground text-center">
                            +{dayEvents.length - 2} أخرى
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Dialog */}
      <EventDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        selectedDate={selectedDate}
        selectedEvent={selectedEvent}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/calendar"] });
          setIsDialogOpen(false);
          setSelectedDate(null);
          setSelectedEvent(null);
        }}
      />
    </div>
  );
}

// Event Dialog Component
interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | null;
  selectedEvent: IfoxEditorialCalendar | null;
  onSuccess: () => void;
}

function EventDialog({ open, onOpenChange, selectedDate, selectedEvent, onSuccess }: EventDialogProps) {
  const { toast } = useToast();
  const isEditMode = selectedEvent !== null;

  // Form schema
  const formSchema = insertIfoxEditorialCalendarSchema.extend({
    topicIdea: z.string().min(1, "الموضوع مطلوب"),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      scheduledDate: selectedEvent
        ? new Date(selectedEvent.scheduledDate).toISOString().split("T")[0]
        : selectedDate
        ? selectedDate.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      slot: selectedEvent?.slot || "morning",
      topicIdea: selectedEvent?.topicIdea || "",
      plannedContentType: selectedEvent?.plannedContentType || "",
      targetAudience: selectedEvent?.targetAudience || "",
      assignmentType: selectedEvent?.assignmentType || "ai",
      status: selectedEvent?.status || "planned",
      notes: selectedEvent?.notes || "",
    },
  });

  // Reset form when dialog opens
  useState(() => {
    if (open) {
      form.reset({
        scheduledDate: selectedEvent
          ? new Date(selectedEvent.scheduledDate).toISOString().split("T")[0]
          : selectedDate
          ? selectedDate.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        slot: selectedEvent?.slot || "morning",
        topicIdea: selectedEvent?.topicIdea || "",
        plannedContentType: selectedEvent?.plannedContentType || "",
        targetAudience: selectedEvent?.targetAudience || "",
        assignmentType: selectedEvent?.assignmentType || "ai",
        status: selectedEvent?.status || "planned",
        notes: selectedEvent?.notes || "",
      });
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) =>
      apiRequest("/api/ifox/ai-management/calendar", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: "تم الإنشاء",
        description: "تم إنشاء الحدث بنجاح",
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء الحدث",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) =>
      apiRequest(`/api/ifox/ai-management/calendar/${selectedEvent?.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: "تم التحديث",
        description: "تم تحديث الحدث بنجاح",
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحديث الحدث",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/ifox/ai-management/calendar/${selectedEvent?.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف الحدث بنجاح",
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف الحدث",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditMode ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {isEditMode ? "تعديل الحدث" : "إنشاء حدث جديد"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? "تعديل تفاصيل الحدث المجدول" : "إضافة حدث جديد إلى التقويم التحريري"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>التاريخ المجدول</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-scheduled-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slot"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الفترة الزمنية</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-slot">
                          <SelectValue placeholder="اختر الفترة" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="morning">صباحاً</SelectItem>
                        <SelectItem value="afternoon">ظهراً</SelectItem>
                        <SelectItem value="evening">مساءً</SelectItem>
                        <SelectItem value="night">ليلاً</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="topicIdea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>فكرة الموضوع</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="أدخل فكرة الموضوع" data-testid="input-topic-idea" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="plannedContentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع المحتوى</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="خبر، تحليل، رأي، دليل"
                        data-testid="input-content-type"
                      />
                    </FormControl>
                    <FormDescription>مثال: خبر، تحليل، رأي، دليل</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetAudience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الجمهور المستهدف</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="الجمهور المستهدف"
                        data-testid="input-target-audience"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="assignmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع التكليف</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-assignment-type">
                          <SelectValue placeholder="اختر نوع التكليف" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ai">ذكاء اصطناعي</SelectItem>
                        <SelectItem value="human">كاتب بشري</SelectItem>
                        <SelectItem value="hybrid">مختلط</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الحالة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="اختر الحالة" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="planned">مخطط</SelectItem>
                        <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                        <SelectItem value="completed">مكتمل</SelectItem>
                        <SelectItem value="cancelled">ملغي</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ملاحظات</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ""}
                      placeholder="أضف ملاحظات إضافية"
                      className="min-h-20"
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-4 border-t">
              {isEditMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={isPending}
                  data-testid="button-delete"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  ) : (
                    <Trash2 className="w-4 h-4 ml-2" />
                  )}
                  حذف
                </Button>
              )}
              <Button type="submit" disabled={isPending} data-testid="button-save">
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                )}
                {isEditMode ? "حفظ التغييرات" : "إنشاء"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                <XCircle className="w-4 h-4 ml-2" />
                إلغاء
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Helper Functions
function getSlotLabel(slot: string): string {
  const labels: Record<string, string> = {
    morning: "صباح",
    afternoon: "ظهر",
    evening: "مساء",
    night: "ليل",
  };
  return labels[slot] || slot;
}

function getEventColor(status: string): string {
  const colors: Record<string, string> = {
    planned: "bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-100",
    in_progress: "bg-yellow-100 dark:bg-yellow-950 text-yellow-900 dark:text-yellow-100",
    completed: "bg-green-100 dark:bg-green-950 text-green-900 dark:text-green-100",
    cancelled: "bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-100",
  };
  return colors[status] || colors.planned;
}
