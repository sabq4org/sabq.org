import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

interface GuideSection {
  id: string;
  title: string;
  content: string;
  displayOrder: number;
  isPublished: boolean;
  updatedAt: string;
}

const emptyForm = { title: "", content: "", displayOrder: 0, isPublished: true };

function formatUpdatedAt(value: string) {
  try {
    return new Date(value).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

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
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

  const { data, isLoading } = useQuery<{ sections: GuideSection[] }>({ queryKey: guideKey });
  const sections = Array.isArray(data?.sections) ? data!.sections : [];

  const stats = useMemo(() => {
    const published = sections.filter((s) => s.isPublished).length;
    return {
      total: sections.length,
      published,
      draft: sections.length - published,
    };
  }, [sections]);

  const filtered = useMemo(() => {
    if (filter === "published") return sections.filter((s) => s.isPublished);
    if (filter === "draft") return sections.filter((s) => !s.isPublished);
    return sections;
  }, [sections, filter]);

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

  const seedMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/publishers/guide/seed-defaults", { method: "POST" }),
    onSuccess: (result: { inserted?: number; skipped?: number }) => {
      queryClient.invalidateQueries({ queryKey: guideKey });
      const inserted = result?.inserted ?? 0;
      const skipped = result?.skipped ?? 0;
      toast({
        title: inserted > 0 ? "تم تحميل المحتوى الاحترافي" : "لا حاجة للإضافة",
        description:
          inserted > 0
            ? `أُضيف ${inserted} قسماً${skipped > 0 ? ` (تُخطّي ${skipped} موجوداً)` : ""}`
            : "كل الأقسام الافتراضية موجودة مسبقاً",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل تحميل المحتوى الافتراضي",
        variant: "destructive",
      });
    },
  });

  const canSave = form.title.trim().length >= 2 && form.content.trim().length >= 10;

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1400px]"
        contentClassName="px-4 pb-16 sm:px-6"
      >
        <DashboardPageHeader
          icon={BookOpen}
          title="دليل الناشر"
          description="مرجع السياسات الذي تراه كل الوكالات في بوابتها — حرّره مرة ويظهر للجميع"
          titleTestId="text-page-title"
          actions={
            <>
              <Button
                variant="outline"
                className="h-10 gap-2 px-4"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                data-testid="button-seed-guide"
              >
                {seedMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                تحميل المحتوى الاحترافي
              </Button>
              <Button
                className="h-10 gap-2 px-4"
                onClick={openCreate}
                data-testid="button-add-section"
              >
                <Plus className="h-4 w-4" />
                قسم جديد
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "الأقسام", value: stats.total },
            { label: "منشور للوكالات", value: stats.published },
            { label: "مسودات", value: stats.draft },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                {isLoading ? "—" : item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/30 p-1">
            {(
              [
                { id: "all", label: "الكل", count: stats.total },
                { id: "published", label: "منشور", count: stats.published },
                { id: "draft", label: "مسودة", count: stats.draft },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
                  filter === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            يظهر للوكالة فقط ما كان «منشوراً»
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">الدليل فارغ</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              حمّل الحزمة الاحترافية الجاهزة (سياسات، صور، رصيد، دورة النشر…) أو أضف قسماً يدوياً.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Button
                className="h-10 gap-2 px-4"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                تحميل المحتوى الاحترافي
              </Button>
              <Button variant="outline" className="h-10 gap-2 px-4" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                قسم يدوي
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            لا أقسام في هذا التبويب
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((section) => (
              <article
                key={section.id}
                data-testid={`section-card-${section.id}`}
                className="flex flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/30"
              >
                <div className="flex flex-1 flex-col gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          #{section.displayOrder}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            section.isPublished
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {section.isPublished ? (
                            <>
                              <Eye className="h-3 w-3" />
                              منشور
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" />
                              مسودة
                            </>
                          )}
                        </span>
                      </div>
                      <h3 className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug">
                        {section.title}
                      </h3>
                    </div>
                    <Switch
                      checked={section.isPublished}
                      onCheckedChange={() => togglePublishMutation.mutate(section)}
                      title={section.isPublished ? "إخفاء عن الناشرين" : "نشر للناشرين"}
                      data-testid={`switch-publish-${section.id}`}
                    />
                  </div>
                  <p className="line-clamp-4 text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                    {section.content}
                  </p>
                  <p className="mt-auto text-[10px] tabular-nums text-muted-foreground">
                    آخر تحديث: {formatUpdatedAt(section.updatedAt)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-px border-t bg-border/60">
                  <button
                    type="button"
                    onClick={() => openEdit(section)}
                    className="flex items-center justify-center gap-1.5 bg-card px-3 py-2.5 text-xs font-medium hover:bg-muted/60"
                    data-testid={`button-edit-${section.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    تحرير
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(section)}
                    className="flex items-center justify-center gap-1.5 bg-card px-3 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/5"
                    data-testid={`button-delete-${section.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="sm:max-w-[680px]" data-testid="dialog-guide-editor">
            <DialogHeader>
              <DialogTitle>{editingId ? "تعديل القسم" : "قسم جديد"}</DialogTitle>
              <DialogDescription>
                يظهر المحتوى للوكالات كنص عادي بأسطره — بدون تنسيق HTML
              </DialogDescription>
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
                    onChange={(e) =>
                      setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })
                    }
                    data-testid="input-section-order"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">المحتوى *</label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={14}
                  dir="rtl"
                  placeholder={"اكتب الإرشادات هنا...\nكل سطر يظهر كما هو للناشر."}
                  data-testid="textarea-section-content"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div className="text-sm">
                  <p className="font-medium">منشور للوكالات</p>
                  <p className="text-muted-foreground">عند الإيقاف يبقى القسم مسودة مخفية</p>
                </div>
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(checked) => setForm({ ...form, isPublished: checked })}
                  data-testid="switch-form-publish"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditorOpen(false)}
                  disabled={saveMutation.isPending}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!canSave || saveMutation.isPending}
                  data-testid="button-save-section"
                >
                  {saveMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  حفظ
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
      </DashboardPageShell>
    </DashboardLayout>
  );
}
