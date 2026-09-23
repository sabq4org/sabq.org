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
      <section className="public-page-header categories-directory-header" data-testid="categories-header">
        <div className="public-container">
          <nav
            className="mb-2 flex items-center text-xs text-[#6b7c8a] sm:text-sm dark:text-muted-foreground"
            data-testid="breadcrumb-navigation"
            aria-label="مسار الصفحة"
          >
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 leading-none hover:text-primary transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              الرئيسية
            </Link>
          </nav>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h1
                className="public-page-title"
                data-testid="heading-categories"
              >
                التصنيفات
              </h1>
              <p className="public-page-description mt-1 hidden max-w-2xl sm:block">
                تصفّح أقسام الصحيفة الرسمية — من السياسة والاقتصاد إلى الرياضة والثقافة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:gap-x-4 sm:text-sm text-[#6b7c8a] dark:text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                <span className="font-bold tabular-nums text-foreground">{formatNumber(filteredCategories.length)}</span>
                <span>قسم</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Newspaper className="h-3.5 w-3.5" />
                <span className="font-bold tabular-nums text-foreground">{formatNumber(totalArticles)}</span>
                <span>خبر</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>الأكثر متابعة</span>
                <span className="truncate font-bold text-foreground">{hotCategory?.nameAr ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="relative mt-3 max-w-xl">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="ابحث عن قسم أو موضوع..."
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-11 rounded-xl border-primary/10 bg-background/90 pr-10 text-sm shadow-sm"
              data-testid="input-search-categories"
            />
          </div>
        </div>
      </section>

      <div className="public-container py-5 lg:py-6">
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
