// نافذة «تحرير وتوليد شامل» الحية: تعرض النص المعاد صياغته أثناء وصوله من
// الخادم (SSE) مع حالة الفروع الثلاثة وعدّاد الزمن — بدل شاشة جامدة 20–35ث.
// لا تطبّق شيئًا بنفسها؛ التطبيق يبقى في onSuccess للـmutation كما كان.
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditStreamPhase, EditStreamPhaseStatus } from "@/hooks/useArticleAiTools";

interface EditAndGenerateStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: string;
  phases: Record<EditStreamPhase, EditStreamPhaseStatus>;
  startedAt: number;
}

const PHASE_LABELS: Record<EditStreamPhase, string> = {
  edit: "إعادة الصياغة بأسلوب سبق",
  smart: "العنوان الفرعي والموجز والكلمات وSEO",
  newsletter: "عنوان البريد الذكي",
};

const PHASE_ORDER: EditStreamPhase[] = ["edit", "smart", "newsletter"];

const STATUS_LABELS: Record<EditStreamPhaseStatus, string> = {
  running: "جارٍ",
  done: "اكتمل",
  failed: "فشل",
};

/** نص المعاينة يصل HTML (<p>…</p>) — نعرضه نصًا صرفًا بفقرات دون حقن HTML. */
function htmlToPlainParagraphs(html: string): string[] {
  return html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function EditAndGenerateStreamDialog({ open, onOpenChange, preview, phases, startedAt }: EditAndGenerateStreamDialogProps) {
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !startedAt) return;
    setElapsed(Math.round((Date.now() - startedAt) / 1000));
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [open, startedAt]);

  const paragraphs = useMemo(() => htmlToPlainParagraphs(preview), [preview]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [paragraphs.length]);

  const doneCount = PHASE_ORDER.filter((phase) => phases[phase] === "done").length;
  const failedCount = PHASE_ORDER.filter((phase) => phases[phase] === "failed").length;
  const settledCount = doneCount + failedCount;
  const progress = Math.round((settledCount / PHASE_ORDER.length) * 100);
  const editing = phases.edit === "running";
  const hasFailure = failedCount > 0;
  const allDone = settledCount === PHASE_ORDER.length && !hasFailure;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0" data-testid="dialog-edit-and-generate-stream">
        {/* رأس متدرّج + عدّاد الزمن — مساحة `ps-10` تحجز موضع إكس الإغلاق كي لا يتداخل مع النص */}
        <DialogHeader className="space-y-2 border-b bg-gradient-to-b from-primary/[0.07] to-transparent pb-4 pe-6 ps-10 pt-6 text-start">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                allDone
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                  : hasFailure
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
              )}
            >
              {allDone ? (
                <Check className="h-4 w-4 animate-in zoom-in-50 duration-300" />
              ) : (
                <Wand2 className={cn("h-4 w-4", editing && "animate-pulse")} />
              )}
            </span>
            <span className="flex-1">تحرير وتوليد شامل</span>
            <span className="text-xs font-normal tabular-nums text-muted-foreground" data-testid="text-edit-stream-elapsed">
              {elapsed} ث
            </span>
          </DialogTitle>
          <DialogDescription className="ps-11 text-start">
            {allDone
              ? "اكتملت الصياغة وكل الحقول — جارٍ تطبيق النتيجة على المحرر."
              : editing
                ? "يُعاد صياغة الخبر بأسلوب سبق الآن — يظهر النص هنا أثناء كتابته، ويُطبَّق تلقائيًا عند الاكتمال."
                : "اكتملت الصياغة، جارٍ تجميع بقية الحقول…"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {/* شريط التقدم */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                التقدم
              </span>
              <span className="tabular-nums">{doneCount}/{PHASE_ORDER.length}</span>
            </div>
            <Progress
              value={progress}
              className="h-1.5"
              indicatorClassName={cn(
                "transition-[width] duration-700 ease-out",
                hasFailure ? "bg-destructive" : "bg-gradient-to-l from-sky-500 to-primary",
              )}
            />
          </div>

          {/* مؤشرات المراحل */}
          <ul className="grid gap-2" data-testid="list-edit-stream-phases">
            {PHASE_ORDER.map((phase) => {
              const status = phases[phase];
              return (
                <li
                  key={phase}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors duration-300",
                    status === "done" && "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
                    status === "failed" && "border-destructive/30 bg-destructive/5",
                    status === "running" && "border-border/70 bg-muted/30",
                  )}
                  data-testid={`phase-${phase}-${status}`}
                >
                  <span
                    key={status}
                    className={cn(
                      "flex h-6 w-6 shrink-0 animate-in zoom-in-75 items-center justify-center rounded-full duration-200",
                      status === "done" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                      status === "failed" && "bg-destructive/15 text-destructive",
                      status === "running" && "bg-background text-muted-foreground",
                    )}
                  >
                    {status === "done" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : status === "failed" ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                  </span>
                  <span className={cn("flex-1", status === "done" && "text-muted-foreground")}>{PHASE_LABELS[phase]}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      status === "done" && "text-emerald-600 dark:text-emerald-400",
                      status === "failed" && "text-destructive",
                      status === "running" && "text-muted-foreground",
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* المعاينة الحية */}
          <ScrollArea className="h-[42vh] rounded-xl border bg-muted/20">
            <div className="p-4">
              {paragraphs.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  بانتظار أول سطر من الصياغة…
                </div>
              ) : (
                <div className="space-y-3 text-sm leading-7" dir="auto" data-testid="text-edit-stream-preview">
                  {paragraphs.map((p, i) => (
                    <p key={i} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                      {p}
                    </p>
                  ))}
                  {editing && <span className="inline-block h-4 w-1 animate-pulse bg-primary/70 align-middle" />}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
