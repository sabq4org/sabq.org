import { memo, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useLocation } from "wouter";

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
  href?: string;
  onClick?: () => void;
  testId?: string;
  className?: string;
}

const QuickActionCardComponent = ({
  title,
  description,
  icon: Icon,
  iconColor,
  iconBgColor,
  href,
  onClick,
  testId,
  className,
}: QuickActionCardProps) => {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      setLocation(href);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-visible rounded-xl p-4 cursor-pointer transition-all duration-200",
        "bg-card/80 backdrop-blur-sm border border-border/50",
        "hover:bg-card hover:border-border hover:shadow-lg hover:-translate-y-0.5",
        "active:translate-y-0 active:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      data-testid={testId}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div
          className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center transition-transform duration-200",
            "group-hover:scale-110",
            iconBgColor
          )}
        >
          <Icon className={cn("h-6 w-6", iconColor)} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground leading-tight line-clamp-2 hidden sm:block">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};

export const QuickActionCard = memo(QuickActionCardComponent);
