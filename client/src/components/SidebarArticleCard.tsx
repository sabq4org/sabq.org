import { Link } from "wouter";
import { Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ArticleWithDetails } from "@shared/schema";
import { ArticleMedia } from "@/components/public/ArticleMedia";
import { formatArticleTimestamp } from "@/lib/formatTime";
import "@/styles/public-news-card.css";

export type SidebarArticleCardItem = {
  id: string;
  href: string;
  title: string;
  imageUrl?: string | null;
  updatedAt?: string | Date | null;
  publishedAt?: string | Date | null;
  /** Author name for opinion pieces, section name for recommendations. */
  byline?: string | null;
  /** Small round author photo shown before the byline (opinion pieces). */
  bylineAvatarUrl?: string | null;
  /** Focal point and AI-image flags flow through untouched when a full article is given. */
  media?: Partial<ArticleWithDetails>;
};

/**
 * The compact news card shape (thumbnail, title, meta) for every sidebar list, so
 * news, opinion pieces and AI picks read as one family. Reuses the public card
 * classes so the image treatment is identical to news cards elsewhere.
 */
export function SidebarArticleCard({
  item,
  testId,
  titleTestId,
  ariaLabel = "خبر",
}: {
  item: SidebarArticleCardItem;
  testId?: string;
  titleTestId?: string;
  ariaLabel?: string;
}) {
  const publishedDate = item.publishedAt ? new Date(item.publishedAt) : null;
  const hasDate = publishedDate !== null && !Number.isNaN(publishedDate.getTime());
  const mediaArticle = {
    ...item.media,
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl ?? item.media?.imageUrl ?? null,
    updatedAt: item.updatedAt ?? item.media?.updatedAt ?? null,
  } as unknown as ArticleWithDetails;

  return (
    <Card
      className="public-news-card public-news-card-compact group"
      data-testid={testId ?? `card-article-compact-${item.id}`}
      role="article"
    >
      <Link href={item.href} className="public-card-link" aria-label={`${ariaLabel}: ${item.title}`}>
        <ArticleMedia article={mediaArticle} variant="compact" className="public-card-media-compact" />
        <div className="public-card-body">
          <h3 data-testid={titleTestId ?? `text-article-title-compact-${item.id}`} className="public-card-title line-clamp-2">
            {item.title}
          </h3>
          {(item.byline || hasDate) && (
            <div className="public-meta sidebar-card-meta">
              {item.byline && (
                <span className="sidebar-card-byline">
                  {item.bylineAvatarUrl && (
                    <img
                      src={item.bylineAvatarUrl}
                      alt=""
                      className="sidebar-card-avatar"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {item.byline}
                </span>
              )}
              {hasDate && publishedDate && (
                <time
                  dateTime={publishedDate.toISOString()}
                  title={formatArticleTimestamp(publishedDate, { format: "absolute" })}
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatArticleTimestamp(publishedDate)}
                </time>
              )}
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
