import type { ArticleItem } from "@/lib/publishing/types";
import { Mic } from "lucide-react";

interface PodcastRowProps {
  items: ArticleItem[];
  title?: string;
  accent?: string;
  showDuration?: boolean;
}

export default function PodcastRow({ title, items, accent, showDuration }: PodcastRowProps) {
  return (
    <section
      dir="rtl"
      className="w-full p-8 rounded-lg border-2 border-dashed border-border bg-muted/30"
      data-testid="template-podcast-row"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <Mic className="w-12 h-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {title || "قريباً: صف حلقات البودكاست"}
          </h3>
          <p className="text-sm text-muted-foreground">
            هذا التمبلت قيد التطوير حالياً
          </p>
        </div>
      </div>
    </section>
  );
}
