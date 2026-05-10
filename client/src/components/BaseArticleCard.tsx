import { ArticleCard } from "./ArticleCard";
import { NewsArticleCard } from "./NewsArticleCard";
import { AIArticleCard } from "./AIArticleCard";
import { InfographicArticleCard } from "./InfographicArticleCard";
import type { ArticleWithDetails } from "@shared/schema";

interface BaseArticleCardProps {
  article: ArticleWithDetails;
  variant?: "grid" | "featured" | "list" | "compact";
  cardType?: "default" | "news" | "ai" | "infographic";
  onReact?: (articleId: string) => void;
  onBookmark?: (articleId: string) => void;
  hideCategory?: boolean;
  aiScore?: number;
  selectionReason?: "breaking" | "trending" | "featured" | "recommended";
}

/**
 * BaseArticleCard - A smart dispatcher component that routes to the appropriate
 * specialized article card component based on article type and card type props.
 * 
 * This component provides a unified interface for rendering different types of
 * article cards (default, news, AI-generated, and infographic) while maintaining
 * backward compatibility with existing specialized components.
 * 
 * @example
 * // Auto-detect type from article properties
 * <BaseArticleCard article={article} variant="grid" />
 * 
 * // Explicitly specify card type
 * <BaseArticleCard article={article} cardType="ai" variant="featured" aiScore={0.92} />
 */
export function BaseArticleCard({ 
  article, 
  variant = "grid", 
  cardType,
  onReact,
  onBookmark,
  hideCategory,
  aiScore,
  selectionReason,
}: BaseArticleCardProps) {
  // Auto-detect card type from article properties if not explicitly provided
  const resolvedType = cardType || (
    article.articleType === 'infographic' ? 'infographic' :
    article.aiGenerated ? 'ai' : 'default'
  );

  switch (resolvedType) {
    case 'infographic':
      // InfographicArticleCard doesn't support all variants
      // Convert "list" to "grid" since InfographicArticleCard only supports grid/featured/compact
      return (
        <InfographicArticleCard 
          article={article} 
          variant={variant === "list" ? "grid" : (variant as "grid" | "featured" | "compact")}
        />
      );

    case 'ai':
      // AIArticleCard doesn't support "compact" variant - convert to "grid"
      return (
        <AIArticleCard 
          article={article} 
          variant={variant === "compact" ? "grid" : (variant as "grid" | "featured" | "list")}
          aiScore={aiScore}
          selectionReason={selectionReason}
          onReact={onReact}
          onBookmark={onBookmark}
        />
      );

    case 'news':
      // NewsArticleCard uses "viewMode" prop instead of "variant"
      // It doesn't support "featured" variant - convert to "grid"
      return (
        <NewsArticleCard 
          article={article} 
          viewMode={variant === "featured" ? "grid" : (variant as "grid" | "list" | "compact")}
          hideCategory={hideCategory}
        />
      );

    case 'default':
    default:
      return (
        <ArticleCard 
          article={article} 
          variant={variant}
          onReact={onReact}
          onBookmark={onBookmark}
        />
      );
  }
}
