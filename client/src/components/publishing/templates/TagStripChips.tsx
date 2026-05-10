import { Tags } from "lucide-react";

interface TagStripChipsProps {
  tags: string[];
  title?: string;
  accent?: string;
  maxDisplay?: number;
}

export default function TagStripChips({ title, tags, accent, maxDisplay }: TagStripChipsProps) {
  return (
    <section
      dir="rtl"
      className="w-full p-8 rounded-lg border-2 border-dashed border-border bg-muted/30"
      data-testid="template-tag-strip-chips"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <Tags className="w-12 h-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {title || "قريباً: شريط الوسوم"}
          </h3>
          <p className="text-sm text-muted-foreground">
            هذا التمبلت قيد التطوير حالياً
          </p>
        </div>
      </div>
    </section>
  );
}
