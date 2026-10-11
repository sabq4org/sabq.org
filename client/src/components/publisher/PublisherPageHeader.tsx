import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * رأس صفحات بوابة الوكالة بلغة لوحة التحكم: وسم صغير ملوّن بأيقونة، وعنوان
 * مضغوط، وسطر شرح، والأزرار في الطرف الآخر.
 */
export function PublisherPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  titleTestId = "text-page-title",
}: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleTestId?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
          <Icon className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid={titleTestId}>
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** شريط الحالة: أرقام قصيرة متجاورة في إطار واحد، كما في لوحة التحكم. */
export function PublisherStatusStrip({
  items,
  className,
  testId,
}: {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 text-sm shadow-sm",
        items.length >= 4 ? "lg:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "",
        className,
      )}
      data-testid={testId}
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
          <span className="text-xs text-muted-foreground">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
