import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CategoryWithStats, CategoryPulseLevel } from "@shared/schema";

interface CategoryPillsProps {
  categories: CategoryWithStats[];
  selectedCategory?: string;
  onSelectCategory?: (categoryId: string | undefined) => void;
}

const PULSE_LABELS: Record<CategoryPulseLevel, string> = {
  calm: "هادئ",
  normal: "معتاد",
  active: "نشط",
  hot: "نشط جداً",
};

const PULSE_DOT_COLORS: Record<CategoryPulseLevel, string> = {
  calm: "bg-slate-400 dark:bg-slate-500",
  normal: "bg-emerald-500",
  active: "bg-amber-500",
  hot: "bg-rose-500",
};

const PULSE_PING_COLORS: Record<CategoryPulseLevel, string> = {
  calm: "bg-slate-400/0",
  normal: "bg-emerald-500/60",
  active: "bg-amber-500/60",
  hot: "bg-rose-500/70",
};

function PulseDot({ category }: { category: CategoryWithStats }) {
  const level: CategoryPulseLevel = category.hasPulseData
    ? category.pulseLevel ?? "calm"
    : "calm";
  const percent = category.hasPulseData
    ? Math.max(0, Math.min(150, Math.round(category.pulsePercent ?? 0)))
    : null;
  const label = PULSE_LABELS[level];
  const showPing = category.hasPulseData && (level === "active" || level === "hot");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="relative inline-flex h-2 w-2 flex-shrink-0"
          data-testid={`pulse-pill-${category.id}`}
          aria-label={percent !== null ? `${label} ${percent}%` : label}
        >
          {showPing && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${PULSE_PING_COLORS[level]}`}
            />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${PULSE_DOT_COLORS[level]}`}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {percent !== null ? `${label} · ${percent}%` : label}
      </TooltipContent>
    </Tooltip>
  );
}

export function CategoryPills({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryPillsProps) {
  const baseItem =
    "cursor-pointer rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors hover-elevate active-elevate-2";
  const activeItem = "bg-foreground text-background font-medium";
  const inactiveItem = "bg-muted/60 text-muted-foreground hover:text-foreground";

  return (
    <div className="w-full border-b bg-background/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollArea className="w-full whitespace-nowrap">
          <TooltipProvider delayDuration={150}>
            <div className="flex items-center justify-center gap-1 py-2">
              <button
                type="button"
                className={cn(baseItem, !selectedCategory ? activeItem : inactiveItem)}
                onClick={() => onSelectCategory?.(undefined)}
                data-testid="badge-category-all"
              >
                الكل
              </button>
              {(categories || []).map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={cn(
                    baseItem,
                    "inline-flex items-center gap-1.5",
                    selectedCategory === category.id ? activeItem : inactiveItem,
                  )}
                  onClick={() => onSelectCategory?.(category.id)}
                  data-testid={`badge-category-${category.slug}`}
                >
                  <span>{category.nameAr}</span>
                  <PulseDot category={category} />
                </button>
              ))}
            </div>
          </TooltipProvider>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
