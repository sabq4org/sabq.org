import { useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Play, Clock } from "lucide-react";
import type { ArticleItem } from "@/lib/publishing/types";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface VideoReelProps {
  items: ArticleItem[];
  title?: string;
  accent?: string;
  autoplay?: boolean;
  className?: string;
  onItemClick?: (item: ArticleItem, index: number) => void;
}

export default function VideoReel({
  items,
  title,
  accent = "#7c3aed",
  className,
  onItemClick,
}: VideoReelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <section
      dir="rtl"
      aria-label={title || "مقاطع الفيديو"}
      className={`w-full ${className || ""}`}
      data-testid="template-video-reel"
    >
      {title && (
        <div className="flex items-center gap-2 mb-4">
          <div 
            className="w-1 h-6 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <h2 className="text-xl md:text-2xl font-bold text-foreground">
            {title}
          </h2>
        </div>
      )}

      {/* Horizontal Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-4 scroll-smooth scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {items.map((item, index) => (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
            className="group flex-shrink-0 w-72 rounded-lg overflow-hidden border bg-card hover-elevate active-elevate-2 transition-all"
            data-testid={`video-card-${item.id}`}
          >
            {/* Video Thumbnail */}
            <Link href={`/${item.slug}`}>
              <a onClick={() => onItemClick?.(item, index)}>
                <div className="relative aspect-[16/9] bg-black overflow-hidden">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}

                  {/* Play Icon Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                    <div 
                      className="flex items-center justify-center w-14 h-14 rounded-full"
                      style={{ backgroundColor: accent }}
                    >
                      <Play className="w-6 h-6 text-white fill-white mr-0.5" />
                    </div>
                  </div>

                  {/* Duration Badge (if available) */}
                  {item.readingTime && (
                    <div className="absolute bottom-2 left-2 bg-black/80 text-white px-2 py-0.5 rounded text-xs font-medium">
                      {item.readingTime}:00
                    </div>
                  )}
                </div>
              </a>
            </Link>

            {/* Video Info */}
            <div className="p-3">
              {/* Category */}
              {item.category && (
                <span
                  className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white mb-2"
                  style={{ backgroundColor: item.category.color || accent }}
                >
                  {item.category.name}
                </span>
              )}

              {/* Title */}
              <Link href={`/${item.slug}`}>
                <a onClick={() => onItemClick?.(item, index)}>
                  <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-2 group-hover:underline">
                    {item.title}
                  </h3>
                </a>
              </Link>

              {/* Meta */}
              {item.publishedAt && (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
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
