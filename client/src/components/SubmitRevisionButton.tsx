import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Send, Loader2 } from "lucide-react";
import {
  canSubmitAfterRevision,
  REVISION_SUBMIT_HINT,
  type RevisionGateArticle,
} from "@/lib/articleRevision";

type Props = {
  article: RevisionGateArticle & { id: string };
  onSubmit: (articleId: string) => void;
  isPending?: boolean;
  size?: "sm" | "default";
  className?: string;
  showLabel?: boolean;
  testId?: string;
};

export function SubmitRevisionButton({
  article,
  onSubmit,
  isPending = false,
  size = "sm",
  className,
  showLabel = true,
  testId,
}: Props) {
  const canSubmit = canSubmitAfterRevision(article);

  const button = (
    <Button
      size={size}
      className={className}
      disabled={!canSubmit || isPending}
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

  if (canSubmit) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-center">
          {REVISION_SUBMIT_HINT}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
