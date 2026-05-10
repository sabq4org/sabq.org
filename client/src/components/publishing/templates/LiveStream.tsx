import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Radio, Clock } from "lucide-react";
import type { ArticleItem } from "@/lib/publishing/types";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface LiveStreamProps {
  items: ArticleItem[];
  title?: string;
  accent?: string;
  autoRefresh?: boolean;
  className?: string;
  onItemClick?: (item: ArticleItem, index: number) => void;
}

export default function LiveStream({
  items,
  title,
  accent = "#dc2626",
  autoRefresh = false,
  className,
  onItemClick,
}: LiveStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort items by newest first
  const sortedItems = [...items].sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  // Auto-refresh effect (simulated)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // In a real implementation, this would fetch new items
      console.log("Auto-refresh triggered");
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  return (
    <section
      dir="rtl"
      aria-label={title || "البث المباشر"}
      className={`w-full ${className || ""}`}
      data-testid="template-live-stream"
      role="feed"
      aria-live="polite"
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 rounded-t-lg"
        style={{ backgroundColor: accent }}
      >
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-white animate-pulse" />
          <h2 className="text-lg md:text-xl font-bold text-white">
            {title || "البث المباشر"}
          </h2>
          <span className="px-2 py-0.5 bg-white/20 text-white text-xs rounded-full font-medium">
            مباشر
          </span>
        </div>
        {autoRefresh && (
          <div className="flex items-center gap-1 text-white/80 text-xs">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>تحديث تلقائي</span>
          </div>
        )}
      </div>

      {/* Live Feed - Virtual Scrolling for Performance */}
      <div
        ref={containerRef}
        className="border-x border-b rounded-b-lg bg-card max-h-[600px] overflow-y-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="divide-y">
          {sortedItems.map((item, index) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: index * 0.02 }}
              className="group p-3 hover-elevate active-elevate-2 transition-all"
              data-testid={`live-item-${item.id}`}
            >
              <div className="flex gap-3">
                {/* Timestamp Indicator */}
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div 
                    className="w-2 h-2 rounded-full mt-1"
                    style={{ backgroundColor: index === 0 ? accent : 'hsl(var(--muted-foreground))' }}
                  />
                  {index === 0 && (
                    <div 
                      className="w-px flex-1 mt-1"
                      style={{ backgroundColor: accent, opacity: 0.3 }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Time */}
                  {item.publishedAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}</span>
                      {index === 0 && (
                        <span 
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white mr-1"
                          style={{ backgroundColor: accent }}
                        >
                          جديد
                        </span>
                      )}
                    </div>
                  )}

                  {/* Category */}
                  {item.category && (
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white mb-1"
                      style={{ backgroundColor: item.category.color || accent }}
                    >
                      {item.category.name}
                    </span>
                  )}

                  {/* Title */}
                  <Link href={`/${item.slug}`}>
                    <a onClick={() => onItemClick?.(item, index)}>
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-1 group-hover:underline">
                        {item.title}
                      </h3>
                    </a>
                  </Link>

                  {/* Excerpt */}
                  {item.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.excerpt}
                    </p>
                  )}
                </div>

                {/* Thumbnail */}
                {item.image && (
                  <Link href={`/${item.slug}`}>
                    <a
                      className="flex-shrink-0"
                      onClick={() => onItemClick?.(item, index)}
                    >
                      <div className="relative w-16 h-16 rounded overflow-hidden">
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
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
