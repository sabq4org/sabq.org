import { FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** مراجع تحريرية ثابتة تُعرض لكتّاب الرأي والمراسلين. */
export const GENERAL_EDUCATION_SYSTEM_PDF =
  "/editorial-refs/general-education-system-opinion-writers.pdf";

const DEFAULT_MESSAGE =
  "مرجع تحريري: ملف «نظام التعليم العام» لمساندتكم عند الكتابة عن نظام التعليم الجديد. يُفضَّل الاطلاع عليه قبل إعداد المقال.";

interface EditorialReferenceCardProps {
  href?: string;
  message?: string;
  className?: string;
  /** لاختبارات e2e / analytics */
  testId?: string;
}

export function EditorialReferenceCard({
  href = GENERAL_EDUCATION_SYSTEM_PDF,
  message = DEFAULT_MESSAGE,
  className,
  testId = "card-editorial-reference-education",
}: EditorialReferenceCardProps) {
  return (
    <aside
      className={cn(
        "rounded-xl border border-primary/25 bg-primary/5 p-3 sm:p-4",
        className,
      )}
      dir="rtl"
      data-testid={testId}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <p className="text-sm leading-relaxed text-foreground">{message}</p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 border-primary/30 bg-background hover:bg-primary/5"
        >
          <a href={href} target="_blank" rel="noopener noreferrer">
            اطّلع على الملف
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </aside>
  );
}
