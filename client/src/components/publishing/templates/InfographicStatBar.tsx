import { BarChart3 } from "lucide-react";

interface InfographicStatBarProps {
  stats: { label: string; value: number }[];
  title?: string;
  accent?: string;
}

export default function InfographicStatBar({ title, stats, accent }: InfographicStatBarProps) {
  return (
    <section
      dir="rtl"
      className="w-full p-8 rounded-lg border-2 border-dashed border-border bg-muted/30"
      data-testid="template-infographic-stat-bar"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {title || "قريباً: شريط الإحصائيات"}
          </h3>
          <p className="text-sm text-muted-foreground">
            هذا التمبلت قيد التطوير حالياً
          </p>
        </div>
      </div>
    </section>
  );
}
