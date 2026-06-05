import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, ensureCsrfToken } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  Plus,
  Edit,
  Send,
  Loader2,
  Upload,
  X,
  ExternalLink,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Wand2,
  SpellCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

interface MyTopic {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: { blocks?: any[]; rawHtml?: string; plainText?: string } | null;
  heroImageUrl?: string | null;
  status: "draft" | "pending_review" | "published" | "needs_revision" | "archived";
  reviewNotes?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

interface MyAngleData {
  angle: { id: string; nameAr: string; slug: string; shortDesc?: string | null };
  stats: {
    draft: number;
    pending_review: number;
    published: number;
    needs_revision: number;
    archived: number;
    total: number;
  };
}

function statusBadge(status: string) {
  switch (status) {
    case "published":
      return <Badge className="bg-green-600 hover:bg-green-600">منشور</Badge>;
    case "pending_review":
      return <Badge className="bg-blue-500 hover:bg-blue-500 text-white">بانتظار المراجعة</Badge>;
    case "needs_revision":
      return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">يحتاج تعديلاً</Badge>;
    case "archived":
      return <Badge variant="secondary" className="bg-orange-500 text-white">مؤرشف</Badge>;
    case "draft":
    default:
      return <Badge variant="secondary">مسودة</Badge>;
  }
}

function isEditable(status: string) {
  return status === "draft" || status === "needs_revision";
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

export default function MyAngle() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<MyTopic | null>(null);
  const [submitTopic, setSubmitTopic] = useState<MyTopic | null>(null);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [aiLoading, setAiLoading] = useState<"titles" | "proofread" | "excerpt" | null>(null);
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [proofreadPreview, setProofreadPreview] = useState<{ correctedText: string; notes: string } | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: angleData,
    isLoading: isAngleLoading,
    isError: isAngleError,
  } = useQuery<MyAngleData>({
    queryKey: ["/api/muqtarab/my-angle"],
    queryFn: async () => apiRequest("/api/muqtarab/my-angle"),
    retry: false,
  });

  const angle = angleData?.angle;
  const stats = angleData?.stats;

  const { data: topicsRaw, isLoading: isTopicsLoading } = useQuery<{ topics: MyTopic[] }>({
    queryKey: ["/api/muqtarab/my-angle/topics"],
    queryFn: async () => apiRequest("/api/muqtarab/my-angle/topics"),
    enabled: !!angle,
    retry: false,
  });
  const topics = Array.isArray(topicsRaw?.topics) ? topicsRaw!.topics : [];

  const buildPayload = () => {
    const plainText = editorContent.replace(/<[^>]*>/g, "").trim();
    return {
      title: title.trim(),
      excerpt: excerpt.trim() || undefined,
      heroImageUrl: heroImageUrl || undefined,
      content: { blocks: [], rawHtml: editorContent, plainText },
    };
  };

  const buildSnapshot = useCallback(
    () => JSON.stringify({ title, excerpt, heroImageUrl, editorContent }),
    [title, excerpt, heroImageUrl, editorContent],
  );

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/muqtarab/my-angle/topics", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/my-angle/topics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/my-angle"] });
      closeDialog();
      toast({ title: "تم إنشاء الموضوع", description: "حُفظ كمسودة. أرسله للمراجعة عندما يكون جاهزاً." });
    },
    onError: (e) =>
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل في إنشاء الموضوع", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/muqtarab/my-angle/topics/${id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPayload()),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/my-angle/topics"] });
      closeDialog();
      toast({ title: "تم الحفظ", description: "حُفظت التعديلات بنجاح." });
    },
    onError: (e) =>
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل في حفظ التعديلات", variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/muqtarab/my-angle/topics/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/my-angle/topics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/my-angle"] });
      setSubmitTopic(null);
      toast({ title: "تم الإرسال للمراجعة", description: "سيراجع فريق التحرير موضوعك قبل نشره." });
    },
    onError: (e) =>
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل في إرسال الموضوع", variant: "destructive" }),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingTopic(null);
    setTitle("");
    setExcerpt("");
    setHeroImageUrl("");
    setEditorContent("");
    setSuggestedTitles([]);
    setProofreadPreview(null);
    setAiLoading(null);
    setAutoSaveStatus("idle");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
  }

  function openCreate() {
    setEditingTopic(null);
    setTitle("");
    setExcerpt("");
    setHeroImageUrl("");
    setEditorContent("");
    setDialogOpen(true);
  }

  function openEdit(topic: MyTopic) {
    setEditingTopic(topic);
    setTitle(topic.title);
    setExcerpt(topic.excerpt || "");
    setHeroImageUrl(topic.heroImageUrl || "");
    setEditorContent(topic.content?.rawHtml || "");
    lastSavedSnapshotRef.current = JSON.stringify({
      title: topic.title,
      excerpt: topic.excerpt || "",
      heroImageUrl: topic.heroImageUrl || "",
      editorContent: topic.content?.rawHtml || "",
    });
    setAutoSaveStatus("idle");
    setDialogOpen(true);
  }

  // حفظ تلقائي للمسودات المفتوحة للتعديل (كل 3 ثوانٍ بعد آخر تغيير)
  useEffect(() => {
    if (!dialogOpen || !editingTopic || !isEditable(editingTopic.status)) return;

    const snapshot = buildSnapshot();
    if (snapshot === lastSavedSnapshotRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      if (!title.trim()) return;
      setAutoSaveStatus("saving");
      try {
        await apiRequest(`/api/muqtarab/my-angle/topics/${editingTopic.id}`, {
          method: "PATCH",
          body: JSON.stringify(buildPayload()),
        });
        lastSavedSnapshotRef.current = snapshot;
        setAutoSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/my-angle/topics"] });
      } catch {
        setAutoSaveStatus("error");
      }
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [dialogOpen, editingTopic, title, excerpt, heroImageUrl, editorContent, buildSnapshot]);

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "خطأ", description: "صيغة غير مدعومة (JPEG/PNG/GIF/WebP)", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "خطأ", description: "الحد الأقصى 10 ميجابايت", variant: "destructive" });
      return;
    }
    setIsUploadingHero(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      // ضمان توكن CSRF — الرفع أول إجراء للكاتب غالباً، فالتوكن قد لا يكون مجلوباً بعد
      // (/api/media/upload محمي بـ CSRF). بدونه يرجع 403.
      const csrf = await ensureCsrfToken();
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: csrf ? { "X-CSRF-Token": csrf } : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `فشل في رفع الصورة (${res.status})`);
      }
      const result = await res.json();
      setHeroImageUrl(result.proxyUrl || result.url);
      toast({ title: "تم رفع الصورة" });
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في رفع الصورة", variant: "destructive" });
    } finally {
      setIsUploadingHero(false);
      if (heroFileInputRef.current) heroFileInputRef.current.value = "";
    }
  }

  function handleSave() {
    if (!title.trim()) {
      toast({ title: "العنوان مطلوب", variant: "destructive" });
      return;
    }
    if (editingTopic) updateMutation.mutate(editingTopic.id);
    else createMutation.mutate();
  }

  async function runAiAction(action: "titles" | "proofread" | "excerpt") {
    const content = editorContent.trim();
    if (!content && action !== "excerpt") {
      toast({ title: "اكتب المحتوى أولاً", variant: "destructive" });
      return;
    }
    if (action === "excerpt" && !title.trim()) {
      toast({ title: "أدخل العنوان أولاً", variant: "destructive" });
      return;
    }

    setAiLoading(action);
    try {
      if (action === "titles") {
        const res = await apiRequest<{ titles: string[] }>("/api/muqtarab/my-angle/ai/suggest-titles", {
          method: "POST",
          body: JSON.stringify({ content, currentTitle: title.trim() || undefined }),
        });
        setSuggestedTitles(Array.isArray(res.titles) ? res.titles : []);
        toast({ title: "اقتراحات جاهزة", description: "اضغط على عنوان لتطبيقه." });
      } else if (action === "proofread") {
        const res = await apiRequest<{ correctedText: string; notes: string }>("/api/muqtarab/my-angle/ai/proofread", {
          method: "POST",
          body: JSON.stringify({ content, title: title.trim() || undefined }),
        });
        setProofreadPreview(res);
      } else {
        const res = await apiRequest<{ excerpt: string }>("/api/muqtarab/my-angle/ai/suggest-excerpt", {
          method: "POST",
          body: JSON.stringify({ content, title: title.trim() }),
        });
        setExcerpt(res.excerpt || "");
        toast({ title: "تم توليد الوصف المختصر" });
      }
    } catch (e) {
      toast({
        title: "خطأ في المساعد الذكي",
        description: e instanceof Error ? e.message : "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setAiLoading(null);
    }
  }

  function applyProofread() {
    if (!proofreadPreview) return;
    setEditorContent(plainTextToHtml(proofreadPreview.correctedText));
    setProofreadPreview(null);
    toast({ title: "تم تطبيق التصحيحات" });
  }

  // لا توجد زاوية مخصّصة (مثلاً أدمن دخل الرابط مباشرة)
  if (!isAngleLoading && (isAngleError || !angle)) {
    return (
      <DashboardLayout>
        <div className="p-6" dir="rtl">
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <Lightbulb className="w-10 h-10 mx-auto mb-4 opacity-50" />
              لا توجد زاوية مخصّصة لحسابك في مُقترب.
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6" dir="rtl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-indigo-500" />
              زاويتي{angle ? `: ${angle.nameAr}` : ""}
            </h1>
            <p className="text-muted-foreground">
              أضف مواضيعك وأرسلها لمراجعة الإدارة قبل النشر
            </p>
          </div>
          <Button onClick={openCreate} disabled={!angle} data-testid="button-create-topic">
            <Plus className="w-4 h-4 ml-2" />
            موضوع جديد
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{stats?.total ?? 0}</div>
              <div className="text-sm text-muted-foreground">إجمالي المواضيع</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats?.pending_review ?? 0}</div>
              <div className="text-sm text-muted-foreground">بانتظار المراجعة</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{stats?.published ?? 0}</div>
              <div className="text-sm text-muted-foreground">منشور</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-amber-600">{stats?.needs_revision ?? 0}</div>
              <div className="text-sm text-muted-foreground">يحتاج تعديلاً</div>
            </CardContent>
          </Card>
        </div>

        {/* Topics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              المواضيع
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isAngleLoading || isTopicsLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : topics.length === 0 ? (
              <div className="text-center p-12 text-muted-foreground">
                لا توجد مواضيع بعد. ابدأ بإضافة موضوعك الأول.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العنوان</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topics.map((topic) => (
                    <TableRow key={topic.id}>
                      <TableCell>
                        <div className="font-medium">{topic.title}</div>
                        {topic.status === "needs_revision" && topic.reviewNotes && (
                          <div className="mt-1 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span className="whitespace-pre-wrap">{topic.reviewNotes}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(topic.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isEditable(topic.status) && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(topic)}
                                data-testid={`button-edit-${topic.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                className="gap-1"
                                onClick={() => setSubmitTopic(topic)}
                                data-testid={`button-submit-${topic.id}`}
                              >
                                <Send className="w-3.5 h-3.5" />
                                إرسال للمراجعة
                              </Button>
                            </>
                          )}
                          {topic.status === "pending_review" && (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              قيد المراجعة
                            </span>
                          )}
                          {topic.status === "published" && (
                            <Button size="sm" variant="ghost" asChild>
                              <a
                                href={`/muqtarab/${angle?.slug}/topic/${topic.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle>{editingTopic ? "تعديل الموضوع" : "موضوع جديد"}</DialogTitle>
                  <DialogDescription>
                    {editingTopic
                      ? "عدّل موضوعك ثم أرسله للمراجعة"
                      : "اكتب موضوعك. سيُحفظ كمسودة حتى ترسله للمراجعة"}
                  </DialogDescription>
                </div>
                {editingTopic && isEditable(editingTopic.status) && (
                  <span className="text-xs text-muted-foreground shrink-0 pt-1" data-testid="text-autosave-status">
                    {autoSaveStatus === "saving" && "جاري الحفظ…"}
                    {autoSaveStatus === "saved" && "✓ حُفظ تلقائياً"}
                    {autoSaveStatus === "error" && "تعذّر الحفظ التلقائي"}
                  </span>
                )}
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {/* مساعد الكاتب الذكي */}
              <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  مساعد الكاتب الذكي
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!!aiLoading}
                    onClick={() => runAiAction("titles")}
                    data-testid="button-ai-titles"
                  >
                    {aiLoading === "titles" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    اقتراح عناوين
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!!aiLoading}
                    onClick={() => runAiAction("proofread")}
                    data-testid="button-ai-proofread"
                  >
                    {aiLoading === "proofread" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SpellCheck className="h-3.5 w-3.5" />}
                    تدقيق لغوي
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!!aiLoading}
                    onClick={() => runAiAction("excerpt")}
                    data-testid="button-ai-excerpt"
                  >
                    {aiLoading === "excerpt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    وصف مختصر
                  </Button>
                </div>

                {suggestedTitles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestedTitles.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        className="rounded-full border bg-background px-3 py-1 text-sm hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors text-right"
                        onClick={() => setTitle(t)}
                        data-testid={`chip-title-${i}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {proofreadPreview && (
                  <div className="rounded-md border bg-background p-3 space-y-2 text-sm">
                    <p className="text-muted-foreground">{proofreadPreview.notes}</p>
                    <p className="leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {proofreadPreview.correctedText}
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={applyProofread} data-testid="button-apply-proofread">
                        تطبيق التصحيحات
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setProofreadPreview(null)}>
                        تجاهل
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">العنوان *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="عنوان الموضوع"
                  className="mt-1"
                  data-testid="input-title"
                />
              </div>

              <div>
                <label className="text-sm font-medium">وصف مختصر</label>
                <Textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="وصف مختصر يظهر في القوائم"
                  rows={2}
                  className="mt-1"
                  data-testid="input-excerpt"
                />
              </div>

              <div>
                <label className="text-sm font-medium">المحتوى</label>
                <div className="border rounded-md mt-1">
                  <RichTextEditor
                    content={editorContent}
                    onChange={setEditorContent}
                    placeholder="اكتب محتوى موضوعك هنا..."
                    dir="rtl"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">صورة الغلاف</label>
                <input
                  type="file"
                  ref={heroFileInputRef}
                  onChange={handleHeroUpload}
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                />
                {heroImageUrl ? (
                  <div className="relative inline-block mt-2">
                    <img src={heroImageUrl} alt="غلاف" className="max-h-40 rounded-md border object-cover" />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute -top-2 -left-2 h-6 w-6"
                      onClick={() => setHeroImageUrl("")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => heroFileInputRef.current?.click()}
                    className="mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                  >
                    {isUploadingHero ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">جاري الرفع...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-7 w-7 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">اضغط لرفع صورة الغلاف</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button variant="outline" onClick={closeDialog}>
                إلغاء
              </Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-topic"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                {editingTopic ? "حفظ التعديلات" : "حفظ كمسودة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Submit-for-review confirm */}
        <AlertDialog open={!!submitTopic} onOpenChange={(o) => !o && setSubmitTopic(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>إرسال الموضوع للمراجعة</AlertDialogTitle>
              <AlertDialogDescription>
                سيُرسل «{submitTopic?.title}» لمراجعة فريق التحرير. لن تتمكن من تعديله حتى تُبتّ المراجعة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => submitTopic && submitMutation.mutate(submitTopic.id)}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                )}
                إرسال
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
