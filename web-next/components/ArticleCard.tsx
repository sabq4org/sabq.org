import type { ArticleListItem } from "@/lib/seoBundle";
import { timeAgoAr, isNewArticle } from "@/lib/timeAgo";

/**
 * Server-rendered article card for list surfaces (home, category). Visually
 * matches the SPA NewsArticleCard (client/src/components/NewsArticleCard.tsx):
 * a compact horizontal layout on mobile and a full image-on-top card on
 * desktop, with the category color accent badge and "جديد"/"عاجل" states. The
 * first card passes `priority` so its image is the eager, high-priority LCP
 * element. All images carry explicit dimensions to avoid layout shift.
 */
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CategoryBadge({ item }: { item: ArticleListItem }) {
  const isBreaking = item.newsType === "breaking";
  const isNew = isNewArticle(item.publishedAt);

  if (isBreaking) {
    return (
      <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground">
        عاجل
      </span>
    );
  }
  if (isNew) {
    return (
      <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-emerald-500 px-2 text-xs font-medium text-white">
        جديد
      </span>
    );
  }
  if (item.category) {
    return (
      <span
        className="inline-flex h-5 shrink-0 items-center rounded-md px-2 text-xs font-medium text-black"
        style={{
          backgroundColor: "#e5e5e6",
          borderRight: `3px solid ${item.categoryColor || "hsl(var(--primary))"}`,
        }}
      >
        {item.category}
      </span>
    );
  }
  return null;
}

export function ArticleCard({
  item,
  priority = false,
  unframedMobile = false,
}: {
  item: ArticleListItem;
  priority?: boolean;
  unframedMobile?: boolean;
}) {
  const time = timeAgoAr(item.publishedAt);
  const isBreaking = item.newsType === "breaking";

  return (
    <a
      href={item.href}
      className={
        unframedMobile
          ? "group block overflow-hidden md:rounded-xl md:border md:border-card-border md:bg-card md:transition-shadow md:hover:shadow-md"
          : "group block overflow-hidden rounded-xl border border-card-border bg-card transition-shadow hover:shadow-md"
      }
    >
      {/* Mobile: compact horizontal layout */}
      <div className={unframedMobile ? "flex gap-3 py-3 md:hidden" : "flex gap-3 p-4 md:hidden"}>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            width={96}
            height={80}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="h-20 w-24 shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <CategoryBadge item={item} />
          <h3
            className={`line-clamp-2 text-sm font-bold leading-relaxed ${
              isBreaking ? "text-destructive" : "text-card-foreground group-hover:text-primary"
            }`}
          >
            {item.title}
          </h3>
          {time && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ClockIcon className="h-3 w-3" />
              {time}
            </span>
          )}
        </div>
      </div>

      {/* Desktop: full card with large image on top */}
      <div className="hidden md:block">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            width={640}
            height={360}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        <div className="flex flex-col gap-3 p-5">
          <div>
            <CategoryBadge item={item} />
          </div>
          <h3
            className={`line-clamp-2 text-lg font-bold leading-snug transition-colors ${
              isBreaking ? "text-destructive" : "text-card-foreground group-hover:text-primary"
            }`}
          >
            {item.title}
          </h3>
          {item.excerpt && (
            <p className="line-clamp-3 text-sm text-muted-foreground">{item.excerpt}</p>
          )}
          {time && (
            <div className="flex items-center gap-1 border-t pt-2 text-xs text-muted-foreground">
              <ClockIcon className="h-3 w-3" />
              <span>{time}</span>
            </div>
          )}
        </div>
      </div>
    </a>
  );
}
