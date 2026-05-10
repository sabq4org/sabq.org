import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, MessageSquare, BookOpen, Flame } from "lucide-react";
import type { ListTemplateProps } from "@/lib/publishing/types";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

// Helper function to check if article is new (published within last 30 minutes)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInMinutes = (now.getTime() - published.getTime()) / (1000 * 60);
  return diffInMinutes <= 30;
};

export default function NewsListSummary({
  items,
  title,
  accent = "hsl(var(--primary))",
  limit = 12,
  showMeta = true,
  showCategory = true,
  showImage = true,
  showExcerpt = true,
  density = "cozy",
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
      data-testid="template-news-list-summary"
    >
      {title && (
        <h2 className="text-xl md:text-2xl font-bold text-foreground mb-6 pb-2 border-b-2" style={{ borderColor: accent }}>
          {title}
        </h2>
      )}

      <div className="space-y-6">
        {displayItems.map((item, index) => (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            className="group flex flex-col md:flex-row gap-4 p-4 rounded-lg border bg-card hover-elevate active-elevate-2 transition-all"
            data-testid={`article-summary-${item.id}`}
          >
            {/* Image */}
            {showImage && item.image && (
              <Link href={`/${item.slug}`}>
                <a
                  className="flex-shrink-0"
                  onClick={() => onItemClick?.(item, index)}
                >
                  <div className="relative w-full md:w-48 lg:w-56 aspect-[16/9] rounded-md overflow-hidden">
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
              {/* Category and Breaking/New Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* Breaking News Badge */}
                {item.newsType === "breaking" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-destructive text-destructive-foreground animate-pulse">
                    عاجل
                  </span>
                )}
                
                {/* New Article Badge */}
                {isNewArticle(item.publishedAt) && item.newsType !== "breaking" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white">
                    <Flame className="h-3 w-3" />
                    جديد
                  </span>
                )}

                {/* Category */}
                {showCategory && item.category && (
                  <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: item.category.color || accent }}
                  >
                    {item.category.name}
                  </span>
                )}
              </div>

              {/* Title */}
              <Link href={`/${item.slug}`}>
                <a onClick={() => onItemClick?.(item, index)}>
                  <h3 className="text-lg md:text-xl font-bold text-foreground line-clamp-2 mb-3 group-hover:underline decoration-2 underline-offset-4">
                    {item.title}
                  </h3>
                </a>
              </Link>

              {/* Excerpt */}
              {showExcerpt && item.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                  {item.excerpt}
                </p>
              )}

              {/* Meta Information */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                {/* Author/Reporter */}
                {(item.author || item.reporter) && (
                  <div className="flex items-center gap-2">
                    {(item.reporter || item.author)?.avatar && (
                      <img
                        src={(item.reporter || item.author)!.avatar!}
                        alt={(item.reporter || item.author)!.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    )}
                    <span className="font-medium text-foreground">
                      {(item.reporter || item.author)?.name}
                    </span>
                  </div>
                )}

                {showMeta && (
                  <>
                    {item.publishedAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}</span>
                      </div>
                    )}
                    {typeof item.readingTime === "number" && (
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{item.readingTime} دقيقة</span>
                      </div>
                    )}
                    {typeof item.commentsCount === "number" && (
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{item.commentsCount.toLocaleString("ar")}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
