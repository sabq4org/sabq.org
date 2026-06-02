import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Newspaper,
  FileText,
  Search,
  LayoutGrid,
  List,
  Activity,
} from "lucide-react";
import { Link } from "wouter";
import type { CategoryWithStats, CategoryPulseLevel } from "@shared/schema";

type PulseLevel = CategoryPulseLevel;

const PULSE_LABELS: Record<PulseLevel, string> = {
  calm: "هادئ",
  normal: "معتاد",
  active: "نشط",
  hot: "نشط جداً",
};

const PULSE_BAR_COLORS: Record<PulseLevel, string> = {
  calm: "bg-slate-400 dark:bg-slate-500",
  normal: "bg-emerald-500",
  active: "bg-amber-500",
  hot: "bg-rose-500",
};

const PULSE_TEXT_COLORS: Record<PulseLevel, string> = {
  calm: "text-slate-500 dark:text-slate-300",
  normal: "text-emerald-600 dark:text-emerald-400",
  active: "text-amber-600 dark:text-amber-400",
  hot: "text-rose-600 dark:text-rose-400",
};

function PulseBar({
  percent,
  level,
  hasData,
  variant,
  testId,
}: {
  percent: number | null;
  level: PulseLevel;
  hasData: boolean;
  variant: "overlay" | "inline";
  testId?: string;
}) {
  const effectiveLevel: PulseLevel = hasData ? level : "calm";
  const safePercent = hasData
    ? Math.max(0, Math.min(150, Math.round(percent ?? 0)))
    : 0;
  const widthPercent = hasData ? Math.min(100, (safePercent / 150) * 100) : 0;
  const label = PULSE_LABELS[effectiveLevel];

  if (variant === "overlay") {
    return (
      <div className="flex items-center gap-2 mb-1.5" data-testid={testId}>
        <Activity className="h-3 w-3 text-white/90 flex-shrink-0" />
        <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
          <div
            className={`h-full rounded-full ${PULSE_BAR_COLORS[effectiveLevel]} transition-all duration-500`}
            style={{ width: `${widthPercent}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold text-white whitespace-nowrap">
          {hasData ? `${label} · ${safePercent}%` : label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2" data-testid={testId}>
      <Activity className={`h-3.5 w-3.5 ${PULSE_TEXT_COLORS[effectiveLevel]} flex-shrink-0`} />
      <div className="flex-1 max-w-[180px] h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${PULSE_BAR_COLORS[effectiveLevel]} transition-all duration-500`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className={`text-xs font-medium whitespace-nowrap ${PULSE_TEXT_COLORS[effectiveLevel]}`}>
        {hasData ? `${label} · ${safePercent}%` : label}
      </span>
    </div>
  );
}

type ViewMode = "grid" | "list";

function categoryColorStyles(color?: string | null) {
  const hex = color && /^#([0-9a-fA-F]{6})$/.test(color) ? color : null;
  return {
    background: hex ? `${hex}0F` : "hsl(var(--muted) / 0.4)",
    border: hex ? `${hex}40` : "hsl(var(--border))",
    iconBg: hex ? `${hex}1A` : "hsl(var(--muted))",
    iconColor: hex ?? "hsl(var(--primary))",
  };
}

export default function CategoriesListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: categoriesRaw, isLoading } = useQuery<CategoryWithStats[]>({
    queryKey: ["/api/categories", "withStats"],
    queryFn: async () => {
      const res = await fetch("/api/categories?withStats=true", { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => cat.status === "visible" && cat.type === "core")
      .filter((cat) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          cat.nameAr.toLowerCase().includes(query) ||
          cat.nameEn?.toLowerCase().includes(query) ||
          cat.description?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [categories, searchQuery]);

  const totalArticles = useMemo(() => {
    return categories
      .filter((cat) => cat.status === "visible" && cat.type === "core")
      .reduce((sum, cat) => sum + (cat.articleCount || 0), 0);
  }, [categories]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />

      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2" data-testid="heading-categories">
            التصنيفات
          </h1>
          <p className="text-muted-foreground">
            استكشف {filteredCategories.length} تصنيف يحتوي على {totalArticles.toLocaleString()} خبر
          </p>
        </div>

        {/* Search and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="ابحث عن تصنيف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
              data-testid="input-search-categories"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Categories Grid/List */}
        {isLoading ? (
          <div className={viewMode === "grid" 
            ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            : "space-y-4"
          }>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-20">
            <Newspaper className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground text-lg">
              {searchQuery ? "لم يتم العثور على تصنيفات مطابقة" : "لا توجد تصنيفات متاحة حالياً"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View - Clean cards with soft tinted backgrounds */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredCategories.map((category) => {
              const styles = categoryColorStyles(category.color);
              return (
                <Link key={category.id} href={`/category/${category.slug}`}>
                  <Card
                    className="group relative flex h-full min-h-[160px] cursor-pointer flex-col rounded-xl border p-5 transition-colors hover-elevate active-elevate-2"
                    style={{ backgroundColor: styles.background, borderColor: styles.border }}
                    data-testid={`card-category-${category.id}`}
                  >
                    {/* Icon chip */}
                    <div
                      className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg text-2xl"
                      style={{ backgroundColor: styles.iconBg, color: styles.iconColor }}
                    >
                      {category.icon || <Newspaper className="h-5 w-5" />}
                    </div>

                    {/* Category Name */}
                    <h3
                      className="text-lg font-bold text-foreground leading-snug"
                      data-testid={`text-category-name-${category.id}`}
                    >
                      {category.nameAr}
                    </h3>
                    {category.nameEn && (
                      <p className="text-xs text-muted-foreground mt-0.5">{category.nameEn}</p>
                    )}

                    <div className="mt-auto pt-3">
                      {/* Pulse Bar */}
                      <PulseBar
                        percent={category.pulsePercent ?? null}
                        level={category.pulseLevel ?? "calm"}
                        hasData={category.hasPulseData ?? false}
                        variant="inline"
                        testId={`pulse-category-${category.id}`}
                      />

                      {/* Article Count Badge */}
                      <Badge variant="secondary" className="mt-2 w-fit text-xs">
                        <FileText className="h-3 w-3 ml-1" />
                        {(category.articleCount || 0).toLocaleString()} خبر
                      </Badge>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          /* List View - Compact Horizontal Cards */
          <div className="space-y-3">
            {filteredCategories.map((category) => {
              const styles = categoryColorStyles(category.color);
              return (
                <Link key={category.id} href={`/category/${category.slug}`}>
                  <Card
                    className="group cursor-pointer border hover-elevate active-elevate-2"
                    style={{ backgroundColor: styles.background, borderColor: styles.border }}
                    data-testid={`card-category-${category.id}`}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Icon chip */}
                      <div
                        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg text-2xl"
                        style={{ backgroundColor: styles.iconBg, color: styles.iconColor }}
                      >
                        {category.icon || <Newspaper className="h-6 w-6" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-lg font-bold text-foreground group-hover:text-primary transition-colors"
                          data-testid={`text-category-name-${category.id}`}
                        >
                          {category.nameAr}
                        </h3>
                        {category.nameEn && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {category.nameEn}
                          </p>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          <FileText className="h-3 w-3 ml-1" />
                          {(category.articleCount || 0).toLocaleString()} خبر
                        </Badge>

                        {/* Pulse Bar */}
                        <PulseBar
                          percent={category.pulsePercent ?? null}
                          level={category.pulseLevel ?? "calm"}
                          hasData={category.hasPulseData ?? false}
                          variant="inline"
                          testId={`pulse-category-${category.id}`}
                        />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
