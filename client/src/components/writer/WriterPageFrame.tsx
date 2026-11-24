// إطار صفحات لوحة الكاتب (المرحلة 0 من خطة التطوير):
// عرض واحد يملأ المساحة بجانب القائمة حتى 1200 بكسل، ورأس موحّد بلا بطاقة.
import type { ReactNode } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";

type WriterPageFrameProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  titleTestId?: string;
  className?: string;
};

export function WriterPageFrame({
  eyebrow = "لوحة الكاتب",
  title,
  description,
  actions,
  children,
  titleTestId,
  className,
}: WriterPageFrameProps) {
  return (
    <DashboardLayout>
      <div className="min-h-full bg-[#F4F7FB] text-[#1B2B3A] dark:bg-background dark:text-foreground" dir="rtl">
        <div className={cn("w-full max-w-[1200px] space-y-6 px-4 pb-16 pt-6 sm:px-8 sm:pt-9", className)}>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 space-y-1">
              {eyebrow ? <p className="text-[13px] text-[#55667A] dark:text-muted-foreground">{eyebrow}</p> : null}
              <h1 className="text-2xl font-bold leading-tight sm:text-[28px]" data-testid={titleTestId}>
                {title}
              </h1>
              {description ? (
                <p className="text-sm leading-6 text-[#55667A] dark:text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
          {children}
        </div>
      </div>
    </DashboardLayout>
  );
}

/** سطح أبيض ناعم الحواف بظل خفيف — الوحدة الأساسية لمحتوى صفحات الكاتب. */
export function WriterSurface({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-[22px] bg-card shadow-[0_2px_14px_rgba(27,43,58,0.06)] dark:border dark:border-border",
        className,
      )}
    >
      {children}
    </section>
  );
}
