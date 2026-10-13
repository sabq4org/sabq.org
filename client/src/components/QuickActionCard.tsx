import { memo, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, LucideIcon } from "lucide-react";
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
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl p-3.5 cursor-pointer transition-all duration-200 sm:p-4",
        "bg-card border border-border/70 shadow-sm",
        "hover:border-primary/40 hover:bg-muted/20 hover:shadow-md hover:-translate-y-0.5",
        "active:translate-y-0 active:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 sm:h-11 sm:w-11",
            "group-hover:scale-105",
            iconBgColor
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <ArrowLeft className="h-4 w-4 text-muted-foreground/50 transition-transform duration-200 group-hover:-translate-x-1 group-hover:text-primary" />
      </div>
      <div className="mt-3 space-y-1 text-right">
        <h3 className="text-sm font-bold leading-tight text-foreground">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-1">
          {description}
        </p>
      </div>
    </div>
  );
};

export const QuickActionCard = memo(QuickActionCardComponent);
