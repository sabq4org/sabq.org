import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { 
  Mail, 
  Edit, 
  Eye, 
  Send,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Save
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmployeeEmailTemplate } from "@shared/schema";

const TEMPLATE_TYPES: Record<string, string> = {
  correspondent_approved: "قبول طلب المراسل",
  correspondent_rejected: "رفض طلب المراسل",
  article_published: "نشر المقال",
  article_rejected: "رفض المقال",
  motivational: "رسالة تحفيزية",
};

const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  correspondent_approved: ["{{name}}", "{{email}}", "{{password}}"],
  correspondent_rejected: ["{{name}}", "{{reason}}"],
  article_published: ["{{name}}", "{{articleTitle}}", "{{articleUrl}}"],
  article_rejected: ["{{name}}", "{{articleTitle}}", "{{reason}}"],
  motivational: ["{{name}}", "{{message}}"],
};

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<EmployeeEmailTemplate | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    subject: "",
    bodyHtml: "",
    bodyText: "",
    isActive: true,
  });
  const [previewContent, setPreviewContent] = useState<{
    subject: string;
    bodyHtml: string;
    bodyText: string;
    sampleData: Record<string, string>;
  } | null>(null);

  const { data: templates, isLoading, refetch } = useQuery<EmployeeEmailTemplate[]>({
    queryKey: ["/api/admin/email-templates/defaults"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ type, data }: { type: string; data: typeof editForm }) => {
      return apiRequest(`/api/admin/email-templates/${type}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم تحديث قالب البريد الإلكتروني بنجاح",
      });
      setShowEditDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: error.message || "حدث خطأ أثناء حفظ القالب",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; bodyHtml: string; bodyText: string }) => {
      return apiRequest("/api/admin/email-templates/preview", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      setPreviewContent(data);
      setShowPreviewDialog(true);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل المعاينة",
        description: error.message || "حدث خطأ أثناء إنشاء المعاينة",
      });
    },
  });

  const testSendMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; bodyHtml: string; bodyText: string }) => {
      return apiRequest("/api/admin/email-templates/test-send", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "تم الإرسال",
        description: `تم إرسال البريد التجريبي إلى ${data.sentTo}`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الإرسال",
        description: error.message || "حدث خطأ أثناء إرسال البريد التجريبي",
      });
    },
  });

  const openEditDialog = (template: EmployeeEmailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      subject: template.subject || "",
      bodyHtml: template.bodyHtml || "",
      bodyText: template.bodyText || "",
      isActive: template.isActive ?? true,
    });
    setShowEditDialog(true);
  };

  const handlePreview = () => {
    if (selectedTemplate) {
      previewMutation.mutate({
        type: selectedTemplate.type,
        subject: editForm.subject,
        bodyHtml: editForm.bodyHtml,
        bodyText: editForm.bodyText,
      });
    }
  };

  const handleTestSend = () => {
    if (selectedTemplate) {
      testSendMutation.mutate({
        type: selectedTemplate.type,
        subject: editForm.subject,
        bodyHtml: editForm.bodyHtml,
        bodyText: editForm.bodyText,
      });
    }
  };

  const handleSave = () => {
    if (selectedTemplate) {
      updateMutation.mutate({
        type: selectedTemplate.type,
        data: editForm,
      });
    }
  };

  const getTemplatesList = (): EmployeeEmailTemplate[] => {
    if (templates && templates.length > 0) {
      return templates.map(t => ({
        ...t,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }
    return Object.entries(TEMPLATE_TYPES).map(([type, nameAr]) => ({
      type,
      nameAr,
      subject: "",
      bodyHtml: "",
      bodyText: "",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  };

  const activeCount = getTemplatesList().filter(t => t.isActive).length;
  const inactiveCount = getTemplatesList().filter(t => !t.isActive).length;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">قوالب البريد الإلكتروني</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">إدارة قوالب رسائل البريد الإلكتروني للموظفين</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 ml-2" />
            تحديث
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي القوالب</p>
                  <p className="text-2xl font-bold" data-testid="text-total-count">{Object.keys(TEMPLATE_TYPES).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">نشطة</p>
                  <p className="text-2xl font-bold" data-testid="text-active-count">{activeCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">معطلة</p>
                  <p className="text-2xl font-bold" data-testid="text-inactive-count">{inactiveCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>قائمة القوالب</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم القالب</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الموضوع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getTemplatesList().map((template) => (
                    <TableRow key={template.type} data-testid={`row-template-${template.type}`}>
                      <TableCell className="font-medium" data-testid={`text-name-${template.type}`}>
                        {TEMPLATE_TYPES[template.type] || template.nameAr || template.type}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded" data-testid={`text-type-${template.type}`}>
                          {template.type}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" data-testid={`text-subject-${template.type}`}>
                        {template.subject || <span className="text-muted-foreground">لم يتم تحديده</span>}
                      </TableCell>
                      <TableCell>
                        {template.isActive ? (
                          <Badge className="bg-green-500" data-testid={`badge-status-${template.type}`}>
                            <CheckCircle className="w-3 h-3 ml-1" />
                            نشط
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-status-${template.type}`}>
                            <XCircle className="w-3 h-3 ml-1" />
                            معطل
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(template)}
                          data-testid={`button-edit-${template.type}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                تحرير قالب: {selectedTemplate ? TEMPLATE_TYPES[selectedTemplate.type] : ""}
              </DialogTitle>
              <DialogDescription>
                المتغيرات المتاحة: {selectedTemplate ? TEMPLATE_PLACEHOLDERS[selectedTemplate.type]?.join("، ") : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">تفعيل القالب</Label>
                <Switch
                  id="isActive"
                  checked={editForm.isActive}
                  onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, isActive: checked }))}
                  data-testid="switch-is-active"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">موضوع الرسالة</Label>
                <Input
                  id="subject"
                  value={editForm.subject}
                  onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="موضوع البريد الإلكتروني"
                  className="text-right"
                  dir="rtl"
                  data-testid="input-subject"
                />
              </div>

              <Tabs defaultValue="html" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="html" data-testid="tab-html">محتوى HTML</TabsTrigger>
                  <TabsTrigger value="text" data-testid="tab-text">نص عادي</TabsTrigger>
                </TabsList>
                <TabsContent value="html" className="space-y-2">
                  <Label htmlFor="bodyHtml">محتوى HTML</Label>
                  <Textarea
                    id="bodyHtml"
                    value={editForm.bodyHtml}
                    onChange={(e) => setEditForm(prev => ({ ...prev, bodyHtml: e.target.value }))}
                    placeholder="<html>...</html>"
                    className="min-h-[300px] font-mono text-sm"
                    dir="ltr"
                    data-testid="textarea-body-html"
                  />
                </TabsContent>
                <TabsContent value="text" className="space-y-2">
                  <Label htmlFor="bodyText">نص عادي</Label>
                  <Textarea
                    id="bodyText"
                    value={editForm.bodyText}
                    onChange={(e) => setEditForm(prev => ({ ...prev, bodyText: e.target.value }))}
                    placeholder="محتوى الرسالة بنص عادي..."
                    className="min-h-[300px]"
                    dir="rtl"
                    data-testid="textarea-body-text"
                  />
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={previewMutation.isPending}
                data-testid="button-preview"
              >
                {previewMutation.isPending ? (
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 ml-2" />
                )}
                معاينة
              </Button>
              <Button
                variant="outline"
                onClick={handleTestSend}
                disabled={testSendMutation.isPending}
                data-testid="button-test-send"
              >
                {testSendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-2" />
                )}
                إرسال تجريبي
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                data-testid="button-save"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 ml-2" />
                )}
                حفظ التغييرات
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                معاينة البريد الإلكتروني
              </DialogTitle>
              <DialogDescription>
                هذه معاينة للقالب مع بيانات تجريبية
              </DialogDescription>
            </DialogHeader>

            {previewContent && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">الموضوع:</p>
                  <p className="font-medium" data-testid="text-preview-subject">{previewContent.subject}</p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">البيانات التجريبية المستخدمة:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(previewContent.sampleData).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {value}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Tabs defaultValue="html" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="html">معاينة HTML</TabsTrigger>
                    <TabsTrigger value="text">نص عادي</TabsTrigger>
                  </TabsList>
                  <TabsContent value="html">
                    <div 
                      className="border rounded-lg p-4 min-h-[200px] bg-white dark:bg-gray-900"
                      dangerouslySetInnerHTML={{ __html: previewContent.bodyHtml }}
                      data-testid="preview-html-content"
                    />
                  </TabsContent>
                  <TabsContent value="text">
                    <pre 
                      className="border rounded-lg p-4 min-h-[200px] whitespace-pre-wrap text-sm"
                      dir="rtl"
                      data-testid="preview-text-content"
                    >
                      {previewContent.bodyText}
                    </pre>
                  </TabsContent>
                </Tabs>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPreviewDialog(false)} data-testid="button-close-preview">
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
