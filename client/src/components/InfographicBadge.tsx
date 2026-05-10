import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfographicBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  dataTestId?: string;
}

export function InfographicBadge({ 
  className, 
  size = "md",
  dataTestId = "badge-infographic" 
}: InfographicBadgeProps) {
  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
    lg: "text-sm px-3 py-1.5 gap-2"
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4"
  };

  return (
    <Badge 
      className={cn(
        "bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600",
        "dark:from-blue-500 dark:via-purple-500 dark:to-indigo-500",
        "text-white border-0 shadow-lg",
        "hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700",
        "dark:hover:from-blue-600 dark:hover:via-purple-600 dark:hover:to-indigo-600",
        "transition-all duration-300",
        "backdrop-blur-sm",
        sizeClasses[size],
        className
      )}
      data-testid={dataTestId}
    >
      <BarChart3 className={cn(iconSizes[size], "drop-shadow-sm")} />
      <span className="font-semibold">إنفوجرافيك</span>
    </Badge>
  );
}

// Simplified version for compact views
export function InfographicBadgeIcon({ 
  className,
  dataTestId = "badge-infographic-icon" 
}: { 
  className?: string;
  dataTestId?: string;
}) {
  return (
    <Badge 
      className={cn(
        "bg-gradient-to-r from-blue-600 to-purple-600",
        "dark:from-blue-500 dark:to-purple-500",
        "text-white border-0 shadow-md",
        "p-1.5",
        className
      )}
      data-testid={dataTestId}
    >
      <BarChart3 className="h-3.5 w-3.5" />
    </Badge>
  );
}