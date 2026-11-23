// ملفات كتّاب الرأي — صفحة الإدارة لرفع ملفات PDF (محاضر اجتماعات، تعاميم، أدلة)
// لتظهر تلقائياً لجميع كتّاب الرأي في قسم «ملفاتي» للعرض والتحميل.

import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import {
  formatFileDateAr,
  formatFileSizeAr,
  type WriterSharedFile,
} from "@/pages/opinion-author/WriterFilesPage";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export default function OpinionWriterFilesAdminPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [fileToDelete, setFileToDelete] = useState<WriterSharedFile | null>(null);

  const { data: dataRaw, isLoading } = useQuery<{ files?: WriterSharedFile[] }>({
    queryKey: ["/api/opinion-writer-files"],
    staleTime: 30_000,
  });
  const files = Array.isArray(dataRaw?.files) ? dataRaw.files : [];

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("يرجى اختيار ملف PDF");
      const formData = new FormData();
      formData.append("title", title.trim());
      if (description.trim()) {
        formData.append("description", description.trim());
      }
      formData.append("file", selectedFile);
      setUploadProgress(0);
      return apiRequest<{ file: WriterSharedFile }>("/api/admin/opinion-writer-files", {
        method: "POST",
        body: formData,
        isFormData: true,
        timeoutMs: 60_000,
        onUploadProgress: ({ loaded, total }) => {
          if (total > 0) setUploadProgress(Math.round((loaded / total) * 100));
        },
      });
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setSelectedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-writer-files"] });
      toast({
        title: "تم رفع الملف بنجاح",
        description: "أصبح الملف ظاهراً الآن لجميع كتّاب الرأي في قسم «ملفاتي».",
      });
    },
    onError: (error: Error) => {
      setUploadProgress(0);
      toast({
        title: "تعذر رفع الملف",
        description: error.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/opinion-writer-files/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setFileToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-writer-files"] });
      toast({ title: "تم حذف الملف" });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر حذف الملف",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast({
        title: "صيغة غير مدعومة",
        description: "يرجى اختيار ملف بصيغة PDF فقط.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast({
        title: "حجم الملف كبير",
        description: "الحد الأقصى لحجم الملف هو 25 ميجابايت.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.pdf$/i, "").trim());
    }
  };

  const canSubmit = title.trim().length >= 2 && Boolean(selectedFile) && !uploadMutation.isPending;

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-4xl" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={FolderOpen}
          title="ملفات كتّاب الرأي"
          description="ارفع ملفات PDF (محاضر الاجتماعات، التعاميم، أدلة العمل) لتظهر تلقائياً لجميع كتّاب الرأي في قسم «ملفاتي»"
          titleTestId="text-admin-writer-files-title"
        />

        <div className="space-y-6" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4 text-primary" />
                رفع ملف PDF جديد
              </CardTitle>
              <CardDescription>
                أضف عنواناً واضحاً واختر ملف PDF (حتى 25 ميجابايت) — سيصل لكتّاب الرأي مباشرة للعرض والتحميل.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canSubmit) uploadMutation.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="writer-file-title">عنوان الملف</Label>
                  <Input
                    id="writer-file-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: محضر لقاء كتّاب الرأي الافتراضي — 23 نوفمبر 2026"
                    maxLength={200}
                    required
                    data-testid="input-writer-file-title"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="writer-file-description">ملاحظة مختصرة (اختياري)</Label>
                  <Textarea
                    id="writer-file-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="نبذة سريعة عمّا يحتويه الملف…"
                    rows={2}
                    maxLength={600}
                    data-testid="input-writer-file-description"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="writer-file-input">ملف PDF</Label>
                  <input
                    ref={fileInputRef}
                    id="writer-file-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                    data-testid="input-writer-file-pdf"
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileText className="h-5 w-5 shrink-0 text-red-600" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSizeAr(selectedFile.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        aria-label="إزالة الملف المختار"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
                      data-testid="button-pick-writer-pdf"
                    >
                      <Upload className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-foreground">
                        اضغط لاختيار ملف PDF من جهازك
                      </span>
                      <span className="text-xs text-muted-foreground">
                        صيغة PDF فقط · بحد أقصى 25 ميجابايت
                      </span>
                    </button>
                  )}
                </div>

                {uploadMutation.isPending && uploadProgress > 0 && (
                  <div className="space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">جارٍ الرفع… {uploadProgress}%</p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="gap-2 font-bold"
                    data-testid="button-upload-writer-file"
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جارٍ الرفع…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        رفع الملف لكتّاب الرأي
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">
                الملفات المرفوعة ({files.length})
              </h2>
            </div>

            {isLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ تحميل الملفات…
                </CardContent>
              </Card>
            ) : files.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  لم يُرفع أي ملف بعد. ارفع أول ملف PDF من النموذج أعلاه ليظهر لكتّاب الرأي.
                </CardContent>
              </Card>
            ) : (
              files.map((file) => (
                <Card key={file.id} data-testid={`admin-writer-file-card-${file.id}`}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold text-foreground sm:text-base">
                          {file.title}
                        </p>
                        {file.description && (
                          <p className="text-xs leading-5 text-muted-foreground">
                            {file.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatFileSizeAr(file.fileSizeBytes)}</span>
                          <span>•</span>
                          <span>{formatFileDateAr(file.createdAt)}</span>
                          <span>•</span>
                          <span>بواسطة {file.uploaderName}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <a
                          href={apiUrl(`/api/opinion-writer-files/${file.id}/download`)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          عرض
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <a
                          href={apiUrl(`/api/opinion-writer-files/${file.id}/download?download=1`)}
                          download
                        >
                          <Download className="h-3.5 w-3.5" />
                          تحميل
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setFileToDelete(file)}
                        data-testid={`button-delete-writer-file-${file.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </div>

        <AlertDialog open={Boolean(fileToDelete)} onOpenChange={(open) => !open && setFileToDelete(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الملف؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيختفي الملف «{fileToDelete?.title}» من قسم «ملفاتي» لدى جميع كتّاب الرأي.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={() => fileToDelete && deleteMutation.mutate(fileToDelete.id)}
              >
                {deleteMutation.isPending ? "جارٍ الحذف…" : "تأكيد الحذف"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
