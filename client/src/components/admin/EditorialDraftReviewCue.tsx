import { Badge } from "@/components/ui/badge";
import { AlertCircle, FilePenLine } from "lucide-react";
import {
  isAwaitingContributorRevision,
  isResubmittedAfterRevision,
  type RevisionGateArticle,
} from "@/lib/articleRevision";

type Props = {
  article: RevisionGateArticle;
  /** inline = badge beside title; banner = block under title; meta = one line with clock */
  layout?: "inline" | "banner" | "meta";
  testId?: string;
};

/** Editorial cues on the drafts list for contributor review workflow. */
export function EditorialDraftReviewCue({
  article,
  layout = "inline",
  testId,
}: Props) {
  const resubmitted = isResubmittedAfterRevision(article);
  const awaitingAuthor = isAwaitingContributorRevision(article);

  if (!resubmitted && !awaitingAuthor) return null;

  const notes =
    typeof article.reviewNotes === "string" && article.reviewNotes.trim()
      ? article.reviewNotes.trim()
      : null;

  if (layout === "inline") {
    if (resubmitted) {
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
      <Badge
        className="gap-1 shrink-0 bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-100 border-orange-400 dark:border-orange-600 text-xs font-medium"
        data-testid={testId}
      >
        <AlertCircle className="h-3 w-3" />
        بانتظار تعديل الكاتب
      </Badge>
    );
  }

  if (layout === "meta") {
    if (resubmitted) {
      return (
        <div
          className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-1 font-medium"
          data-testid={testId}
        >
          <FilePenLine className="h-3 w-3 shrink-0" />
          <span>مُعدَّل وفق التوجيه — أُعيد إرساله للمراجعة</span>
        </div>
      );
    }
    return (
      <div
        className="text-xs text-orange-800 dark:text-orange-200 flex items-center gap-1"
        data-testid={testId}
      >
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>بانتظار تعديل الكاتب{notes ? `: ${notes}` : ""}</span>
      </div>
    );
  }

  // banner
  if (resubmitted) {
    return (
      <div
        className="rounded-md border border-amber-300/80 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 px-2.5 py-1.5 text-xs text-amber-950 dark:text-amber-100 leading-relaxed"
        data-testid={testId}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          <FilePenLine className="h-3.5 w-3.5 shrink-0" />
          مُعدَّل وفق توجيه التحرير — بانتظار المراجعة
        </div>
        {notes ? (
          <p className="mt-1 text-amber-900/85 dark:text-amber-200/90 font-normal">
            <span className="font-medium">ملاحظات التحرير: </span>
            {notes}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-orange-300/80 bg-orange-50 dark:bg-orange-500/10 dark:border-orange-500/40 px-2.5 py-1.5 text-xs text-orange-950 dark:text-orange-100 leading-relaxed"
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        بانتظار تعديل الكاتب
      </div>
      {notes ? (
        <p className="mt-1 font-normal">
          <span className="font-medium">الملاحظات: </span>
          {notes}
        </p>
      ) : null}
    </div>
  );
}
