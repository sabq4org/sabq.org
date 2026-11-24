// ملفاتي — المحاضر والتعاميم والمستندات المرفوعة لكتّاب الرأي (PDF).
// المرحلة 2 من خطة لوحة الكاتب: تصنيف وبحث وصفوف، وشارة «جديد» حتى يفتح الكاتب الملف.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Loader2, Search } from "lucide-react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import { NewBadge } from "@/components/writer/NewBadge";
import { apiUrl, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  WRITER_FILE_KIND_LABEL,
  inferWriterFileKind,
  isWriterFileNew,
  type WriterFileKind,
} from "@shared/opinionWriterFileKinds";

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

const FILES_QUERY = "/api/opinion-writer-files";

const KIND_CHIP: Record<WriterFileKind, string> = {
  minutes: "bg-[#E6F4FD] text-[#0B6FA8]",
  circular: "bg-[#FFF6E5] text-[#946000]",
  document: "bg-[#E8F6EF] text-[#13734E]",
};

type Filter = "all" | WriterFileKind;

export default function WriterFilesPage() {
  const { data: dataRaw, isLoading, isError } = useQuery<{ files?: WriterSharedFile[]; openedFileIds?: string[] }>({
    queryKey: [FILES_QUERY],
    staleTime: 60_000,
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const files = useMemo(() => {
    const list = Array.isArray(dataRaw?.files) ? dataRaw.files : [];
    const opened = new Set(Array.isArray(dataRaw?.openedFileIds) ? dataRaw.openedFileIds : []);
    return list.map((f) => ({ ...f, kind: inferWriterFileKind(f.title), isNew: isWriterFileNew(f.createdAt, opened.has(f.id)) }));
  }, [dataRaw]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: files.length, minutes: 0, circular: 0, document: 0 };
    files.forEach((f) => { c[f.kind] += 1; });
    return c;
  }, [files]);

  const needle = q.trim();
  const shown = files.filter(
    (f) =>
      (filter === "all" || f.kind === filter) &&
      (!needle || f.title.includes(needle) || (f.description ?? "").includes(needle)),
  );

  // فتح الملف يُسجَّل على الخادم؛ نحدّث القائمة بعدها لتختفي شارة «جديد».
  const afterOpen = () => window.setTimeout(() => queryClient.invalidateQueries({ queryKey: [FILES_QUERY] }), 1500);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "الكل" },
    { key: "minutes", label: "محاضر" },
    { key: "circular", label: "تعاميم" },
    { key: "document", label: "مستندات" },
  ];

  return (
    <WriterPageFrame
      title="ملفاتي"
      description="المحاضر والتعاميم والمستندات التي ترفعها إدارة الرأي لك."
      titleTestId="text-writer-files-title"
    >
      {files.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            {filters.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "h-9 rounded-full px-4 text-sm transition",
                  filter === f.key
                    ? "bg-[#1E9BE6] font-semibold text-white"
                    : "bg-card text-foreground shadow-[inset_0_0_0_1px_#DCE4EC] hover:bg-[#F7F9FB]",
                )}
                data-testid={`filter-files-${f.key}`}
              >
                {f.label} {counts[f.key]}
              </button>
            ))}
          </div>
          <label className="flex h-10 items-center gap-2 rounded-full bg-card px-4 shadow-[inset_0_0_0_1px_#DCE4EC] sm:ms-auto sm:w-72">
            <Search className="h-4 w-4 shrink-0 text-[#8A99A8]" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث في الملفات"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              data-testid="input-search-files"
            />
          </label>
        </div>
      )}

      {isLoading ? (
        <WriterSurface className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الملفات…
        </WriterSurface>
      ) : isError ? (
        <WriterSurface className="py-10 text-center text-sm text-destructive">
          تعذر تحميل قائمة الملفات. حدّث الصفحة بعد قليل.
        </WriterSurface>
      ) : files.length === 0 ? (
        <WriterSurface className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <FolderOpen className="h-8 w-8 text-[#8A99A8]" aria-hidden="true" />
          <p className="text-[15px] font-semibold">لا توجد ملفات بعد</p>
          <p className="max-w-sm text-[13px] leading-6 text-[#55667A] dark:text-muted-foreground">
            حين ترفع إدارة الرأي محضرًا أو تعميمًا يظهر هنا، ويصلك إشعار.
          </p>
        </WriterSurface>
      ) : shown.length === 0 ? (
        <WriterSurface className="py-10 text-center text-sm text-[#55667A]">لا ملفات تطابق البحث.</WriterSurface>
      ) : (
        <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
          {shown.map((file) => (
            <div
              key={file.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
              data-testid={`writer-file-card-${file.id}`}
            >
              <span className={cn("w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold", KIND_CHIP[file.kind])}>
                {WRITER_FILE_KIND_LABEL[file.kind]}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-snug">
                  {file.title}
                  {file.isNew && <NewBadge />}
                </p>
                {file.description && (
                  <p className="text-[13px] leading-6 text-[#55667A] dark:text-muted-foreground">{file.description}</p>
                )}
                <p className="text-[13px] text-[#617183] dark:text-muted-foreground">
                  {formatFileDateAr(file.createdAt)} · PDF · {formatFileSizeAr(file.fileSizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-5 text-sm font-medium">
                <a
                  href={apiUrl(`/api/opinion-writer-files/${file.id}/download`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={afterOpen}
                  className="text-[#0B6FA8] hover:text-[#08557F]"
                  data-testid={`button-view-file-${file.id}`}
                >
                  عرض
                </a>
                <a
                  href={apiUrl(`/api/opinion-writer-files/${file.id}/download?download=1`)}
                  download
                  onClick={afterOpen}
                  className="text-[#0B6FA8] hover:text-[#08557F]"
                  data-testid={`button-download-file-${file.id}`}
                >
                  تحميل
                </a>
              </div>
            </div>
          ))}
        </WriterSurface>
      )}
    </WriterPageFrame>
  );
}
