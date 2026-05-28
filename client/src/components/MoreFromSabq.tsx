import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { ArticleWithDetails } from "@shared/schema";
import { getObjectPosition } from "@/lib/imageUtils";
import { OptimizedImage } from "./OptimizedImage";

export function MoreFromSabq() {
  const { data: personalFeed, isLoading } = useQuery<{
    articles: ArticleWithDetails[];
  }>({
    queryKey: ["/api/personal-feed"],
    retry: false,
  });

  const articles = personalFeed?.articles || [];

  if (!isLoading && articles.length === 0) {
    return null;
  }

  const featuredArticle = articles[0];
  const otherArticles = articles.slice(1, 10);

  return (
    <section className="py-16" data-testid="section-personalized">
      <div className="container mx-auto px-4">
        {/* Simple Header */}
        <h2 className="text-2xl font-bold mb-8">محتوى مخصص لك</h2>

        {isLoading ? (
          <div className="grid lg:grid-cols-[1fr,1fr] gap-12">
            <div className="animate-pulse space-y-4">
              <div className="aspect-video bg-muted rounded" />
              <div className="h-6 bg-muted rounded w-3/4" />
            </div>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-5 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr,1fr] gap-12">
            {/* Featured Article with Image - Left */}
            {featuredArticle && (
              <Link href={`/article/${featuredArticle.englishSlug || featuredArticle.slug}`}>
                <div className="group cursor-pointer" data-testid={`featured-article-${featuredArticle.id}`}>
                  {featuredArticle.imageUrl && (
                    <div className="relative aspect-video overflow-hidden mb-4">
                      <OptimizedImage
                        src={featuredArticle.imageUrl}
                        alt={featuredArticle.title}
                        width={640}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        style={{
                          objectPosition: getObjectPosition(featuredArticle)
                        }}
                      />
                    </div>
                  )}
                  <h3 className="text-lg font-bold leading-tight group-hover:underline">
                    {featuredArticle.title}
                  </h3>
                </div>
              </Link>
            )}

            {/* Simple List of Headlines - Right */}
            <div className="space-y-1" dir="rtl">
              {otherArticles.map((article, index) => (
                <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
                  <div 
                    className="group py-2 cursor-pointer"
                    data-testid={`list-article-${article.id}`}
                  >
                    <p className="leading-relaxed group-hover:underline">
                      {article.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
