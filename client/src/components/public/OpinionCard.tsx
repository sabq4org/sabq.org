import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookOpen, Clock, Eye, Quote, User } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { formatArticleTimestamp } from "@/lib/formatTime";

export type OpinionCardArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  views?: number | null;
  author?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    profileImageUrl?: string | null;
  } | null;
};

export type OpinionCardVariant = "home" | "grid" | "sidebar";

function authorName(article: OpinionCardArticle) {
  const author = article.author;
  if (!author) return "كاتب رأي";
  return (
    author.name ||
    `${author.firstName || ""} ${author.lastName || ""}`.trim() ||
    "كاتب رأي"
  );
}

function validDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Opinion cards share typography and metadata while keeping each context's density. */
export function OpinionCard({
  article,
  variant = "grid",
}: {
  article: OpinionCardArticle;
  variant?: OpinionCardVariant;
}) {
  const name = authorName(article);
  const href = `/opinion/${article.slug}`;
  const publishedDate = validDate(article.publishedAt);
  const meta = publishedDate ? formatArticleTimestamp(publishedDate) : "";

  if (variant === "sidebar") {
    return (
      <Link
        href={href}
        className="public-opinion-card public-opinion-card-sidebar group"
        data-testid={`opinion-sidebar-${article.id}`}
      >
        <Avatar className="public-opinion-avatar h-12 w-12 shrink-0">
          <AvatarImage
            src={article.author?.profileImageUrl || undefined}
            alt={name}
            className="object-cover"
          />
          <AvatarFallback>
            <User className="h-4 w-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        <h3 className="public-opinion-title line-clamp-2 group-hover:text-primary">
          {article.title}
        </h3>
        <div className="public-opinion-author-meta">
          <span>{name}</span>
          {publishedDate && (
            <>
              <span aria-hidden="true">·</span>
              <time
                dateTime={publishedDate.toISOString()}
                title={formatArticleTimestamp(publishedDate, { format: "absolute" })}
              >
                {meta}
              </time>
            </>
          )}
        </div>
      </Link>
    );
  }

  return (
    <article
      className={`public-opinion-card public-opinion-card-${variant} group`}
      data-testid={`opinion-card-${article.id}`}
    >
      <Quote className="public-opinion-quote" aria-hidden="true" />
      {(variant === "home" || variant === "grid") && (
        <div className="public-opinion-author-row">
          <Avatar className="public-opinion-avatar h-12 w-12 shrink-0">
            <AvatarImage
              src={article.author?.profileImageUrl || undefined}
              alt={name}
              className="object-cover"
              loading="lazy"
            />
            <AvatarFallback>
              <User className="h-6 w-6" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="public-opinion-author-name">{name}</p>
            <p className="public-opinion-author-role">كاتب رأي</p>
          </div>
        </div>
      )}
      <h3 className="public-opinion-title line-clamp-3">
        <Link
          href={href}
          className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {article.title}
        </Link>
      </h3>
      {article.excerpt && (
        <p className="public-opinion-excerpt line-clamp-2">{article.excerpt}</p>
      )}
      <div className="public-opinion-footer">
        <span className="public-opinion-footer-meta">
          {variant === "grid" && <span>{name}</span>}
          {publishedDate && (
            <time
              dateTime={publishedDate.toISOString()}
              title={formatArticleTimestamp(publishedDate, {
                format: "absolute",
              })}
            >
              <Clock aria-hidden="true" />
              {meta}
            </time>
          )}
        </span>
        {variant === "grid" ? (
          <span
            className="public-opinion-views"
            data-testid={`opinion-views-${article.id}`}
          >
            <Eye aria-hidden="true" />
            {formatNumber(article.views ?? 0)} مشاهدة
          </span>
        ) : (
          <span className="public-opinion-read">
            <BookOpen aria-hidden="true" />
            اقرأ المقال
          </span>
        )}
      </div>
    </article>
  );
}
