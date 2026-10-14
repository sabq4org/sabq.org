import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bookmark, BookOpen, Clock, Eye, Quote, Sparkles, User } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { formatArticleTimestamp } from "@/lib/formatTime";

export type OpinionCardArticle = {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  excerpt?: string | null;
  aiSummary?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  views?: number | null;
  category?: {
    id?: string;
    nameAr?: string;
    nameEn?: string;
    slug?: string;
    color?: string | null;
    icon?: string | null;
  } | null;
  author?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    profileImageUrl?: string | null;
    bio?: string | null;
    gender?: string | null;
  } | null;
};

export type OpinionCardVariant = "home" | "grid" | "sidebar";

export function getOpinionAuthorName(article: OpinionCardArticle) {
  const author = article.author;
  if (!author) return "كاتب رأي";
  return (
    author.name ||
    `${author.firstName || ""} ${author.lastName || ""}`.trim() ||
    "كاتب رأي"
  );
}

export function cleanOpinionAuthorBio(bio?: string | null): string {
  if (!bio) return "كاتب رأي";
  const cleaned = bio
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:x\.com|twitter\.com)\/\S+/gi, "")
    .replace(/^[\s\-–—•➢▪▫*]+/gm, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0];
  if (!cleaned) return "كاتب رأي";
  const firstClause = cleaned.split(/[。.!؟\n]/)[0]?.trim() || cleaned;
  return firstClause.length > 68 ? `${firstClause.slice(0, 65).trim()}…` : firstClause;
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
  hideAuthor = false,
  onQuickPreview,
  isSaved,
  onToggleSave,
}: {
  article: OpinionCardArticle;
  variant?: OpinionCardVariant;
  /** في صفحة الكاتب نفسه: صورته واسمه في رأس الصفحة، فلا تُكرَّر في كل بطاقة. */
  hideAuthor?: boolean;
  onQuickPreview?: (article: OpinionCardArticle) => void;
  isSaved?: boolean;
  onToggleSave?: (article: OpinionCardArticle) => void;
}) {
  const name = getOpinionAuthorName(article);
  const roleLabel = cleanOpinionAuthorBio(article.author?.bio);
  const href = `/opinion/${article.slug}`;
  const authorHref =
    name && name !== "كاتب رأي" ? `/author/${encodeURIComponent(name)}` : null;
  const publishedDate = validDate(article.publishedAt);
  const meta = publishedDate ? formatArticleTimestamp(publishedDate) : "";
  const summaryText = article.excerpt || article.aiSummary || "";

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
        <h3 className="public-opinion-title line-clamp-3 group-hover:text-primary">
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
      className={`public-opinion-card public-opinion-card-${variant} group${hideAuthor ? " public-opinion-card-noauthor" : ""}`}
      data-testid={`opinion-card-${article.id}`}
    >
      <Quote className="public-opinion-quote" aria-hidden="true" />
      {!hideAuthor && (variant === "home" || variant === "grid") && (
        <div className="public-opinion-author-row">
          {authorHref ? (
            <Link
              href={authorHref}
              className="relative z-10 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title={`مقالات ${name}`}
            >
              <Avatar className="public-opinion-avatar h-12 w-12 shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
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
            </Link>
          ) : (
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
          )}
          <div className="min-w-0 flex-1">
            {authorHref ? (
              <Link
                href={authorHref}
                className="public-opinion-author-name relative z-10 block hover:text-primary transition-colors"
              >
                {name}
              </Link>
            ) : (
              <p className="public-opinion-author-name">{name}</p>
            )}
            <p className="public-opinion-author-role" title={roleLabel}>
              {roleLabel}
            </p>
          </div>
        </div>
      )}
      <h3 className="public-opinion-title line-clamp-3 group-hover:text-primary transition-colors">
        <Link
          href={href}
          className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {article.title}
        </Link>
      </h3>
      {summaryText && (
        <p className="public-opinion-excerpt line-clamp-3">{summaryText}</p>
      )}
      <div className="public-opinion-footer">
        <span className="public-opinion-footer-meta">
          {variant === "grid" && article.category?.nameAr ? (
            <span className="public-opinion-category-pill">
              {article.category.nameAr}
            </span>
          ) : (
            variant === "grid" && !hideAuthor && <span>{name}</span>
          )}
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
          <div className="flex items-center gap-2">
            {onQuickPreview && summaryText.length > 80 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickPreview(article);
                }}
                className="public-opinion-quick-btn relative z-10"
                title="معاينة خلاصة المقال"
                data-testid={`button-opinion-preview-${article.id}`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>الخلاصة</span>
              </button>
            )}
            {onToggleSave && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSave(article);
                }}
                aria-pressed={!!isSaved}
                aria-label={isSaved ? "إزالة من المحفوظات" : "حفظ المقال"}
                title={isSaved ? "محفوظ في قائمتك" : "حفظ للقراءة لاحقاً"}
                className={`public-opinion-save-btn relative z-10${isSaved ? " is-saved" : ""}`}
                data-testid={`button-opinion-save-${article.id}`}
              >
                <Bookmark className={`h-3.5 w-3.5${isSaved ? " fill-current" : ""}`} aria-hidden="true" />
              </button>
            )}
            <span
              className="public-opinion-views"
              data-testid={`opinion-views-${article.id}`}
            >
              <Eye aria-hidden="true" />
              {formatNumber(article.views ?? 0)} مشاهدة
            </span>
          </div>
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
