import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/RichTextEditor";
import { TagInput } from "@/components/TagInput";
import { CalendarIcon, Save, Send, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

const announcementSchema = z.object({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  message: z.string().min(10, "الرسالة يجب أن تكون 10 أحرف على الأقل"),
  priority: z.enum(["low", "normal", "high"]),
  channels: z.array(z.enum(["dashboardBanner", "inbox", "toast"])).min(1, "يجب اختيار قناة واحدة على الأقل"),
  audienceRoles: z.array(z.string()).optional(),
  audienceUserIds: z.array(z.string()).optional(),
  startAt: z.date().optional(),
  endAt: z.date().optional(),
  publishNow: z.boolean().default(false),
  iconName: z.string().optional(),
  actionButtonLabel: z.string().optional(),
  actionButtonUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

type AnnouncementFormData = z.infer<typeof announcementSchema>;

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
  channels: string[];
  audienceRoles: string[] | null;
  audienceUserIds: string[] | null;
  startAt: string | null;
  endAt: string | null;
  iconName: string | null;
  actionButtonLabel: string | null;
  actionButtonUrl: string | null;
  tags: string[] | null;
}

export default function AnnouncementEditor() {
  const { id } = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tags, setTags] = useState<string[]>([]);

  const isEditMode = !!id && id !== 'new';

  const { data: announcement, isLoading } = useQuery<Announcement>({
    queryKey: ['/api/announcements', id],
    enabled: isEditMode,
  });

  const { data: allUsers } = useQuery<{ id: string; email: string; firstName?: string; lastName?: string }[]>({
    queryKey: ['/api/users'],
  });

  const form = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: "",
      message: "",
      priority: "normal",
      channels: [],
      audienceRoles: [],
      audienceUserIds: [],
      publishNow: false,
      tags: [],
    },
  });

  useEffect(() => {
    if (announcement && isEditMode) {
      form.reset({
        title: announcement.title,
        message: announcement.message,
        priority: announcement.priority as any,
        channels: announcement.channels as ("dashboardBanner" | "inbox" | "toast")[],
        audienceRoles: announcement.audienceRoles || [],
        audienceUserIds: announcement.audienceUserIds || [],
        startAt: announcement.startAt ? new Date(announcement.startAt) : undefined,
        endAt: announcement.endAt ? new Date(announcement.endAt) : undefined,
        publishNow: false,
        iconName: announcement.iconName || undefined,
        actionButtonLabel: announcement.actionButtonLabel || undefined,
        actionButtonUrl: announcement.actionButtonUrl || undefined,
      });
      // Load tags into local state
      setTags(announcement.tags || []);
    }
  }, [announcement, isEditMode, form]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم إنشاء الإعلان بنجاح" });
      setLocation('/dashboard/announcements');
    },
    onError: () => {
      toast({ title: "❌ فشل إنشاء الإعلان", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم تحديث الإعلان بنجاح" });
      setLocation('/dashboard/announcements');
    },
    onError: () => {
      toast({ title: "❌ فشل تحديث الإعلان", variant: "destructive" });
    },
  });

  const onSubmit = (data: AnnouncementFormData, action: 'draft' | 'schedule' | 'publish') => {
    // Debug: Log form errors if any
    if (Object.keys(form.formState.errors).length > 0) {
      console.error('❌ Form validation errors:', form.formState.errors);
      toast({ 
        title: "❌ خطأ في النموذج", 
        description: "يرجى التحقق من جميع الحقول المطلوبة",
        variant: "destructive" 
      });
      return;
    }

    const payload = {
      title: data.title,
      message: data.message,
      priority: data.priority,
      channels: data.channels,
      audienceRoles: data.audienceRoles && data.audienceRoles.length > 0 ? data.audienceRoles : null,
      audienceUserIds: data.audienceUserIds && data.audienceUserIds.length > 0 ? data.audienceUserIds : null,
      startAt: data.startAt ? data.startAt.toISOString() : null,
      endAt: data.endAt ? data.endAt.toISOString() : null,
      iconName: data.iconName || null,
      actionButtonLabel: data.actionButtonLabel || null,
      actionButtonUrl: data.actionButtonUrl || null,
      tags: tags.length > 0 ? tags : null,
      status: action === 'publish' ? 'published' : action === 'schedule' ? 'scheduled' : 'draft',
    };

    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleChannel = (channel: "dashboardBanner" | "inbox" | "toast") => {
    const current = form.getValues('channels');
    if (current.includes(channel)) {
      form.setValue('channels', current.filter(c => c !== channel));
    } else {
      form.setValue('channels', [...current, channel]);
    }
  };

  const toggleRole = (role: string) => {
    const current = form.getValues('audienceRoles') || [];
    if (current.includes(role)) {
      form.setValue('audienceRoles', current.filter(r => r !== role));
    } else {
      form.setValue('audienceRoles', [...current, role]);
    }
  };

  if (isLoading && isEditMode) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6" dir="rtl">
          <div>جاري التحميل...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6" dir="rtl">
        <div>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'تحرير الإعلان' : 'إنشاء إعلان جديد'}
          </h1>
        </div>

        <Form {...form}>
          <form className="space-y-6">
            <Tabs defaultValue="content" dir="rtl">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="content">المحتوى</TabsTrigger>
                <TabsTrigger value="targeting">الاستهداف</TabsTrigger>
                <TabsTrigger value="scheduling">الجدولة</TabsTrigger>
                <TabsTrigger value="attachments">المرفقات</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>محتوى الإعلان</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>العنوان</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="عنوان الإعلان"
                              data-testid="input-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الرسالة</FormLabel>
                          <FormControl>
                            <RichTextEditor
                              content={field.value}
                              onChange={field.onChange}
                              placeholder="اكتب رسالة الإعلان هنا..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الأولوية</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-priority">
                                <SelectValue placeholder="اختر الأولوية" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">منخفض</SelectItem>
                              <SelectItem value="normal">عادي</SelectItem>
                              <SelectItem value="high">عالي</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div>
                      <FormLabel>الوسوم</FormLabel>
                      <TagInput
                        tags={tags}
                        onTagsChange={setTags}
                        placeholder="أضف وسماً..."
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="targeting" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>استهداف الجمهور</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="channels"
                      render={() => (
                        <FormItem>
                          <FormLabel>القنوات</FormLabel>
                          <div className="space-y-2">
                            {(['dashboardBanner', 'inbox', 'toast'] as const).map(channel => (
                              <div key={channel} className="flex items-center gap-2">
                                <Checkbox
                                  id={`channel-${channel}`}
                                  checked={form.watch('channels').includes(channel)}
                                  onCheckedChange={() => toggleChannel(channel)}
                                  data-testid={`checkbox-channel-${channel}`}
                                />
                                <label htmlFor={`channel-${channel}`} className="text-sm cursor-pointer">
                                  {channel === 'dashboardBanner' && 'بانر لوحة التحكم'}
                                  {channel === 'inbox' && 'صندوق الوارد'}
                                  {channel === 'toast' && 'إشعار منبثق'}
                                </label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="audienceRoles"
                      render={() => (
                        <FormItem>
                          <FormLabel>الأدوار المستهدفة</FormLabel>
                          <div className="space-y-2">
                            {['admin', 'editor', 'reporter', 'reader'].map(role => (
                              <div key={role} className="flex items-center gap-2">
                                <Checkbox
                                  id={`role-${role}`}
                                  checked={(form.watch('audienceRoles') || []).includes(role)}
                                  onCheckedChange={() => toggleRole(role)}
                                  data-testid={`checkbox-role-${role}`}
                                />
                                <label htmlFor={`role-${role}`} className="text-sm cursor-pointer">
                                  {role === 'admin' && 'مدير النظام'}
                                  {role === 'editor' && 'محرر'}
                                  {role === 'reporter' && 'مراسل'}
                                  {role === 'reader' && 'قارئ'}
                                </label>
                              </div>
                            ))}
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="audienceUserIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>مستخدمون محددون (اختياري)</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              value={field.value?.join('\n') || ''}
                              onChange={(e) => field.onChange(e.target.value.split('\n').filter(Boolean))}
                              placeholder="معرفات المستخدمين (واحد في كل سطر)"
                              data-testid="textarea-target-users"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="scheduling" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>جدولة الإعلان</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="publishNow"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-publish-now"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">نشر الآن</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="startAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>تاريخ البدء</FormLabel>
                          <div className="flex gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "flex-1 justify-start text-right font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-start-date"
                                  >
                                    <CalendarIcon className="ml-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP", { locale: ar }) : "اختر تاريخ البدء"}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  locale={ar}
                                />
                              </PopoverContent>
                            </Popover>
                            {field.value && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => field.onChange(undefined)}
                                data-testid="button-clear-start-date"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>تاريخ الانتهاء</FormLabel>
                          <div className="flex gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "flex-1 justify-start text-right font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-end-date"
                                  >
                                    <CalendarIcon className="ml-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP", { locale: ar }) : "اختر تاريخ الانتهاء"}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  locale={ar}
                                />
                              </PopoverContent>
                            </Popover>
                            {field.value && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => field.onChange(undefined)}
                                data-testid="button-clear-end-date"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="attachments" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>المرفقات والإضافات</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="iconName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رمز الأيقونة (Lucide React)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="مثال: Bell, AlertCircle, Info"
                              data-testid="input-icon-name"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="actionButtonLabel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>نص زر الإجراء</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="مثال: اقرأ المزيد، تفاصيل"
                              data-testid="input-action-label"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="actionButtonUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رابط زر الإجراء</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="مثال: /dashboard/news"
                              data-testid="input-action-url"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 justify-end border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation('/dashboard/announcements')}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={form.handleSubmit((data) => onSubmit(data, 'draft'))}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-draft"
              >
                <Save className="ml-2 h-4 w-4" />
                حفظ كمسودة
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={form.handleSubmit((data) => onSubmit(data, 'schedule'))}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-schedule"
              >
                <Clock className="ml-2 h-4 w-4" />
                جدولة
              </Button>

              <Button
                type="button"
                onClick={form.handleSubmit((data) => onSubmit(data, 'publish'))}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-publish"
              >
                <Send className="ml-2 h-4 w-4" />
                نشر الآن
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
