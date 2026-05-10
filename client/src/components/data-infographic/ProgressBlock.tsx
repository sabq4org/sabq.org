import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressItem {
  label: string;
  value: number;
  maxValue?: number;
  color?: string;
}

interface ProgressBlockProps {
  title?: string;
  items: ProgressItem[];
  showPercentage?: boolean;
  variant?: "bar" | "circle";
  delay?: number;
  className?: string;
}

function AnimatedBar({ 
  item, 
  index, 
  isInView, 
  showPercentage 
}: { 
  item: ProgressItem; 
  index: number; 
  isInView: boolean;
  showPercentage: boolean;
}) {
  const maxVal = item.maxValue || 100;
  const percentage = Math.min((item.value / maxVal) * 100, 100);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setWidth(percentage), index * 100);
      return () => clearTimeout(timer);
    }
  }, [isInView, percentage, index]);

  const colors = [
    "bg-primary",
    "bg-success",
    "bg-warning",
    "bg-destructive",
    "bg-info",
  ];

  const barColor = item.color || colors[index % colors.length];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{item.label}</span>
        {showPercentage && (
          <span className="text-sm font-bold text-muted-foreground">
            {item.value.toLocaleString("ar-SA")}
            {item.maxValue ? ` / ${item.maxValue.toLocaleString("ar-SA")}` : "%"}
          </span>
        )}
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 1, delay: index * 0.1, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

export function ProgressBlock({
  title,
  items,
  showPercentage = true,
  delay = 0,
  className,
}: ProgressBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={cn(
        "bg-card rounded-2xl p-6 border border-border shadow-sm",
        className
      )}
      data-testid="progress-block"
    >
      {title && (
        <h3 className="text-lg font-bold text-foreground mb-6">{title}</h3>
      )}
      
      <div className="space-y-5">
        {items.map((item, index) => (
          <AnimatedBar
            key={item.label}
            item={item}
            index={index}
            isInView={isInView}
            showPercentage={showPercentage}
          />
        ))}
      </div>
    </motion.div>
  );
}
