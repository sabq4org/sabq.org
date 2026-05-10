import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Workflow, Plus, Edit, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { IfoxWorkflowRule } from "@shared/schema";

// Form validation schema
const formSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(200),
  description: z.string().optional(),
  ruleType: z.enum(["auto_publish", "auto_review", "auto_reject", "escalate", "notify", "schedule"]),
  triggerEvent: z.string().min(1, "الحدث المُشغّل مطلوب"),
  priority: z.number().min(1).max(10),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export default function WorkflowRulesTab() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<IfoxWorkflowRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch rules
  const { data: rulesRaw, isLoading } = useQuery<IfoxWorkflowRule[]>({
    queryKey: ["/api/ifox/ai-management/workflows"],
  });
  const rules = Array.isArray(rulesRaw) ? rulesRaw : [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("/api/ifox/ai-management/workflows", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/workflows"] });
      setIsCreateOpen(false);
      toast({ title: "تم الإنشاء", description: "تم إنشاء القاعدة بنجاح" });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء القاعدة",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest(`/api/ifox/ai-management/workflows/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/workflows"] });
      setEditingRule(null);
      toast({ title: "تم التحديث", description: "تم تحديث القاعدة بنجاح" });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحديث القاعدة",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/ifox/ai-management/workflows/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/workflows"] });
      setDeleteId(null);
      toast({ title: "تم الحذف", description: "تم حذف القاعدة بنجاح" });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف القاعدة",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي القواعد</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-rules">
              {rules.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">القواعد النشطة</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-rules">
              {rules.filter((r) => r.isActive).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">القواعد المعطلة</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-inactive-rules">
              {rules.filter((r) => !r.isActive).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card with Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>قواعد سير العمل</CardTitle>
              <CardDescription>إدارة قواعد الأتمتة والنشر التلقائي</CardDescription>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-rule">
              <Plus className="w-4 h-4 ml-2" />
              إنشاء قاعدة
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              لا توجد قواعد. قم بإنشاء قاعدة جديدة للبدء.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الحدث المُشغّل</TableHead>
                  <TableHead>نوع القاعدة</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTriggerLabel(rule.triggerEvent)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{getRuleTypeLabel(rule.ruleType)}</Badge>
                    </TableCell>
                    <TableCell>{rule.priority || 5}</TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? "default" : "secondary"}>
                        {rule.isActive ? "نشط" : "معطل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingRule(rule)}
                          data-testid={`button-edit-${rule.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(rule.id)}
                          data-testid={`button-delete-${rule.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <RuleDialog
        open={isCreateOpen || editingRule !== null}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingRule(null);
        }}
        rule={editingRule}
        onSubmit={(data) => {
          if (editingRule) {
            updateMutation.mutate({ id: editingRule.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه القاعدة؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : null}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Helper functions
function getTriggerLabel(trigger: string): string {
  const labels: Record<string, string> = {
    article_created: "مقال جديد",
    task_completed: "مهمة مكتملة",
    quality_check_passed: "اجتاز فحص الجودة",
    scheduled_time: "موعد محدد",
    manual_trigger: "تشغيل يدوي",
  };
  return labels[trigger] || trigger;
}

function getRuleTypeLabel(ruleType: string): string {
  const labels: Record<string, string> = {
    auto_publish: "نشر تلقائي",
    auto_review: "مراجعة تلقائية",
    auto_reject: "رفض تلقائي",
    escalate: "تصعيد",
    notify: "إشعار",
    schedule: "جدولة",
  };
  return labels[ruleType] || ruleType;
}

// RuleDialog component with full form
interface RuleDialogProps {
  open: boolean;
  onClose: () => void;
  rule: IfoxWorkflowRule | null;
  onSubmit: (data: any) => void;
  isPending: boolean;
}

function RuleDialog({ open, onClose, rule, onSubmit, isPending }: RuleDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      ruleType: "auto_publish",
      triggerEvent: "article_created",
      priority: 5,
      isActive: true,
    },
  });

  // Reset form when rule changes
  useEffect(() => {
    if (rule) {
      form.reset({
        name: rule.name,
        description: rule.description || "",
        ruleType: rule.ruleType as any,
        triggerEvent: rule.triggerEvent,
        priority: rule.priority || 5,
        isActive: rule.isActive,
      });
    } else {
      form.reset({
        name: "",
        description: "",
        ruleType: "auto_publish",
        triggerEvent: "article_created",
        priority: 5,
        isActive: true,
      });
    }
  }, [rule, form]);

  const handleSubmit = (data: FormValues) => {
    // Prepare data with required fields for backend
    const submitData = {
      ...data,
      conditions: {}, // Required JSONB field
      actions: [], // Required JSONB field
    };
    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "تعديل القاعدة" : "إنشاء قاعدة جديدة"}</DialogTitle>
          <DialogDescription>قم بتعريف قاعدة لأتمتة سير العمل</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم القاعدة</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-rule-name" placeholder="أدخل اسم القاعدة" />
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
                      data-testid="input-rule-description"
                      placeholder="أدخل وصف القاعدة"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ruleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع القاعدة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-rule-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="auto_publish">نشر تلقائي</SelectItem>
                        <SelectItem value="auto_review">مراجعة تلقائية</SelectItem>
                        <SelectItem value="auto_reject">رفض تلقائي</SelectItem>
                        <SelectItem value="escalate">تصعيد</SelectItem>
                        <SelectItem value="notify">إشعار</SelectItem>
                        <SelectItem value="schedule">جدولة</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="triggerEvent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الحدث المُشغّل</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-trigger-event">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="article_created">مقال جديد</SelectItem>
                        <SelectItem value="task_completed">مهمة مكتملة</SelectItem>
                        <SelectItem value="quality_check_passed">اجتاز فحص الجودة</SelectItem>
                        <SelectItem value="scheduled_time">موعد محدد</SelectItem>
                        <SelectItem value="manual_trigger">تشغيل يدوي</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الأولوية (1-10): {field.value}</FormLabel>
                  <FormControl>
                    <Slider
                      min={1}
                      max={10}
                      step={1}
                      value={[field.value]}
                      onValueChange={(vals) => field.onChange(vals[0])}
                      data-testid="slider-priority"
                    />
                  </FormControl>
                  <FormDescription>الأولوية الأعلى تنفذ أولاً</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">تفعيل القاعدة</FormLabel>
                    <FormDescription>عند التفعيل، ستعمل هذه القاعدة تلقائياً</FormDescription>
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
                onClick={onClose}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-rule">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                {rule ? "تحديث" : "إنشاء"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
