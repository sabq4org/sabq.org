import { Eye, Flame } from "lucide-react";

interface ViewsCountProps {
  views: number;
  className?: string;
  iconClassName?: string;
  showFlame?: boolean;
  flameThreshold?: number;
}

export function ViewsCount({ 
  views, 
  className = "", 
  iconClassName = "h-3 w-3",
  showFlame = true,
  flameThreshold = 10000
}: ViewsCountProps) {
  const isTrending = showFlame && views >= flameThreshold;
  
  return (
    <div className={`flex items-center gap-1 ${className}`} data-testid="views-count">
      <Eye className={iconClassName} />
      <span>{views.toLocaleString()}</span>
      {isTrending && (
        <Flame className={`${iconClassName} text-orange-500`} data-testid="icon-flame-trending" />
      )}
    </div>
  );
}
