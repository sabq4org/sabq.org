import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import type { ListTemplateProps } from "@/lib/publishing/types";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export default function NewsListBasic({
  items,
  title,
  accent = "hsl(var(--primary))",
  limit = 12,
  showMeta = true,
  showCategory = true,
  showImage = true,
  className,
  onItemClick,
  onView,
}: ListTemplateProps) {
  const displayItems = items.slice(0, limit);

  useEffect(() => {
    onView?.();
  }, [onView]);

  return (
    <section
      dir="rtl"
      aria-label={title || "قائمة الأخبار"}
      className={`w-full ${className || ""}`}
      data-testid="template-news-list-basic"
    >
      {title && (
        <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 pb-2 border-b-2" style={{ borderColor: accent }}>
          {title}
        </h2>
      )}

      <div className="space-y-3">
        {displayItems.map((item, index) => (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
            className="group flex gap-3 p-3 rounded-lg hover-elevate active-elevate-2 transition-all"
            data-testid={`article-item-${item.id}`}
          >
            {/* Thumbnail */}
            {showImage && item.image && (
              <Link href={`/${item.slug}`}>
                <a
                  className="flex-shrink-0"
                  onClick={() => onItemClick?.(item, index)}
                >
                  <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-md overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      loading="lazy"
                    />
                  </div>
                </a>
              </Link>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Category and Breaking Badge */}
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {/* Breaking News Badge */}
                {(item as any).newsType === "breaking" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-destructive text-destructive-foreground animate-pulse">
                    عاجل
                  </span>
                )}
                
                {/* Category */}
                {showCategory && item.category && (
                  <span
                    className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                    style={{ backgroundColor: item.category.color || accent }}
                  >
                    {item.category.name}
                  </span>
                )}
              </div>

              {/* Title */}
              <Link href={`/${item.slug}`}>
                <a onClick={() => onItemClick?.(item, index)}>
                  <h3 className="text-sm md:text-base font-semibold text-foreground line-clamp-2 mb-1 group-hover:underline">
                    {item.title}
                  </h3>
                </a>
              </Link>

              {/* Meta */}
              {showMeta && item.publishedAt && (
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}</span>
                  </div>
                </div>
              )}
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
