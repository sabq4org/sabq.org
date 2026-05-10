import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import type { Angle } from "@/lib/muqtarab";
import * as LucideIcons from "lucide-react";
import { Circle } from "lucide-react";

interface AngleCardProps {
  angle: Angle;
  articleCount?: number;
  onClick?: () => void;
}

function getIconComponent(iconKey: string) {
  const iconName = iconKey as keyof typeof LucideIcons;
  const IconComponent = LucideIcons[iconName];
  
  if (IconComponent && typeof IconComponent === 'function') {
    return IconComponent as React.ComponentType<{ className?: string }>;
  }
  
  return Circle;
}

export function AngleCard({ angle, articleCount, onClick }: AngleCardProps) {
  const Icon = getIconComponent(angle.iconKey || 'Circle');

  return (
    <Link 
      href={`/muqtarab/${angle.slug}`}
      onClick={onClick}
      data-testid={`link-angle-${angle.id}`}
    >
      <Card 
        className="group relative overflow-hidden border border-card-border h-full"
        data-testid={`card-angle-${angle.id}`}
      >
        <div 
          className="absolute top-0 right-0 bottom-0 w-1"
          style={{ backgroundColor: angle.colorHex }}
          data-testid={`accent-bar-${angle.id}`}
        />
        
        <CardContent className="p-4 pr-6">
          <div className="flex items-start gap-4">
            <div 
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ 
                backgroundColor: `${angle.colorHex}15`,
                color: angle.colorHex 
              }}
              data-testid={`icon-container-${angle.id}`}
            >
              <Icon className="w-6 h-6" data-testid={`icon-${angle.id}`} />
            </div>

            <div className="flex-1 min-w-0">
              <h3 
                className="text-lg font-semibold mb-1.5 line-clamp-1 group-hover:text-primary transition-colors"
                data-testid={`text-name-${angle.id}`}
              >
                {angle.nameAr}
              </h3>
              
              {angle.shortDesc && (
                <p 
                  className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-3"
                  data-testid={`text-description-${angle.id}`}
                >
                  {angle.shortDesc}
                </p>
              )}

              {articleCount !== undefined && (
                <Badge 
                  variant="secondary" 
                  className="text-xs"
                  data-testid={`badge-count-${angle.id}`}
                >
                  {articleCount} مقال{articleCount !== 1 ? 'ة' : ''}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function AngleCardSkeleton() {
  return (
    <Card className="h-full">
      <div className="absolute top-0 right-0 bottom-0 w-1 bg-muted" />
      
      <CardContent className="p-4 pr-6">
        <div className="flex items-start gap-4">
          <Skeleton className="flex-shrink-0 w-12 h-12 rounded-full" />

          <div className="flex-1 min-w-0 space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
