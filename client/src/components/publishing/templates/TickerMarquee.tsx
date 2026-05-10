import { Link } from "wouter";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import type { TickerTemplateProps } from "@/lib/publishing/types";

export default function TickerMarquee({
  items,
  title,
  accent = "#dc2626",
  speed = "fast",
  className,
  onItemClick,
}: TickerTemplateProps) {
  const duration = {
    slow: 30,
    medium: 20,
    fast: 10,
  }[speed];

  // Triple items for seamless infinite loop
  const repeatedItems = [...items, ...items, ...items];

  return (
    <section
      dir="rtl"
      aria-label={title || "شريط الأخبار العاجلة"}
      className={`w-full ${className || ""}`}
      data-testid="template-ticker-marquee"
      role="marquee"
      aria-live="polite"
    >
      <div 
        className="rounded-lg overflow-hidden shadow-md"
        style={{ backgroundColor: accent }}
      >
        <div className="flex items-center px-4 py-2 text-white border-b border-white/20">
          <Zap className="w-4 h-4 ml-2 flex-shrink-0 animate-pulse" />
          <span className="text-sm font-bold">{title || "عاجل الآن"}</span>
        </div>

        <div className="relative overflow-hidden py-2" style={{ backgroundColor: `${accent}dd` }}>
          <motion.div
            className="flex gap-8 whitespace-nowrap"
            animate={{
              x: [0, -2000],
            }}
            transition={{
              x: {
                duration: duration,
                repeat: Infinity,
                ease: "linear",
              },
            }}
          >
            {repeatedItems.map((item, index) => (
              <Link key={`${item.id}-${index}`} href={`/${item.slug}`}>
                <a
                  className="inline-flex items-center gap-2 text-white hover:text-white/80 transition-colors"
                  onClick={() => onItemClick?.(item, index % items.length)}
                >
                  <span className="text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="text-white/60">•</span>
                </a>
              </Link>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
