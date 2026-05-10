import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock, Sparkles } from "lucide-react";
import type { ArticleWithDetails } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { OptimizedImage } from "./OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";

interface DeepDiveSectionProps {
  articles: ArticleWithDetails[];
}

export function DeepDiveSection({ articles }: DeepDiveSectionProps) {
  if (!articles || articles.length === 0) return null;

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-deep-dive">
          تحليلات وآراء
        </h2>
      </div>
      
      <p className="text-muted-foreground">
        مقالات تحليلية معمقة مدعومة بالذكاء الاصطناعي
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article) => (
          <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
            <Card 
              className="cursor-pointer h-full overflow-hidden border border-card-border"
              data-testid={`card-deep-dive-${article.id}`}
            >
              {article.imageUrl && (
                <div className="relative h-48 overflow-hidden">
                  <OptimizedImage
                    src={article.imageUrl}
                    alt={article.title}
                    className="w-full h-full object-cover"
                    objectPosition={getObjectPosition(article)}
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant="default" className="bg-primary">
                      <BarChart3 className="h-3 w-3 ml-1" />
                      تحليل معمق
                    </Badge>
                  </div>
                  {article.aiSummary && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-secondary">
                        <Sparkles className="h-3 w-3 ml-1" />
                        AI
                      </Badge>
                    </div>
                  )}
                </div>
              )}
              
              <CardContent className="p-4 space-y-3">
                {article.category && (
                  <Badge variant="outline" data-testid={`badge-category-${article.id}`}>
                    {article.category.nameAr}
                  </Badge>
                )}
                
                <h3 
                  className="font-bold text-lg line-clamp-2 text-foreground"
                  data-testid={`text-deep-dive-title-${article.id}`}
                >
                  {article.title}
                </h3>
                
                {article.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {article.excerpt}
                  </p>
                )}

                {article.publishedAt && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(article.publishedAt), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
