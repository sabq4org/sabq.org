import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, Plus, Edit, Trash2, Loader2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { IfoxContentTemplate } from "@shared/schema";

export default function ContentTemplatesTab() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<IfoxContentTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: templatesRaw, isLoading } = useQuery<IfoxContentTemplate[]>({
    queryKey: ["/api/ifox/ai-management/templates"],
  });
  const templates = Array.isArray(templatesRaw) ? templatesRaw : [];

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/ifox/ai-management/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/templates"] });
      setIsCreateOpen(false);
      toast({ title: "تم الإنشاء", description: "تم إنشاء القالب بنجاح" });
    },
    onError: () => {
      toast({ 
        title: "خطأ", 
        description: "فشل إنشاء القالب",
        variant: "destructive"
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest(`/api/ifox/ai-management/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/templates"] });
      setEditingTemplate(null);
      toast({ title: "تم التحديث", description: "تم تحديث القالب بنجاح" });
    },
    onError: () => {
      toast({ 
        title: "خطأ", 
        description: "فشل تحديث القالب",
        variant: "destructive"
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/ifox/ai-management/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/templates"] });
      setDeleteId(null);
      toast({ title: "تم الحذف", description: "تم حذف القالب بنجاح" });
    },
    onError: () => {
      toast({ 
        title: "خطأ", 
        description: "فشل حذف القالب",
        variant: "destructive"
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي القوالب</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-templates">
              {templates.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">القوالب النشطة</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-templates">
              {templates.filter(t => t.isActive).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الاستخدامات</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-usage">
              {templates.reduce((sum, t) => sum + (t.usageCount || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>قوالب المحتوى</CardTitle>
              <CardDescription>إدارة قوالب توليد المحتوى</CardDescription>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-template">
              <Plus className="w-4 h-4 ml-2" />
              إنشاء قالب
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              لا توجد قوالب. قم بإنشاء قالب جديد للبدء.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الوصف</TableHead>
                  <TableHead>نوع المقال</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الاستخدامات</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell className="max-w-xs truncate">{template.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTemplateTypeLabel(template.templateType)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? "default" : "secondary"}>
                        {template.isActive ? "نشط" : "غير نشط"}
                      </Badge>
                    </TableCell>
                    <TableCell>{template.usageCount || 0}</TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingTemplate(template)}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(template.id)}
                          data-testid={`button-delete-${template.id}`}
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

      <TemplateDialog
        open={isCreateOpen || editingTemplate !== null}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingTemplate(null);
        }}
        template={editingTemplate}
        onSubmit={(data) => {
          if (editingTemplate) {
            updateMutation.mutate({ id: editingTemplate.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا القالب؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getTemplateTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    breaking_news: "خبر عاجل",
    analysis: "تحليل",
    interview: "مقابلة",
    opinion: "رأي",
    review: "مراجعة",
    tutorial: "شرح تعليمي",
    feature: "تقرير",
    listicle: "قائمة",
  };
  return labels[type] || type;
}

interface TemplateDialogProps {
  open: boolean;
  onClose: () => void;
  template: IfoxContentTemplate | null;
  onSubmit: (data: any) => void;
  isPending: boolean;
}

function TemplateDialog({ open, onClose, template, onSubmit, isPending }: TemplateDialogProps) {
  const formSchema = z.object({
    name: z.string().min(1, "الاسم مطلوب").max(200, "الاسم طويل جداً"),
    description: z.string().optional(),
    templateType: z.enum([
      "breaking_news",
      "analysis",
      "interview",
      "opinion",
      "review",
      "tutorial",
      "feature",
      "listicle"
    ]),
    promptTemplate: z.string().min(1, "القالب النصي مطلوب"),
    language: z.enum(["ar", "en", "ur"]).default("ar"),
    isActive: z.boolean(),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      templateType: template?.templateType || "breaking_news",
      promptTemplate: template?.promptTemplate || "",
      language: template?.language || "ar",
      isActive: template?.isActive ?? true,
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "تعديل القالب" : "إنشاء قالب جديد"}</DialogTitle>
          <DialogDescription>
            قم بتعريف قالب لتوليد المحتوى بشكل منظم
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم القالب</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-template-name" placeholder="مثال: قالب الأخبار العاجلة" />
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
                      data-testid="input-template-description" 
                      placeholder="وصف مختصر للقالب وأهدافه"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="templateType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نوع المقال</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-article-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="breaking_news">خبر عاجل</SelectItem>
                      <SelectItem value="analysis">تحليل</SelectItem>
                      <SelectItem value="interview">مقابلة</SelectItem>
                      <SelectItem value="opinion">رأي</SelectItem>
                      <SelectItem value="review">مراجعة</SelectItem>
                      <SelectItem value="tutorial">شرح تعليمي</SelectItem>
                      <SelectItem value="feature">تقرير</SelectItem>
                      <SelectItem value="listicle">قائمة</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اللغة</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-language">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ur">اردو</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="promptTemplate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>قالب الأمر (Prompt Template)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      data-testid="input-prompt-template"
                      placeholder="اكتب مقالاً عن {{topic}} باستخدام {{keywords}}..."
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">تفعيل القالب</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      القوالب المفعلة فقط متاحة للاستخدام
                    </div>
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
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                إلغاء
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-template">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                {template ? "تحديث" : "إنشاء"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
