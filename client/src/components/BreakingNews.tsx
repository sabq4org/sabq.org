import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock } from "lucide-react";
import type { ArticleWithDetails } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { OptimizedImage } from "./OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";

interface BreakingNewsProps {
  articles: ArticleWithDetails[];
}

export function BreakingNews({ articles }: BreakingNewsProps) {
  if (!articles || articles.length === 0) return null;

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-destructive" />
        <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-breaking-news">
          الأخبار العاجلة
        </h2>
      </div>

      <div className="space-y-3">
        {articles.map((article, index) => (
          <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
            <div 
              className="flex gap-4 p-4 bg-card rounded-lg border-r-4 border-destructive cursor-pointer"
              data-testid={`item-breaking-${article.id}`}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <span className="text-sm font-bold text-destructive">
                  {index + 1}
                </span>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {article.category && (
                    <Badge variant="outline" className="text-xs">
                      {article.category.nameAr}
                    </Badge>
                  )}
                  {article.publishedAt && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(article.publishedAt), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </span>
                  )}
                </div>

                <h3 
                  className="font-semibold text-base line-clamp-2 text-foreground"
                  data-testid={`text-breaking-title-${article.id}`}
                >
                  {article.title}
                </h3>
              </div>

              {article.imageUrl && (
                <OptimizedImage
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-20 h-20 object-cover rounded-md flex-shrink-0"
                  objectPosition={getObjectPosition(article)}
                />
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
