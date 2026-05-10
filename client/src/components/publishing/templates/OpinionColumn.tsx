import type { ArticleItem } from "@/lib/publishing/types";
import { FileText } from "lucide-react";

interface OpinionColumnProps {
  items: ArticleItem[];
  title?: string;
  columnist?: {
    name: string;
    avatar?: string;
  };
}

export default function OpinionColumn({ title, items, columnist }: OpinionColumnProps) {
  return (
    <section
      dir="rtl"
      className="w-full p-8 rounded-lg border-2 border-dashed border-border bg-muted/30"
      data-testid="template-opinion-column"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <FileText className="w-12 h-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {title || "قريباً: عمود الرأي"}
          </h3>
          <p className="text-sm text-muted-foreground">
            هذا التمبلت قيد التطوير حالياً
          </p>
        </div>
      </div>
    </section>
  );
}
