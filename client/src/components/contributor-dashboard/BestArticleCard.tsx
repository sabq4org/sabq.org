import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Eye } from "lucide-react";

interface BestArticleCardProps {
  article: { id: string; title: string; views: number } | null;
  loading?: boolean;
  onNavigate?: (id: string) => void;
}

export function BestArticleCard({ article, loading, onNavigate }: BestArticleCardProps) {
  return (
    <Card className="hover-elevate border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          أفضل مقال هذا الأسبوع
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ) : article ? (
          <div
            className={onNavigate ? "cursor-pointer" : ""}
            onClick={() => onNavigate?.(article.id)}
          >
            <p className="font-semibold text-sm line-clamp-2 leading-relaxed">
              {article.title}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              <span>{article.views.toLocaleString()} مشاهدة</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد مقالات منشورة بعد</p>
        )}
      </CardContent>
    </Card>
  );
}
