import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bookmark,
  Eye,
  FileText,
  FolderOpen,
  Home,
  Layers,
  Newspaper,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactNumber, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CategoryPulseLevel, CategoryWithStats } from "@shared/schema";

const PULSE_LABELS: Record<CategoryPulseLevel, string> = {
  calm: "هادئ",
  normal: "معتاد",
  active: "نشط",
  hot: "الأكثر متابعة",
};

const PULSE_BADGE_STYLES: Record<CategoryPulseLevel, string> = {
  calm: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  normal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  active: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  hot: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

function categoryHref(category: CategoryWithStats) {
  return `/category/${category.slug}`;
}

function categoryAccentColor(color?: string | null) {
  return color && /^#([0-9a-fA-F]{6})$/.test(color) ? color : "hsl(var(--primary))";
}

function CategoryPulseBadge({
  category,
  testId,
}: {
  category: CategoryWithStats;
  testId?: string;
}) {
  const level: CategoryPulseLevel = category.hasPulseData
    ? category.pulseLevel ?? "calm"
    : "calm";

  return (
    <Badge
      variant="secondary"
      className={cn("border-0 font-medium", PULSE_BADGE_STYLES[level])}
      data-testid={testId}
    >
      {category.hasPulseData && level === "hot" ? (
        <TrendingUp className="h-3 w-3 ml-1" />
      ) : null}
      {PULSE_LABELS[level]}
    </Badge>
  );
}

function CategoryCard({
  category,
  featured = false,
}: {
  category: CategoryWithStats;
  featured?: boolean;
}) {
  const accent = categoryAccentColor(category.color);

  return (
    <Link href={categoryHref(category)}>
      <article
        className={cn(
          "group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300",
          "hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg",
          featured && "md:min-h-[320px]",
        )}
        data-testid={`card-category-${category.id}`}
      >
        <div
          className={cn("absolute inset-x-0 top-0 z-10 h-1", featured && "h-1.5")}
          style={{ backgroundColor: accent }}
        />

        <div className={cn("relative overflow-hidden", featured ? "h-48 md:h-56" : "h-40")}>
          {category.heroImageUrl ? (
            <OptimizedImage
              src={category.heroImageUrl}
              alt={category.nameAr}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              wrapperClassName="h-full w-full"
              sizes={featured ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 33vw"}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${accent}22 0%, ${accent}08 55%, transparent 100%)`,
              }}
            >
              <span className="text-5xl opacity-90">{category.icon || "📰"}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h3
                  className={cn(
                    "font-bold leading-tight text-white drop-shadow-sm",
                    featured ? "text-2xl md:text-3xl" : "text-xl",
                  )}
                  data-testid={`text-category-name-${category.id}`}
                >
                  {category.nameAr}
                </h3>
                {category.nameEn ? (
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/75">
                    {category.nameEn}
                  </p>
                ) : null}
              </div>
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors group-hover:bg-white/25">
                <ArrowLeft className="h-4 w-4" />
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          {category.description ? (
            <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {category.description}
            </p>
          ) : (
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              آخر الأخبار والتغطيات في قسم {category.nameAr}
            </p>
          )}

          <div className="mt-auto space-y-3">
            <div className="grid grid-cols-3 gap-2 border-t pt-3">
              <div className="text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="text-[11px]">الأخبار</span>
                </div>
                <p className="text-sm font-bold">
                  {formatNumber(category.articleCount || 0)}
                </p>
              </div>
              <div className="text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  <span className="text-[11px]">المشاهدات</span>
                </div>
                <p className="text-sm font-bold">
                  {formatCompactNumber(category.totalViews || 0)}
                </p>
              </div>
              <div className="text-center">
                <div className="mb-1 flex items-center justify-center gap-1 text-muted-foreground">
                  <Bookmark className="h-3.5 w-3.5" />
                  <span className="text-[11px]">المحفوظات</span>
                </div>
                <p className="text-sm font-bold">
                  {formatCompactNumber(category.totalBookmarks || 0)}
                </p>
              </div>
            </div>

            <CategoryPulseBadge
              category={category}
              testId={`pulse-category-${category.id}`}
            />
          </div>
        </div>
      </article>
    </Link>
  );
}

function CategoryCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <Skeleton className={cn("w-full", featured ? "h-56" : "h-40")} />
      <div className="space-y-3 p-5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

export interface CategoriesDirectoryProps {
  categories: CategoryWithStats[];
  filteredCategories: CategoryWithStats[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  totalArticles: number;
}

export function CategoriesDirectory({
  categories,
  filteredCategories,
  isLoading,
  searchQuery,
  onSearchChange,
  totalArticles,
}: CategoriesDirectoryProps) {
  const featuredCategories = useMemo(() => {
    if (searchQuery.trim()) return [];

    return [...categories]
      .sort((a, b) => {
        const pulseDiff = (b.pulsePercent ?? 0) - (a.pulsePercent ?? 0);
        if (pulseDiff !== 0) return pulseDiff;
        return (b.articleCount || 0) - (a.articleCount || 0);
      })
      .slice(0, 2);
  }, [categories, searchQuery]);

  const directoryCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      const featuredIds = new Set(featuredCategories.map((category) => category.id));
      return filteredCategories.filter((category) => !featuredIds.has(category.id));
    }
    return filteredCategories;
  }, [filteredCategories, featuredCategories, searchQuery]);

  const hotCategory = useMemo(() => {
    return [...categories]
      .filter((category) => category.hasPulseData)
      .sort((a, b) => (b.pulsePercent ?? 0) - (a.pulsePercent ?? 0))[0];
  }, [categories]);

  return (
    <>
      <section className="border-b border-[#e3ebf2] bg-[#f4f8fb] text-[#10202e] dark:border-border dark:bg-[#171e29] dark:text-foreground" data-testid="categories-header">

        <div className="container relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <nav
            className="mb-6 flex items-center gap-2 text-sm text-[#6b7c8a] dark:text-muted-foreground"
            data-testid="breadcrumb-navigation"
          >
            <Link href="/">
              <span className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted/60">
                <Home className="h-3.5 w-3.5" />
                الرئيسية
              </span>
            </Link>
            <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
            <span className="font-semibold text-foreground">التصنيفات</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                دليل أقسام سبق الإخباري
              </div>
              <h1
                className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl"
                data-testid="heading-categories"
              >
                التصنيفات
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#6b7c8a] md:text-lg dark:text-muted-foreground">
                تصفّح أقسام الصحيفة الرسمية — من السياسة والاقتصاد إلى الرياضة والثقافة —
                مع مؤشرات النشاط التحريري وعدد التغطيات في كل قسم.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-background/80 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  <span className="text-xs">الأقسام</span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(filteredCategories.length)}</p>
              </div>
              <div className="rounded-2xl border bg-background/80 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Newspaper className="h-4 w-4" />
                  <span className="text-xs">الأخبار</span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(totalArticles)}</p>
              </div>
              <div className="rounded-2xl border bg-background/80 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">الأكثر متابعة</span>
                </div>
                <p className="truncate text-sm font-bold">
                  {hotCategory?.nameAr ?? "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="relative mt-8 max-w-2xl">
            <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="ابحث عن قسم أو موضوع..."
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-12 rounded-2xl border-primary/10 bg-background/90 pr-11 text-base shadow-sm backdrop-blur-sm"
              data-testid="input-search-categories"
            />
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {!isLoading && !searchQuery && categories.length > 0 ? (
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold">تصفّح سريع</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => (
                <Link key={category.id} href={categoryHref(category)}>
                  <span
                    className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
                    data-testid={`pill-category-${category.id}`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: categoryAccentColor(category.color) }}
                    />
                    {category.nameAr}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {isLoading ? (
          <div className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <CategoryCardSkeleton featured />
              <CategoryCardSkeleton featured />
            </div>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <CategoryCardSkeleton key={item} />
              ))}
            </div>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="rounded-3xl border border-dashed py-20 text-center">
            <Newspaper className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">
              {searchQuery ? "لم يتم العثور على أقسام مطابقة لبحثك" : "لا توجد تصنيفات متاحة حالياً"}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {featuredCategories.length > 0 ? (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">مختارات التحرير</p>
                    <h2 className="text-2xl font-bold">أبرز الأقسام</h2>
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {featuredCategories.map((category) => (
                    <CategoryCard key={category.id} category={category} featured />
                  ))}
                </div>
              </motion.section>
            ) : null}

            <section>
              <div className="mb-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">الفهرس الكامل</p>
                  <h2 className="text-2xl font-bold">
                    {searchQuery ? "نتائج البحث" : "جميع الأقسام"}
                  </h2>
                </div>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {formatNumber(directoryCategories.length)} قسم
                </Badge>
              </div>

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {directoryCategories.map((category, index) => (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.24) }}
                  >
                    <CategoryCard category={category} />
                  </motion.div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}
