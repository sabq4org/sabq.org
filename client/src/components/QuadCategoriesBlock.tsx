import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useEffect, useMemo } from "react";
import { isAICategory } from "@/utils/filterAICategories";
import { getObjectPosition } from "@/lib/imageUtils";
import { OptimizedImage } from "@/components/OptimizedImage";
import { expandShortAge } from "@/lib/shortAge";

// Icon mapper
const getIcon = (iconName: string) => {
  return getLucideIcon(iconName, Folder);
};

// Types
interface CategoryColumnData {
  category: {
    slug: string;
    name: string;
    icon: string;
  };
  stats: {
    label: string;
    value: number;
    trend?: string;
  };
  featured: {
    id: string;
    title: string;
    image?: string;
    thumbnailUrl?: string | null;
    imageFocalPoint?: { x: number; y: number } | null;
    href: string;
    meta: {
      age: string;
      readMins: number;
      views: number;
      badge?: string | null;
    };
  };
  list: Array<{
    id: string;
    title: string;
    href: string;
    meta: {
      views: number;
      age: string;
    };
  }>;
  teaser?: string;
}

interface QuadCategoriesData {
  items: CategoryColumnData[];
  mobileCarousel: boolean;
  backgroundColor?: string;
}

// Featured Card Component
function FeaturedCard({ data }: { data: CategoryColumnData["featured"] }) {
  // Use thumbnail if available, otherwise fall back to main image
  const displayImage = data.image || data.thumbnailUrl;
  
  return (
    <Link href={data.href}>
      <div 
        className="group relative overflow-hidden rounded-lg mb-3 cursor-pointer"
        data-testid={`featured-card-${data.id}`}
      >
        {/* Image */}
        <div className="relative aspect-[16/9] bg-muted overflow-hidden">
          {displayImage ? (
            <OptimizedImage
              src={displayImage}
              alt={data.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              objectPosition={getObjectPosition(data)}
              preferSize="small"
              aspectRatio="16/9"
              sizes="(max-width: 1023px) 100vw, 25vw"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50" />
          )}
          
          {/* Badge */}
          {data.meta.badge && (
            <div className="absolute top-2 right-2">
              <Badge 
                variant={data.meta.badge === "عاجل" ? "destructive" : "secondary"}
                className="text-xs font-bold"
                data-testid="featured-badge"
              >
                {data.meta.badge}
              </Badge>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 
          className="font-bold text-sm mt-2 line-clamp-2 group-hover:text-primary transition-colors"
          data-testid="featured-title"
        >
          {data.title}
        </h3>

        {/* Meta */}
        <div className="flex items-center gap-3 mt-1.5 text-xs font-medium text-foreground/65">
          <div className="flex items-center gap-1" data-testid="featured-time">
            <Clock className="w-3 h-3" />
            <span>{data.meta.age}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Title List Component
function TitleList({ items }: { items: CategoryColumnData["list"] }) {
  return (
    <div className="space-y-2" data-testid="title-list">
      {items.map((item, index) => (
        <Link key={item.id} href={item.href}>
          <div
            className="group py-2 border-b border-border dark:border-border/60 last:border-0 cursor-pointer"
            data-testid={`list-item-${index}`}
          >
            <h4 className="text-sm font-medium line-clamp-2 mb-1 group-hover:text-primary transition-colors">
              {item.title}
            </h4>
            <div className="flex items-center gap-3 text-xs font-medium text-foreground/65">
              <span>{item.meta.age}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// Column Header Component
function ColumnHeader({ category, stats, teaser }: Pick<CategoryColumnData, 'category' | 'stats' | 'teaser'>) {
  const IconComponent = getIcon(category.icon);

  return (
    <div className="mb-4" data-testid="column-header">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <IconComponent className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold" data-testid="category-name">
            {category.name}
          </h2>
        </div>
        <Badge variant="secondary" className="text-xs" data-testid="category-stats">
          {stats.value.toLocaleString('en-US')} {stats.label}
        </Badge>
      </div>
      {teaser && (
        <p className="text-xs font-medium text-foreground/65" data-testid="category-teaser">
          {teaser}
        </p>
      )}
    </div>
  );
}

// Category Column Component
function CategoryColumn({ data, index }: { data: CategoryColumnData; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="bg-card shadow-sm border border-border dark:border-card-border rounded-xl p-4"
      data-testid={`category-column-${data.category.slug}`}
    >
      <ColumnHeader 
        category={data.category}
        stats={data.stats}
        teaser={data.teaser}
      />
      <FeaturedCard data={data.featured} />
      <TitleList items={data.list} />
    </motion.div>
  );
}

// Mobile Compact List Component
function MobileCompactList({ items }: { items: CategoryColumnData[] }) {
  // Category colours come from the categories list the homepage already
  // caches; the quad endpoint itself carries no colour. Fallback: Sabq blue.
  const { data: categoriesRaw } = useQuery<Array<{ slug: string; color?: string | null }>>({
    queryKey: ["/api/categories", "withStats"],
    enabled: false,
  });
  const colorBySlug = useMemo(() => {
    const map = new Map<string, string>();
    if (Array.isArray(categoriesRaw)) {
      for (const c of categoriesRaw) if (c?.slug && c.color) map.set(c.slug, c.color);
    }
    return map;
  }, [categoriesRaw]);

  return (
    <div className="space-y-3" data-testid="mobile-compact-list">
      {items.map((item, index) => {
        const accent = colorBySlug.get(item.category.slug) || "hsl(var(--primary))";
        return (
          <motion.div
            key={item.category.slug}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
            className="bg-card shadow-sm border border-border dark:border-card-border rounded-2xl p-3.5"
            data-testid={`mobile-category-${item.category.slug}`}
          >
            {/* Header: category colour bar + name, link to the category */}
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1 h-[18px] rounded-full flex-shrink-0" style={{ backgroundColor: accent }} aria-hidden="true" />
              <h3 className="text-base font-bold flex-1 min-w-0 truncate">{item.category.name}</h3>
              <Link
                href={`/category/${item.category.slug}`}
                className="text-xs font-semibold text-primary whitespace-nowrap py-1"
                data-testid={`mobile-category-more-${item.category.slug}`}
              >
                {item.stats.value > 0 ? `${item.stats.value.toLocaleString('en-US')} اليوم · ` : ""}الكل ‹
              </Link>
            </div>

            {/* Featured Article */}
            <Link href={item.featured.href}>
              <div className="flex gap-3 group" data-testid={`mobile-featured-${item.featured.id}`}>
                <div className="relative flex-shrink-0 w-[118px] aspect-video rounded-lg overflow-hidden">
                  {(item.featured.image || item.featured.thumbnailUrl) ? (
                    <OptimizedImage
                      src={item.featured.image || item.featured.thumbnailUrl || ''}
                      alt={item.featured.title}
                      className="w-full h-full object-cover"
                      objectPosition={getObjectPosition(item.featured)}
                      preferSize="small"
                      sizes="118px"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <h4 className="text-sm font-bold leading-relaxed line-clamp-3 group-hover:text-primary transition-colors">
                    {item.featured.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {item.featured.meta.badge && (
                      <Badge
                        variant={item.featured.meta.badge === "عاجل" ? "destructive" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {item.featured.meta.badge}
                      </Badge>
                    )}
                    <span>{expandShortAge(item.featured.meta.age)}</span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Headlines: full two lines, thin dividers */}
            {item.list.length > 0 && (
              <ul className="mt-2.5">
                {item.list.slice(0, 3).map((article, idx) => (
                  <li key={article.id} className="border-t border-border/70 dark:border-border/50">
                    <Link href={article.href}>
                      <h5
                        className="text-[13px] leading-relaxed font-medium line-clamp-2 py-2.5 hover:text-primary transition-colors"
                        data-testid={`mobile-list-item-${idx}`}
                      >
                        {article.title}
                      </h5>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// Loading Skeleton
function QuadCategoriesSkeleton() {
  return (
    <div className="space-y-4">
      {/* Mobile Skeleton - Compact */}
      <div className="lg:hidden space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card shadow-sm border border-border dark:border-card-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-12" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="w-28 h-20 rounded flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
              </div>
            </div>
            <div className="space-y-1.5 pt-2 border-t">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-3 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tablet/Desktop Skeleton */}
      <div className="hidden lg:grid lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="aspect-[16/9] w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            {[1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-12 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Component
interface QuadCategoriesBlockProps {
  enabled?: boolean;
}

export function QuadCategoriesBlock({ enabled = true }: QuadCategoriesBlockProps) {
  const { data, isLoading } = useQuery<QuadCategoriesData>({
    queryKey: ["/api/blocks/quad-categories"],
    enabled,
  });

  // Filter out AI categories from the quad block
  const filteredData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      items: data?.items?.filter(item => !isAICategory({ id: '', slug: item.category.slug }))
    };
  }, [data]);

  if (isLoading) {
    return <QuadCategoriesSkeleton />;
  }

  if (!filteredData || filteredData.items.length === 0) {
    return null;
  }

  return (
    <div 
      data-testid="quad-categories-block"
      className="w-full"
      style={filteredData.backgroundColor ? { backgroundColor: filteredData.backgroundColor } : undefined}
    >
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-6">
          {/* Mobile View: Compact List (always on mobile) */}
          <div className="lg:hidden">
            <MobileCompactList items={filteredData.items} />
          </div>

          {/* Tablet View: 2 columns */}
          <div className="hidden lg:grid xl:hidden grid-cols-2 gap-4">
            {filteredData.items.map((item, index) => (
              <CategoryColumn key={item.category.slug} data={item} index={index} />
            ))}
          </div>

          {/* Desktop View: 4 columns */}
          <div className="hidden xl:grid grid-cols-4 gap-4">
            {filteredData.items.map((item, index) => (
              <CategoryColumn key={item.category.slug} data={item} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
