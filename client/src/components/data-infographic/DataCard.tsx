import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface DataCardProps {
  title: string;
  value?: string | number;
  description?: string;
  icon?: LucideIcon;
  iconColor?: string;
  children?: React.ReactNode;
  variant?: "default" | "outlined" | "glass";
  delay?: number;
  className?: string;
}

export function DataCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = "text-indigo-500",
  children,
  variant = "default",
  delay = 0,
  className,
}: DataCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const variantStyles = {
    default: "bg-card border border-border shadow-sm",
    outlined: "bg-transparent border-2 border-indigo-500/30",
    glass: "bg-white/10 dark:bg-black/20 backdrop-blur-lg border border-white/20",
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "rounded-xl p-5 transition-shadow hover:shadow-lg",
        variantStyles[variant],
        className
      )}
      data-testid={`data-card-${title.replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={isInView ? { scale: 1, rotate: 0 } : {}}
            transition={{ delay: delay + 0.2, type: "spring", stiffness: 200 }}
            className={cn(
              "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-indigo-500/10 to-violet-500/10"
            )}
          >
            <Icon className={cn("w-6 h-6", iconColor)} />
          </motion.div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-lg mb-1">{title}</h3>
          
          {value !== undefined && (
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {typeof value === "number" ? value.toLocaleString("ar-SA") : value}
            </p>
          )}
          
          {description && (
            <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
              {description}
            </p>
          )}
          
          {children}
        </div>
      </div>
    </motion.div>
  );
}
