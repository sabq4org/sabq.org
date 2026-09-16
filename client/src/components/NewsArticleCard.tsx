import { publicArticleText } from "./public/publicArticleText";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import type { ArticleWithDetails } from "@shared/schema";
import { ContentLabel, ContentStateLabels } from "./public/ContentLabel";
import { ArticleMedia } from "./public/ArticleMedia";
import { ArticleMeta } from "./public/ArticleMeta";
import { ArticleActions } from "./public/ArticleActions";
import { InfographicArticleCard } from "./InfographicArticleCard";
import "@/styles/public-news-card.css";

export type NewsCardViewMode = "grid" | "list" | "compact";
type NewsArticleCardProps = {
  article: ArticleWithDetails;
  viewMode: NewsCardViewMode;
  hideCategory?: boolean;
  priority?: boolean;
  locale?: "ar" | "en" | "ur";
  compact?: boolean;
  onClick?: (article: ArticleWithDetails) => void;
  onBookmark?: (articleId: string) => void;
  onShare?: (article: ArticleWithDetails) => void;
  metadata?: { views?: boolean; comments?: boolean };
  href?: string;
};
const hrefFor = (article: ArticleWithDetails, locale: "ar" | "en" | "ur") =>
  `${locale === "en" ? "/en" : locale === "ur" ? "/ur" : ""}/article/${article.englishSlug || article.slug}`;

export function NewsArticleCard({
  article: inputArticle,
  viewMode,
  hideCategory = false,
  priority = false,
  locale = "ar",
  compact = false,
  onClick,
  onBookmark,
  onShare,
  metadata,
  href,
}: NewsArticleCardProps) {
  // Resolve presentation from the public category catalog, so partial payloads
  // from feeds, tags and archives cannot assign different colors to one section.
  const { data: categoriesRaw } = useQuery<NonNullable<ArticleWithDetails["category"]>[]>({
    queryKey: ["/api/categories"],
    enabled: !hideCategory && Boolean(inputArticle.category || inputArticle.categoryId),
    staleTime: 5 * 60 * 1000,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];
  const category = categories.find(item => item.id === (inputArticle.categoryId || inputArticle.category?.id) || (inputArticle.category?.slug && item.slug === inputArticle.category.slug));
  const article = category ? { ...inputArticle, category: { ...inputArticle.category, ...category } } : inputArticle;
  const resolvedMode = compact ? "compact" : viewMode;
  if (article.articleType === "infographic")
    return (
      <InfographicArticleCard
        article={article}
        locale={locale}
        href={href}
        variant={resolvedMode === "compact" ? "compact" : "grid"}
      />
    );
  const labels = (
    <div className="public-labels flex flex-wrap items-center gap-2">
      <ContentLabel
        article={article}
        locale={locale}
        hideCategory={hideCategory}
      />
      <ContentStateLabels article={article} locale={locale} />
    </div>
  );
  const titleTestId =
    resolvedMode === "compact"
      ? `text-article-title-compact-${article.id}`
      : resolvedMode === "list"
        ? `text-article-title-${article.id}`
        : `text-article-title-${article.id}`;
  const content =
    resolvedMode === "list" ? (
      <>
        <ArticleMedia
          article={article}
          locale={locale}
          priority={priority}
          variant="list"
          className="public-card-media-list"
        />
        <div className="public-card-body min-w-0 flex-1">
          {labels}
          <h3
            data-testid={titleTestId}
            className="public-card-title line-clamp-2"
          >
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="public-card-excerpt line-clamp-2">
              {article.excerpt}
            </p>
          )}
          <ArticleMeta
            article={article}
            locale={locale}
            showViews={metadata?.views}
            showComments={metadata?.comments ?? true}
          />
        </div>
      </>
    ) : (
      <>
        <ArticleMedia
          article={article}
          locale={locale}
          priority={priority}
          variant={resolvedMode === "compact" ? "compact" : "grid"}
          className={
            resolvedMode === "compact"
              ? "public-card-media-compact"
              : "public-card-media-grid"
          }
        />
        <div className="public-card-body">
          {labels}
          <h3
            data-testid={titleTestId}
            className="public-card-title line-clamp-2"
          >
            {article.title}
          </h3>
          {resolvedMode === "grid" && article.excerpt && (
            <p className="public-card-excerpt line-clamp-2">
              {article.excerpt}
            </p>
          )}
          <ArticleMeta
            article={article}
            locale={locale}
            showViews={metadata?.views}
            showComments={metadata?.comments}
          />
        </div>
      </>
    );
  return (
    <Card
      className={`public-news-card public-news-card-${resolvedMode} group`}
      data-testid={`card-article-${resolvedMode}-${article.id}`}
      role="article"
      onClick={() => onClick?.(article)}
    >
      <Link
        href={href || hrefFor(article, locale)}
        className="public-card-link"
        aria-label={`${publicArticleText[locale].article}: ${article.title}`}
      >
        {content}
      </Link>
      {resolvedMode === "list" && (
        <ArticleActions
          article={article}
          onBookmark={onBookmark}
          onShare={onShare}
          href={href}
          locale={locale}
        />
      )}
    </Card>
  );
}
