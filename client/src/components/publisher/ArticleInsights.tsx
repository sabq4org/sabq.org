import { Bell, Home, Twitter, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export interface VsUsual {
  ratio: number;
  median: number;
}

export interface ArticlePlacements {
  featured: boolean;
  breaking: boolean;
  push: { sentAt: string | null } | null;
  x: { url: string | null; publishedAt: string | null } | null;
}

/**
 * قراءات الخبر مقارنة بالمعتاد في قسمه داخل سبق (الوسيط لآخر 90 يومًا).
 * null من الخادم = مبكر للحكم (أقل من يومين) أو لا معتاد موثوق للقسم.
 */
export function UsualComparison({ value, status, className }: { value: VsUsual | null | undefined; status?: string; className?: string }) {
  if (status && status !== "published") return <span className="text-xs text-muted-foreground">—</span>;
  if (!value) return <span className={cn("text-xs text-muted-foreground", className)}>مبكر للحكم</span>;
  const { ratio, median } = value;
  const above = ratio >= 1.1;
  const below = ratio < 0.9;
  const width = Math.max(4, Math.min(64, Math.round(ratio * 14)));
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs", className)}
      title={`المعتاد في القسم: ${formatNumber(median)} قراءة`}
      data-testid="usual-comparison"
    >
      <span
        aria-hidden
        className={cn("h-1.5 rounded-full", above ? "bg-primary" : below ? "bg-muted-foreground/30" : "bg-primary/50")}
        style={{ width }}
      />
      <span className={cn("whitespace-nowrap", above ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {above ? (
          <>
            <bdi dir="ltr" className="tabular-nums">
              ×{ratio.toLocaleString("en-US", { maximumFractionDigits: 1 })}
            </bdi>{" "}
            المعتاد
          </>
        ) : below ? (
          "أقل من المعتاد"
        ) : (
          "في حدود المعتاد"
        )}
      </span>
    </span>
  );
}

/** أين ظهر الخبر — يعرض ما حدث فعلًا فقط، بلا شارات فارغة. */
export function PlacementChips({ value, className }: { value: ArticlePlacements | null | undefined; className?: string }) {
  if (!value) return null;
  const chips: Array<{ key: string; label: string; icon: typeof Home; href?: string | null }> = [];
  if (value.featured) chips.push({ key: "featured", label: "مميز في الرئيسية", icon: Home });
  if (value.breaking) chips.push({ key: "breaking", label: "عاجل", icon: Zap });
  if (value.push) chips.push({ key: "push", label: "تنبيه للقراء", icon: Bell });
  if (value.x) chips.push({ key: "x", label: "منشور على X", icon: Twitter, href: value.x.url });
  if (chips.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)} data-testid="placement-chips">
      {chips.map(({ key, label, icon: Icon, href }) => {
        const body = (
          <>
            <Icon className="h-3 w-3" aria-hidden />
            {label}
          </>
        );
        const cls =
          "inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
        return href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className={cn(cls, "hover:underline")}>
            {body}
          </a>
        ) : (
          <span key={key} className={cls}>
            {body}
          </span>
        );
      })}
    </span>
  );
}
