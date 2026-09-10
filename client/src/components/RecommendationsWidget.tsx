import { ArticleSidebarHeading } from "./ArticleSidebarHeading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import type { ArticleWithDetails } from "@shared/schema";
import { NewsArticleCard } from "./NewsArticleCard";

interface RecommendationsWidgetProps {
  articles: ArticleWithDetails[];
  title?: string;
  reason?: string;
  editorial?: boolean;
}

export function RecommendationsWidget({ articles, title = "مقترحات لك", editorial = false, reason = "بناءً على قراءاتك السابقة" }: RecommendationsWidgetProps) {
  if (!articles?.length) return null;
  return <Card className="public-recommendations overflow-hidden">
    {editorial ? <ArticleSidebarHeading title={title} description={reason} icon={Sparkles} /> : (
      <CardHeader className="public-surface border-b space-y-2 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />{title}</CardTitle>
        <p className="public-meta">{reason}</p>
      </CardHeader>
    )}
    <CardContent className="p-0">
      <div className="divide-y">
        {articles.map(article => <div key={article.id} data-testid={`link-recommendation-${article.id}`}>
          <NewsArticleCard article={article} viewMode="compact" hideCategory metadata={{ comments: true }} />
        </div>)}
      </div>
    </CardContent>
  </Card>;
}
