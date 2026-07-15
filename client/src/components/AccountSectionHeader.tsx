import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * رأس قسم بهوية الصفحة الرئيسية: أيقونة في شريحة ملونة + عنوان + سطر فرعي.
 * يُستخدم في صفحات الحساب (الملف، الملخص، التركيز، الإشعارات).
 */
export function AccountSectionHeader({
  icon: Icon,
  title,
  subtitle,
  className,
  action,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  className?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}
      data-testid={testId}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-foreground/70">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
