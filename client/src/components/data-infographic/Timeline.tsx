import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  color?: "primary" | "accent" | "success" | "warning" | "danger";
}

interface TimelineProps {
  title?: string;
  events: TimelineEvent[];
  delay?: number;
  className?: string;
}

const dotColors = {
  primary: "bg-indigo-500 ring-indigo-500/20",
  accent: "bg-amber-500 ring-amber-500/20",
  success: "bg-emerald-500 ring-emerald-500/20",
  warning: "bg-yellow-500 ring-yellow-500/20",
  danger: "bg-rose-500 ring-rose-500/20",
};

export function Timeline({
  title,
  events,
  delay = 0,
  className,
}: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={cn("relative", className)}
      data-testid="timeline-block"
    >
      {title && (
        <h3 className="text-xl font-bold text-foreground mb-8">{title}</h3>
      )}

      <div className="relative">
        {/* Vertical line */}
        <motion.div
          initial={{ scaleY: 0 }}
          animate={isInView ? { scaleY: 1 } : {}}
          transition={{ duration: 0.8, delay: delay + 0.2 }}
          style={{ originY: 0 }}
          className="absolute right-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-500 via-violet-500 to-indigo-500/20"
        />

        <div className="space-y-8">
          {events.map((event, index) => {
            const Icon = event.icon;
            const color = event.color || "primary";

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: delay + 0.3 + index * 0.15 }}
                className="relative pr-12"
              >
                {/* Timeline dot */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={isInView ? { scale: 1 } : {}}
                  transition={{ 
                    delay: delay + 0.4 + index * 0.15, 
                    type: "spring", 
                    stiffness: 300 
                  }}
                  className={cn(
                    "absolute right-2 top-1 w-5 h-5 rounded-full ring-4",
                    "flex items-center justify-center",
                    dotColors[color]
                  )}
                >
                  {Icon && <Icon className="w-2.5 h-2.5 text-white" />}
                </motion.div>

                <div className="bg-card rounded-xl p-4 border border-border shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-xs font-medium text-indigo-500 dark:text-indigo-400">
                    {event.date}
                  </span>
                  <h4 className="font-semibold text-foreground mt-1">
                    {event.title}
                  </h4>
                  {event.description && (
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {event.description}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
