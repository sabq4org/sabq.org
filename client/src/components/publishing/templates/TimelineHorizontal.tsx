import { useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { TimelineTemplateProps } from "@/lib/publishing/types";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function TimelineHorizontal({
  items,
  title,
  accent = "hsl(var(--primary))",
  showDates = true,
  className,
  onItemClick,
}: TimelineTemplateProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section
      dir="rtl"
      aria-label={title || "الخط الزمني"}
      className={`w-full ${className || ""}`}
      data-testid="template-timeline-horizontal"
    >
      {title && (
        <h2 className="text-xl md:text-2xl font-bold text-foreground mb-6">
          {title}
        </h2>
      )}

      <div className="relative group">
        {/* Navigation Arrows - Desktop Only */}
        <button
          onClick={() => scroll("right")}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-background/90 border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover-elevate active-elevate-2"
          aria-label="التالي"
          data-testid="scroll-next"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          onClick={() => scroll("left")}
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-background/90 border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover-elevate active-elevate-2"
          aria-label="السابق"
          data-testid="scroll-prev"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Horizontal Timeline */}
        <div className="relative">
          {/* Timeline Line */}
          <div 
            className="absolute top-8 right-0 left-0 h-0.5"
            style={{ backgroundColor: accent, opacity: 0.3 }}
          />

          {/* Scrollable Container */}
          <div
            ref={scrollContainerRef}
            className="flex gap-6 overflow-x-auto pb-4 scroll-smooth scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {items.map((item, index) => (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="relative flex-shrink-0 w-64"
                data-testid={`timeline-h-item-${item.id}`}
              >
                {/* Timeline Dot */}
                <div className="flex justify-center mb-4">
                  <div 
                    className="w-4 h-4 rounded-full border-2 bg-background relative"
                    style={{ borderColor: accent }}
                  >
                    <div 
                      className="absolute inset-0.5 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                  </div>
                </div>

                {/* Card */}
                <div className="rounded-lg border bg-card p-3 hover-elevate active-elevate-2 transition-all">
                  {/* Image */}
                  {item.image && (
                    <Link href={`/${item.slug}`}>
                      <a onClick={() => onItemClick?.(item, index)}>
                        <div className="relative aspect-[16/9] rounded-md overflow-hidden mb-3">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                      </a>
                    </Link>
                  )}

                  {/* Date */}
                  {showDates && item.publishedAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <Clock className="w-3 h-3" />
                      <span>
                        {format(new Date(item.publishedAt), "d MMM yyyy", { locale: ar })}
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
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 hover:underline">
                        {item.title}
                      </h3>
                    </a>
                  </Link>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
