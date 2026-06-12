import { Badge } from "@/components/ui/badge";
import { FilePenLine } from "lucide-react";
import { isResubmittedAfterRevision, type RevisionGateArticle } from "@/lib/articleRevision";

type Props = {
  article: RevisionGateArticle;
  /** compact = badge only; full = badge + optional notes line */
  variant?: "compact" | "full";
  testId?: string;
};

/** Editorial cue: contributor edited per revision notes and resent for review. */
export function ResubmittedDraftIndicator({
  article,
  variant = "compact",
  testId,
}: Props) {
  if (!isResubmittedAfterRevision(article)) return null;

  const notes =
    typeof article.reviewNotes === "string" && article.reviewNotes.trim()
      ? article.reviewNotes.trim()
      : null;

  if (variant === "compact") {
    return (
      <Badge
        className="gap-1 shrink-0 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-400 dark:border-amber-600 text-xs font-medium"
        data-testid={testId}
      >
        <FilePenLine className="h-3 w-3" />
        مُعدَّل وفق التوجيه
      </Badge>
    );
  }

  return (
    <div
      className="rounded-md border border-amber-300/80 bg-amber-50 dark:bg-muted/40 dark:border-border px-2.5 py-1.5 text-xs text-amber-950 dark:text-amber-100 leading-relaxed"
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <FilePenLine className="h-3.5 w-3.5 shrink-0" />
        مُعدَّل وفق توجيه التحرير — بانتظار المراجعة
      </div>
      {notes ? (
        <p className="mt-1 text-amber-900/85 dark:text-amber-200/90 font-normal">
          <span className="font-medium">ملاحظات سابقة: </span>
          {notes}
        </p>
      ) : null}
    </div>
  );
}
