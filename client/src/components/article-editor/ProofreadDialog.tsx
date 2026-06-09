// Extracted from pages/ArticleEditor.tsx (refactor: article-editor-split).
// AI content-proofread results dialog: lists spelling issues and lets the
// editor apply/skip each one (or apply all) — never auto-applies.
// JSX preserved verbatim; the page passes `content`/`setContent` and the
// issues state so replacement semantics stay identical.
import type { Dispatch, SetStateAction } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, SpellCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProofreadIssue } from "@/hooks/useArticleAiTools";

interface ProofreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: ProofreadIssue[];
  setIssues: Dispatch<SetStateAction<ProofreadIssue[]>>;
  content: string;
  setContent: Dispatch<SetStateAction<string>>;
}

export function ProofreadDialog({
  open,
  onOpenChange,
  issues,
  setIssues,
  content,
  setContent,
}: ProofreadDialogProps) {
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-proofread">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SpellCheck className="h-5 w-5" />
            نتائج التدقيق اللغوي
          </DialogTitle>
          <DialogDescription>
            {issues.length === 0
              ? "النص سليم إملائياً، لا توجد أخطاء."
              : `تم العثور على ${issues.length} ملاحظة. اضغط "تطبيق" لاستبدال الكلمة في المقال، أو "تجاهل" لتجاوزها.`}
          </DialogDescription>
        </DialogHeader>
        {issues.length > 0 && (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-3">
              {issues.map((issue, idx) => (
                <Card key={`${issue.original}-${idx}`} data-testid={`proofread-issue-${idx}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {issue.type || "إملائي"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">رقم {idx + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">الكلمة الحالية</Label>
                        <div
                          className="mt-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium"
                          data-testid={`proofread-original-${idx}`}
                        >
                          {issue.original}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">الاقتراح</Label>
                        <div
                          className="mt-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium"
                          data-testid={`proofread-suggestion-${idx}`}
                        >
                          {issue.suggestion}
                        </div>
                      </div>
                    </div>
                    {issue.explanation && (
                      <p className="text-xs text-muted-foreground" data-testid={`proofread-explanation-${idx}`}>
                        {issue.explanation}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIssues((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        data-testid={`button-skip-proofread-${idx}`}
                      >
                        تجاهل
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          if (!content.includes(issue.original)) {
                            toast({
                              title: "الكلمة لم تعد في النص",
                              description: "ربما تم تعديل المقال. أعد التدقيق.",
                              variant: "destructive",
                            });
                            setIssues((prev) => prev.filter((_, i) => i !== idx));
                            return;
                          }
                          setContent(content.replace(issue.original, issue.suggestion));
                          setIssues((prev) =>
                            prev
                              .filter((_, i) => i !== idx)
                              .map((it) =>
                                it.original === issue.original
                                  ? { ...it, original: issue.suggestion }
                                  : it
                              )
                          );
                          toast({ title: "تم التطبيق", description: `${issue.original} ← ${issue.suggestion}` });
                        }}
                        data-testid={`button-apply-proofread-${idx}`}
                        className="gap-1"
                      >
                        <Check className="h-3 w-3" />
                        تطبيق
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          {issues.length > 1 && (
            <Button
              variant="default"
              onClick={() => {
                let newContent = content;
                let appliedCount = 0;
                for (const issue of issues) {
                  if (newContent.includes(issue.original)) {
                    newContent = newContent.replace(issue.original, issue.suggestion);
                    appliedCount++;
                  }
                }
                setContent(newContent);
                setIssues([]);
                toast({
                  title: "تم تطبيق التصحيحات",
                  description: `تم تطبيق ${appliedCount} تصحيح${appliedCount === 1 ? "" : "اً"} على النص.`,
                });
                onOpenChange(false);
              }}
              data-testid="button-apply-all-proofread"
              className="gap-1"
            >
              <Check className="h-4 w-4" />
              تطبيق الكل ({issues.length})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-proofread"
          >
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
