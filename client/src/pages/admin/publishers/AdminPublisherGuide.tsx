import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

interface GuideSection {
  id: string;
  title: string;
  content: string;
  displayOrder: number;
  isPublished: boolean;
  updatedAt: string;
}

const emptyForm = { title: "", content: "", displayOrder: 0, isPublished: true };

/** إدارة أقسام «دليل الناشر» الظاهرة في بوابة الوكالات. */
export default function AdminPublisherGuide() {
  useRoleProtection("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const guideKey = ["/api/admin/publishers/guide"];

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<GuideSection | null>(null);

  const { data, isLoading } = useQuery<{ sections: GuideSection[] }>({ queryKey: guideKey });
  const sections = Array.isArray(data?.sections) ? data!.sections : [];

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, displayOrder: sections.length });
    setEditorOpen(true);
  };

  const openEdit = (section: GuideSection) => {
    setEditingId(section.id);
    setForm({
      title: section.title,
      content: section.content,
      displayOrder: section.displayOrder,
      isPublished: section.isPublished,
    });
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const endpoint = editingId
        ? `/api/admin/publishers/guide/${editingId}`
        : "/api/admin/publishers/guide";
      return apiRequest(endpoint, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(form),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guideKey });
      toast({ title: "تم الحفظ", description: editingId ? "حُدّث القسم" : "أُضيف القسم للدليل" });
      setEditorOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل الحفظ", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/admin/publishers/guide/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guideKey });
      toast({ title: "تم الحذف", description: "حُذف القسم من الدليل" });
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل الحذف", variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async (section: GuideSection) =>
      apiRequest(`/api/admin/publishers/guide/${section.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished: !section.isPublished }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guideKey }),
  });

  const canSave = form.title.trim().length >= 2 && form.content.trim().length >= 10;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 pb-10" dir="rtl">
        <DashboardPageHeader
          icon={BookOpen}
          title="دليل الناشر"
          description="الأقسام الإرشادية التي تظهر لكل الوكالات في بوابة الناشر (سياسات المحتوى، حقوق الصور، آلية الرصيد...)"
          titleTestId="text-page-title"
        />

        <div className="flex justify-end">
          <Button onClick={openCreate} data-testid="button-add-section">
            <Plus className="ml-2 h-4 w-4" />
            قسم جديد
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : sections.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              لا توجد أقسام بعد — أضف أول قسم (مثل «سياسات المحتوى»)
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sections.map((section) => (
              <Card key={section.id} data-testid={`section-card-${section.id}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground font-mono">#{section.displayOrder}</span>
                        <h3 className="font-bold text-lg">{section.title}</h3>
                        {!section.isPublished && <Badge variant="secondary">مسودة (غير ظاهر)</Badge>}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {section.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={section.isPublished}
                        onCheckedChange={() => togglePublishMutation.mutate(section)}
                        title={section.isPublished ? "إخفاء عن الناشرين" : "نشر للناشرين"}
                        data-testid={`switch-publish-${section.id}`}
                      />
                      <Button variant="ghost" size="sm" onClick={() => openEdit(section)} data-testid={`button-edit-${section.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(section)} data-testid={`button-delete-${section.id}`}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* محرر القسم */}
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="sm:max-w-[640px]" data-testid="dialog-guide-editor">
            <DialogHeader>
              <DialogTitle>{editingId ? "تعديل القسم" : "قسم جديد"}</DialogTitle>
              <DialogDescription>يظهر المحتوى للوكالات كما تكتبه هنا (نص عادي بأسطر)</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3 space-y-1">
                  <label className="text-sm font-medium">العنوان *</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="مثال: سياسات المحتوى"
                    dir="rtl"
                    data-testid="input-section-title"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">الترتيب</label>
                  <Input
                    type="number"
                    min="0"
                    value={form.displayOrder}
                    onChange={(e) => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })}
                    data-testid="input-section-order"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">المحتوى *</label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={12}
                  dir="rtl"
                  placeholder={"اكتب الإرشادات هنا...\nكل سطر يظهر كما هو للناشر."}
                  data-testid="textarea-section-content"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="text-sm">
                  <p className="font-medium">منشور</p>
                  <p className="text-muted-foreground">عند الإيقاف يبقى القسم مسودة لا يراها الناشرون</p>
                </div>
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(checked) => setForm({ ...form, isPublished: checked })}
                  data-testid="switch-form-publish"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saveMutation.isPending}>
                  إلغاء
                </Button>
                <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} data-testid="button-save-section">
                  {saveMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  حفظ
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* تأكيد الحذف */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف القسم</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && `سيُحذف «${deleteTarget.title}» نهائياً من دليل الناشر.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
