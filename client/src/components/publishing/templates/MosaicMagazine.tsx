import type { ArticleItem } from "@/lib/publishing/types";
import { LayoutGrid } from "lucide-react";

interface MosaicMagazineProps {
  items: ArticleItem[];
  title?: string;
  accent?: string;
  layout?: "grid" | "asymmetric";
}

export default function MosaicMagazine({ title, items, accent, layout }: MosaicMagazineProps) {
  return (
    <section
      dir="rtl"
      className="w-full p-8 rounded-lg border-2 border-dashed border-border bg-muted/30"
      data-testid="template-mosaic-magazine"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <LayoutGrid className="w-12 h-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {title || "قريباً: تخطيط المجلة"}
          </h3>
          <p className="text-sm text-muted-foreground">
            هذا التمبلت قيد التطوير حالياً
          </p>
        </div>
      </div>
    </section>
  );
}
