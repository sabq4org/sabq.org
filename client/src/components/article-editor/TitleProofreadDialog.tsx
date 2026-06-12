// Extracted from pages/ArticleEditor.tsx (refactor: article-editor-split).
// AI title-proofread result dialog: shows original vs suggested title and
// applies the correction on confirm. JSX preserved verbatim; the page's
// `titleProofreadResult` arrives as `result`, applying goes through
// `onApplySuggestion` (the page wires it to handleTitleChange).
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { TitleProofreadResult } from "@/hooks/useArticleAiTools";

interface TitleProofreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: TitleProofreadResult | null;
  onApplySuggestion: (suggestion: string) => void;
}

export function TitleProofreadDialog({
  open,
  onOpenChange,
  result,
  onApplySuggestion,
}: TitleProofreadDialogProps) {
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="dialog-proofread-title">
        <DialogHeader>
          <DialogTitle>تدقيق لغوي للعنوان</DialogTitle>
          <DialogDescription>
            {result?.hasIssues
              ? "اقتراح تصحيح للعنوان. راجعه ثم اضغط \"تطبيق\" لاستبداله."
              : "العنوان سليم لغوياً ولا يحتاج تصحيحاً."}
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">العنوان الأصلي</p>
              <div
                className="p-3 rounded-md border bg-muted/30 text-sm"
                data-testid="text-title-original"
              >
                {result.original}
              </div>
            </div>
            {result.hasIssues && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">العنوان بعد التصحيح</p>
                <div
                  className="p-3 rounded-md border border-green-300 dark:border-border bg-green-50 dark:bg-muted/40 text-sm font-medium"
                  data-testid="text-title-suggestion"
                >
                  {result.suggestion}
                </div>
              </div>
            )}
            {result.notes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">ملاحظات التصحيح</p>
                <ul className="space-y-1.5 text-sm list-disc pr-5">
                  {result.notes.map((n, idx) => (
                    <li key={idx} data-testid={`note-title-${idx}`}>
                      {n.type && <span className="text-xs text-muted-foreground ml-1">[{n.type}]</span>}
                      {n.explanation}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-title-proofread"
          >
            إغلاق
          </Button>
          {result?.hasIssues && (
            <Button
              onClick={() => {
                if (result) {
                  onApplySuggestion(result.suggestion);
                  toast({ title: "تم تطبيق التصحيح على العنوان" });
                }
                onOpenChange(false);
              }}
              data-testid="button-apply-title-proofread"
            >
              تطبيق التصحيح
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
