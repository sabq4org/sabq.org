import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";

interface RecommendationsWidgetProps {
  articles: ArticleWithDetails[];
  title?: string;
  reason?: string;
}

export function RecommendationsWidget({ 
  articles, 
  title = "مقترحات لك",
  reason = "بناءً على قراءاتك السابقة" 
}: RecommendationsWidgetProps) {
  if (articles.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-br from-primary/5 to-accent/5 border-b space-y-2 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {reason}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {articles.map((article, index) => {
            const timeAgo = article.publishedAt
              ? formatDistanceToNow(new Date(article.publishedAt), {
                  addSuffix: true,
                  locale: arSA,
                })
              : null;

            return (
              <Link 
                key={article.id} 
                href={`/article/${article.englishSlug || article.slug}`}
                className="block group"
                data-testid={`link-recommendation-${article.id}`}
              >
                <div className="p-4 hover-elevate active-elevate-2 transition-all">
                  <div className="flex gap-3">
                    {/* Image */}
                    <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                      {article.imageUrl ? (
                        <img
                          src={article.imageUrl}
                          alt={article.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                          style={{
                            objectPosition: getObjectPosition(article)
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Title */}
                      <h4 className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors" data-testid={`text-rec-title-${article.id}`}>
                        {article.title}
                      </h4>

                      {/* Meta Info */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {timeAgo && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo}
                          </span>
                        )}
                        {(article.commentsCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {article.commentsCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
