import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Info,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Calendar as CalendarIcon,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { DashboardAnnouncement } from "@shared/schema";

const announcementFormSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  message: z.string().min(1, "الرسالة مطلوبة"),
  type: z.enum(["info", "success", "warning", "feature"]),
  icon: z.string().optional(),
  linkUrl: z.string().url("رابط غير صالح").optional().or(z.literal("")),
  linkText: z.string().optional(),
  priority: z.number().default(0),
  isActive: z.boolean().default(true),
  startsAt: z.date().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
});

type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

const typeConfig: Record<string, { color: string; label: string; icon: typeof Info }> = {
  info: { color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20", label: "معلومات", icon: Info },
  success: { color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20", label: "نجاح", icon: CheckCircle },
  warning: { color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "تحذير", icon: AlertTriangle },
  feature: { color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20", label: "ميزة جديدة", icon: Sparkles },
};

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return format(new Date(date), "d MMMM yyyy - HH:mm", { locale: ar });
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-primary/10 p-6 mb-4">
          <Megaphone className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2" data-testid="text-empty-title">لا توجد إعلانات</h3>
        <p className="text-muted-foreground text-center max-w-md" data-testid="text-empty-description">
          لم يتم إنشاء أي إعلانات بعد. أنشئ إعلانًا جديدًا لعرضه على لوحة التحكم.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AnnouncementsManagement() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<DashboardAnnouncement | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState<DashboardAnnouncement | null>(null);

  useEffect(() => {
    document.title = "إدارة الإعلانات - لوحة التحكم";
  }, []);

  const { data: announcementsRaw, isLoading } = useQuery<DashboardAnnouncement[]>({
    queryKey: ["/api/admin/announcements"],
  });
  const announcements = Array.isArray(announcementsRaw) ? announcementsRaw : [];

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: "",
      message: "",
      type: "info",
      icon: "",
      linkUrl: "",
      linkText: "",
      priority: 0,
      isActive: true,
      startsAt: null,
      expiresAt: null,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AnnouncementFormValues) => {
      return await apiRequest("/api/admin/announcements", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          linkUrl: data.linkUrl || null,
          linkText: data.linkText || null,
          icon: data.icon || null,
          startsAt: data.startsAt?.toISOString() || null,
          expiresAt: data.expiresAt?.toISOString() || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      toast({
        title: "تم إنشاء الإعلان",
        description: "تم إنشاء الإعلان بنجاح",
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الإعلان",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AnnouncementFormValues }) => {
      return await apiRequest(`/api/admin/announcements/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...data,
          linkUrl: data.linkUrl || null,
          linkText: data.linkText || null,
          icon: data.icon || null,
          startsAt: data.startsAt?.toISOString() || null,
          expiresAt: data.expiresAt?.toISOString() || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      toast({
        title: "تم تحديث الإعلان",
        description: "تم تحديث الإعلان بنجاح",
      });
      setDialogOpen(false);
      setEditingAnnouncement(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الإعلان",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/announcements/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف الإعلان بنجاح",
      });
      setDeleteDialogOpen(false);
      setAnnouncementToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الإعلان",
        variant: "destructive",
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingAnnouncement(null);
    form.reset({
      title: "",
      message: "",
      type: "info",
      icon: "",
      linkUrl: "",
      linkText: "",
      priority: 0,
      isActive: true,
      startsAt: null,
      expiresAt: null,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (announcement: DashboardAnnouncement) => {
    setEditingAnnouncement(announcement);
    form.reset({
      title: announcement.title,
      message: announcement.message,
      type: announcement.type as "info" | "success" | "warning" | "feature",
      icon: announcement.icon || "",
      linkUrl: announcement.linkUrl || "",
      linkText: announcement.linkText || "",
      priority: announcement.priority,
      isActive: announcement.isActive,
      startsAt: announcement.startsAt ? new Date(announcement.startsAt) : null,
      expiresAt: announcement.expiresAt ? new Date(announcement.expiresAt) : null,
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: AnnouncementFormValues) => {
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (announcement: DashboardAnnouncement) => {
    setAnnouncementToDelete(announcement);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (announcementToDelete) {
      deleteMutation.mutate(announcementToDelete.id);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="h-8 w-8 text-primary" data-testid="icon-header" />
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">إدارة الإعلانات</h1>
              <p className="text-muted-foreground" data-testid="text-page-description">
                إدارة إعلانات لوحة التحكم والتنبيهات
              </p>
            </div>
          </div>

          <Button onClick={handleOpenCreate} data-testid="button-create-announcement">
            <Plus className="ml-2 h-4 w-4" />
            إنشاء إعلان جديد
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg">الإعلانات</CardTitle>
            <Badge variant="secondary" data-testid="badge-total-count">
              {announcements.length} إعلان
            </Badge>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton />
            ) : announcements.length === 0 ? (
              <EmptyState />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العنوان</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الأولوية</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">تاريخ البداية</TableHead>
                    <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((announcement) => {
                    const config = typeConfig[announcement.type] || typeConfig.info;
                    const TypeIcon = config.icon;
                    return (
                      <TableRow key={announcement.id} data-testid={`row-announcement-${announcement.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium" data-testid={`text-title-${announcement.id}`}>
                              {announcement.title}
                            </span>
                            {announcement.linkUrl && (
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={config.color} data-testid={`badge-type-${announcement.id}`}>
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-priority-${announcement.id}`}>
                          {announcement.priority}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={announcement.isActive
                              ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                              : "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
                            }
                            data-testid={`badge-status-${announcement.id}`}
                          >
                            {announcement.isActive ? "نشط" : "غير نشط"}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-starts-at-${announcement.id}`}>
                          {formatDate(announcement.startsAt)}
                        </TableCell>
                        <TableCell data-testid={`text-expires-at-${announcement.id}`}>
                          {formatDate(announcement.expiresAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(announcement)}
                              data-testid={`button-edit-${announcement.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(announcement)}
                              data-testid={`button-delete-${announcement.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">
                {editingAnnouncement ? "تعديل الإعلان" : "إنشاء إعلان جديد"}
              </DialogTitle>
              <DialogDescription data-testid="text-dialog-description">
                {editingAnnouncement
                  ? "قم بتعديل بيانات الإعلان"
                  : "أضف إعلانًا جديدًا لعرضه على لوحة التحكم"
                }
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العنوان *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="عنوان الإعلان" data-testid="input-title" />
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
                      <FormLabel>الرسالة *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="نص الرسالة..."
                          rows={4}
                          data-testid="input-message"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>النوع</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="info">معلومات</SelectItem>
                            <SelectItem value="success">نجاح</SelectItem>
                            <SelectItem value="warning">تحذير</SelectItem>
                            <SelectItem value="feature">ميزة جديدة</SelectItem>
                          </SelectContent>
                        </Select>
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
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-priority"
                          />
                        </FormControl>
                        <FormDescription>الأعلى = الأكثر أهمية</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الأيقونة (اختياري)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="اسم الأيقونة من Lucide (مثال: Bell)"
                          data-testid="input-icon"
                        />
                      </FormControl>
                      <FormDescription>اترك فارغًا لاستخدام أيقونة النوع الافتراضية</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="linkUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>رابط (اختياري)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://..."
                            type="url"
                            data-testid="input-link-url"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="linkText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نص الرابط (اختياري)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="اقرأ المزيد"
                            data-testid="input-link-text"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startsAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>تاريخ البداية (اختياري)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={`w-full justify-start text-right font-normal ${!field.value && "text-muted-foreground"}`}
                                data-testid="button-starts-at"
                              >
                                <CalendarIcon className="ml-2 h-4 w-4" />
                                {field.value
                                  ? format(field.value, "PPP", { locale: ar })
                                  : "اختر تاريخ"
                                }
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              locale={ar}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expiresAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>تاريخ الانتهاء (اختياري)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={`w-full justify-start text-right font-normal ${!field.value && "text-muted-foreground"}`}
                                data-testid="button-expires-at"
                              >
                                <CalendarIcon className="ml-2 h-4 w-4" />
                                {field.value
                                  ? format(field.value, "PPP", { locale: ar })
                                  : "اختر تاريخ"
                                }
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              locale={ar}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">نشط</FormLabel>
                        <FormDescription>
                          تفعيل أو إيقاف عرض الإعلان
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-is-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    )}
                    {editingAnnouncement ? "تحديث" : "إنشاء"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="text-delete-title">تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription data-testid="text-delete-description">
                هل أنت متأكد من حذف هذا الإعلان؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
