import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface ChartSegment {
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  title?: string;
  data: ChartSegment[];
  centerLabel?: string;
  centerValue?: string | number;
  size?: "sm" | "md" | "lg";
  delay?: number;
  className?: string;
}

const defaultColors = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--info))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-5))",
];

const sizeMap = {
  sm: { svg: 150, stroke: 25, radius: 50 },
  md: { svg: 200, stroke: 30, radius: 70 },
  lg: { svg: 280, stroke: 40, radius: 100 },
};

export function DonutChart({
  title,
  data,
  centerLabel,
  centerValue,
  size = "md",
  delay = 0,
  className,
}: DonutChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  
  const { svg, stroke, radius } = sizeMap[size];
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  let currentOffset = circumference * 0.25; // Start from top

  const segments = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const dashArray = (percentage / 100) * circumference;
    const dashOffset = currentOffset;
    currentOffset -= dashArray;
    
    return {
      ...item,
      percentage,
      dashArray,
      dashOffset,
      color: item.color || defaultColors[index % defaultColors.length],
    };
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={isInView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={cn("flex flex-col items-center", className)}
      data-testid="donut-chart"
    >
      {title && (
        <h3 className="text-lg font-bold text-foreground mb-6">{title}</h3>
      )}

      <div className="relative" style={{ width: svg, height: svg }}>
        <svg
          width={svg}
          height={svg}
          viewBox={`0 0 ${svg} ${svg}`}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={svg / 2}
            cy={svg / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted/20"
          />

          {/* Data segments */}
          {segments.map((segment, index) => (
            <motion.circle
              key={segment.label}
              cx={svg / 2}
              cy={svg / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${segment.dashArray} ${circumference}`}
              strokeDashoffset={segment.dashOffset}
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={isInView ? { 
                strokeDasharray: `${segment.dashArray} ${circumference}` 
              } : {}}
              transition={{ 
                duration: 1.2, 
                delay: delay + 0.3 + index * 0.1,
                ease: "easeOut" 
              }}
            />
          ))}
        </svg>

        {/* Center content */}
        {(centerValue || centerLabel) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: delay + 0.5, duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            {centerValue && (
              <span className="text-2xl md:text-3xl font-bold text-foreground">
                {typeof centerValue === "number" 
                  ? centerValue.toLocaleString("ar-SA") 
                  : centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="text-sm text-muted-foreground">{centerLabel}</span>
            )}
          </motion.div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-6">
        {segments.map((segment, index) => (
          <motion.div
            key={segment.label}
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: delay + 0.6 + index * 0.05 }}
            className="flex items-center gap-2"
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-sm text-muted-foreground">
              {segment.label}
              <span className="font-medium text-foreground mr-1">
                {" "}({segment.percentage.toFixed(0)}%)
              </span>
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
