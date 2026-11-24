// إطار صفحات لوحة الكاتب (المرحلة 0 من خطة التطوير):
// عرض واحد يملأ المساحة بجانب القائمة حتى 1200 بكسل، ورأس موحّد بلا بطاقة.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";

type WriterPageFrameProps = {
  /** أيقونة الصفحة داخل مربع أزرق فاتح بجانب العنوان (نفس أيقونة القائمة الجانبية). */
  icon?: LucideIcon;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  titleTestId?: string;
  className?: string;
};

/**
 * رأس الصفحة (الخيار «ب» المعتمد 2026-11-24): أيقونة في مربع أزرق فاتح، وعنوان
 * كبير، ووصف سطر واحد، على خلفية الصفحة نفسها بلا شريط أبيض ولا مسار تنقل
 * (DashboardLayout fullBleed)، والأفعال على السطر نفسه يسارًا.
 */
export function WriterPageFrame({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  children,
  titleTestId,
  className,
}: WriterPageFrameProps) {
  return (
    <DashboardLayout fullBleed>
      <div className="min-h-full text-[#1B2B3A] dark:text-foreground" dir="rtl">
        <div className={cn("w-full max-w-[1200px] space-y-7 px-4 pb-16 pt-7 sm:px-8 sm:pt-9", className)}>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              {Icon ? (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#EAF5FD] text-[#1E9BE6] dark:bg-primary/10 dark:text-primary sm:h-[52px] sm:w-[52px] sm:rounded-2xl"
                  aria-hidden
                >
                  <Icon className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={1.8} />
                </span>
              ) : null}
              <div className="min-w-0 space-y-0.5">
                {eyebrow ? (
                  <p className="text-[13px] font-medium text-[#0B6FA8] dark:text-primary">{eyebrow}</p>
                ) : null}
                <h1 className="text-2xl font-bold leading-snug sm:text-[28px]" data-testid={titleTestId}>
                  {title}
                </h1>
                {description ? (
                  <p className="text-[13px] leading-6 text-[#55667A] dark:text-muted-foreground sm:text-sm">{description}</p>
                ) : null}
              </div>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
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
