import { useState, KeyboardEvent, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { z } from "zod";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Calendar, Save, Bell, Plus, Trash2, Clock, Zap, X } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const reminderSchema = z.object({
  channel: z.enum(["IN_APP", "EMAIL", "WHATSAPP", "SLACK"]),
  scheduledFor: z.string().min(1, "وقت التذكير مطلوب"),
  recipients: z.string().optional(),
  message: z.string().optional(),
});

const eventSchema = z.object({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  description: z.string().optional(),
  type: z.enum(["GLOBAL", "NATIONAL", "INTERNAL"]),
  dateStart: z.string().min(1, "تاريخ البدء مطلوب"),
  dateEnd: z.string().optional(),
  importance: z.coerce.number().min(1).max(5),
  categoryId: z.string().optional(),
  tags: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;
type ReminderFormValues = z.infer<typeof reminderSchema>;

export default function CalendarEventForm() {
  const [, params] = useRoute("/dashboard/calendar/:action");
  const [, paramsDetail] = useRoute("/dashboard/calendar/events/:id/edit");
  const eventId = paramsDetail?.id;
  const isEdit = !!eventId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isNew = params?.action === "new";
  const [reminders, setReminders] = useState<ReminderFormValues[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const { data: categoriesDataRaw } = useQuery({
    queryKey: ["/api/categories"],
  });
  const categoriesData = Array.isArray(categoriesDataRaw) ? categoriesDataRaw : [];

  // فلترة التصنيفات: التصنيفات الرسمية فقط (ليست SMART أو DYNAMIC)
  const categories = (categoriesData as any[]).filter((cat: any) => {
    const catType = cat.type?.toLowerCase();
    return !catType || catType === "core";
  });

  // تحميل بيانات الحدث للتعديل
  const { data: existingEvent } = useQuery<any>({
    queryKey: [`/api/calendar/${eventId}`],
    enabled: isEdit,
  });

  // تحميل التذكيرات الموجودة
  const { data: existingRemindersRaw } = useQuery<any[]>({
    queryKey: [`/api/calendar/${eventId}/reminders`],
    enabled: isEdit,
  });
  const existingReminders = Array.isArray(existingRemindersRaw) ? existingRemindersRaw : [];

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "GLOBAL",
      dateStart: "",
      dateEnd: "",
      importance: 3,
      categoryId: "",
      tags: "",
    },
  });

  // useEffect لملء النموذج عند التعديل
  useEffect(() => {
    if (existingEvent && isEdit) {
      form.reset({
        title: existingEvent.title,
        description: existingEvent.description || "",
        type: existingEvent.type,
        dateStart: new Date(existingEvent.dateStart).toISOString().slice(0, 16),
        dateEnd: existingEvent.dateEnd ? new Date(existingEvent.dateEnd).toISOString().slice(0, 16) : "",
        importance: existingEvent.importance,
        categoryId: existingEvent.categoryId || "",
        tags: "",
      });
      
      if (existingEvent.tags) {
        setTags(existingEvent.tags);
      }
    }
  }, [existingEvent, isEdit, form]);

  useEffect(() => {
    if (existingReminders && existingReminders.length > 0 && isEdit && existingEvent) {
      const formattedReminders = existingReminders.map((r: any) => {
        // حساب وقت التذكير من fireWhen وتاريخ الحدث
        const eventDate = new Date(existingEvent.dateStart);
        const reminderDate = new Date(eventDate);
        reminderDate.setDate(eventDate.getDate() - (r.fireWhen || 0));
        
        return {
          channel: r.channel,
          scheduledFor: reminderDate.toISOString().slice(0, 16),
          recipients: Array.isArray(r.recipients) ? r.recipients.join(", ") : (r.recipients || ""),
          message: r.message || "",
        };
      });
      setReminders(formattedReminders);
    }
  }, [existingReminders, isEdit, existingEvent]);

  // Tags Management
  const handleTagInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
        setTagInput("");
      } else {
        toast({
          title: "تنبيه",
          description: "هذا الوسم موجود بالفعل",
          variant: "destructive",
        });
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addReminder = () => {
    setReminders([
      ...reminders,
      {
        channel: "IN_APP",
        scheduledFor: "",
        recipients: "",
        message: "",
      },
    ]);
  };

  const removeReminder = (index: number) => {
    setReminders(reminders.filter((_, i) => i !== index));
  };

  const updateReminder = (index: number, field: keyof ReminderFormValues, value: string) => {
    const updated = [...reminders];
    updated[index] = { ...updated[index], [field]: value };
    setReminders(updated);
  };

  // حساب وقت التذكير بناءً على تاريخ المناسبة
  const calculateReminderTime = (daysOffset?: number, hoursOffset?: number): string | null => {
    const dateStart = form.getValues("dateStart");
    if (!dateStart) {
      toast({
        title: "تنبيه",
        description: "يرجى اختيار تاريخ المناسبة أولاً",
        variant: "destructive",
      });
      return null;
    }

    const eventDate = new Date(dateStart);
    const reminderDate = new Date(eventDate);

    if (daysOffset) {
      reminderDate.setDate(reminderDate.getDate() - daysOffset);
    }
    if (hoursOffset) {
      reminderDate.setHours(reminderDate.getHours() - hoursOffset);
    }

    // التحقق من أن الوقت في المستقبل
    const now = new Date();
    if (reminderDate < now) {
      toast({
        title: "تنبيه",
        description: "وقت التذكير المحسوب في الماضي. يرجى اختيار تاريخ مناسبة في المستقبل.",
        variant: "destructive",
      });
      return null;
    }

    // تنسيق للـ datetime-local input
    const year = reminderDate.getFullYear();
    const month = String(reminderDate.getMonth() + 1).padStart(2, '0');
    const day = String(reminderDate.getDate()).padStart(2, '0');
    const hours = String(reminderDate.getHours()).padStart(2, '0');
    const minutes = String(reminderDate.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // إضافة تذكير سريع
  const addQuickReminder = (label: string, daysOffset?: number, hoursOffset?: number) => {
    const scheduledTime = calculateReminderTime(daysOffset, hoursOffset);
    if (!scheduledTime) return;

    setReminders([
      ...reminders,
      {
        channel: "IN_APP",
        scheduledFor: scheduledTime,
        recipients: "",
        message: `تذكير: ${label}`,
      },
    ]);

    toast({
      title: "تم الإضافة",
      description: `تم إضافة تذكير ${label}`,
    });
  };

  const createEvent = useMutation({
    mutationFn: async (data: EventFormValues) => {
      const payload = {
        ...data,
        tags: tags, // استخدام tags من state
        categoryId: data.categoryId || null,
        dateEnd: data.dateEnd || null,
        reminders: reminders.map(r => ({
          ...r,
          recipients: r.recipients ? r.recipients.split(",").map(t => t.trim()) : [],
        })),
      };
      
      if (isEdit) {
        return await apiRequest(`/api/calendar/${eventId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        return await apiRequest("/api/calendar", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: [`/api/calendar/${eventId}`] });
      }
      toast({
        title: isEdit ? "تم التحديث" : "تم الحفظ",
        description: isEdit ? "تم تحديث المناسبة بنجاح" : "تم إضافة المناسبة بنجاح",
      });
      navigate("/dashboard/calendar");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || (isEdit ? "حدث خطأ أثناء تحديث المناسبة" : "حدث خطأ أثناء حفظ المناسبة"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EventFormValues) => {
    createEvent.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/calendar">
            <Button variant="outline" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">
              {isEdit ? "تعديل مناسبة" : "إضافة مناسبة جديدة"}
            </h1>
            <p className="text-muted-foreground">
              {isEdit ? "تحديث بيانات المناسبة في التقويم التحريري" : "أضف مناسبة إلى التقويم التحريري"}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>معلومات المناسبة</CardTitle>
            <CardDescription>
              املأ البيانات أدناه لإضافة مناسبة جديدة إلى التقويم
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>عنوان المناسبة *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="مثال: اليوم العالمي للمرأة"
                          {...field}
                          data-testid="input-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الوصف</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="وصف تفصيلي للمناسبة..."
                          rows={4}
                          {...field}
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نوع المناسبة *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue placeholder="اختر النوع" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="GLOBAL">عالمي</SelectItem>
                            <SelectItem value="NATIONAL">وطني</SelectItem>
                            <SelectItem value="INTERNAL">داخلي</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="importance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الأهمية (1-5) *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-importance">
                              <SelectValue placeholder="اختر الأهمية" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 - منخفضة</SelectItem>
                            <SelectItem value="2">2 - متوسطة</SelectItem>
                            <SelectItem value="3">3 - عادية</SelectItem>
                            <SelectItem value="4">4 - مهمة</SelectItem>
                            <SelectItem value="5">5 - مهمة جداً</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="dateStart"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تاريخ ووقت البدء *</FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            data-testid="input-date-start"
                          />
                        </FormControl>
                        <FormDescription>
                          حدد التاريخ والوقت الدقيق للمناسبة
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dateEnd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تاريخ ووقت الانتهاء (اختياري)</FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            data-testid="input-date-end"
                          />
                        </FormControl>
                        <FormDescription>
                          للمناسبات التي تستمر لأكثر من يوم
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>التصنيف (اختياري)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="اختر تصنيفاً (اختياري)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(categories as any[]).map((cat: any) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <FormLabel>الكلمات المفتاحية (اختياري)</FormLabel>
                  <div className="space-y-2">
                    <Input
                      placeholder="اكتب الكلمة واضغط Enter لإضافتها"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagInputKeyDown}
                      data-testid="input-tags"
                    />
                    <p className="text-xs text-muted-foreground">
                      اكتب الكلمة المفتاحية واضغط <kbd className="px-1.5 py-0.5 text-xs border rounded bg-muted">Enter</kbd> لإضافتها
                    </p>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/50">
                        {tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="gap-1"
                            data-testid={`tag-${tag}`}
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-1 hover:text-destructive"
                              data-testid={`button-remove-tag-${tag}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Reminders Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        التذكيرات والإشعارات
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        أضف تذكيرات للمناسبة عبر قنوات مختلفة
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addReminder}
                      data-testid="button-add-reminder"
                    >
                      <Plus className="h-4 w-4 ml-2" />
                      إضافة تذكير مخصص
                    </Button>
                  </div>

                  {/* Quick Reminder Buttons */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-primary" />
                          <h4 className="font-medium text-sm">تذكيرات سريعة</h4>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          اضغط على أي زر لإضافة تذكير تلقائي قبل موعد المناسبة
                        </p>
                        <ScrollArea className="w-full">
                          <div className="flex gap-2 pb-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addQuickReminder("قبل أسبوع", 7)}
                              data-testid="button-quick-7days"
                              className="whitespace-nowrap"
                            >
                              <Clock className="h-3 w-3 ml-1" />
                              قبل أسبوع
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addQuickReminder("قبل 3 أيام", 3)}
                              data-testid="button-quick-3days"
                              className="whitespace-nowrap"
                            >
                              <Clock className="h-3 w-3 ml-1" />
                              قبل 3 أيام
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addQuickReminder("قبل يوم", 1)}
                              data-testid="button-quick-1day"
                              className="whitespace-nowrap"
                            >
                              <Clock className="h-3 w-3 ml-1" />
                              قبل يوم
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addQuickReminder("قبل 3 ساعات", undefined, 3)}
                              data-testid="button-quick-3hours"
                              className="whitespace-nowrap"
                            >
                              <Clock className="h-3 w-3 ml-1" />
                              قبل 3 ساعات
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addQuickReminder("قبل ساعة", undefined, 1)}
                              data-testid="button-quick-1hour"
                              className="whitespace-nowrap"
                            >
                              <Clock className="h-3 w-3 ml-1" />
                              قبل ساعة
                            </Button>
                          </div>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>

                  {reminders.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                      <Bell className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-muted-foreground">لم تتم إضافة تذكيرات بعد</p>
                      <p className="text-sm text-muted-foreground">
                        اضغط على "إضافة تذكير" لإضافة تذكير جديد
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {reminders.map((reminder, index) => (
                        <Card key={index}>
                          <CardContent className="p-4">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline">تذكير {index + 1}</Badge>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeReminder(index)}
                                  data-testid={`button-remove-reminder-${index}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium mb-2 block">
                                    القناة *
                                  </label>
                                  <Select
                                    value={reminder.channel}
                                    onValueChange={(value) =>
                                      updateReminder(index, "channel", value)
                                    }
                                  >
                                    <SelectTrigger data-testid={`select-channel-${index}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="IN_APP">
                                        إشعار داخل التطبيق
                                      </SelectItem>
                                      <SelectItem value="EMAIL">بريد إلكتروني</SelectItem>
                                      <SelectItem value="WHATSAPP">واتساب</SelectItem>
                                      <SelectItem value="SLACK">سلاك</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div>
                                  <label className="text-sm font-medium mb-2 block">
                                    وقت التذكير *
                                  </label>
                                  <Input
                                    type="datetime-local"
                                    value={reminder.scheduledFor}
                                    onChange={(e) =>
                                      updateReminder(index, "scheduledFor", e.target.value)
                                    }
                                    data-testid={`input-scheduled-${index}`}
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-sm font-medium mb-2 block">
                                  المستلمون (اختياري)
                                </label>
                                <Input
                                  placeholder="افصل بين الإيميلات/الأرقام بفاصلة"
                                  value={reminder.recipients}
                                  onChange={(e) =>
                                    updateReminder(index, "recipients", e.target.value)
                                  }
                                  data-testid={`input-recipients-${index}`}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {reminder.channel === "EMAIL"
                                    ? "أدخل الإيميلات مفصولة بفاصلة"
                                    : reminder.channel === "WHATSAPP"
                                    ? "أدخل أرقام الهواتف مفصولة بفاصلة (مثال: +966501234567)"
                                    : "أدخل معرفات المستخدمين"}
                                </p>
                              </div>

                              <div>
                                <label className="text-sm font-medium mb-2 block">
                                  رسالة مخصصة (اختياري)
                                </label>
                                <Textarea
                                  placeholder="رسالة التذكير..."
                                  rows={2}
                                  value={reminder.message}
                                  onChange={(e) =>
                                    updateReminder(index, "message", e.target.value)
                                  }
                                  data-testid={`input-message-${index}`}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button
                    type="submit"
                    disabled={createEvent.isPending}
                    data-testid="button-submit"
                  >
                    <Save className="h-4 w-4 ml-2" />
                    {createEvent.isPending 
                      ? (isEdit ? "جاري التحديث..." : "جاري الحفظ...") 
                      : (isEdit ? "تحديث" : "حفظ")}
                  </Button>
                  <Link href="/dashboard/calendar">
                    <Button variant="outline" type="button" data-testid="button-cancel">
                      إلغاء
                    </Button>
                  </Link>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
