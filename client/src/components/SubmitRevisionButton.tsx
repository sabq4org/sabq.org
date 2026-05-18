import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import type { RevisionGateArticle } from "@/lib/articleRevision";

type Props = {
  article: RevisionGateArticle & { id: string };
  onSubmit: (articleId: string) => void;
  isPending?: boolean;
  size?: "sm" | "default";
  className?: string;
  showLabel?: boolean;
  testId?: string;
};

/// Resubmit-after-revision button. The "must save first" disable rule
/// was removed 2026-05-18 — the server-side gate that backed it was
/// dropping resubmits silently (a fleeting 400 toast the contributor
/// often missed), and editors reported articles stuck in `needs_changes`
/// even after the writer thought they had resent. Now the button is
/// always enabled while the row is in needs_changes; the rare
/// no-edit resubmit is handled by the editorial team directly.
export function SubmitRevisionButton({
  article,
  onSubmit,
  isPending = false,
  size = "sm",
  className,
  showLabel = true,
  testId,
}: Props) {
  return (
    <Button
      size={size}
      className={className}
      disabled={isPending}
      onClick={() => onSubmit(article.id)}
      data-testid={testId}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Send className={showLabel ? "h-3.5 w-3.5 ml-1" : "h-4 w-4"} />
      )}
      {showLabel && "إرسال"}
    </Button>
  );
}
