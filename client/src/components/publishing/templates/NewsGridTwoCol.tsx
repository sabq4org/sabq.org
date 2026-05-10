import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, MessageSquare, Flame } from "lucide-react";
import type { GridTemplateProps } from "@/lib/publishing/types";
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

export default function NewsGridTwoCol({
  items,
  title,
  accent = "hsl(var(--primary))",
  limit = 12,
  showMeta = true,
  density = "cozy",
  className,
  onItemClick,
}: GridTemplateProps) {
  const displayItems = items.slice(0, limit);

  const padding = {
    compact: "p-2",
    cozy: "p-3",
    comfortable: "p-4",
  }[density];

  return (
    <section
      dir="rtl"
      aria-label={title || "شبكة الأخبار"}
      className={`w-full ${className || ""}`}
      data-testid="template-news-grid-two-col"
    >
      {title && (
        <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">
          {title}
        </h2>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {displayItems.map((item, index) => (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04 }}
            className="group overflow-hidden rounded-lg border bg-card shadow-sm hover-elevate active-elevate-2 transition-all"
            data-testid={`grid-item-${item.id}`}
          >
            {/* Image */}
            {item.image && (
              <Link href={`/${item.slug}`}>
                <a onClick={() => onItemClick?.(item, index)}>
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                </a>
              </Link>
            )}

            {/* Content */}
            <div className={padding}>
              {/* Category and Breaking/New Badges */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {/* Breaking News Badge */}
                {item.newsType === "breaking" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-destructive text-destructive-foreground animate-pulse">
                    عاجل
                  </span>
                )}
                
                {/* New Article Badge */}
                {isNewArticle(item.publishedAt) && item.newsType !== "breaking" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white">
                    <Flame className="h-3 w-3" />
                    جديد
                  </span>
                )}

                {/* Category */}
                {item.category && (
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
                  <h3 className="text-sm md:text-base font-semibold text-foreground line-clamp-2 mb-2 group-hover:underline">
                    {item.title}
                  </h3>
                </a>
              </Link>

              {/* Excerpt */}
              {item.excerpt && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {item.excerpt}
                </p>
              )}

              {/* Meta */}
              {showMeta && (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {item.publishedAt && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}</span>
                    </div>
                  )}
                  {typeof item.commentsCount === "number" && (
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      <span>{item.commentsCount.toLocaleString("ar")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
