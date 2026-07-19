import { useState } from "react";
import { ChevronDown, Info, ShieldCheck } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const NOTICES = [
  "المقال يُرسل للمراجعة، وليس للنشر المباشر.",
  "لهيئة التحرير حق قبول المقال أو رفضه دون الالتزام بذكر الأسباب.",
  "قد تُعدَّل الصورة أو تُحذف إن رأت هيئة التحرير أنها لا تناسب المقال أو سياسات النشر.",
  "قد يُعدَّل العنوان صياغةً بما يخدم وضوح المقال دون تغيير موقفك.",
  "تجنّب الادعاءات غير الموثقة؛ صوتك مهم، والمسؤولية أيضًا.",
] as const;

function NoticesList({ className }: { className?: string }) {
  return (
    <ul className={cn("space-y-3", className)}>
      {NOTICES.map((notice) => (
        <li key={notice} className="flex gap-2.5 text-sm leading-6 text-foreground/75">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/80" aria-hidden />
          <span>{notice}</span>
        </li>
      ))}
    </ul>
  );
}

function NoticesHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5", compact && "min-w-0 flex-1")}>
      <span className="mt-0.5 rounded-lg bg-sky-100/90 p-1.5 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">تنويهات التحرير</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">تذكيرات مهمة قبل الإرسال</p>
      </div>
    </div>
  );
}

/** Sticky left rail for desktop (RTL visual left). */
export function WriterEditorialNoticesAside() {
  return (
    <aside
      className="hidden lg:block"
      aria-label="تنويهات التحرير"
      data-testid="writer-editorial-notices-aside"
    >
      <div className="sticky top-20 space-y-4 rounded-2xl border border-sky-200/60 bg-gradient-to-b from-sky-50/70 via-background to-background p-4 shadow-sm dark:border-sky-900/40 dark:from-sky-950/25">
        <NoticesHeader />
        <NoticesList />
        <p className="flex items-start gap-2 rounded-xl border border-sky-100/80 bg-background/70 p-3 text-xs leading-5 text-muted-foreground dark:border-sky-900/30">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
          هذه تنويهات عامة لتوضيح مسار المراجعة، وليست بديلاً عن دليل الكاتب.
        </p>
      </div>
    </aside>
  );
}

/** Compact collapsible block for mobile/tablet. */
export function WriterEditorialNoticesMobile() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-testid="writer-editorial-notices-mobile"
    >
      <div className="rounded-2xl border border-sky-200/60 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-950/20">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-4 text-right no-min-touch-size"
            aria-expanded={open}
          >
            <NoticesHeader compact />
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-sky-700 transition-transform dark:text-sky-300",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t border-sky-200/50 px-4 pb-4 pt-3 dark:border-sky-900/30">
            <NoticesList />
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
              هذه تنويهات عامة لتوضيح مسار المراجعة، وليست بديلاً عن دليل الكاتب.
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
