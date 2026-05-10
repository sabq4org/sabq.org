import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import type { TimelineTemplateProps } from "@/lib/publishing/types";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function TimelineVertical({
  items,
  title,
  accent = "hsl(var(--primary))",
  showDates = true,
  className,
  onItemClick,
}: TimelineTemplateProps) {
  return (
    <section
      dir="rtl"
      aria-label={title || "الخط الزمني"}
      className={`w-full ${className || ""}`}
      data-testid="template-timeline-vertical"
    >
      {title && (
        <h2 className="text-xl md:text-2xl font-bold text-foreground mb-6">
          {title}
        </h2>
      )}

      <div className="relative">
        {/* Vertical Line */}
        <div 
          className="absolute right-6 top-0 bottom-0 w-0.5"
          style={{ backgroundColor: accent, opacity: 0.3 }}
        />

        {/* Timeline Items */}
        <div className="space-y-6">
          {items.map((item, index) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.08 }}
              className="relative pr-14 group"
              data-testid={`timeline-item-${item.id}`}
            >
              {/* Timeline Dot */}
              <div 
                className="absolute right-4 top-2 w-4 h-4 rounded-full border-2 bg-background"
                style={{ borderColor: accent }}
              >
                <div 
                  className="absolute inset-0.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              </div>

              {/* Content Card */}
              <div className="rounded-lg border bg-card p-4 hover-elevate active-elevate-2 transition-all">
                {/* Date */}
                {showDates && item.publishedAt && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <Clock className="w-3 h-3" />
                    <span>
                      {format(new Date(item.publishedAt), "d MMMM yyyy, HH:mm", { locale: ar })}
                    </span>
                  </div>
                )}

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
                    <h3 className="text-base font-semibold text-foreground mb-2 group-hover:underline">
                      {item.title}
                    </h3>
                  </a>
                </Link>

                {/* Excerpt */}
                {item.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.excerpt}
                  </p>
                )}

                {/* Image Thumbnail */}
                {item.image && (
                  <Link href={`/${item.slug}`}>
                    <a className="block mt-3" onClick={() => onItemClick?.(item, index)}>
                      <div className="relative aspect-[16/9] rounded-md overflow-hidden">
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
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
