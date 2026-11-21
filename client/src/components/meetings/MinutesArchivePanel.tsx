// أرشيف المحاضر في مركز الاجتماعات — دائم وبالبحث، بدل قائمة «انتهت خلال الأسبوع»
// التي كان المحضر يختفي بعدها. كل صف يفتح صفحة المحضر المستقلة.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Download, Loader2, Trash2 } from "lucide-react";
import {
  DECISIONS_FORMS,
  MINUTES_FORMS,
  TASKS_FORMS,
  arCount,
  minutesStatusLabel,
} from "./minutesShared";

export type ArchiveItem = {
  id: string;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  minutesStatus: string;
  isHost: boolean;
  decisions: number;
  tasks: number;
  openTasks: number;
  canDownloadPdf?: boolean;
};

type ArchivePage = { items: ArchiveItem[]; nextBefore: string | null };

const DAY_FMT = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", {
  weekday: "long", day: "numeric", month: "long",
});

const TONE_CLASS: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  bad: "bg-muted text-muted-foreground",
  muted: "bg-muted text-muted-foreground",
};

function summaryLine(m: ArchiveItem): string {
  const duration = m.durationMinutes ? arCount(m.durationMinutes, MINUTES_FORMS) : null;
  if (m.minutesStatus === "failed") {
    return ["لا محضر لهذا الاجتماع", duration].filter(Boolean).join(" · ");
  }
  if (m.minutesStatus !== "draft" && m.minutesStatus !== "approved") {
    return ["المحضر قيد الإعداد", duration].filter(Boolean).join(" · ");
  }
  return [arCount(m.decisions, DECISIONS_FORMS), arCount(m.tasks, TASKS_FORMS), duration]
    .filter(Boolean)
    .join(" · ");
}

export function MinutesArchivePanel({
  onDelete,
}: {
  /** حذف اجتماع من الأرشيف — يظهر زره لمضيف الاجتماع فقط */
  onDelete?: (m: ArchiveItem) => void;
}) {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  // تأخير قصير حتى لا يُرسل طلب مع كل حرف
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["/api/meetings-archive", q],
      initialPageParam: "",
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (pageParam) params.set("before", String(pageParam));
        const qs = params.toString();
        return apiRequest<ArchivePage>(`/api/meetings-archive${qs ? `?${qs}` : ""}`);
      },
      getNextPageParam: (last) => last?.nextBefore || undefined,
      staleTime: 30_000,
      // مثل قائمة المركز: اجتماع ينتهي والصفحة مفتوحة يظهر محضره هنا بلا إعادة تحميل
      refetchInterval: 30_000,
    });

  const pages = Array.isArray(data?.pages) ? data.pages : [];
  const items = pages.flatMap((p) => (Array.isArray(p?.items) ? p.items : []));

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" data-testid="panel-minutes-archive">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold">أرشيف المحاضر</h2>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ابحث في العناوين والقرارات والمهام"
          aria-label="بحث في أرشيف المحاضر"
          className="h-9 w-full sm:w-64"
          data-testid="input-archive-search"
        />
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الأرشيف…
        </div>
      ) : isError ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          تعذر تحميل الأرشيف. حدّث الصفحة وحاول ثانية.
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="text-archive-empty">
          {q
            ? `لا محضر يطابق «${q}».`
            : "لا محاضر بعد. يظهر هنا محضر كل اجتماع ينتهي ومُدوِّن سبق AI مفعّل فيه."}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((m) => {
            const chip = minutesStatusLabel(m.minutesStatus, m.isHost);
            const ended = m.endedAt ? new Date(m.endedAt) : null;
            return (
              <li
                key={m.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto_auto_auto]"
                data-testid={`row-archive-${m.id}`}
              >
                <span className="col-span-2 text-xs tabular-nums text-muted-foreground sm:col-span-1">
                  {ended && !Number.isNaN(ended.getTime()) ? DAY_FMT.format(ended) : "—"}
                </span>
                <button
                  type="button"
                  className="no-min-touch-size min-w-0 py-1 text-right hover:text-primary"
                  onClick={() => setLocation(`/dashboard/meetings/${m.id}/minutes`)}
                  data-testid={`link-archive-${m.id}`}
                >
                  <span className="block text-sm font-medium leading-6">{m.title}</span>
                  <span className="block text-xs text-muted-foreground">{summaryLine(m)}</span>
                </button>
                <span
                  className={cn(
                    "col-start-1 row-start-3 w-fit rounded-md px-2 py-0.5 text-xs font-bold sm:col-start-auto sm:row-start-auto",
                    TONE_CLASS[chip.tone],
                  )}
                >
                  {chip.label}
                </span>
                {m.canDownloadPdf && m.minutesStatus === "approved" ? (
                  <Button
                    asChild
                    size="icon"
                    variant="ghost"
                    className="col-start-2 row-start-3 h-8 w-8 text-muted-foreground hover:text-primary sm:col-start-auto sm:row-start-auto"
                  >
                    <a
                      href={apiUrl(`/api/meetings/${m.id}/minutes/pdf`)}
                      download
                      aria-label={`تحميل محضر ${m.title} PDF`}
                      data-testid={`link-archive-pdf-${m.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                {onDelete && m.isHost ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="col-start-2 row-start-2 h-8 w-8 text-muted-foreground hover:text-destructive sm:col-start-auto sm:row-start-auto"
                    onClick={() => onDelete(m)}
                    aria-label={`حذف اجتماع ${m.title}`}
                    data-testid={`button-archive-delete-${m.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hasNextPage ? (
        <div className="border-t border-border px-4 py-3 text-center">
          <Button
            size="sm"
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            data-testid="button-archive-more"
          >
            {isFetchingNextPage ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : null}
            محاضر أقدم
          </Button>
        </div>
      ) : null}
    </section>
  );
}
