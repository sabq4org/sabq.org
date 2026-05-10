import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SectionDividerProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  color?: "primary" | "accent" | "success" | "danger";
  delay?: number;
  className?: string;
}

const colorStyles = {
  primary: {
    icon: "bg-primary text-primary-foreground",
    line: "from-transparent via-primary to-transparent",
    text: "text-primary",
  },
  accent: {
    icon: "bg-warning text-warning-foreground",
    line: "from-transparent via-warning to-transparent",
    text: "text-warning dark:text-warning",
  },
  success: {
    icon: "bg-success text-success-foreground",
    line: "from-transparent via-success to-transparent",
    text: "text-success dark:text-success",
  },
  danger: {
    icon: "bg-destructive text-destructive-foreground",
    line: "from-transparent via-destructive to-transparent",
    text: "text-destructive",
  },
};

export function SectionDivider({
  title,
  subtitle,
  icon: Icon,
  color = "primary",
  delay = 0,
  className,
}: SectionDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const styles = colorStyles[color];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : {}}
      transition={{ duration: 0.6, delay }}
      className={cn("py-12", className)}
      data-testid={`section-${title.replace(/\s+/g, "-")}`}
    >
      {/* Animated line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={isInView ? { scaleX: 1 } : {}}
        transition={{ duration: 0.8, delay: delay + 0.1 }}
        className={cn("h-px w-full bg-gradient-to-l mb-8", styles.line)}
      />

      <div className="flex items-center gap-4">
        {Icon && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={isInView ? { scale: 1, rotate: 0 } : {}}
            transition={{ delay: delay + 0.2, type: "spring", stiffness: 200 }}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
              styles.icon
            )}
          >
            <Icon className="w-6 h-6" />
          </motion.div>
        )}

        <div>
          <motion.h2
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: delay + 0.3 }}
            className={cn("text-2xl md:text-3xl font-bold", styles.text)}
          >
            {title}
          </motion.h2>
          
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: delay + 0.4 }}
              className="text-muted-foreground mt-1"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
