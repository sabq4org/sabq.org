import { Link } from "wouter";
import { motion } from "framer-motion";
import { AlertCircle, Zap } from "lucide-react";
import type { TickerTemplateProps } from "@/lib/publishing/types";

export default function TickerInline({
  items,
  title,
  accent = "#dc2626",
  speed = "medium",
  pauseOnHover = true,
  className,
  onItemClick,
}: TickerTemplateProps) {
  const duration = {
    slow: 30,
    medium: 20,
    fast: 10,
  }[speed];

  return (
    <section
      dir="rtl"
      aria-label={title || "شريط الأخبار العاجلة"}
      className={`w-full ${className || ""}`}
      data-testid="template-ticker-inline"
      role="marquee"
    >
      <div 
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: accent }}
      >
        <div 
          className="flex items-center px-4 py-2 text-white"
          style={{ backgroundColor: accent }}
        >
          <Zap className="w-4 h-4 ml-2 flex-shrink-0" />
          <span className="text-sm font-bold">{title || "عاجل"}</span>
        </div>

        <div className="relative overflow-hidden bg-card">
          <motion.div
            className={`flex gap-8 py-3 ${pauseOnHover ? "hover:pause" : ""}`}
            animate={{
              x: [0, -1000],
            }}
            transition={{
              x: {
                duration: duration,
                repeat: Infinity,
                ease: "linear",
              },
            }}
          >
            {/* Duplicate items for seamless loop */}
            {[...items, ...items].map((item, index) => (
              <Link key={`${item.id}-${index}`} href={`/${item.slug}`}>
                <a
                  className="flex items-center gap-2 whitespace-nowrap group"
                  onClick={() => onItemClick?.(item, index % items.length)}
                >
                  <AlertCircle className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-foreground group-hover:underline">
                    {item.title}
                  </span>
                </a>
              </Link>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
