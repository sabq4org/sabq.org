import type { ArticleListItem } from "@/lib/seoBundle";

/**
 * Server-rendered article card for list surfaces (home, category). The first
 * card on a page passes `priority` so its image is the eager, high-priority LCP
 * element. All images carry explicit dimensions to avoid layout shift.
 */
export function ArticleCard({
  item,
  priority = false,
}: {
  item: ArticleListItem;
  priority?: boolean;
}) {
  return (
    <a
      href={item.href}
      className="group flex flex-col overflow-hidden rounded-lg border border-card-border bg-card transition-shadow hover:shadow-md"
    >
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
          className="aspect-[16/9] w-full object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-base font-bold leading-snug text-card-foreground group-hover:text-primary">
          {item.title}
        </h3>
        {item.excerpt && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {item.excerpt}
          </p>
        )}
      </div>
    </a>
  );
}
