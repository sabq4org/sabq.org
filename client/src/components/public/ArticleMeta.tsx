import { Clock, Eye, MessageSquare } from "lucide-react";
import type { ArticleWithDetails } from "@shared/schema";
import { formatArticleTimestamp } from "@/lib/formatTime";

export function ArticleMeta({
  article,
  locale = "ar",
  className = "",
  showViews = false,
  showComments = false,
}: {
  article: ArticleWithDetails;
  locale?: "ar" | "en" | "ur";
  className?: string;
  showViews?: boolean;
  showComments?: boolean;
}) {
  return (
    <div
      className={`public-meta flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}
    >
      {article.publishedAt &&
        !Number.isNaN(new Date(article.publishedAt).getTime()) && (
          <time
            dateTime={new Date(article.publishedAt).toISOString()}
            title={formatArticleTimestamp(article.publishedAt, {
              format: "absolute",
              locale,
            })}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatArticleTimestamp(article.publishedAt, {
              locale,
            })}
          </time>
        )}
      {showViews && (article.views ?? 0) > 0 && (
        <span>
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {(article.views ?? 0).toLocaleString("en-US")}
        </span>
      )}
      {showComments && (article.commentsCount ?? 0) > 0 && (
        <span>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          {(article.commentsCount ?? 0).toLocaleString("en-US")}
        </span>
      )}
    </div>
  );
}
