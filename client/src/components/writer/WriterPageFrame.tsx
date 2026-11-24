// إطار صفحات لوحة الكاتب (المرحلة 0 من خطة التطوير):
// عرض واحد يملأ المساحة بجانب القائمة حتى 1200 بكسل، ورأس موحّد بلا بطاقة.
import type { ReactNode } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";

type WriterPageFrameProps = {
  /** سطر صغير فوق العنوان، اختياري (لا يتكرر اسم «لوحة الكاتب» في كل صفحة). */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  titleTestId?: string;
  className?: string;
};

/**
 * رأس الصفحة: شريط أبيض بعرض المساحة كلها وخط رفيع تحته، والعنوان والوصف
 * يمينًا والأفعال يسارًا على السطر نفسه، ثم المحتوى على خلفية #F4F7FB.
 * لا مسار تنقل فوقه ولا صندوق داخلي (DashboardLayout fullBleed).
 */
export function WriterPageFrame({
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
        <header className="border-b border-[#E6ECF2] bg-white dark:border-border dark:bg-card">
          <div className="flex w-full max-w-[1200px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 sm:py-6">
            <div className="min-w-0 space-y-1">
              {eyebrow ? (
                <p className="text-[13px] font-medium text-[#0B6FA8] dark:text-primary">{eyebrow}</p>
              ) : null}
              <h1 className="text-[22px] font-bold leading-snug sm:text-[26px]" data-testid={titleTestId}>
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-sm leading-6 text-[#55667A] dark:text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </header>
        <div className={cn("w-full max-w-[1200px] space-y-6 px-4 pb-16 pt-6 sm:px-8 sm:pt-8", className)}>
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
