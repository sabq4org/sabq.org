// ملفاتي — قسم الملفات والمستندات المرفوعة لكتّاب الرأي (مثل محاضر الاجتماعات والتعاميم بصيغة PDF).

import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, FolderOpen, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiUrl } from "@/lib/queryClient";

export type WriterSharedFile = {
  id: string;
  title: string;
  description: string | null;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
};

export function formatFileSizeAr(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 بايت";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function formatFileDateAr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar", {
      day: "numeric",
      month: "long",
      year: "numeric",
      numberingSystem: "latn",
    });
  } catch {
    return "";
  }
}

export default function WriterFilesPage() {
  const { data: dataRaw, isLoading, isError } = useQuery<{ files?: WriterSharedFile[] }>({
    queryKey: ["/api/opinion-writer-files"],
    staleTime: 60_000,
  });

  const files = Array.isArray(dataRaw?.files) ? dataRaw.files : [];

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-3xl" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={FolderOpen}
          title="ملفاتي"
          description="المحاضر والمستندات والتعاميم المرفوعة لكتّاب الرأي — يمكنك عرضها أو تحميلها بصيغة PDF"
          titleTestId="text-writer-files-title"
        />

        <div className="space-y-3" dir="rtl">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ تحميل الملفات…
              </CardContent>
            </Card>
          ) : isError ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-destructive">
                تعذر تحميل قائمة الملفات حالياً. حاول تحديث الصفحة بعد قليل.
              </CardContent>
            </Card>
          ) : files.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <FolderOpen className="h-6 w-6" />
                </span>
                <p className="text-sm font-bold text-foreground">لا توجد ملفات مرفوعة حالياً</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  عند رفع محاضر الاجتماعات أو المستندات الخاصة بكتّاب الرأي ستظهر لك هنا مباشرة للتحميل والاطلاع.
                </p>
              </CardContent>
            </Card>
          ) : (
            files.map((file) => (
              <Card key={file.id} data-testid={`writer-file-card-${file.id}`}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <h2 className="text-base font-bold leading-snug text-foreground">
                        {file.title}
                      </h2>
                      {file.description && (
                        <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                          {file.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-foreground/80">
                          PDF
                        </span>
                        <span>{formatFileSizeAr(file.fileSizeBytes)}</span>
                        <span>•</span>
                        <span>{formatFileDateAr(file.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      asChild
                    >
                      <a
                        href={apiUrl(`/api/opinion-writer-files/${file.id}/download`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`button-view-file-${file.id}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        عرض
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 font-bold"
                      asChild
                    >
                      <a
                        href={apiUrl(`/api/opinion-writer-files/${file.id}/download?download=1`)}
                        download
                        data-testid={`button-download-file-${file.id}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                        تحميل PDF
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
