import { memo, KeyboardEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileOptimizedKpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  suffix?: string;
  prefix?: string;
  testId?: string;
  className?: string;
  ariaLive?: boolean;
  onClick?: () => void;
}

const MobileOptimizedKpiCardComponent = ({
  label,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBgColor = "bg-primary/10",
  suffix,
  prefix,
  testId,
  className,
  ariaLive = false,
  onClick,
}: MobileOptimizedKpiCardProps) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    
    // Handle Enter and Space keys (standard button behavior)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();  // Prevent scroll on Space
      onClick();
    }
  };

  const isCompact = className?.includes('compact');

  return (
    <Card 
      className={cn(
        "hover-elevate transition-all",
        onClick && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className?.replace('compact', '').trim()
      )} 
      data-testid={testId}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick && className?.includes('ring-2') ? true : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <CardContent className={cn(
        isCompact ? "p-1.5 sm:p-2" : "p-2 sm:p-3 md:p-4"
      )}>
        <div className={cn(
          "flex items-center justify-between",
          isCompact ? "gap-1 sm:gap-2" : "gap-2 sm:gap-3 md:gap-4"
        )}>
          <div className="flex-1 min-w-0">
            <p 
              className={cn(
                "text-muted-foreground truncate",
                isCompact ? "text-[8px] sm:text-[10px] mb-0.5" : "text-[10px] sm:text-xs mb-1"
              )}
              data-testid={testId ? `${testId}-label` : undefined}
            >
              {label}
            </p>
            <h3 
              className={cn(
                "font-bold break-words",
                isCompact ? "text-sm sm:text-base md:text-lg" : "text-base sm:text-lg md:text-xl lg:text-2xl"
              )}
              data-testid={testId ? `${testId}-value` : undefined}
              role={ariaLive ? "status" : undefined}
              aria-live={ariaLive ? "polite" : undefined}
            >
              {prefix}
              {value}
              {suffix && (
                <span className={cn(
                  "font-normal text-muted-foreground mr-1",
                  isCompact ? "text-xs" : "text-sm sm:text-base"
                )}>
                  {suffix}
                </span>
              )}
            </h3>
          </div>
          <div className="flex-shrink-0">
            <div 
              className={cn(
                "rounded-full flex items-center justify-center",
                isCompact ? "h-5 w-5 sm:h-6 sm:w-6" : "h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10",
                iconBgColor
              )}
            >
              <Icon className={cn(
                iconColor,
                isCompact ? "h-2.5 w-2.5 sm:h-3 sm:w-3" : "h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5"
              )} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const MobileOptimizedKpiCard = memo(MobileOptimizedKpiCardComponent);
