import { Sparkles } from "lucide-react";
import type { ArticleWithDetails } from "@shared/schema";
import { ArticleSidebarModule } from "@/components/ArticleSidebarModule";
import { SidebarArticleCard } from "@/components/SidebarArticleCard";

interface RecommendationsWidgetProps {
  articles: ArticleWithDetails[];
  title?: string;
  reason?: string;
}

/** Latest stories from the section, in the shared sidebar card shape. */
export function RecommendationsWidget({ articles, title = "مقترحات لك", reason = "بناءً على قراءاتك السابقة" }: RecommendationsWidgetProps) {
  if (!articles?.length) return null;
  return (
    <ArticleSidebarModule title={title} description={reason} icon={Sparkles} testId="sidebar-recommendations">
      {articles.map(article => (
        <div key={article.id} data-testid={`link-recommendation-${article.id}`}>
          <SidebarArticleCard
            item={{
              id: article.id,
              href: `/article/${article.englishSlug || article.slug}`,
              title: article.title,
              publishedAt: article.publishedAt,
              updatedAt: article.updatedAt,
              media: article,
            }}
          />
        </div>
      ))}
    </ArticleSidebarModule>
  );
}
