import { ExternalLink } from "lucide-react";
import { fmtDateAr } from "./format";
import type { SamaNewsItem } from "./types";

/** «من البنك المركزي» — آخر إعلانات ساما الرسمية بروابطها الأصلية. */
export function SamaNewsFeed({ items }: { items: SamaNewsItem[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-base font-bold">من البنك المركزي</h3>
        <span className="text-[11px] text-muted-foreground">إعلانات ساما الرسمية</span>
      </div>
      <ul className="divide-y divide-border">
        {items.slice(0, 5).map((n) => (
          <li key={n.id} className="py-2.5">
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 hover:text-primary">
              <span className="flex-1 text-[13.5px] font-semibold leading-snug">{n.title}</span>
              <ExternalLink className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            </a>
            <div className="mt-1 text-[11px] text-muted-foreground">{fmtDateAr(n.publishedAt)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
