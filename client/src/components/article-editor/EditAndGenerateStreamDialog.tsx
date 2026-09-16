// نافذة «تحرير وتوليد شامل» الحية: تعرض النص المعاد صياغته أثناء وصوله من
// الخادم (SSE) مع حالة الفروع الثلاثة وعدّاد الزمن — بدل شاشة جامدة 20–35ث.
// لا تطبّق شيئًا بنفسها؛ التطبيق يبقى في onSuccess للـmutation كما كان.
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Loader2, Wand2, X } from "lucide-react";
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [preview]);

  const paragraphs = htmlToPlainParagraphs(preview);
  const editing = phases.edit === "running";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-edit-and-generate-stream">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            تحرير وتوليد شامل
            <span className="ms-auto text-xs font-normal tabular-nums text-muted-foreground" data-testid="text-edit-stream-elapsed">
              {elapsed} ث
            </span>
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "يُعاد صياغة الخبر بأسلوب سبق الآن — يظهر النص هنا أثناء كتابته، ويُطبَّق تلقائيًا عند الاكتمال."
              : "اكتملت الصياغة، جارٍ تجميع بقية الحقول…"}
          </DialogDescription>
        </DialogHeader>

        <ul className="grid gap-1 text-sm" data-testid="list-edit-stream-phases">
          {(Object.keys(PHASE_LABELS) as EditStreamPhase[]).map((phase) => {
            const status = phases[phase];
            return (
              <li key={phase} className="flex items-center gap-2" data-testid={`phase-${phase}-${status}`}>
                {status === "done" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : status === "failed" ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <span className={status === "done" ? "text-muted-foreground" : ""}>{PHASE_LABELS[phase]}</span>
              </li>
            );
          })}
        </ul>

        <ScrollArea className="h-[45vh] rounded-md border bg-muted/30 p-4">
          {paragraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">بانتظار أول سطر من الصياغة…</p>
          ) : (
            <div className="space-y-3 text-sm leading-7" dir="auto" data-testid="text-edit-stream-preview">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {editing && <span className="inline-block h-4 w-1 animate-pulse bg-foreground/60 align-middle" />}
            </div>
          )}
          <div ref={bottomRef} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
