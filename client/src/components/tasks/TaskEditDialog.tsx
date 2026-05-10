import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@shared/schema";
import { z } from "zod";
import { cn } from "@/lib/utils";

const editTaskSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'completed', 'archived']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  dueDate: z.date().optional(),
  assignedToId: z.string().optional(),
  department: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
});

type EditTaskForm = z.infer<typeof editTaskSchema>;

interface TaskEditDialogProps {
  taskId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export function TaskEditDialog({ taskId, onClose, onSuccess }: TaskEditDialogProps) {
  const { toast } = useToast();

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ['/api/tasks', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch task');
      return await res.json();
    },
  });

  const { data: usersRaw } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return await res.json();
    },
  });
  const users = Array.isArray(usersRaw) ? usersRaw : [];

  const form = useForm<EditTaskForm>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: undefined,
      assignedToId: undefined,
      department: "",
      category: "",
      tags: "",
    },
  });

  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title,
        description: task.description || "",
        status: task.status as any,
        priority: task.priority as any,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        assignedToId: task.assignedToId || undefined,
        department: task.department || "",
        category: task.category || "",
        tags: task.tags && task.tags.length > 0 ? task.tags.join(', ') : "",
      });
    }
  }, [task, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditTaskForm) => {
      const submitData = {
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        status: data.status,
        priority: data.priority,
        dueDate: data.dueDate?.toISOString(),
        assignedToId: data.assignedToId || undefined,
        department: data.department || undefined,
        category: data.category || undefined,
        tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
        completedAt: data.status === 'completed' && task?.status !== 'completed' 
          ? new Date().toISOString() 
          : task?.completedAt,
      };

      return await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(submitData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/statistics'] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث المهمة بنجاح",
      });
      onSuccess();
      onClose();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحديث المهمة",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: EditTaskForm) => {
    await updateMutation.mutateAsync(data);
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return 'غير معروف';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl" data-testid="dialog-task-edit">
        <DialogHeader>
          <DialogTitle data-testid="heading-dialog-title">تعديل المهمة</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8" data-testid="text-loading">جاري التحميل...</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>العنوان</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="عنوان المهمة"
                        disabled={updateMutation.isPending}
                        data-testid="input-task-title"
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
                        {...field}
                        value={field.value || ""}
                        placeholder="وصف المهمة (اختياري)"
                        disabled={updateMutation.isPending}
                        rows={3}
                        className="resize-none"
                        data-testid="textarea-task-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحالة</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={updateMutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-task-status">
                            <SelectValue placeholder="اختر الحالة" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="todo">قيد الانتظار</SelectItem>
                          <SelectItem value="in_progress">قيد العمل</SelectItem>
                          <SelectItem value="review">مراجعة</SelectItem>
                          <SelectItem value="completed">مكتملة</SelectItem>
                          <SelectItem value="archived">مؤرشفة</SelectItem>
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={updateMutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-task-priority">
                            <SelectValue placeholder="اختر الأولوية" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">منخفضة</SelectItem>
                          <SelectItem value="medium">متوسطة</SelectItem>
                          <SelectItem value="high">عالية</SelectItem>
                          <SelectItem value="critical">عاجلة</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>تاريخ الاستحقاق</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-right font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={updateMutation.isPending}
                            data-testid="button-task-due-date"
                          >
                            <CalendarIcon className="ml-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP", { locale: ar })
                            ) : (
                              <span>اختر التاريخ</span>
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return date < today;
                          }}
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
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المسؤول</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "unassigned" ? undefined : value)}
                      value={field.value || "unassigned"}
                      disabled={updateMutation.isPending}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-task-assignee">
                          <SelectValue placeholder="اختر المسؤول" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">غير مسند</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {getUserName(user.id)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>القسم</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          placeholder="القسم (اختياري)"
                          disabled={updateMutation.isPending}
                          data-testid="input-task-department"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الفئة</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          placeholder="الفئة (اختياري)"
                          disabled={updateMutation.isPending}
                          data-testid="input-task-category"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الوسوم</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="الوسوم مفصولة بفاصلة (اختياري)"
                        disabled={updateMutation.isPending}
                        data-testid="input-task-tags"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={updateMutation.isPending}
                  data-testid="button-cancel"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-save"
                >
                  {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
