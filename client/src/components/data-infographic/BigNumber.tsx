import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface BigNumberProps {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  icon?: LucideIcon;
  color?: "primary" | "accent" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
  delay?: number;
  className?: string;
}

const colorStyles = {
  primary: "bg-primary text-primary-foreground",
  accent: "bg-warning text-warning-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
};

const sizeStyles = {
  sm: { number: "text-3xl", label: "text-sm", padding: "p-4", icon: "w-6 h-6" },
  md: { number: "text-5xl", label: "text-base", padding: "p-6", icon: "w-8 h-8" },
  lg: { number: "text-6xl", label: "text-lg", padding: "p-8", icon: "w-10 h-10" },
  xl: { number: "text-7xl md:text-8xl", label: "text-xl", padding: "p-10", icon: "w-12 h-12" },
};

function useCountUp(end: number, duration: number = 2000, start: boolean = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!start) return;
    
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(easeOutQuart * end));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration, start]);

  return count;
}

export function BigNumber({
  value,
  label,
  suffix = "",
  prefix = "",
  icon: Icon,
  color = "primary",
  size = "md",
  animate = true,
  delay = 0,
  className,
}: BigNumberProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setShouldAnimate(true), delay * 1000);
      return () => clearTimeout(timer);
    }
  }, [isInView, delay]);

  const displayValue = useCountUp(value, 2000, animate && shouldAnimate);
  const styles = sizeStyles[size];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl shadow-lg",
        colorStyles[color],
        styles.padding,
        className
      )}
      data-testid={`big-number-${label.replace(/\s+/g, "-")}`}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-white/20 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full bg-white/10 translate-x-1/3 translate-y-1/3" />
      </div>

      <div className="relative flex flex-col items-center text-center gap-2">
        {Icon && (
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : {}}
            transition={{ delay: delay + 0.2, type: "spring", stiffness: 200 }}
            className={cn("opacity-80", styles.icon)}
          >
            <Icon className="w-full h-full" />
          </motion.div>
        )}

        <div className={cn("font-bold tracking-tight", styles.number)}>
          <span>{prefix}</span>
          <span>{animate ? displayValue.toLocaleString("ar-SA") : value.toLocaleString("ar-SA")}</span>
          <span>{suffix}</span>
        </div>

        <p className={cn("font-medium opacity-90", styles.label)}>
          {label}
        </p>
      </div>
    </motion.div>
  );
}
